# Run on Android (EAS cloud dev build)

No Android SDK needed locally — EAS builds the APK in the cloud. You need: a free Expo account, a
Vercel account, and a physical Android phone (Android 9+). Passkeys don't work in Expo Go, hence a
dev build.

## 1. Deploy the passkey relying-party site (Vercel)

The passkey RP host must serve `/.well-known/assetlinks.json`. Deploy `../passkey-site`:

```
cd ../passkey-site
npx vercel --prod            # log in, accept defaults; framework = Other
```

Name the project **metropolis-passkeys** so the domain is `metropolis-passkeys.vercel.app` — that
must equal `RP.id` in `lib/wallet.ts`. (Different name → edit `RP.id` to match.) Verify:

```
curl https://<your-domain>/.well-known/assetlinks.json   # JSON, HTTP 200, no redirect
```

## 2. Build the dev client (EAS)

```
cd ../app
npm i -g eas-cli
eas login                    # free Expo account
eas build -p android --profile development
```

Wait for the cloud build; it gives an install URL / QR for the APK.

## 3. Fill assetlinks with the app's signing fingerprint

EAS manages the signing keystore. Get its SHA-256:

```
eas credentials -p android          # → Keystore → copy "SHA256 Fingerprint"
```

Put that value in `../passkey-site/.well-known/assetlinks.json`
(`sha256_cert_fingerprints`), then redeploy:

```
cd ../passkey-site && npx vercel --prod
```

(assetlinks is checked at passkey time, so updating it after the build is fine.)

## 4. Install + run

- Install the APK on the phone (scan the EAS QR / open the install URL).
- Start Metro: `cd ../app && bun run start` — open the dev client on the phone (same network).
- In the app: **Create a new account** → biometric → account address appears.

## 5. Fund the on-device account, then trade

The passkey account is a fresh address (shown after login) — fund **that** address:
- **MON gas:** https://faucet.monad.xyz
- **AUSD (≥100):** connect it at https://testnet.perpl.xyz and deposit.

Then in the app: **Set up trading account** (`createAccount`) → **Open BTC long** (on-chain
`execOrder`). Done — the full Agora flow on a real device.

## iOS (later)

Needs a Mac/EAS + paid Apple Developer account. The AASA file
(`passkey-site/.well-known/apple-app-site-association`) and `app.json` `ios.associatedDomains`
(`webcredentials:<rp-host>`) are the extra pieces; fill the Apple Team ID in the AASA.
