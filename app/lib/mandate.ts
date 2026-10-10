// The on-chain Mandate — the "guarantee". The agent is this wallet; the contract reverts if a
// proposed trade breaches the owner's bounds. We SIMULATE the agent's proposal (eth_call, gas-free):
// within bounds it returns; out of bounds the contract reverts and the trade never happens.
// Deployed to Monad testnet with agent = the passkey account (see deployments/monad-testnet.json).
import { parseAbi, getAddress } from "viem";
import { publicClient } from "./tokens";

export const MANDATE = "0x37a0873e8d04796F7D1991B18A23C9364b5107af";
const KURU_VENUE = "0x7EFbE105Ca7415dE98F96622173458ac1c054630"; // allowlisted venue

const mandateAbi = parseAbi([
  "function terms() view returns (uint256 maxLeverageBps, uint256 maxSlippageBps, uint256 drawdownTriggerBps)",
  "function agent() view returns (address)",
  "function act(uint8 action, address venue, uint256 leverageBps, uint256 slippageBps) returns (uint256)",
  "error LeverageExceeded(uint256 requested, uint256 max)",
  "error SlippageExceeded(uint256 requested, uint256 max)",
  "error VenueNotAllowed(address venue)",
  "error NotAgent()",
]);

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
