// Real Perpl trade flow (Monad testnet). Orders are submitted ON-CHAIN via execOrder — the gasless
// WS relay is disabled on testnet (returns sr:34 OrderForwardingNotAllowed), so the wallet signs each
// order tx itself. Verified end-to-end against a successful UI trade (tx 0x3a6d5fe0…) and a replayed
// order from our stack (tx 0x43e4f968…): account #981 balance moved, margin locked.
//   1. ensureExchangeAccount — approve AUSD + createAccount(amount) (one-time)
//   2. openLong              — execOrder(...) on the exchange
// enroll()/signTypedFor are the authenticated-read path (Ed25519 API key); not needed to trade.
import { parseAbi, hashTypedData } from "viem";
import { PERPL, enrollApiKey, getContext, type SignTyped, type EnrollResult } from "./perpl";
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

/** One-time: approve AUSD to the exchange and open the on-chain account with collateral. */
export async function ensureExchangeAccount(wallet: Wallet, amountRaw = PERPL.minAccountOpen) {
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

/** Current oracle price (`orl`, scaled by the market's price_decimals) from the public context. */
export async function oraclePrice(marketId: number): Promise<number> {
  const ctx = await getContext();
  const m = (ctx.markets ?? []).find((x: any) => x.id === marketId);
  if (!m?.state?.orl) throw new Error(`no oracle price for market ${marketId}`);
  return m.state.orl;
}

// execOrder struct, replicated from the verified UI long. Fields proven variable: [0]=time(ms),
// [4]=oracle price, [5]=size. The rest are copied from the known-good long.
// ponytail: only the long side is sampled (side byte = 0); short + custom leverage need another
// reference tx before parameterizing [2]/[11].
export type ExecOrder = readonly [bigint, bigint, number, bigint, bigint, bigint, bigint, boolean, boolean, boolean, bigint, bigint, bigint, bigint, bigint];

export function buildLong(marketId: number, oracle: number, sizeScaled: number, maxSlippageBps = 1000): ExecOrder {
  return [BigInt(Date.now()), BigInt(marketId), 0, 0n, BigInt(oracle), BigInt(sizeScaled), 0n, false, false, false, 0n, 1500n, 0n, 0n, BigInt(maxSlippageBps)];
}

/** Open a long on `marketId` for `sizeScaled` (market's size_decimals). Submits execOrder on-chain. */
export async function openLong(wallet: Wallet, opts: { marketId: number; sizeScaled: number; maxSlippageBps?: number }) {
  const order = buildLong(opts.marketId, await oraclePrice(opts.marketId), opts.sizeScaled, opts.maxSlippageBps ?? 1000);
  const tx = await wallet.client.writeContract({
    address: PERPL.exchange as `0x${string}`, abi: exchangeAbi, functionName: "execOrder",
    args: [order], account: wallet.account, chain: wallet.client.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  return tx;
}

/** Wallet-signed Ed25519 API-key enrollment (authenticated reads: account, positions, fills). */
export async function enroll(wallet: Wallet, origin = "https://testnet.perpl.xyz"): Promise<EnrollResult> {
  return enrollApiKey({ address: wallet.address, origin, label: "charter", signTyped: signTypedFor(wallet) });
}
