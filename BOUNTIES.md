# BOUNTIES — adherence checklist

> 🔴 40% of each bounty score is **literal adherence to the published requirements**. The public page
> shows only one-line summaries. **Paste each bounty's full in-platform requirements here verbatim,
> one checkbox per line, before building.** A padded claim scores worse than no claim — only claim a
> bounty where the integration is load-bearing.

## Agora — Best Mobile Trading App on Monad ($10,000) — ★ OUR TRACK (01)

Full requirements (read from platform 2026-10-06). Deadline Oct 14, 2026 09:29 GMT+5:30.

- [ ] Build a **mobile application** (stated explicitly, twice — not just responsive web)
- [ ] Authenticate users via **Mera** (passkey)
- [ ] **Hold AND display** a stablecoin balance in **AUSD**
- [ ] **Execute at least one trade through Perpl**

Judging: implementation quality · user experience · **"creative use of the three integrations
together — not just technical completeness."**
→ Our mandate-bounded agent that holds AUSD and hedges on Perpl *is* the creative-use story.

Demo (**≤2 min**) MUST show: passkey login → funding/viewing an AUSD balance → placing ≥1 Perpl trade.

**RESOLVED — the AUSD/Perpl seam.** The bounty treats "AUSD balance displayed" and "a Perpl trade" as
two *separate* requirements; it does NOT require AUSD to be Perpl's collateral. So we stay on
**testnet**: AUSD (testnet `0xa9012a…`) is the user's displayed balance; the Perpl trade uses Perpl
testnet as-is. No mainnet, no blocker. (Keep [[perpl-testnet-ausd-gap]] in mind only for copy — don't
claim AUSD *is* the perp collateral on testnet.)

- [ ] **OPEN DECISION — surface form factor.** "mobile application" is explicit; 40% of bounty score
      is literal adherence. Recommend **Expo (React Native)**: one codebase ships a real iOS/Android
      app *and* a web URL a judge can click; Mera has a React Native guide. Alternatives: native-only
      RN, or mobile-web PWA (lighter, but weaker adherence to "mobile application").

## Agora — Best Cross-Border Payments App ($10,000) — TRACK 04, NOT OURS

Different track (Consumer Products & Payments) and a different product: send AUSD across borders via
Mera + the Instant Settlement contract (mock fund movements, `testnet.monadvision.com`) on Monad
testnet. Our project is a position manager, not a payments app. We submit to ONE track, so pursuing
this means a second app. **Recommend: do not pursue** unless we pivot the whole submission to Track 04.

## Perpl — API ($5,000)

One-line: *"production-ready trading bot or automation system."*
- [ ] (paste full requirements)

## Perpl — Analytics / Risk ($3,000)

One-line: *"real-time analytics, risk-monitoring, portfolio intelligence."*
- [ ] (paste full requirements)

## Kuru — Next Consumer Trading App ($5,000)

One-line: spot trading routed through Kuru's order book.
- [ ] (paste full requirements)

## Mera — Powered UX ($2,500)

One-line: *"Mera is the entire account layer — no seed phrase, no extension."*
- [ ] (paste full requirements)

## MetaMask — Agent Wallet Plugin ($2,500)

One-line: expose the mandate engine as an Agent Wallet plugin.
- [ ] (paste full requirements)

---

### All-track bounties — claim only where the integration is genuinely load-bearing
- [ ] Dynamic ($5,000) **or** Privy ($5,000) — ⚠️ Privy: "login-only integrations will not qualify"
- [ ] Nansen ($5,000) — counterparty/risk data, "beyond exposing raw data"
- [ ] Aurora Intents ($5,000) — any-chain deposits into the vault
- [ ] Chainlink CRE ($3,000) — orchestration layer for the agent loop
- [ ] Envio ($1,000) — index the decision log
- [ ] Monad Best Community Team ($5,000)
- [ ] Alchemy ($1,000 credits) · Kimi ($3,000 credits)
