// Perpl testnet client — portable across Node and React Native (no node:crypto).
// Constants verified 2026-10-07 against the live GET /api/v1/pub/context. Source of truth: config/monad.ts.
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { base64urlnopad } from "@scure/base";

export const PERPL = {
  restBase: "https://testnet.perpl.xyz/api",
  wsBase: "wss://testnet.perpl.xyz",
  tradingWsPath: "/ws/v1/trading",
  marketDataWsPath: "/ws/v1/market-data",
  chainId: 10143,
  exchange: "0x1964C32f0bE608E7D29302AFF5E61268E72080cc",
  collateral: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC", // AUSD
  collateralDecimals: 6,
  minAccountOpen: 100_000_000n, // 100 AUSD (createAccount minimum)
  marketIds: { BTC: 16, ETH: 32, SOL: 48, MON: 64, ZEC: 256 },
} as const;

const DEC = 10 ** PERPL.collateralDecimals;
export const rawToUsd = (raw: bigint): number => Number(raw) / DEC;
export const usdToRaw = (usd: number): bigint => BigInt(Math.round(usd * DEC));

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

/** New Ed25519 API-key pair. publicKeyHex is the 0x-hex sent at enrollment. */
export function generateApiKey() {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKey,
    privateKeyHex: "0x" + bytesToHex(privateKey),
    publicKeyHex: "0x" + bytesToHex(publicKey),
  };
}

/** Public, unauthenticated: live chain + market config. */
export async function getContext(): Promise<any> {
  const res = await fetch(`${PERPL.restBase}/v1/pub/context`);
  if (!res.ok) throw new Error(`context ${res.status}`);
  return res.json();
}

/**
 * Sign + send an authenticated REST request. Canonical string is six fields joined by "\n":
 * chain_id, METHOD, request-target (path+query as sent), timestamp_ms, nonce, sha256(body) hex.
 */
export async function signedFetch(
  opts: { apiKey: string; privateKey: Uint8Array },
  method: string,
  target: string,
  body = "",
): Promise<Response> {
  const timestamp = Date.now().toString();
  const nonce = base64urlnopad.encode(randomBytes(16));
  const bodyHash = bytesToHex(sha256(utf8ToBytes(body)));
  const canonical = [PERPL.chainId, method, target, timestamp, nonce, bodyHash].join("\n");
  const sig = ed25519.sign(utf8ToBytes(canonical), opts.privateKey);
  return fetch(`${PERPL.restBase}${target}`, {
    method,
    headers: {
      "X-API-Key": opts.apiKey,
      "X-API-Timestamp": timestamp,
      "X-API-Nonce": nonce,
      "X-API-Signature": base64urlnopad.encode(sig),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body } : {}),
  });
}

export interface EnrollResult {
  apiKey: string;
  privateKey: Uint8Array;
  privateKeyHex: string;
  info: any;
}

/** The caller signs the server's EIP-712 payload with the wallet and returns both the secp256k1
 *  signature and the 0x-hex EIP-712 digest. With viem: account.signTypedData(...) + hashTypedData(...). */
export type SignTyped = (typedData: any) => Promise<{ signature: `0x${string}`; digestHex: string }>;

/**
 * Programmatic key enrollment (two wallet-authorized endpoints). `signTyped` comes from the connected
 * wallet (Mera/viem); `origin` must be whitelisted by Perpl, else fall back to the web UI
 * (testnet.perpl.xyz/apikeys). Returns the X-API-Key token plus the Ed25519 secret to persist.
 */
export async function enrollApiKey(args: {
  address: `0x${string}`;
  scopeMask?: number;
  label?: string;
  origin: string;
  signTyped: SignTyped;
}): Promise<EnrollResult> {
  const key = generateApiKey();
  const headers = { "Content-Type": "application/json", Origin: args.origin };

  const payloadRes = await fetch(`${PERPL.restBase}/v1/api-key/payload`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      chain_id: PERPL.chainId,
      address: args.address,
      public_key: key.publicKeyHex,
      scope_mask: args.scopeMask ?? 3,
      label: args.label ?? "charter",
    }),
  });
  if (!payloadRes.ok) throw new Error(`payload ${payloadRes.status}: ${await payloadRes.text()}`);
  const { typed_data, mac } = await payloadRes.json();

  const { signature, digestHex } = await args.signTyped(typed_data);
  const pop = ed25519.sign(hexToBytes(digestHex.replace(/^0x/, "")), key.privateKey);

  const enrollRes = await fetch(`${PERPL.restBase}/v1/api-key/enroll`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      chain_id: PERPL.chainId,
      address: args.address,
      typed_data,
      mac,
      signature,
      pop_signature: "0x" + bytesToHex(pop),
    }),
  });
  if (!enrollRes.ok) throw new Error(`enroll ${enrollRes.status}: ${await enrollRes.text()}`);
  const info = await enrollRes.json();
  return { apiKey: info.api_key?.api_key ?? info.api_key, privateKey: key.privateKey, privateKeyHex: key.privateKeyHex, info };
}
