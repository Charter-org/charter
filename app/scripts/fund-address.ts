// Dev-wallet faucet: send MON (gas) + AUSD (collateral) to an address so it can deploy a mandate
// and open a Perpl account. Testnet only. Key read from repo-root .env (never committed).
//   bun run scripts/fund-address.ts <address> [monAmount] [ausdAmount]
import { readFileSync } from "fs";
import { join } from "path";
import { createWalletClient, http, parseEther, parseUnits, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet, publicClient, ausdBalance } from "../lib/tokens";
import { PERPL } from "../lib/perpl";

const target = getAddress(process.argv[2] ?? "");
const mon = process.argv[3] ?? "0.5";
const ausd = process.argv[4] ?? "150";

const pk = readFileSync(join(import.meta.dir, "..", "..", ".env"), "utf8").match(/^PRIVATE_KEY=(.+)$/m)?.[1]?.trim() as `0x${string}`;
if (!pk) throw new Error("PRIVATE_KEY not found in repo-root .env");
const account = privateKeyToAccount(pk);
const wallet = createWalletClient({ account, chain: monadTestnet, transport: http() });

const erc20 = [{ name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }] as const;

console.log(`from ${account.address}\n  -> ${target}\n  MON ${mon} + AUSD ${ausd}`);

const monTx = await wallet.sendTransaction({ to: target, value: parseEther(mon) });
const monRc = await publicClient.waitForTransactionReceipt({ hash: monTx });
console.log(`MON  tx ${monTx} ${monRc.status}`);

const ausdTx = await wallet.writeContract({
  address: getAddress(PERPL.collateral), abi: erc20, functionName: "transfer",
  args: [target, parseUnits(ausd, PERPL.collateralDecimals)],
});
const ausdRc = await publicClient.waitForTransactionReceipt({ hash: ausdTx });
console.log(`AUSD tx ${ausdTx} ${ausdRc.status}`);

if (monRc.status !== "success" || ausdRc.status !== "success") throw new Error("a transfer reverted");
console.log(`target now holds ${await ausdBalance(target)} AUSD`);
