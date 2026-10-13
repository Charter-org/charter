import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './tokens.css'
import './globals.css'
import './site.css'
import { SmoothScroll } from '@/components/SmoothScroll'

const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Charter — automated investing, with a guarantee',
  description:
    'An autonomous investing agent on Monad, bound by a rule it cannot break. Set a mandate once — max leverage, slippage, drawdown — and it lives in a contract, not a prompt. A reckless trade reverts on-chain. Your account is a passkey.',
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b0d12' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <SmoothScroll>
          {/* before first paint: lets reveal-able text start hidden (a CSS timeout always un-hides it) */}
          <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('ch-js')" }} />
          <div className="ch-site">
            <div className="ch-bg" aria-hidden />
            <div className="ch-grain" aria-hidden />
            {children}
          </div>
        </SmoothScroll>
      </body>
    </html>
  )
}
