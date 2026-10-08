# Metropolis — mobile app

Expo (React Native) app for the Agora "Best Mobile Trading App" track: passkey sign-in (Mera) →
live AUSD balance → a real Perpl perp trade. One token, AUSD, serves both the displayed balance and
the Perpl collateral on Monad testnet.

## Stack (all real integrations)

- **Mera** (`@category-labs/mera`) — passkey → EVM account. The key is derived from the passkey PRF
  output (no stored secret) and adapted to a viem account. `lib/wallet.ts`.
- **viem** — AUSD `balanceOf`, EIP-712 signing, and the exchange `createAccount` tx. `lib/tokens.ts`.
- **Perpl** — orders are on-chain `execOrder` txs signed by the wallet (the gasless WS relay is
  disabled on testnet → `OrderForwardingNotAllowed`). `lib/trade.ts`. The Ed25519 API key + WS
  (`lib/perpl.ts`) are the read path. Constants verified against the live `GET /api/v1/pub/context`;
  the `execOrder` call was proven end-to-end (tx `0x43e4f968…`, account #981 margin locked).

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

Sign in → derive account → show live AUSD balance → (once funded) `createAccount` → open a BTC perp
long via an on-chain `execOrder` tx. Each step is a real on-chain / live-API call; nothing is mocked.
