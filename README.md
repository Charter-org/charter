# METROPOLIS

**A position manager that runs every block, bounded by a rule it cannot break.**

You deposit. You set a mandate once — *never above 2× leverage · never more than X bps slippage ·
hedge if drawdown exceeds Y%*. An agent then manages the position continuously, hedging on **Perpl**
and rebalancing through **Kuru**. Every decision — including every decision to do nothing — is
written on-chain for anyone to replay.

The mandate lives in a **contract, not a prompt**. The agent cannot talk its way past it: when it
tries to exceed the bound, the contract reverts. This is the only honest answer to "how much
autonomy do you give an agent over real money?" — and it only exists on Monad, because per-block
on-chain action is economically impossible anywhere else.

Built for the **Monad Metropolis Hackathon** — Track 01, Onchain Finance & Trading.

---

## Status

Spine live on **Monad testnet** (chainId 10143).

- **`Mandate` contract:** [`0x564EFe00cfF81eaF6A65422758C27A0c89EAA648`](https://testnet.monadexplorer.com/address/0x564EFe00cfF81eaF6A65422758C27A0c89EAA648)
  — terms: max **2.00x** leverage · max **0.50%** slippage · hedge trigger at **10%** drawdown.
- **Custody + execution:** the owner deposits capital into the mandate; the agent can only move it
  through `executeSwap`, which measures the realized fill and **reverts the trade** if it breaches the
  slippage floor. A breach undoes a real swap, not just a log row (`test/MandateExecution.t.sol`).
- **Proven on-chain:** an in-bounds action and an abstention are recorded as `Decision` rows; an
  attempt to exceed leverage (2.50x) **reverts** (`LeverageExceeded`). 14/14 local tests pass.
- Deployment + evidence tx hashes: `deployments/monad-testnet.json`. Venue constants: `config/monad.ts`.
- Bounty adherence checklist: `BOUNTIES.md`.

The custody gate is live and tested. Next: exercise the `executeSwap` refusal on-chain against a real
Kuru router + price-source adapter, then the per-block agent loop and the Mera/AUSD mobile surface.

## Architecture (planned, spine-first)

1. **`Mandate.sol`** on Monad — max leverage, max slippage, drawdown trigger, allowlisted venues.
   Reverts on breach. The contract the agent cannot exceed.
2. **Per-block agent loop** — read position → evaluate against the mandate → decide → act or abstain.
3. **On-chain decision log** — every evaluation is a row: inputs seen, rule applied, action taken or
   the reason for abstaining. Abstentions are rows too.
4. **Venues** — Perpl (perps hedge), Kuru (on-chain spot rebalance).
5. **Surface** — Mera passkey login (no seed phrase, no extension), AUSD balance, a page anyone can drive.
6. **Baseline** — a naive hourly rebalancer run on the same data, for the headline number.

## Tech stack

- **Chain:** Monad testnet (chainId `10143`) — see `config/monad.ts`.
- **Contracts:** Solidity / Foundry.
- **App:** TypeScript; viem/wagmi; Mera for passkey accounts.
- **Venues:** `@kuru-labs/kuru-sdk` (on-chain CLOB); Perpl REST/WS API (Ed25519-signed).

## Setup

_To be filled in as the build lands. Network constants and contract addresses live in
`config/monad.ts`._

## Attribution

External SDKs and docs: `@kuru-labs/kuru-sdk`, Perpl `api-docs`, Mera (`category-labs/mera`), Agora
AUSD. Any third-party code is identified at its use site.

## AI tool disclosure

This project is built with AI coding assistance (Claude Code). Per hackathon rules, AI tool use is
permitted and disclosed here. Human authors direct the design, review all code, and own the
submission.

## License

MIT — see `LICENSE`.
