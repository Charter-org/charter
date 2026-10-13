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

The "Download" buttons serve `public/charter-android.apk` **same-origin** (no GitHub redirect). The APK
is **gitignored** (repo policy: `*.apk` lives on Releases, not git). The Vercel CLI uploads files from
the working dir regardless of `.gitignore`, so `npx vercel --prod` ships it. If you deploy via the
**GitHub integration** instead, the file won't be in the repo — commit it, use Git LFS, or redirect to a
bucket/Release asset.

Update the build (stable filename keeps every link working):

```
cp charter-vX.Y.Z.apk site/public/charter-android.apk
```

The file currently in place is the **v0.2.0** build (that's what was available locally); drop in v0.3.0
to match the latest Release.

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
