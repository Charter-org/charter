/** Charter's app screens in a phone frame — built in HTML (no screenshots), matching the app. */

export function Phone({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="ch-phone" aria-label={label}>
      <div className="ch-phone__screen">
        <div className="ch-phone__status"><span>4:15</span><span className="ch-phone__island" /><span>5G</span></div>
        <div className="ch-phone__brand">
          <b>CHARTER</b>
          <span className="ch-dot">On-chain</span>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Hero: the full home screen — account + mandate + the refusal, in one glance. */
export function PhoneMock() {
  return (
    <Phone label="The Charter app home screen">
      <div className="ch-phone__card">
        <small>Account · passkey</small>
        <code>0x171e…CDE2</code>
        <div className="ch-phone__bal"><b>0</b><em>AUSD</em></div>
      </div>
      <div className="ch-phone__card">
        <small>Your mandate</small>
        <p className="ch-phone__terms">Max 2.00× leverage · 0.50% slippage · hedge at 10% drawdown</p>
        <div className="ch-phone__btn ch-phone__btn--primary">Agent: attempt a 3× long</div>
        <div className="ch-phone__btn">Agent: a 1.5× long</div>
        <div className="ch-phone__refused">
          <span className="ch-phone__refused-dot">⛔</span>
          Refused by your mandate — 3.00× exceeds your 2.00× cap. The contract reverted on-chain; no trade happened.
        </div>
      </div>
    </Phone>
  )
}

/** 01 · The guarantee — reckless refused (red), reasonable allowed (green). */
export function RefusalScreen() {
  return (
    <Phone label="The mandate refusing a reckless trade">
      <div className="ch-phone__card">
        <small>Your mandate</small>
        <p className="ch-phone__terms">Max 2.00× leverage · enforced on-chain</p>
        <div className="ch-phone__btn ch-phone__btn--primary">Agent: attempt a 3× long</div>
        <div className="ch-phone__refused">
          <strong className="ch-phone__verdict ch-phone__verdict--bad">⛔ Refused by your mandate</strong>
          3.00× exceeds your 2.00× cap. Reverted on-chain · <span className="ch-mono">LeverageExceeded</span> · no trade happened.
        </div>
      </div>
      <div className="ch-phone__card">
        <div className="ch-phone__btn">Agent: a 1.5× long</div>
        <div className="ch-phone__allowed">
          <strong className="ch-phone__verdict ch-phone__verdict--ok">✓ Allowed</strong>
          Within your 2.00× cap. Order sent to Perpl.
        </div>
      </div>
    </Phone>
  )
}

/** Step 01 · Passkey sign-in (Mera). */
export function PasskeyScreen() {
  return (
    <Phone label="Passkey sign-in">
      <div className="ch-phone__auth">
        <div className="ch-phone__auth-ic" aria-hidden>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 4 5v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V5l-8-3Z" />
            <path d="M9 12l2 2 4-5" />
          </svg>
        </div>
        <b>Create your account</b>
        <p>One biometric. No seed phrase, no extension, no custody backend.</p>
        <div className="ch-phone__btn ch-phone__btn--primary ch-phone__btn--wide">Continue with passkey</div>
        <span className="ch-phone__mera">Powered by Mera</span>
      </div>
    </Phone>
  )
}

/** Step 02 · Set a mandate you own. */
export function MandateFormScreen() {
  return (
    <Phone label="Create your own mandate">
      <div className="ch-phone__card">
        <small>Create your own mandate</small>
        <p className="ch-phone__terms">Set your limits and deploy a mandate you own, on-chain.</p>
        <div className="ch-phone__fields">
          <label>Max lev ×<span className="ch-phone__field">2</span></label>
          <label>Max slip %<span className="ch-phone__field">0.5</span></label>
          <label>Drawdown %<span className="ch-phone__field">10</span></label>
        </div>
        <div className="ch-phone__btn ch-phone__btn--primary ch-phone__btn--wide">Deploy mandate</div>
      </div>
    </Phone>
  )
}

/** Step 03 · The agent trades within it (on-chain decision feed). */
export function ActivityScreen() {
  const feed: [string, string, string, 'act' | 'abstain'][] = [
    ['act · Rebalance', 'signal up · opened 1.8× long', '12s', 'act'],
    ['abstain', 'drawdown within range', '1m', 'abstain'],
    ['act · Hedge', 'drawdown 11% > 10% trigger', '3m', 'act'],
    ['abstain', 'no edge this tick', '4m', 'abstain'],
  ]
  return (
    <Phone label="Agent activity feed">
      <div className="ch-phone__feedhead"><b>Agent activity</b><span className="ch-dot">live</span></div>
      <div className="ch-phone__feed">
        {feed.map(([t, r, time, kind]) => (
          <div key={t + time} className="ch-phone__row">
            <i className={`ch-phone__pip ch-phone__pip--${kind}`} />
            <span className="ch-phone__rowmain"><b>{t}</b><small>{r}</small></span>
            <em>{time}</em>
          </div>
        ))}
      </div>
      <span className="ch-phone__mera">Every decision is an on-chain event</span>
    </Phone>
  )
}

/** Step 04 · Stay in control (kill switch + limits). */
export function ControlScreen() {
  return (
    <Phone label="Manage your mandate">
      <div className="ch-phone__card">
        <small>Manage your mandate</small>
        <div className="ch-phone__ctl">
          <span><b>Agent</b><small>reading signal every tick</small></span>
          <span className="ch-phone__switch" data-on="true" aria-hidden />
        </div>
        <div className="ch-phone__btn ch-phone__btn--danger ch-phone__btn--wide">Pause agent · kill switch</div>
        <p className="ch-phone__terms">Owner-only · enforced on-chain. The agent can never widen your limits.</p>
      </div>
      <div className="ch-phone__card">
        <small>Your limits</small>
        <div className="ch-phone__fields ch-phone__fields--row">
          <label>Lev ×<span className="ch-phone__field">2</span></label>
          <label>Slip %<span className="ch-phone__field">0.5</span></label>
          <label>DD %<span className="ch-phone__field">10</span></label>
        </div>
      </div>
    </Phone>
  )
}

/** Custody · portfolio read on-chain. */
export function PortfolioScreen() {
  return (
    <Phone label="Portfolio, read on-chain">
      <div className="ch-phone__card">
        <small>Account value · the mandate holds it</small>
        <div className="ch-phone__bal"><b>1,284</b><em>AUSD</em></div>
        <span className="ch-phone__pnl">+$47.20 unrealized · +3.8%</span>
      </div>
      <div className="ch-phone__card">
        <small>Open position</small>
        <div className="ch-phone__row ch-phone__row--pos">
          <span className="ch-phone__rowmain"><b>BTC · long 2.0×</b><small>entry 64,120 · size $620</small></span>
          <em className="ch-phone__up">+$47.20</em>
        </div>
      </div>
      <span className="ch-phone__mera">Read straight from Perpl’s contracts</span>
    </Phone>
  )
}
