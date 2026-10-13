'use client'

import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

/** The five Perpl markets Charter can trade, each a real on-chain marketId. */
const MARKETS: { sym: string; name: string; id: number; tint: string }[] = [
  { sym: 'BTC', name: 'Bitcoin', id: 16, tint: 'rgba(247, 147, 26, 0.5)' },
  { sym: 'ETH', name: 'Ethereum', id: 32, tint: 'rgba(125, 151, 255, 0.55)' },
  { sym: 'SOL', name: 'Solana', id: 48, tint: 'rgba(153, 69, 255, 0.5)' },
  { sym: 'MON', name: 'Monad', id: 64, tint: 'rgba(91, 214, 160, 0.5)' },
  { sym: 'ZEC', name: 'Zcash', id: 256, tint: 'rgba(255, 200, 87, 0.5)' },
]

/** Pinned horizontal scroll through the markets. Collapses to a stack on reduced-motion / small screens. */
export function MarketsTrack() {
  const wrap = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      gsap.to(track.current!, {
        xPercent: -100 * (MARKETS.length - 1),
        ease: 'none',
        scrollTrigger: {
          trigger: wrap.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.6,
          invalidateOnRefresh: true,
          snap: { snapTo: 1 / (MARKETS.length - 1), duration: { min: 0.25, max: 0.7 }, delay: 0.08, ease: 'power2.inOut' },
        },
      })
    },
    { scope: wrap },
  )
  return (
    <div ref={wrap} id="markets" className="ch-markets" style={{ ['--n' as any]: MARKETS.length }}>
      <div className="ch-markets__sticky">
        <div className="ch-markets__head">
          <p className="ch-kicker">04 · Perpl</p>
          <h2 className="ch-h2">Real perp trades, five markets deep.</h2>
          <p className="ch-body">Every order is a live <code>execOrder</code> on Perpl, sent by your mandate — never above the leverage you set.</p>
        </div>
        <div className="ch-markets__viewport">
          <div ref={track} className="ch-markets__track">
            {MARKETS.map((m, i) => (
              <article key={m.sym} className="ch-market" style={{ ['--tint' as any]: m.tint }}>
                <span className="ch-market__n">0{i + 1}</span>
                <div className="ch-market__chip"><b>{m.sym}</b></div>
                <h3>{m.name}</h3>
                <p>Long or short with a chosen notional and leverage, capped on-chain.</p>
                <span className="ch-market__id">marketId {m.id}</span>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
