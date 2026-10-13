import { Nav } from '@/components/Nav'
import { Reveal, Rise } from '@/components/Reveal'
import { Magnetic } from '@/components/Magnetic'
import { PhoneMock, RefusalScreen, PasskeyScreen, MandateFormScreen, ActivityScreen, ControlScreen, PortfolioScreen } from '@/components/PhoneMock'
import { MarketsTrack } from '@/components/MarketsTrack'
import { StatGrid } from '@/components/StatGrid'
import { REPO, APK, addr, MANDATE, PERPL_EXCHANGE } from '@/lib/links'

const STEPS = [
  { n: '01', title: 'Sign in with a passkey.', body: 'No seed phrase, no browser extension, no custody backend. One biometric and you have an EVM account on Monad, powered by Mera.', screen: <PasskeyScreen /> },
  { n: '02', title: 'Set a mandate you own.', body: 'Max leverage, max slippage, a drawdown trigger — you choose them once, and they live in a contract you deploy and own. Not a prompt. Not a setting we can change.', screen: <MandateFormScreen /> },
  { n: '03', title: 'The agent trades within it.', body: 'An autonomous keeper reads a market signal each tick and writes its decision on-chain — act or abstain. Every order routes through your mandate, which caps leverage before any funds move.', screen: <ActivityScreen /> },
  { n: '04', title: 'Stay in control.', body: 'Pause the agent instantly — a kill switch — or tighten your limits live. Owner-only, enforced on-chain. The agent can never widen what you set.', screen: <ControlScreen /> },
]

const BUILT = [
  ['Mera', 'Passkey → EVM account. No seed phrase, no extension, no custody backend.', 'Best Mera-Powered UX'],
  ['Perpl', 'Real perp trades via execOrder, plus on-chain account and position reads.', 'Best use of Perpl’s API'],
  ['The Mandate', 'On-chain leverage / slippage / drawdown enforcement and auto-hedge.', 'Perpl Best Analytics / Risk Tool'],
  ['AUSD (Agora)', 'The displayed balance and the Perpl collateral — one token.', 'Best Mobile Trading App'],
  ['Monad', 'Per-block agent decisions, fully on-chain.', 'Track 01 · Onchain Finance'],
]

const FAQ: [string, string][] = [
  ['What does “a rule it cannot break” actually mean?', 'Your mandate is a smart contract on Monad. The agent and even you can only trade through it, and it checks leverage, slippage and drawdown before placing an order. If an order would exceed your cap, the contract reverts — the trade never reaches the exchange. The enforcement is in the contract, not in the app, so a buggy or compromised agent still can’t breach your limits.'],
  ['Who holds my money?', 'The mandate does. It custodies the collateral and holds its own Perpl account, and the agent can only send orders through it. There is no custody backend and no server with your keys — your account is a passkey on your device.'],
  ['Is this real or a simulation?', 'Real. Orders are live execOrder calls on Perpl on Monad testnet, portfolio and positions are read straight from Perpl’s contracts, and every agent decision is an on-chain event. The custody enforcement is unit-tested — 19/19, including an over-leverage order reverting LeverageExceeded.'],
  ['What can the agent trade?', 'Perps on five markets — BTC, ETH, SOL, MON and ZEC — long or short, with a notional and leverage you bound. Spot swaps go through the same mandate with a slippage floor.'],
  ['Do I need funds to try it?', 'No — passkey sign-in and the mandate-refusal demo work with zero funding. To place a real trade you need testnet MON for gas (faucet.monad.xyz) and testnet AUSD collateral, which you get by opening a Perpl account at testnet.perpl.xyz.'],
  ['Can I deploy my own mandate?', 'Yes. The app deploys a mandate you own, with your limits, and you can pause the agent or tighten the limits any time. It’s all owner-only and on-chain.'],
]

export default function Home() {
  return (
    <>
      <Nav />
      <main className="ch-main" id="top">
        {/* 1 · Hero */}
        <section className="ch-hero" aria-labelledby="hero-title">
          <div className="ch-hero__copy">
            <Reveal as="p" className="ch-kicker" onLoad>On-chain investing agent · Monad</Reveal>
            <Reveal as="h1" className="ch-h1" onLoad delay={0.1} id="hero-title">Automated investing is a promise. Charter makes it a guarantee.</Reveal>
            <Reveal as="p" className="ch-lede" onLoad delay={0.25}>
              An autonomous agent manages a position on Monad, bound by a rule it cannot break. You set the mandate once; it lives in a contract, not a prompt. When the agent tries to exceed it, the contract reverts.
            </Reveal>
            <Rise className="ch-cta" delay={0.4}>
              <Magnetic href={APK} download>Download for Android</Magnetic>
              <Magnetic href={REPO} external variant="ghost">View on GitHub</Magnetic>
            </Rise>
            <Rise delay={0.5}>
              <p className="ch-muted">Android 9+ · APK · passkey sign-in, no seed phrase. The mandate refusal works with zero funding.</p>
            </Rise>
          </div>
          <Rise className="ch-hero__phone" delay={0.3}>
            <PhoneMock />
          </Rise>
          <a href="#guarantee" className="ch-scroll-hint" aria-label="Scroll to learn more"><span /></a>
        </section>

        {/* 2 · The guarantee — the money shot */}
        <section id="guarantee" className="ch-feat" aria-labelledby="guarantee-title">
          <div className="ch-copy">
            <Reveal as="p" className="ch-kicker">01 · The guarantee</Reveal>
            <Reveal as="h2" className="ch-h2" id="guarantee-title">A reckless trade reverts on-chain.</Reveal>
            <Reveal as="p" className="ch-body">
              The agent proposes a 3× long. Your mandate allows 2×. So the contract refuses it — before any funds move, before the exchange ever sees it. Not a warning, not a log. The trade simply cannot happen. A 1.5× long, within your limit, goes straight through.
            </Reveal>
            <div className="ch-refused" aria-hidden>
              <span>Agent → open 3.00× long · BTC</span>
              <strong>Refused by your mandate</strong>
              <small>LeverageExceeded (0x6881ba1f) · reverted on-chain · no trade happened</small>
            </div>
          </div>
          <Rise className="ch-feat__media"><RefusalScreen /></Rise>
        </section>

        {/* 3 · How it works */}
        <section id="how" className="ch-how" aria-labelledby="how-title">
          <div className="ch-how__head">
            <Reveal as="p" className="ch-kicker">02 · How it works</Reveal>
            <Reveal as="h2" className="ch-h2" id="how-title">A guardrailed agent, in four moves.</Reveal>
          </div>
          {STEPS.map((s, i) => (
            <div key={s.n} className={`ch-step ch-feat${i % 2 === 1 ? ' ch-feat--rev' : ''}`}>
              <div className="ch-copy">
                <span className="ch-step__n" aria-hidden>{s.n}</span>
                <Reveal as="h3" className="ch-h3">{s.title}</Reveal>
                <Reveal as="p" className="ch-body">{s.body}</Reveal>
              </div>
              <Rise className="ch-feat__media">{s.screen}</Rise>
            </div>
          ))}
        </section>

        {/* 4 · Custody */}
        <section className="ch-feat ch-feat--rev" aria-labelledby="custody-title">
          <div className="ch-copy">
            <Reveal as="p" className="ch-kicker">03 · Custody</Reveal>
            <Reveal as="h2" className="ch-h2" id="custody-title">The mandate holds the account. Not the agent.</Reveal>
            <Reveal as="p" className="ch-body">
              Charter doesn’t just log the agent’s intentions — the mandate custodies the collateral and holds the Perpl account itself. Every order, from the agent or from you, goes through execPerplOrder, which caps leverage in the contract. A compromised keeper still can’t over-lever: the order reverts before it’s placed. The enforcement is on-chain, and it’s unit-tested, 19/19.
            </Reveal>
          </div>
          <Rise className="ch-feat__media"><PortfolioScreen /></Rise>
        </section>

        {/* 5 · Markets (pinned horizontal) */}
        <MarketsTrack />

        {/* 6 · Proof on-chain */}
        <section id="proof" className="ch-live" aria-labelledby="proof-title">
          <Reveal as="p" className="ch-kicker">Don’t trust — verify</Reveal>
          <Reveal as="h2" className="ch-h2" id="proof-title">Every claim here is on-chain.</Reveal>
          <Rise><StatGrid /></Rise>
          <Rise className="ch-addrs">
            <a href={addr(MANDATE)} target="_blank" rel="noreferrer" className="ch-addr">
              <span>Mandate</span>
              <code>{MANDATE.slice(0, 10)}…{MANDATE.slice(-4)}</code>
              <em>agent-operated · a 3× proposal reverts LeverageExceeded →</em>
            </a>
            <a href={addr(PERPL_EXCHANGE)} target="_blank" rel="noreferrer" className="ch-addr">
              <span>Perpl exchange</span>
              <code>{PERPL_EXCHANGE.slice(0, 10)}…{PERPL_EXCHANGE.slice(-4)}</code>
              <em>real execOrder perp trades · the mandate holds the account →</em>
            </a>
          </Rise>
          <p className="ch-muted">Monad testnet · chainId 10143.</p>
        </section>

        {/* 7 · Built on */}
        <section className="ch-built" aria-labelledby="built-title">
          <div className="ch-how__head">
            <Reveal as="p" className="ch-kicker">05 · Built on</Reveal>
            <Reveal as="h2" className="ch-h2" id="built-title">Real integrations, not mocks.</Reveal>
          </div>
          <div className="ch-built__grid">
            {BUILT.map(([name, body, tag]) => (
              <Rise key={name} className="ch-built__card">
                <span className="ch-built__tag">{tag}</span>
                <h3>{name}</h3>
                <p>{body}</p>
              </Rise>
            ))}
          </div>
        </section>

        {/* 8 · Fees / mantra marquee */}
        <section className="ch-fees" aria-labelledby="fees-title">
          <Reveal as="h2" className="ch-mega" id="fees-title">The bound is the product.</Reveal>
          <div className="ch-marquee" aria-hidden>
            <div>
              {Array.from({ length: 2 }).map((_, j) => (
                <span key={j}>
                  Leverage capped on-chain <i /> Passkey, no seed phrase <i /> Real Perpl trades <i /> Kill switch in one tap <i /> Custody in the contract <i /> Decisions logged every tick <i /> Deploy your own mandate <i /> Slippage floor <i /> Portfolio read on-chain <i /> Zero-funding demo <i />
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* 9 · FAQ */}
        <section id="faq" className="ch-faq" aria-labelledby="faq-title">
          <Reveal as="h2" className="ch-h2" id="faq-title">Questions.</Reveal>
          <div className="ch-faq__list">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 10 · Final */}
        <section className="ch-final" aria-labelledby="final-title">
          <Reveal as="h2" className="ch-mega" id="final-title">Set the rule. Let it run.</Reveal>
          <Rise className="ch-cta ch-cta--center">
            <Magnetic href={APK} download>Download for Android</Magnetic>
            <Magnetic href={REPO} external variant="ghost">Read the code</Magnetic>
          </Rise>
        </section>
      </main>
      <footer className="ch-footer">
        <span>Charter · an on-chain investing agent, bounded by a mandate</span>
        <span>
          Built on <a href="https://monad.xyz" target="_blank" rel="noreferrer">Monad</a> · <a href="https://perpl.xyz" target="_blank" rel="noreferrer">Perpl</a> · Mera · Agora
        </span>
      </footer>
    </>
  )
}
