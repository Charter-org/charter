// Headless proof that the lib works against LIVE Monad/Perpl testnet. Run: bun run verify
import { ed25519 } from "@noble/curves/ed25519.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { encodeFunctionData, parseAbi } from "viem";
import { getContext, generateApiKey, PERPL } from "../lib/perpl";
import { ausdBalance } from "../lib/tokens";

const DEPLOYER = "0xcB4071FFfe67a4F21AA218fBeCf6FC8c0Ee67fDD";

async function main() {
  console.log("1) Perpl public context (live, no auth)");
  const ctx = await getContext();
  const inst = ctx.instances?.[0];
  const token = ctx.tokens?.find((t: any) => t.id === inst?.collateral_token_id);
  console.log("   chain:", ctx.chain?.chain_id, ctx.chain?.name);
  console.log("   collateral:", token?.symbol, token?.address, `(${token?.decimals}d)`);
  console.log("   min account open:", inst?.min_account_open_amount, "raw AUSD");
  console.log("   markets:", ctx.markets?.slice(0, 6).map((m: any) => `${m.symbol}#${m.id}`).join(" "));

  const okCollateral = token?.address?.toLowerCase() === PERPL.collateral.toLowerCase();
  console.log("   collateral matches our constant:", okCollateral);

  console.log("2) AUSD balance read via viem (live RPC)");
  console.log("   ", DEPLOYER, "->", await ausdBalance(DEPLOYER), "AUSD");

  console.log("3) Ed25519 signing self-test (the exact primitive used for API auth)");
  const key = generateApiKey();
  const canonical = [PERPL.chainId, "GET", "/v1/trading/fills?count=1", "1700000000000", "nonce", "deadbeef"].join("\n");
  const sig = ed25519.sign(utf8ToBytes(canonical), key.privateKey);
  const verified = ed25519.verify(sig, utf8ToBytes(canonical), ed25519.getPublicKey(key.privateKey));
  console.log("   pubkey:", key.publicKeyHex.slice(0, 18) + "…", "sig verifies:", verified);

  console.log("4) execOrder ABI encodes to the real on-chain selector (0x4d8dc985)");
  const abi = parseAbi(["function execOrder((uint256,uint256,uint8,uint256,uint256,uint256,uint256,bool,bool,bool,uint256,uint256,uint256,uint256,uint256))"]);
  const data = encodeFunctionData({ abi, functionName: "execOrder", args: [[0n, 16n, 0, 0n, 0n, 10n, 0n, false, false, false, 0n, 1500n, 0n, 0n, 1000n]] });
  const selOk = data.startsWith("0x4d8dc985");
  console.log("   selector:", data.slice(0, 10), "matches:", selOk);

  if (!okCollateral || !verified || !selOk) process.exit(1);
  console.log("\nAll live checks passed.");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
