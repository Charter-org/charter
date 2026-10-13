// The on-chain Mandate - the "guarantee". An autonomous agent operates under it; the contract reverts
// if a proposed trade breaches the owner's bounds. The agent's live decisions (from the keeper) are a
// public Decision-event log, and we SIMULATE a proposal (gas-free eth_call from the mandate's agent)
// to show enforcement. Same mandate the keeper writes to (see deployments/monad-testnet.json).
import { parseAbi, getAddress } from "viem";
import { publicClient } from "./tokens";
import { MANDATE_BYTECODE } from "./mandateBytecode";
import type { Wallet } from "./wallet";

// The shared demo mandate the keeper writes to. A user can deploy their OWN (deployMandate) and the
// app then points at theirs (setMandate) - refusal demo, feed, and agent all follow the active one.
const DEFAULT_MANDATE = "0x564EFe00cfF81eaF6A65422758C27A0c89EAA648";
let active = DEFAULT_MANDATE;
export const currentMandate = () => active;
export function setMandate(addr: string) {
  active = addr;
  cachedAgent = undefined;
}

const KURU_VENUE = "0x7EFbE105Ca7415dE98F96622173458ac1c054630"; // allowlisted venue

const ZERO = "0x0000000000000000000000000000000000000000" as const;

const mandateAbi = parseAbi([
  "constructor(address agent_, (uint256 maxLeverageBps, uint256 maxSlippageBps, uint256 drawdownTriggerBps) terms_)",
  "function terms() view returns (uint256 maxLeverageBps, uint256 maxSlippageBps, uint256 drawdownTriggerBps)",
  "function owner() view returns (address)",
  "function agent() view returns (address)",
  "function setAgent(address agent_)",
  "function setTerms((uint256 maxLeverageBps, uint256 maxSlippageBps, uint256 drawdownTriggerBps) terms_)",
  "function setVenue(address venue, bool allowed)",
  "function act(uint8 action, address venue, uint256 leverageBps, uint256 slippageBps) returns (uint256)",
  "function deposit(address token, uint256 amount)",
  "function withdraw(address token, uint256 amount, address to)",
  "function openPerplAccount(uint256 amountCNS) returns (uint256)",
  "function withdrawPerplCollateral(uint256 amountCNS)",
  "function execPerplOrder(uint8 orderType, uint256 perpId, uint256 pricePNS, uint256 lotLNS, uint256 leverageHdths, uint256 maxNegPnlCollatBPS) returns (uint256)",
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
          .getContractEvents({ address: getAddress(active), abi: mandateAbi, eventName: "Decision", fromBlock: from, toBlock: to })
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
      address: getAddress(active), abi: mandateAbi, functionName: "agent",
    })) as `0x${string}`;
  }
  return cachedAgent;
}

export async function readTerms() {
  const [lev, slip, dd] = (await publicClient.readContract({
    address: getAddress(active), abi: mandateAbi, functionName: "terms",
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
 * the on-chain mandate (gas-free eth_call). Within bounds → allowed; out of bounds → the contract
 * reverts and we surface the reason. Real contract logic, not a client-side check.
 * `from` is the proposer identity: pass the owner's address for a mandate they own (so a paused agent -
 * agent set to 0 - reverts NotAgent instead of passing); defaults to the mandate's live agent (spine).
 */
export async function proposeTrade(leverageBps: number, from?: `0x${string}`): Promise<MandateResult> {
  try {
    await publicClient.simulateContract({
      address: getAddress(active),
      abi: mandateAbi,
      functionName: "act",
      args: [2, getAddress(KURU_VENUE), BigInt(leverageBps), 30n],
      account: from ?? (await mandateAgent()),
    });
    return { allowed: true };
  } catch (e: any) {
    // viem decodes the custom error onto the revert cause; read its name directly (shortMessage omits it).
    const revert = typeof e?.walk === "function" ? e.walk((err: any) => err?.name === "ContractFunctionRevertedError") : e?.cause;
    const name = revert?.data?.errorName as string | undefined;
    const msg = String(e?.shortMessage ?? e?.message ?? e);
    const reason = name ?? ["LeverageExceeded", "SlippageExceeded", "VenueNotAllowed", "NotAgent"].find((n) => msg.includes(n)) ?? "reverted";
    return { allowed: false, reason };
  }
}

/** Deploy a mandate the user OWNS (owner + agent = their account), allowlist the venue, and point the
 *  app at it. Needs MON gas. After this, the refusal demo and feed follow the user's own mandate. */
export async function deployMandate(
  wallet: Wallet,
  terms: { maxLeverageBps: number; maxSlippageBps: number; drawdownTriggerBps: number },
): Promise<`0x${string}`> {
  const deployHash = await wallet.client.deployContract({
    abi: mandateAbi,
    bytecode: MANDATE_BYTECODE as `0x${string}`,
    args: [
      wallet.address,
      {
        maxLeverageBps: BigInt(terms.maxLeverageBps),
        maxSlippageBps: BigInt(terms.maxSlippageBps),
        drawdownTriggerBps: BigInt(terms.drawdownTriggerBps),
      },
    ],
    account: wallet.account,
    chain: wallet.client.chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const addr = receipt.contractAddress as `0x${string}`;
  const vhash = await wallet.client.writeContract({
    address: addr, abi: mandateAbi, functionName: "setVenue", args: [getAddress(KURU_VENUE), true],
    account: wallet.account, chain: wallet.client.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: vhash });
  setMandate(addr);
  return addr;
}

/** Kill switch: owner sets agent to the zero address, so no one can call act/executeSwap (NotAgent).
 *  The owner keeps full control (can resume or adjust limits); only the agent's powers are revoked. */
export async function pauseAgent(wallet: Wallet): Promise<void> {
  const hash = await wallet.client.writeContract({
    address: getAddress(active), abi: mandateAbi, functionName: "setAgent", args: [ZERO],
    account: wallet.account, chain: wallet.client.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

/** Re-authorize the agent (owner only). */
export async function resumeAgent(wallet: Wallet): Promise<void> {
  const hash = await wallet.client.writeContract({
    address: getAddress(active), abi: mandateAbi, functionName: "setAgent", args: [wallet.address],
    account: wallet.account, chain: wallet.client.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

/** Adjust the on-chain limits (owner only). The refusal demo and feed immediately follow the new bounds. */
export async function updateTerms(
  wallet: Wallet,
  terms: { maxLeverageBps: number; maxSlippageBps: number; drawdownTriggerBps: number },
): Promise<void> {
  const hash = await wallet.client.writeContract({
    address: getAddress(active), abi: mandateAbi, functionName: "setTerms",
    args: [{
      maxLeverageBps: BigInt(terms.maxLeverageBps),
      maxSlippageBps: BigInt(terms.maxSlippageBps),
      drawdownTriggerBps: BigInt(terms.drawdownTriggerBps),
    }],
    account: wallet.account, chain: wallet.client.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}
