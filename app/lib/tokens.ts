// AUSD balance reads via viem. Same client the app uses to read the user's displayed balance.
import { createPublicClient, defineChain, http, formatUnits, getAddress } from "viem";
import { PERPL } from "./perpl";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" } },
});

export const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });

const ERC20_BALANCE_OF = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** Raw AUSD balance (6-decimal integer) for an address. */
export async function ausdBalanceRaw(address: string): Promise<bigint> {
  return publicClient.readContract({
    address: getAddress(PERPL.collateral),
    abi: ERC20_BALANCE_OF,
    functionName: "balanceOf",
    args: [getAddress(address)],
  }) as Promise<bigint>;
}

/** Human-readable AUSD balance string, e.g. "12.34". */
export async function ausdBalance(address: string): Promise<string> {
  return formatUnits(await ausdBalanceRaw(address), PERPL.collateralDecimals);
}
