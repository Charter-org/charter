/** Static, verifiable facts — not a live feed. Each number is checkable on-chain or in the repo. */
const STATS: [string, string][] = [
  ['2.00×', 'leverage cap, enforced on-chain'],
  ['0', 'breaches — the contract reverts first'],
  ['19 / 19', 'custody tests passing'],
  ['5', 'Perpl markets, real execOrder'],
]

export function StatGrid() {
  return (
    <div className="ch-stats">
      {STATS.map(([n, label]) => (
        <div key={label} className="ch-stat">
          <b>{n}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
