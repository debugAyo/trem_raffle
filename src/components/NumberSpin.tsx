import { useCallback, useEffect, useRef, useState } from 'react'

export type SpinPhase = 'idle' | 'spinning' | 'popped'

export interface NumberSpinProps {
  /** The winning number, known before the spin starts (server picks first). */
  target: string | null
  /** Runs the spin-and-pop animation whenever this becomes true. */
  running: boolean
  onComplete?: () => void
  compact?: boolean
  /** Giant projector-sized reels for the live display. */
  hero?: boolean
}

const DIGITS = 6
const SPIN_BASE_MS = 2100
const REEL_STAGGER_MS = 220
const CONFETTI_MS = 2000

const CONFETTI_COLORS = ['#6c5ce7', '#00d2ff', '#ffb545', '#22c98a', '#ff5c8a', '#f7f7ff']
const EMOJIS = ['🎉', '🎟️', '✨', '🪪', '💰', '🍀', '🎊', '⭐']

interface EmojiDrop {
  id: number
  emoji: string
  left: number
  delay: number
  duration: number
  size: number
}

let emojiId = 0

function buildEmojiRain(): EmojiDrop[] {
  if (prefersReducedMotion()) return []
  return Array.from({ length: 16 }, () => ({
    id: emojiId++,
    emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    left: 3 + Math.random() * 92,
    delay: Math.random() * 1.4,
    duration: 3.2 + Math.random() * 2,
    size: 1.6 + Math.random() * 1.6,
  }))
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rotation: number
  spin: number
  color: string
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function padTarget(target: string | null): string[] {
  const padded = (target ?? '').padStart(DIGITS, '0').slice(-DIGITS)
  return padded.split('')
}

/**
 * Slot-machine number reveal. Each of the six digits is an independent reel
 * that spins fast, decelerates, and lands left-to-right on the winning
 * number, which then pops with a confetti burst.
 */
export function NumberSpin({ target, running, onComplete, compact, hero }: NumberSpinProps) {
  const [phase, setPhase] = useState<SpinPhase>('idle')
  const [shown, setShown] = useState<string[]>(() => Array.from({ length: DIGITS }, () => '0'))
  const [emojiRain, setEmojiRain] = useState<EmojiDrop[]>([])
  const digitsRef = useRef<string[]>(shown)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const confettiRafRef = useRef(0)

  const goPopped = useCallback(() => {
    setEmojiRain(buildEmojiRain())
    setPhase('popped')
  }, [])

  const fireConfetti = useCallback(() => {
    if (prefersReducedMotion()) return
    const canvas = confettiCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    const originX = rect.width / 2
    const originY = rect.height * 0.45
    const particles: Particle[] = Array.from({ length: 80 }, () => ({
      x: originX + (Math.random() - 0.5) * 60,
      y: originY + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 11,
      vy: -Math.random() * 13 - 4,
      size: Math.random() * 8 + 4,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.35,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    }))

    const start = performance.now()
    cancelAnimationFrame(confettiRafRef.current)

    const tick = (now: number) => {
      const elapsed = now - start
      ctx.clearRect(0, 0, rect.width, rect.height)

      for (const p of particles) {
        p.x += p.vx
        p.vy += 0.32
        p.y += p.vy
        p.vx *= 0.99
        p.rotation += p.spin

        const alpha = Math.max(0, 1 - elapsed / CONFETTI_MS)
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx.restore()
      }

      if (elapsed < CONFETTI_MS) {
        confettiRafRef.current = requestAnimationFrame(tick)
      } else {
        ctx.clearRect(0, 0, rect.width, rect.height)
      }
    }
    confettiRafRef.current = requestAnimationFrame(tick)
  }, [])

  // Static reveal when winners already exist (e.g. live display reload).
  useEffect(() => {
    if (!running && target) {
      const digits = padTarget(target)
      digitsRef.current = digits
      setShown(digits)
      goPopped()
    } else if (!running && !target) {
      setEmojiRain([])
      setPhase('idle')
      setShown(Array.from({ length: DIGITS }, () => '0'))
    }
  }, [running, target, goPopped])

  useEffect(() => {
    if (!running || !target) return

    const digits = padTarget(target)
    setEmojiRain([])
    setShown(Array.from({ length: DIGITS }, () => '0'))
    setPhase('spinning')

    if (prefersReducedMotion()) {
      digitsRef.current = digits
      setShown(digits)
      goPopped()
      onCompleteRef.current?.()
      return
    }

    const start = performance.now()
    const durations = digits.map((_, i) => SPIN_BASE_MS + i * REEL_STAGGER_MS)
    const landed = digits.map(() => false)
    const lastTick = digits.map(() => 0)
    let raf = 0

    const frame = (now: number) => {
      const elapsed = now - start
      let allDone = true
      const next = digitsRef.current.slice()
      let changed = false

      for (let i = 0; i < DIGITS; i++) {
        if (landed[i]) continue
        const duration = durations[i]
        if (elapsed >= duration) {
          next[i] = digits[i]
          landed[i] = true
          changed = true
          continue
        }
        allDone = false
        const progress = elapsed / duration
        const interval = 40 + 280 * progress ** 3
        if (now - lastTick[i] >= interval) {
          lastTick[i] = now
          next[i] = String(Math.floor(Math.random() * 10))
          changed = true
        }
      }

      if (changed) {
        digitsRef.current = next
        setShown(next)
      }

      if (allDone) {
        goPopped()
        fireConfetti()
        onCompleteRef.current?.()
        return
      }
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, target, goPopped])

  useEffect(() => () => cancelAnimationFrame(confettiRafRef.current), [])

  if (phase === 'idle') {
    return (
      <div className={hero ? 'draw-stage draw-stage-hero' : 'draw-stage'}>
        <div>
          <div style={{ fontSize: hero ? '5.5rem' : compact ? '2.5rem' : '3.5rem' }}>🎟️</div>
          <p className="muted" style={hero ? { fontSize: 'clamp(1.1rem, 2vw, 1.5rem)' } : undefined}>
            The number draw has not started yet.
          </p>
        </div>
      </div>
    )
  }

  const sizeClass = hero ? ' number-spin-hero' : compact ? ' compact' : ''

  return (
    <div className={`number-spin${sizeClass}`}>
      <canvas ref={confettiCanvasRef} className="confetti-canvas" aria-hidden="true" />
      {phase === 'popped' && (
        <div className="winner-banner" role="status">
          🎉 Winning number! 🎉
        </div>
      )}
      <div className={`number-reels${phase === 'popped' ? ' popped' : ''}`}>
        {shown.map((digit, i) => (
          <span key={i} className={`reel-window${phase === 'spinning' ? ' spinning' : ''}`}>
            {digit}
          </span>
        ))}
      </div>
      {phase === 'popped' && (
        <p className="winner-meta spin-caption">
          This draw is final — claim with your special member card
        </p>
      )}
      {phase === 'spinning' && <p className="muted spin-caption">Drawing…</p>}
      {phase === 'popped' && emojiRain.length > 0 && (
        <div className="emoji-rain" aria-hidden="true">
          {emojiRain.map((drop) => (
            <span
              key={drop.id}
              className="emoji-drop"
              style={{
                left: `${drop.left}%`,
                fontSize: `${drop.size}rem`,
                animationDelay: `${drop.delay}s`,
                animationDuration: `${drop.duration}s`,
              }}
            >
              {drop.emoji}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
