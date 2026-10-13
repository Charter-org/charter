# Charter — mobile app

Expo (React Native) app for the Agora "Best Mobile Trading App" track: passkey sign-in (Mera) →
live AUSD balance → a real Perpl perp trade. One token, AUSD, serves both the displayed balance and
the Perpl collateral on Monad testnet.

## Stack (all real integrations)

- **Mera** (`@category-labs/mera`) — passkey → EVM account. The key is derived from the passkey PRF
  output (no stored secret) and adapted to a viem account. `lib/wallet.ts`.
- **viem** — AUSD `balanceOf`, EIP-712 signing, and the exchange `createAccount` tx. `lib/tokens.ts`.
- **Perpl** — orders are on-chain `execOrder` txs signed by the wallet (the gasless WS relay is
  disabled on testnet → `OrderForwardingNotAllowed`). `lib/trade.ts`. The Ed25519 API key + WS
  (`lib/perpl.ts`) are the read path. Constants verified against the live `GET /api/v1/pub/context`.
  All four actions proven end-to-end on BTC against the live positions API (`orderType` 0/1/2/3,
  account #981): open long `0x6c5b42ed…`, open short `0xc8a55807…`, close long `0x4640482a…`,
  close short `0x15fb88b7…`. A market order is an IOC with the limit priced through the book
  (buy above ask, sell below bid); `maxNegPnlCollatBps` is the slippage guard. Position size is a USD
  notional converted per the market's `price_decimals`/`size_decimals`, verified across markets
  (ETH long `0xee527fb3…`, MON short `0x591d7971…`).

## Verify the non-UI paths headlessly

```
bun install
bun run verify        # live: Perpl context, AUSD balance read, Ed25519 signing
bun run typecheck     # tsc, app + lib
```

## Run on a device

Passkeys use a native module (`react-native-passkey`), so this does **not** run in Expo Go — build a
dev client:

```
bunx expo prebuild
bun run ios           # or: bun run android   (simulator/emulator or device)
```

### Required before passkeys work

1. **Associated domains.** Set `RP.id` in `lib/wallet.ts` to a host you control and serve
   `/.well-known/apple-app-site-association` (iOS) and `/.well-known/assetlinks.json` (Android) for it.
   Add the matching entitlement in the prebuilt native project.
2. **Fund AUSD.** The trade needs ≥100 testnet AUSD at the signed-in address (Perpl `createAccount`
   minimum). AUSD is not self-mintable — fund via the Perpl testnet app (`testnet.perpl.xyz`). Until
   funded, the app shows the balance and blocks "Set up trading account" (by design).

## Flow

Sign in → derive account → show live AUSD balance → (once funded) `createAccount` → open or close a
long or short on any Perpl market (BTC/ETH/SOL/MON/ZEC), sized by USD notional, via an on-chain
`execOrder` tx. Each step is a real on-chain / live-API call; nothing is mocked.
