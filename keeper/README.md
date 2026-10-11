# Charter keeper — the autonomous agent

The agent half of Charter. On each tick it reads a live market signal (BTC mark from Perpl), decides
**within the on-chain mandate**, and writes the decision on-chain: `act(Hedge|Rebalance, …)` or
`abstain(reason)`. Every call is a `Decision` event — a public, replayable log of what the agent saw
and did (including every decision to do nothing).

The mandate is the guarantee: a greedy, buggy, or compromised agent still **cannot** exceed the
owner's bounds — the contract reverts. The keeper proves this every few ticks with a deliberate
"reckless" 3× proposal that the mandate blocks (`LeverageExceeded`).

```
bun install
bun run agent.ts                      # continuous, 20s ticks
TICKS=6 INTERVAL=8 bun run agent.ts   # bounded demo run
```

Agent key is read from `../.env` (`PRIVATE_KEY`), and must be the mandate's `agent`. Operates the
spine Mandate `0x564EFe00cfF81eaF6A65422758C27A0c89EAA648` (2× leverage / 0.5% slippage cap, Kuru
allowlisted). Decisions show up in the app's Activity feed.
