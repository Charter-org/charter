'use client'

import { useEffect } from 'react'
import { ReactLenis, useLenis } from 'lenis/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(ScrollTrigger, SplitText)

/** Lenis driven from the GSAP ticker, feeding ScrollTrigger — one clock for smooth scroll + reveals. */
function Clock() {
  const lenis = useLenis()
  useEffect(() => {
    if (!lenis) return
    const tick = (t: number) => lenis.raf(t * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    const update = () => ScrollTrigger.update()
    lenis.on('scroll', update)
    return () => {
      gsap.ticker.remove(tick)
      lenis.off('scroll', update)
    }
  }, [lenis])
  return null
}

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('ch-js')
  }, [])
  return (
    <ReactLenis root options={{ autoRaf: false, lerp: 0.1, smoothWheel: true, anchors: true }}>
      <Clock />
      {children}
    </ReactLenis>
  )
}
