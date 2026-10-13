import { Magnetic } from './Magnetic'
import { APK } from '@/lib/links'

export function Nav() {
  return (
    <header className="ch-nav">
      <a href="#top" className="ch-wordmark" aria-label="Charter home">
        <svg viewBox="0 0 24 24" aria-hidden>
          <defs>
            <linearGradient id="ch-mark" x1="12" y1="4" x2="12" y2="20" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#8aa0ff" />
              <stop offset="1" stopColor="#3b61ff" />
            </linearGradient>
          </defs>
          <path d="M4.5 19 12 5l7.5 14" fill="none" stroke="url(#ch-mark)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        CHARTER
      </a>
      <nav className="ch-nav__links" aria-label="Sections">
        <a href="#guarantee">The guarantee</a>
        <a href="#how">How it works</a>
        <a href="#markets">Markets</a>
        <a href="#proof">On-chain</a>
        <a href="#faq">FAQ</a>
      </nav>
      <Magnetic href={APK} download className="ch-pill--sm">Download</Magnetic>
    </header>
  )
}
