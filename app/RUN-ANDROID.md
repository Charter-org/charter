# Run on Android

The passkey relying-party site is **already live** at `charter-passkeys.vercel.app` (serving
`/.well-known/assetlinks.json` with this app's signing fingerprint), so to run the canonical build you
only need to produce the APK. Sections 1 and 3 below are only for **forking** to your own domain.

## Quickest: standalone APK (no Metro, for anyone)

Build a self-contained APK anyone can install and open — no dev server, no cable:

```
cd app
npm i -g eas-cli
eas login                                   # the Expo account that owns this project (id in app.json)
eas build -p android --profile preview      # cloud build; prints an install URL / QR
```

Install the APK on an Android 9+ phone, open it, **Create a new account** → biometric → your account
address appears. Passkeys work because the build reuses the project's keystore, whose fingerprint is
already in the live `assetlinks.json`.

> Building under a **different** Expo account mints a new keystore with a new fingerprint, which won't
> match the live `assetlinks.json` — passkeys will fail. Either build under the owning account, or fork
> (sections 1 & 3) with your own domain + fingerprint.

## Fund the account, then trade

The passkey account is a fresh address (shown after login) — fund **that** address:
- **MON gas:** https://faucet.monad.xyz
- **AUSD (≥100):** connect the address at https://testnet.perpl.xyz and deposit.

Then in the app:
1. **Deploy & fund mandate** — deploys a mandate *you own* and opens the Perpl account it custodies.
2. **Trade** — pick a market (BTC/ETH/SOL/MON/ZEC), long or short, set notional + leverage. The order
   goes on-chain through your mandate's `execPerplOrder`; anything above your leverage cap **reverts
   before any funds move** (shown as "Refused by your mandate").

Portfolio and your trades read straight from Perpl's contracts — the mandate is the account holder.

---

## Dev build (code changes with live reload)

For hacking on the app with Fast Refresh:

```
cd app
eas build -p android --profile development   # one-time: installs a dev client
bun run start                                # Metro; open the dev client on the same network
```

## 1. Deploy your own passkey RP site (fork only)

Only if you're pointing the app at your own domain. The RP host must serve
`/.well-known/assetlinks.json`:

```
cd passkey-site
npx vercel --prod            # log in, accept defaults; framework = Other
```

Name it so the domain equals `RP.id` in `app/lib/wallet.ts` (currently `charter-passkeys.vercel.app`;
edit it to match your domain). Verify: `curl https://<domain>/.well-known/assetlinks.json` → JSON, 200,
no redirect.

## 3. Register your build's signing fingerprint (fork only)

EAS manages the signing keystore. Get its SHA-256 and put it in your `assetlinks.json`, then redeploy:

```
eas credentials -p android          # → Keystore → copy "SHA256 Fingerprint"
cd passkey-site && npx vercel --prod
```

(assetlinks is checked at passkey time, so updating it after the build is fine.)

## iOS (later)

Needs a Mac/EAS + paid Apple Developer account. The AASA file
(`passkey-site/.well-known/apple-app-site-association`) and `app.json` `ios.associatedDomains`
(`webcredentials:<rp-host>`) are the extra pieces; fill the Apple Team ID in the AASA.
