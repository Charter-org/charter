// Custody Perpl trade flow (Monad testnet). The Mandate contract owns the Perpl account and places
// every order through execPerplOrder, which hard-caps leverage on-chain - so a compromised agent
// cannot over-lever, and the position is custodied by the contract, not an EOA. Reads are on-chain
// (the account owner is a contract, so Perpl's EOA-signed API is not usable):
//   setupMandateTrading - deposit AUSD into the mandate + open its Perpl account (one-time)
//   openPosition / closePosition - mandate.execPerplOrder(...) long or short, open or flatten
//   fetchPortfolio / fetchPositions - getAccountByAddr + getPositionV2 for the mandate
//   fetchFills - the mandate's own PerplOrderPlaced events (its authoritative trade log)
import { parseAbi, encodeFunctionData } from "viem";
import { PERPL, getContext } from "./perpl";
import { publicClient } from "./tokens";
import type { Wallet } from "./wallet";

const EX = PERPL.exchange as `0x${string}`;
const AUSD = PERPL.collateral as `0x${string}`;
const DEC = 10 ** PERPL.collateralDecimals;

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);
const mandateAbi = parseAbi([
  "function deposit(address token, uint256 amount)",
  "function openPerplAccount(uint256 amountCNS) returns (uint256)",
  "function execPerplOrder(uint8 orderType, uint256 perpId, uint256 pricePNS, uint256 lotLNS, uint256 leverageHdths, uint256 maxNegPnlCollatBPS) returns (uint256)",
  "event PerplOrderPlaced(uint256 indexed seq, uint8 orderType, uint256 perpId, uint256 pricePNS, uint256 lotLNS, uint256 leverageBps)",
  "error LeverageExceeded(uint256 requested, uint256 max)",
  "error NotAgent()",
]);
const callAbi = parseAbi(["function getAccountByAddr(address)", "function getPositionV2(uint256,uint256)"]);

export type Side = "long" | "short";
// orderType enum: OpenLong 0, OpenShort 1, CloseLong 2, CloseShort 3.
const ORDER_TYPE = { openLong: 0, openShort: 1, closeLong: 2, closeShort: 3 } as const;
const DEFAULT_LEVERAGE_HDTHS = 200; // 2.00x; the contract caps it to the mandate's terms anyway

/** Raw 32-byte words of a Perpl exchange view call (we parse fields by index; structs are static). */
async function exWords(fn: "getAccountByAddr" | "getPositionV2", args: any[]): Promise<bigint[]> {
  const res = await publicClient.call({ to: EX, data: encodeFunctionData({ abi: callAbi, functionName: fn, args: args as any }) });
  const hex = (res.data ?? "0x").slice(2);
  const out: bigint[] = [];
  for (let i = 0; i + 64 <= hex.length; i += 64) out.push(BigInt("0x" + hex.slice(i, i + 64)));
  return out;
}
const toInt = (w: bigint): bigint => (w >= 1n << 255n ? w - (1n << 256n) : w);

/** Live oracle + top-of-book + scaling for a market (prices in price_decimals, sizes in size_decimals). */
export async function marketPrices(marketId: number): Promise<{ orl: number; bid: number; ask: number; priceDecimals: number; sizeDecimals: number }> {
  const ctx = await getContext();
  const m = (ctx.markets ?? []).find((x: any) => x.id === marketId);
  const s = m?.state;
  if (!s?.orl) throw new Error(`no market state for ${marketId}`);
  return { orl: s.orl, bid: s.bid ?? s.orl, ask: s.ask ?? s.orl, priceDecimals: m.config?.price_decimals ?? 0, sizeDecimals: m.config?.size_decimals ?? 0 };
}

// A price that crosses the book now: a buy pays through the ask, a sell hits through the bid.
function marketable(isBuy: boolean, book: { bid: number; ask: number }, bufferBps = 200): number {
  const base = isBuy ? book.ask : book.bid;
  return Math.round(base * (isBuy ? 1 + bufferBps / 10000 : 1 - bufferBps / 10000));
}
// notionalUsd = (sizeScaled / 10^sizeDecimals) * (orl / 10^priceDecimals), inverted for the raw size.
function sizeFromNotional(notionalUsd: number, book: { orl: number; priceDecimals: number; sizeDecimals: number }): number {
  return Math.round((notionalUsd * 10 ** book.sizeDecimals * 10 ** book.priceDecimals) / book.orl);
}

/** The mandate's Perpl account id, or 0n if it has none (getAccountByAddr reverts for a missing account). */
export async function mandatePerplAccountId(mandate: `0x${string}`): Promise<bigint> {
  try {
    const w = await exWords("getAccountByAddr", [mandate]);
    return w[0] ?? 0n;
  } catch {
    return 0n;
  }
}

/** One-time: fund the mandate with AUSD and open its own Perpl account. Owner (the signed-in user). */
export async function setupMandateTrading(wallet: Wallet, mandate: `0x${string}`, amountRaw = PERPL.minAccountOpen) {
  if ((await mandatePerplAccountId(mandate)) > 0n) return; // already set up

  const approveTx = await wallet.client.writeContract({
    address: AUSD, abi: erc20Abi, functionName: "approve", args: [mandate, amountRaw],
    account: wallet.account, chain: wallet.client.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  const depTx = await wallet.client.writeContract({
    address: mandate, abi: mandateAbi, functionName: "deposit", args: [AUSD, amountRaw],
    account: wallet.account, chain: wallet.client.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: depTx });

  const openTx = await wallet.client.writeContract({
    address: mandate, abi: mandateAbi, functionName: "openPerplAccount", args: [amountRaw],
    account: wallet.account, chain: wallet.client.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: openTx });
  return openTx;
}

async function execPerplOrder(wallet: Wallet, mandate: `0x${string}`, orderType: number, marketId: number, priceScaled: number, sizeScaled: number, leverageHdths: number, maxNegPnlBps = 1000) {
  const args = [orderType, BigInt(marketId), BigInt(priceScaled), BigInt(sizeScaled), BigInt(leverageHdths), BigInt(maxNegPnlBps)] as const;
  // Simulate first: an out-of-bounds order reverts here (decoded LeverageExceeded) instead of mining a
  // reverted tx. writeContract does not simulate, so without this the revert would be silent.
  await publicClient.simulateContract({ address: mandate, abi: mandateAbi, functionName: "execPerplOrder", args: args as any, account: wallet.account });
  const tx = await wallet.client.writeContract({
    address: mandate, abi: mandateAbi, functionName: "execPerplOrder", args: args as any,
    account: wallet.account, chain: wallet.client.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  return tx;
}

/** Open a long/short through the mandate, sized by USD notional. Leverage is capped on-chain by the
 *  contract (reverts LeverageExceeded if it exceeds the owner's terms). */
export async function openPosition(wallet: Wallet, opts: { mandate: `0x${string}`; marketId: number; side: Side; notionalUsd: number; leverageHdths?: number }) {
  const isBuy = opts.side === "long";
  const book = await marketPrices(opts.marketId);
  const sizeScaled = sizeFromNotional(opts.notionalUsd, book);
  if (sizeScaled < 1) {
    const minUsd = book.orl / (10 ** book.priceDecimals * 10 ** book.sizeDecimals);
    throw new Error(`Notional too small - minimum about $${minUsd.toFixed(2)} for this market`);
  }
  const type = isBuy ? ORDER_TYPE.openLong : ORDER_TYPE.openShort;
  return execPerplOrder(wallet, opts.mandate, type, opts.marketId, marketable(isBuy, book), sizeScaled, opts.leverageHdths ?? DEFAULT_LEVERAGE_HDTHS);
}

/** Flatten an open position through the mandate - closing a long sells, closing a short buys. */
export async function closePosition(wallet: Wallet, opts: { mandate: `0x${string}`; marketId: number; side: Side; sizeScaled: number }) {
  const isBuy = opts.side === "short";
  const book = await marketPrices(opts.marketId);
  const type = opts.side === "long" ? ORDER_TYPE.closeLong : ORDER_TYPE.closeShort;
  return execPerplOrder(wallet, opts.mandate, type, opts.marketId, marketable(isBuy, book), opts.sizeScaled, DEFAULT_LEVERAGE_HDTHS);
}

export interface Portfolio {
  accountValue: number; // AUSD custodied in the mandate's Perpl account
  unrealizedPnl: number; // AUSD, summed across open positions
  openPositions: number;
}

export interface OpenPosition {
  marketId: number;
  symbol: string;
  side: Side;
  sizeScaled: number;  // raw size, used to close
  size: number;        // human size (e.g. 0.0001 BTC)
  entryUsd: number;    // human entry price
  notionalUsd: number; // size * entryUsd
}

async function marketMeta() {
  const ctx = await getContext();
  const byId = new Map<number, { symbol: string; sd: number; pd: number }>();
  for (const m of ctx.markets ?? []) byId.set(m.id, { symbol: m.symbol ?? String(m.id), sd: m.config?.size_decimals ?? 0, pd: m.config?.price_decimals ?? 0 });
  return byId;
}

/** Open positions held by the mandate's Perpl account, read on-chain (getPositionV2 per market). */
export async function fetchPositions(mandate: `0x${string}`): Promise<OpenPosition[]> {
  const accountId = await mandatePerplAccountId(mandate);
  if (accountId === 0n) return [];
  const meta = await marketMeta();
  const out: OpenPosition[] = [];
  for (const marketId of Object.values(PERPL.marketIds)) {
    const p = await exWords("getPositionV2", [BigInt(marketId), accountId]); // [3]type [5]entry [6]lot
    const lot = p[6] ?? 0n;
    if (lot === 0n) continue;
    const info = meta.get(marketId);
    const sd = info?.sd ?? 0, pd = info?.pd ?? 0;
    const size = Number(lot) / 10 ** sd;
    const entryUsd = Number(p[5] ?? 0n) / 10 ** pd;
    out.push({ marketId, symbol: info?.symbol ?? String(marketId), side: p[3] === 1n ? "short" : "long", sizeScaled: Number(lot), size, entryUsd, notionalUsd: size * entryUsd });
  }
  return out;
}

/** Account value + unrealized PnL + open-position count, read on-chain for the mandate's account. */
export async function fetchPortfolio(mandate: `0x${string}`): Promise<Portfolio> {
  const a = await exWords("getAccountByAddr", [mandate]); // [0]accountId [1]balanceCNS
  const accountId = a[0] ?? 0n;
  const accountValue = Number(a[1] ?? 0n) / DEC;
  if (accountId === 0n) return { accountValue, unrealizedPnl: 0, openPositions: 0 };
  let pnl = 0n, open = 0;
  for (const marketId of Object.values(PERPL.marketIds)) {
    const p = await exWords("getPositionV2", [BigInt(marketId), accountId]); // [6]lot [8]pnlCNS(int)
    if ((p[6] ?? 0n) === 0n) continue;
    open++;
    pnl += toInt(p[8] ?? 0n);
  }
  return { accountValue, unrealizedPnl: Number(pnl) / DEC, openPositions: open };
}

export interface Fill {
  marketId: number;
  symbol: string;
  action: "Opened" | "Closed";
  side: Side;
  size: number;
  priceUsd: number;
  notionalUsd: number;
  feeUsd: number;
  timeMs: number;
  txHash: string;
}

// PerplOrderPlaced.orderType is the on-chain enum: 0 OpenLong, 1 OpenShort, 2 CloseLong, 3 CloseShort.
const fillMeta = (t: number): { action: "Opened" | "Closed"; side: Side } => ({
  action: t <= 1 ? "Opened" : "Closed",
  side: t === 0 || t === 2 ? "long" : "short",
});

/** The mandate's own trade log: PerplOrderPlaced events, newest first (chunked 100-block windows). */
export async function fetchFills(mandate: `0x${string}`, limit = 12, lookbackBlocks = 5000): Promise<Fill[]> {
  const meta = await marketMeta();
  const head = await publicClient.getBlockNumber();
  const start = head > BigInt(lookbackBlocks) ? head - BigInt(lookbackBlocks) : 0n;
  const raw: { log: any }[] = [];
  for (let to = head; to >= start && raw.length < 200; to -= 100n) {
    const from = to - 99n > start ? to - 99n : start;
    const logs = await publicClient
      .getContractEvents({ address: mandate, abi: mandateAbi, eventName: "PerplOrderPlaced", fromBlock: from, toBlock: to })
      .catch(() => [] as any[]);
    for (const log of logs) raw.push({ log });
    if (from === start) break;
  }
  raw.sort((a, b) => Number((b.log.blockNumber ?? 0n) - (a.log.blockNumber ?? 0n)));
  const picked = raw.slice(0, limit);
  const blocks = new Map<string, number>();
  const out: Fill[] = [];
  for (const { log } of picked) {
    const a = log.args as any;
    const info = meta.get(Number(a.perpId));
    const sd = info?.sd ?? 0, pd = info?.pd ?? 0;
    const size = Number(a.lotLNS) / 10 ** sd;
    const priceUsd = Number(a.pricePNS) / 10 ** pd;
    const bn = String(log.blockNumber);
    if (!blocks.has(bn)) blocks.set(bn, Number((await publicClient.getBlock({ blockNumber: log.blockNumber })).timestamp) * 1000);
    out.push({
      marketId: Number(a.perpId), symbol: info?.symbol ?? String(a.perpId), ...fillMeta(Number(a.orderType)),
      size, priceUsd, notionalUsd: size * priceUsd, feeUsd: 0, timeMs: blocks.get(bn)!, txHash: log.transactionHash,
    });
  }
  return out;
}
