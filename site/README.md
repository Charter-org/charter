# Charter — website

The marketing site for Charter. Next.js 15 (App Router, static export-friendly), GSAP line-reveals +
pinned scroll, Lenis smooth scroll. Same visual language as the app: dark navy, electric-blue accent,
the on-chain **"Refused by your mandate"** moment as the centerpiece.

## Run

```
cd site
npm install
npm run dev          # http://localhost:3000
```

Build: `npm run build` (fully static, no backend). Typecheck: `npm run typecheck`.

## Deploy

Vercel is one command:

```
npx vercel --prod    # framework autodetected (Next.js)
```

## The APK download

The "Download" buttons point at the on-domain path **`/charter-android.apk`**, which `next.config.mjs`
redirects to the APK hosted in **Vercel Blob** (public). The binary stays out of git (Vercel's build
couldn't smudge Git LFS, and a 74 MB blob doesn't belong in history).

To ship a new build: upload the APK to the Blob store (`npx vercel blob put ./charter-vX.Y.Z.apk`, or the
dashboard) and update `APK_BLOB_URL` in `next.config.mjs`. Current build: **v0.3.0**.

## Favicon

`app/icon.png` (Charter's app icon) — Next.js App Router serves it as the favicon automatically.

## Edit

- Copy / sections — `app/page.tsx`
- Design tokens (palette, radii, easing) — `app/tokens.css`
- Layout + section styles — `app/site.css`
- On-chain addresses + download/repo links — `lib/links.ts`
- Phone mock (the app home screen, in HTML) — `components/PhoneMock.tsx`
- Pinned markets strip — `components/MarketsTrack.tsx`

All numbers on the page are real and verifiable (addresses link to the Monad testnet explorer; the
19/19 is `test/MandateExecution.t.sol`). Keep them honest when editing.
