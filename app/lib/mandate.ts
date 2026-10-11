// The on-chain Mandate — the "guarantee". An autonomous agent operates under it; the contract reverts
// if a proposed trade breaches the owner's bounds. The agent's live decisions (from the keeper) are a
// public Decision-event log, and we SIMULATE a proposal (gas-free eth_call from the mandate's agent)
// to show enforcement. Same mandate the keeper writes to (see deployments/monad-testnet.json).
import { parseAbi, getAddress } from "viem";
import { publicClient } from "./tokens";

export const MANDATE = "0x564EFe00cfF81eaF6A65422758C27A0c89EAA648";
const KURU_VENUE = "0x7EFbE105Ca7415dE98F96622173458ac1c054630"; // allowlisted venue

const mandateAbi = parseAbi([
  "function terms() view returns (uint256 maxLeverageBps, uint256 maxSlippageBps, uint256 drawdownTriggerBps)",
  "function agent() view returns (address)",
  "function act(uint8 action, address venue, uint256 leverageBps, uint256 slippageBps) returns (uint256)",
  "event Decision(uint256 indexed seq, uint8 indexed action, address indexed venue, bool acted, uint256 leverageBps, uint256 slippageBps, string reason)",
  "error LeverageExceeded(uint256 requested, uint256 max)",
  "error SlippageExceeded(uint256 requested, uint256 max)",
  "error VenueNotAllowed(address venue)",
  "error NotAgent()",
]);

const ACTIONS = ["Abstain", "Hedge", "Rebalance"] as const;

export interface Decision {
  seq: number;
  action: string;
  acted: boolean;
  leverageX: number;
  slippagePct: number;
  reason: string;
}

/** Recent agent decisions from the mandate's on-chain Decision log, newest first.
 *  Monad caps eth_getLogs to a 100-block range, so we scan the window newest-first in small
 *  concurrency-limited batches, stopping once we have `limit` decisions. */
export async function recentDecisions(limit = 8, lookbackBlocks = 3000): Promise<Decision[]> {
  const latest = await publicClient.getBlockNumber();
  const floor = latest > BigInt(lookbackBlocks) ? latest - BigInt(lookbackBlocks) : 0n;
  const ranges: Array<[bigint, bigint]> = [];
  for (let to = latest; to >= floor; to -= 100n) {
    const from = to - 99n > floor ? to - 99n : floor;
    ranges.push([from, to]);
    if (from === floor) break;
  }
  const out: Decision[] = [];
  const CONCURRENCY = 6;
  for (let i = 0; i < ranges.length && out.length < limit; i += CONCURRENCY) {
    const batch = await Promise.all(
      ranges.slice(i, i + CONCURRENCY).map(([from, to]) =>
        publicClient
          .getContractEvents({ address: getAddress(MANDATE), abi: mandateAbi, eventName: "Decision", fromBlock: from, toBlock: to })
          .catch(() => []),
      ),
    );
    for (const l of batch.flat()) {
      const a = l.args as any;
      out.push({
        seq: Number(a.seq),
        action: ACTIONS[Number(a.action)] ?? "Decision",
        acted: Boolean(a.acted),
        leverageX: Number(a.leverageBps) / 10000,
        slippagePct: Number(a.slippageBps) / 100,
        reason: a.reason ?? "",
      });
    }
  }
  return out.sort((x, y) => y.seq - x.seq).slice(0, limit);
}

let cachedAgent: `0x${string}` | undefined;
async function mandateAgent(): Promise<`0x${string}`> {
  if (!cachedAgent) {
    cachedAgent = (await publicClient.readContract({
      address: getAddress(MANDATE), abi: mandateAbi, functionName: "agent",
    })) as `0x${string}`;
  }
  return cachedAgent;
}

export async function readTerms() {
  const [lev, slip, dd] = (await publicClient.readContract({
    address: getAddress(MANDATE), abi: mandateAbi, functionName: "terms",
  })) as readonly [bigint, bigint, bigint];
  return {
    maxLeverageX: Number(lev) / 10000,
    maxSlippagePct: Number(slip) / 100,
    drawdownPct: Number(dd) / 100,
  };
}

export interface MandateResult {
  allowed: boolean;
  /** custom-error name when refused, e.g. "LeverageExceeded" */
  reason?: string;
}

/**
 * The agent (the automated trader the mandate governs) proposes a trade at `leverageBps`, checked by
 * the on-chain mandate (gas-free eth_call, from the mandate's agent). Within bounds → allowed; out of
 * bounds → the contract reverts and we surface the reason. Real contract logic, not a client-side
 * check — and because it's simulated from the agent, it works for any viewer with zero gas.
 */
export async function proposeTrade(leverageBps: number): Promise<MandateResult> {
  try {
    await publicClient.simulateContract({
      address: getAddress(MANDATE),
      abi: mandateAbi,
      functionName: "act",
      args: [2, getAddress(KURU_VENUE), BigInt(leverageBps), 30n],
      account: await mandateAgent(),
    });
    return { allowed: true };
  } catch (e: any) {
    const msg = String(e?.shortMessage ?? e?.message ?? e);
    const reason = ["LeverageExceeded", "SlippageExceeded", "VenueNotAllowed", "NotAgent"].find((n) =>
      msg.includes(n),
    );
    return { allowed: false, reason: reason ?? "reverted" };
  }
}
