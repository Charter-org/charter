// Live test: can we enroll a Perpl API key programmatically (viem signer), or is the Origin gated?
// Signs with the throwaway deployer EOA from ../.env. Run: bun run scripts/try-enroll.ts [origin]
import { readFileSync } from "fs";
import { join } from "path";
import { privateKeyToAccount } from "viem/accounts";
import { hashTypedData } from "viem";
import { enrollApiKey, type SignTyped } from "../lib/perpl";

const envPath = join(import.meta.dir, "..", "..", ".env");
const pk = readFileSync(envPath, "utf8").match(/^PRIVATE_KEY=(.+)$/m)?.[1]?.trim() as `0x${string}`;
if (!pk) throw new Error("PRIVATE_KEY not found in ../.env");

const account = privateKeyToAccount(pk);
const ORIGIN = process.argv[2] ?? "https://testnet.perpl.xyz";

const signTyped: SignTyped = async (td) => {
  const { EIP712Domain: _omit, ...types } = td.types;
  const primaryType = td.primaryType ?? Object.keys(types)[0];
  // viem needs numeric EIP-712 fields as bigint; the server returns them as hex strings.
  const domain = { ...td.domain, chainId: BigInt(td.domain.chainId) };
  const message = { ...td.message, time: BigInt(td.message.time) };
  const signature = await account.signTypedData({ domain, types, primaryType, message });
  const digestHex = hashTypedData({ domain, types, primaryType, message });
  return { signature, digestHex };
};

console.log("wallet:", account.address, "\norigin:", ORIGIN);
try {
  const r = await enrollApiKey({ address: account.address, origin: ORIGIN, label: "charter-test", signTyped });
  console.log("ENROLLED ✓ api_key:", String(r.apiKey).slice(0, 10) + "…", "\nsecret (persist):", r.privateKeyHex);
} catch (e: any) {
  console.log("enrollment failed ->", e.message);
}
