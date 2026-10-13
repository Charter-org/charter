## Charter v0.3.0 — the mandate custodies the trade

Automated investing is a promise; this build makes it a **guarantee you can't argue with**. The mandate
no longer just *logs* the agent's decisions — it **holds the Perpl account and sends the orders itself**.
A reckless trade reverts on-chain before any funds move, whether it comes from the agent or from you.

### New
- **Trades go through your mandate.** Set up a trading account the mandate custodies, then open a long or
  short on **BTC / ETH / SOL / MON / ZEC** with a chosen notional and leverage. The order is a real
  on-chain `execOrder`, sent by the mandate via `execPerplOrder` — and **leverage is capped on-chain**:
  anything over your limit reverts before the order is placed ("Refused by your mandate").
- **Custody, not just logging.** The mandate holds its own Perpl account, so a compromised or buggy agent
  **cannot over-lever** — the enforcement is in the contract, not the app. Unit-tested in
  `test/MandateExecution.t.sol` (19/19, incl. `execPerplOrder` reverting `LeverageExceeded`).
- **Portfolio & trades read on-chain.** Account value, unrealized PnL, and open positions come straight
  from Perpl's contracts (the mandate is the account holder), and your trades are the mandate's own
  `PerplOrderPlaced` events — tap any one for size / fill / fee / tx. No self-reported numbers.

### Still here from v0.2.0
- Autonomous agent (keeper) writing `act` / `abstain` decisions on-chain every tick, within the mandate.
- Live Activity feed + proof-of-performance track record (N decisions, 0 breaches) from the on-chain log.
- Deploy a mandate *you own*; pause the agent (kill switch) or adjust limits live — owner-only, on-chain.
- Passkey sign-in (Mera) — no seed phrase, no extension, no custody backend.

### Install
Android 9+. Standalone APK — install and open, no dev server (see `app/RUN-ANDROID.md`). Passkey sign-in
and the Mandate refusal work with **zero funding**; trading needs testnet MON (`faucet.monad.xyz`) + AUSD.
Upgrading from an earlier build? Uninstall it first.

Signed with the project keystore (SHA-256 `5C:F3…859a8c`) — passkeys validate against the live assetlinks
at `charter-passkeys.vercel.app`.

On-chain: Mandate [`0x564EFe…A648`](https://testnet.monadexplorer.com/address/0x564EFe00cfF81eaF6A65422758C27A0c89EAA648) ·
Perpl exchange [`0x1964…80cc`](https://testnet.monadexplorer.com/address/0x1964C32f0bE608E7D29302AFF5E61268E72080cc)
