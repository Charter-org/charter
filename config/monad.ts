// Monad networks + Charter venue constants.
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

// Perpl — perpetual-futures leg.
// Orders are relayed off-chain: authenticate the trading WebSocket with an Ed25519 API key, then
// stream OrderRequest frames. The client does NOT sign each order on-chain, so a Solidity mandate
// cannot intercept a Perpl order the way it can a Kuru one — the perp bound lives at the collateral
// layer. Values verified 2026-10-07 against the live GET /api/v1/pub/context and the Perpl docs.
// IMPORTANT: testnet collateral IS AUSD (same token as AUSD.testnet below) — this collapses the
// Agora "display AUSD" + "Perpl collateral" requirements onto one token.
export const PERPL_TESTNET = {
  restBase: "https://testnet.perpl.xyz/api", // includes /api; sign canonical string per docs
  wsBase: "wss://testnet.perpl.xyz", // NO /api; streams: /ws/v1/market-data, /ws/v1/trading
  contextPath: "/v1/pub/context", // public, no auth — live chain + market config
  apiKeysUrl: "https://testnet.perpl.xyz/apikeys", // enroll an Ed25519 key here (Origin-whitelisted)
  chainId: 10143,
  exchange: "0x1964C32f0bE608E7D29302AFF5E61268E72080cc",
  collateral: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC", // AUSD, 6 decimals
  collateralDecimals: 6,
  minAccountOpen: 100_000_000n, // 100 AUSD (createAccount)
  minDeposit: 10_000_000n, // 10 AUSD
  marketIds: { BTC: 16, ETH: 32, SOL: 48, MON: 64, ZEC: 256 } as const,
} as const;

export const PERPL_MAINNET = {
  restBase: "https://app.perpl.xyz/api",
  wsBase: "wss://app.perpl.xyz",
  chainId: 143,
  exchange: "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F",
  collateral: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a", // AUSD on mainnet
  collateralDecimals: 6,
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
