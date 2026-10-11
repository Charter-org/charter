// Charter agent keeper — the autonomous half of the thesis.
//
// Every tick it reads a live market signal (BTC mark from Perpl), decides WITHIN the mandate, and
// writes that decision ON-CHAIN: act(Hedge|Rebalance, …) or abstain(reason). Each call is a Decision
// event anyone can replay. The mandate is the guarantee: even a greedy/buggy/compromised agent can't
// exceed the owner's bounds — the contract reverts. We prove that every few ticks with a deliberate
// "reckless" proposal that the mandate blocks.
//
// Run:  bun run agent.ts            (continuous, 20s ticks)
//       TICKS=6 INTERVAL=8 bun run agent.ts
import { readFileSync } from "fs";
import { join } from "path";
import { createPublicClient, createWalletClient, http, parseAbi, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://testnet-rpc.monad.xyz";
const MANDATE = "0x564EFe00cfF81eaF6A65422758C27A0c89EAA648"; // agent = this keeper key
const KURU = "0x7EFbE105Ca7415dE98F96622173458ac1c054630"; // allowlisted venue
const PERPL_CTX = "https://testnet.perpl.xyz/api/v1/pub/context";
const BTC = 16;

const INTERVAL = Number(process.env.INTERVAL ?? 20) * 1000;
const TICKS = Number(process.env.TICKS ?? 0); // 0 = run forever
const RECKLESS_EVERY = Number(process.env.RECKLESS_EVERY ?? 4); // demo the guarantee every N ticks

const monad = defineChain({
  id: 10143, name: "Monad Testnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const abi = parseAbi([
  "function act(uint8 action, address venue, uint256 leverageBps, uint256 slippageBps) returns (uint256)",
  "function abstain(string reason) returns (uint256)",
  "function terms() view returns (uint256 maxLeverageBps, uint256 maxSlippageBps, uint256 drawdownTriggerBps)",
  "function decisionCount() view returns (uint256)",
  "error LeverageExceeded(uint256 requested, uint256 max)",
  "error SlippageExceeded(uint256 requested, uint256 max)",
]);

const pk = readFileSync(join(import.meta.dir, "..", ".env"), "utf8").match(/^PRIVATE_KEY=(.+)$/m)![1].trim() as `0x${string}`;
const account = privateKeyToAccount(pk);
const pub = createPublicClient({ chain: monad, transport: http() });
const wallet = createWalletClient({ account, chain: monad, transport: http() });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function btcMark(): Promise<number> {
  const ctx = await (await fetch(PERPL_CTX)).json();
  const m = ctx.markets.find((x: any) => x.id === BTC);
  return m.state.mrk; // scaled by price_decimals; only the ratio matters for momentum
}

async function send(fn: "act" | "abstain", args: any[], label: string) {
  try {
    const hash = await wallet.writeContract({ address: MANDATE as `0x${string}`, abi, functionName: fn, args, account, chain: monad });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`   on-chain ✓ ${label}  tx ${hash.slice(0, 12)}…`);
    return true;
  } catch (e: any) {
    const data = e?.cause?.data ?? e?.cause?.cause?.data;
    const name = data?.errorName;
    const detail = name === "LeverageExceeded" && data?.args
      ? `LeverageExceeded (${Number(data.args[0]) / 10000}x > ${Number(data.args[1]) / 10000}x cap)`
      : name ?? String(e?.shortMessage ?? e?.message ?? e).split("\n")[0];
    console.log(`   ⛔ mandate refused: ${detail}`);
    return false;
  }
}

async function main() {
  const [maxLev, maxSlip] = (await pub.readContract({ address: MANDATE as `0x${string}`, abi, functionName: "terms" })) as readonly [bigint, bigint, bigint];
  console.log(`agent ${account.address}`);
  console.log(`mandate ${MANDATE}  (max ${Number(maxLev) / 10000}x lev · max ${Number(maxSlip) / 100}% slip)\n`);

  let prev: number | null = null;
  let n = 0;
  while (TICKS === 0 || n < TICKS) {
    n++;
    const mark = await btcMark();
    const momoBps = prev == null ? 0 : Math.round(((mark - prev) / prev) * 10000);
    prev = mark;
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] tick ${n}  BTC mark ${mark}  momentum ${momoBps >= 0 ? "+" : ""}${momoBps}bps`);

    // Every few ticks, a greedy agent tries to over-lever — the mandate must block it.
    if (RECKLESS_EVERY && n % RECKLESS_EVERY === 0) {
      console.log("   agent attempts a reckless 3.0x (simulating a greedy/compromised agent)…");
      await send("act", [2, KURU, 30000n, 30n], "reckless 3.0x"); // reverts LeverageExceeded
    }

    // Normal, mandate-respecting decision from the live signal.
    if (n === 1) {
      await send("abstain", ["warming up — no prior mark"], "abstain: warming up");
    } else if (momoBps >= 5) {
      const lev = Math.min(Number(maxLev), 10000 + momoBps * 20); // scale conviction, capped at the mandate
      await send("act", [2, KURU, BigInt(lev), 30n], `rebalance long ${(lev / 10000).toFixed(2)}x`);
    } else if (momoBps <= -5) {
      await send("act", [1, KURU, 15000n, 30n], "hedge 1.50x (momentum down)");
    } else {
      await send("abstain", [`no edge (momentum ${momoBps}bps) — holding`], "abstain: no edge");
    }

    if (TICKS === 0 || n < TICKS) await sleep(INTERVAL);
  }
  const total = await pub.readContract({ address: MANDATE as `0x${string}`, abi, functionName: "decisionCount" });
  console.log(`\ndone — ${n} ticks. on-chain decisionCount is now ${total}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
