// Real Perpl trade flow (Monad testnet). Orders are submitted ON-CHAIN via execOrder - the gasless
// WS relay is disabled on testnet (returns sr:34 OrderForwardingNotAllowed), so the wallet signs each
// order tx itself. Verified end-to-end against a successful UI trade (tx 0x3a6d5fe0…) and a replayed
// order from our stack (tx 0x43e4f968…): account #981 balance moved, margin locked.
//   1. ensureExchangeAccount         - approve AUSD + createAccount(amount) (one-time)
//   2. openPosition / closePosition  - execOrder(...) long or short, open or flatten
// enroll()/signTypedFor are the authenticated-read path (Ed25519 API key); not needed to trade.
import { parseAbi, hashTypedData, encodeFunctionData } from "viem";
import { PERPL, enrollApiKey, signedFetch, getContext, type SignTyped, type EnrollResult } from "./perpl";
import { publicClient } from "./tokens";
import type { Wallet } from "./wallet";

const exchangeAbi = parseAbi([
  "function createAccount(uint256 amountCNS)",
  "function execOrder((uint256,uint256,uint8,uint256,uint256,uint256,uint256,bool,bool,bool,uint256,uint256,uint256,uint256,uint256) order)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

/** EIP-712 signer backed by the Mera/viem account, with the field coercions Perpl's payload needs. */
export function signTypedFor(wallet: Wallet): SignTyped {
  return async (td) => {
    const { EIP712Domain: _omit, ...types } = td.types;
    const primaryType = td.primaryType ?? Object.keys(types)[0];
    const domain = { ...td.domain, chainId: BigInt(td.domain.chainId) };
    const message = { ...td.message, time: BigInt(td.message.time) };
    const signature = await wallet.account.signTypedData({ domain, types, primaryType, message } as any);
    const digestHex = hashTypedData({ domain, types, primaryType, message } as any);
    return { signature, digestHex };
  };
}

/** The wallet's Perpl account id, or 0n if it has none (getAccountByAddr reverts for a missing account). */
export async function exchangeAccountId(address: `0x${string}`): Promise<bigint> {
  const data = encodeFunctionData({ abi: parseAbi(["function getAccountByAddr(address)"]), functionName: "getAccountByAddr", args: [address] });
  try {
    const res = await publicClient.call({ to: PERPL.exchange as `0x${string}`, data });
    return res.data && res.data.length >= 66 ? BigInt(res.data.slice(0, 66)) : 0n;
  } catch {
    return 0n;
  }
}

/** One-time: approve AUSD and open the on-chain account. Idempotent - returns early if the wallet
 *  already has an account (createAccount reverts for an existing one). */
export async function ensureExchangeAccount(wallet: Wallet, amountRaw = PERPL.minAccountOpen) {
  if ((await exchangeAccountId(wallet.address)) > 0n) return; // already set up

  const exchange = PERPL.exchange as `0x${string}`;
  const collateral = PERPL.collateral as `0x${string}`;

  const allowance = (await publicClient.readContract({
    address: collateral, abi: erc20Abi, functionName: "allowance", args: [wallet.address, exchange],
  })) as bigint;

  if (allowance < amountRaw) {
    const approveTx = await wallet.client.writeContract({
      address: collateral, abi: erc20Abi, functionName: "approve", args: [exchange, amountRaw],
      account: wallet.account, chain: wallet.client.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }

  const createTx = await wallet.client.writeContract({
    address: exchange, abi: exchangeAbi, functionName: "createAccount", args: [amountRaw],
    account: wallet.account, chain: wallet.client.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: createTx });
  return createTx;
}

/** Live oracle + top-of-book + scaling for a market (prices in price_decimals, sizes in size_decimals). */
export async function marketPrices(marketId: number): Promise<{ orl: number; bid: number; ask: number; priceDecimals: number; sizeDecimals: number }> {
  const ctx = await getContext();
  const m = (ctx.markets ?? []).find((x: any) => x.id === marketId);
  const s = m?.state;
  if (!s?.orl) throw new Error(`no market state for ${marketId}`);
  return { orl: s.orl, bid: s.bid ?? s.orl, ask: s.ask ?? s.orl, priceDecimals: m.config?.price_decimals ?? 0, sizeDecimals: m.config?.size_decimals ?? 0 };
}

// execOrder OrderDesc layout (names from Perpl's on-chain ABI; every field proven against live BTC
// fills - captured refs in README): [0] clientId, [1] perpId, [2] orderType, [3] orderId, [4] price,
// [5] size, [6] expiryBlock, [7] postOnly, [8] fillOrKill, [9] IOC, [10] maxMatches,
// [11] leverageHdths (x100, so 1500 = 15x), [12] lastExecBlock, [13] amountCNS, [14] maxNegPnlCollatBps.
export type ExecOrder = readonly [bigint, bigint, number, bigint, bigint, bigint, bigint, boolean, boolean, boolean, bigint, bigint, bigint, bigint, bigint];
export type Side = "long" | "short";
// orderType enum: OpenLong 0, OpenShort 1, CloseLong 2, CloseShort 3 (Cancel 4, Change 6).
const ORDER_TYPE = { openLong: 0, openShort: 1, closeLong: 2, closeShort: 3 } as const;

function buildOrder(marketId: number, orderType: number, priceScaled: number, sizeScaled: number, leverageHdths = 1500, maxNegPnlBps = 1000): ExecOrder {
  // IOC (field [9]) makes it a market order: fill what crosses now, never rest on the book.
  return [BigInt(Date.now()), BigInt(marketId), orderType, 0n, BigInt(priceScaled), BigInt(sizeScaled), 0n, false, false, true, 0n, BigInt(leverageHdths), 0n, 0n, BigInt(maxNegPnlBps)];
}

/** A price that crosses the book now: a buy pays through the ask, a sell hits through the bid. The
 *  band only guarantees a taker fill - maxNegPnlCollatBps is the real slippage guard. */
function marketable(isBuy: boolean, book: { bid: number; ask: number }, bufferBps = 200): number {
  const base = isBuy ? book.ask : book.bid;
  return Math.round(base * (isBuy ? 1 + bufferBps / 10000 : 1 - bufferBps / 10000));
}

async function submitOrder(wallet: Wallet, order: ExecOrder) {
  const tx = await wallet.client.writeContract({
    address: PERPL.exchange as `0x${string}`, abi: exchangeAbi, functionName: "execOrder",
    args: [order], account: wallet.account, chain: wallet.client.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  return tx;
}

// notionalUsd = (sizeScaled / 10^sizeDecimals) * (orl / 10^priceDecimals), so invert for the raw size.
function sizeFromNotional(notionalUsd: number, book: { orl: number; priceDecimals: number; sizeDecimals: number }): number {
  return Math.round((notionalUsd * 10 ** book.sizeDecimals * 10 ** book.priceDecimals) / book.orl);
}

/** Open a long or short on `marketId` sized by USD notional (converted per the market's decimals). */
export async function openPosition(wallet: Wallet, opts: { marketId: number; side: Side; notionalUsd: number; leverageHdths?: number }) {
  const isBuy = opts.side === "long";
  const book = await marketPrices(opts.marketId);
  const sizeScaled = sizeFromNotional(opts.notionalUsd, book);
  if (sizeScaled < 1) {
    // one size-unit is the smallest fillable order; below it the notional rounds to zero size.
    const minUsd = book.orl / (10 ** book.priceDecimals * 10 ** book.sizeDecimals);
    throw new Error(`Notional too small - minimum about $${minUsd.toFixed(2)} for this market`);
  }
  const type = isBuy ? ORDER_TYPE.openLong : ORDER_TYPE.openShort;
  return submitOrder(wallet, buildOrder(opts.marketId, type, marketable(isBuy, book), sizeScaled, opts.leverageHdths ?? 1500));
}

/** Flatten an open position - closing a long sells, closing a short buys. On-chain execOrder. */
export async function closePosition(wallet: Wallet, opts: { marketId: number; side: Side; sizeScaled: number }) {
  const isBuy = opts.side === "short"; // buying back to close a short
  const price = marketable(isBuy, await marketPrices(opts.marketId));
  const type = opts.side === "long" ? ORDER_TYPE.closeLong : ORDER_TYPE.closeShort;
  return submitOrder(wallet, buildOrder(opts.marketId, type, price, opts.sizeScaled));
}

/** Wallet-signed Ed25519 API-key enrollment (authenticated reads: account, positions, fills). */
export async function enroll(wallet: Wallet, origin = "https://testnet.perpl.xyz"): Promise<EnrollResult> {
  return enrollApiKey({ address: wallet.address, origin, label: "charter", signTyped: signTypedFor(wallet) });
}

export interface ReadCreds {
  apiKey: string;
  privateKey: Uint8Array;
}

/** Enroll a read-scoped API key (for the portfolio). Requires the exchange account to exist. */
export async function enrollReadKey(wallet: Wallet): Promise<ReadCreds> {
  const r = await enrollApiKey({
    address: wallet.address, origin: "https://testnet.perpl.xyz", label: "charter-read", scopeMask: 1,
    signTyped: signTypedFor(wallet),
  });
  return { apiKey: r.apiKey, privateKey: r.privateKey };
}

export interface Portfolio {
  accountValue: number; // AUSD in the exchange
  realizedPnl: number; // AUSD
  volume: number; // AUSD traded
  openPositions: number;
}

export interface OpenPosition {
  marketId: number;
  symbol: string;
  side: Side;
  sizeScaled: number;  // raw size as submitted on-chain (used to close)
  size: number;        // human size (e.g. 0.0001 BTC)
  entryUsd: number;    // human entry price
  notionalUsd: number; // size * entryUsd
}

/** Open positions from Perpl's authenticated REST, joined with market decimals. sd: 1 long, 2 short. */
export async function fetchPositions(creds: ReadCreds): Promise<OpenPosition[]> {
  const [p, ctx] = await Promise.all([
    signedFetch(creds, "GET", "/v1/trading/positions").then((r) => r.json()),
    getContext(),
  ]);
  const byId = new Map<number, any>((ctx.markets ?? []).map((m: any) => [m.id, m]));
  return (p.d ?? []).map((x: any) => {
    const m = byId.get(x.mkt);
    const size = x.s / 10 ** (m?.config?.size_decimals ?? 0);
    const entryUsd = x.ep / 10 ** (m?.config?.price_decimals ?? 0);
    return { marketId: x.mkt, symbol: m?.symbol ?? String(x.mkt), side: x.sd === 2 ? "short" : "long", sizeScaled: x.s, size, entryUsd, notionalUsd: size * entryUsd };
  });
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

// Fill `t` is the on-chain orderType + 1: 1 OpenLong, 2 OpenShort, 3 CloseLong, 4 CloseShort
// (verified against known capture txs).
const fillMeta = (t: number): { action: "Opened" | "Closed"; side: Side } => ({
  action: t <= 2 ? "Opened" : "Closed",
  side: t === 1 || t === 3 ? "long" : "short",
});

/** The account's recent on-chain fills (GET /v1/trading/fills), joined with market decimals. */
export async function fetchFills(creds: ReadCreds, limit = 12): Promise<Fill[]> {
  const [res, ctx] = await Promise.all([
    signedFetch(creds, "GET", "/v1/trading/fills").then((r) => r.json()),
    getContext(),
  ]);
  const byId = new Map<number, any>((ctx.markets ?? []).map((m: any) => [m.id, m]));
  return (res.d ?? []).slice(0, limit).map((f: any) => {
    const m = byId.get(f.mkt);
    const size = f.s / 10 ** (m?.config?.size_decimals ?? 0);
    const priceUsd = f.p / 10 ** (m?.config?.price_decimals ?? 0);
    return {
      marketId: f.mkt,
      symbol: m?.symbol ?? String(f.mkt),
      ...fillMeta(f.t),
      size,
      priceUsd,
      notionalUsd: size * priceUsd,
      feeUsd: Number(f.f ?? 0) / 10 ** PERPL.collateralDecimals,
      timeMs: f.at?.t ?? 0,
      txHash: f.at?.txid ? "0x" + f.at.txid : "",
    };
  });
}

/** Live portfolio from Perpl's authenticated REST (GET /v1/trading/wallet + /positions). */
export async function fetchPortfolio(creds: ReadCreds): Promise<Portfolio> {
  const w = await (await signedFetch(creds, "GET", "/v1/trading/wallet")).json();
  const p = await (await signedFetch(creds, "GET", "/v1/trading/positions")).json();
  const acct = w.as?.[0];
  const st = w.sts?.[0];
  const dec = 10 ** PERPL.collateralDecimals;
  return {
    accountValue: Number(acct?.b ?? 0) / dec,
    realizedPnl: Number(st?.trp ?? 0) / dec,
    volume: Number(st?.tv ?? 0) / dec,
    openPositions: (p.d ?? []).length,
  };
}
