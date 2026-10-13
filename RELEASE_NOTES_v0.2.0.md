## Charter v0.2.0 — the agent, on-chain

The mandate now has an **agent** behind it, you can **own the mandate yourself**, and the whole app
has a new look.

### New
- **Autonomous agent, not a button.** A keeper reads a live market signal each tick and writes its
  decision on-chain — `act(Hedge|Rebalance)` or `abstain(reason)` — always within the mandate.
- **Live Activity feed.** Every agent decision (including every decision to do nothing) is a public
  on-chain `Decision` event, shown in-app.
- **Proof-of-performance.** A provable track record read straight from the on-chain log — how many
  decisions the agent made and that it **never once breached your limits**. Not a self-reported number.
- **Deploy your own mandate, and stay in control.** Set your own leverage / slippage / drawdown limits
  and deploy a mandate _you own_, then **pause the agent instantly** (a kill switch) or adjust your
  limits live — all owner-only, enforced on-chain.
- **Portfolio.** Account value, realized PnL, volume, and open positions from Perpl's authenticated API.
- **Redesigned UI.** A cleaner, more trustworthy fintech look — Inter typography, a refined slate
  palette, and a mandate-refusal moment that reads unmistakably as a hard on-chain stop.
- Refresh now reloads the feed and portfolio too.

### Still here from v0.1.0
- Passkey sign-in (Mera) — no seed phrase, no extension, no custody backend.
- On-chain Mandate refusal: a reckless 3× long reverts `LeverageExceeded`; 1.5× is allowed.
- Real Perpl BTC perp long (`execOrder`) from a passkey account.

### Install
Android 13+. Passkey sign-in and the Mandate refusal work with **zero funding**; the Perpl trade needs
testnet MON (`faucet.monad.xyz`) + AUSD. Upgrading from v0.1.0? Uninstall it first.

Signed with the same keystore as v0.1.0 (SHA-256 `5C:F3…859a8c`) — passkeys validate against the live
assetlinks.

On-chain: Mandate [`0x564EFe…A648`](https://testnet.monadexplorer.com/address/0x564EFe00cfF81eaF6A65422758C27A0c89EAA648) ·
Perpl exchange [`0x1964…80cc`](https://testnet.monadexplorer.com/address/0x1964C32f0bE608E7D29302AFF5E61268E72080cc)
