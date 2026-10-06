// Monad networks + Metropolis venue constants.
// Verified 2026-10-06 against official docs (Perpl api-docs, docs.kuru.io, Agora deployments,
// Monad docs). Re-verify the Kuru pins before the final build: the SDK is "under active
// development" and deployment addresses have drifted for other teams.

export const MONAD_TESTNET = {
  chainId: 10143,
  rpcUrl: "https://testnet-rpc.monad.xyz",
  explorer: "https://testnet.monadexplorer.com",
  gasFaucet: "https://testnet.monad.xyz", // 0.05–5 MON every 12h
} as const;

export const MONAD_MAINNET = {
  chainId: 143,
} as const;

// Perpl — perpetual-futures hedge leg.
// Orders are relayed GASLESSLY by the exchange off an Ed25519-signed REST/WS API; the client
// does NOT sign each order on-chain. => a Solidity mandate cannot intercept a Perpl order the way
// it can a Kuru one. Enforce the perp bound at the collateral level (see perpl-testnet-ausd-gap).
export const PERPL_TESTNET = {
  exchange: "0x1964c32f0be608e7d29302aff5e61268e72080cc",
  collateral: "0xdf5b718d8fcc173335185a2a1513ee8151e3c027", // symbol "USD" — NOT AUSD on testnet
  rest: "https://testnet.perpl.xyz/api",
  ws: "wss://testnet.perpl.xyz",
  tradingWs: "wss://testnet.perpl.xyz/ws/v1/trading",
} as const;

export const PERPL_MAINNET = {
  exchange: "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F",
  collateral: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a", // AUSD on mainnet
} as const;

// Kuru — fully on-chain central-limit order book, spot-rebalance leg.
// The refusal demo lives HERE: the agent signs on-chain via an ethers signer, so Mandate.sol can
// gate the call and revert on breach.
export const KURU_TESTNET = {
  router: "0x7EFbE105Ca7415dE98F96622173458ac1c054630",
  marginAccount: "0xd029C2D98ff85D8F64799017fE00a59B1159CE02",
  forwarder: "0x681bB1508E14433b148a2549ba2726454aDc9BB4",
  deployer: "0xDacd06372cEb638640c9D8466A023b7362324e1A",
  utils: "0xE0841E0F06c5770C1D4930EC6C507ee33199C88C",
  usdc: "0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570",
  markets: {
    monUsdc: "0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9",
  },
} as const;

// AUSD (Agora) — the user-facing vault balance.
export const AUSD = {
  testnet: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  mainnet: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
} as const;
