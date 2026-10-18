import { useEffect, useRef } from 'react'

export interface RulesOverlayProps {
  open: boolean
  onStart: () => void
  startLabel?: string
  /** When set, the rules auto-dismiss and start the draw after this many ms. */
  autoStartMs?: number
}

/**
 * Rules screen shown before every draw. The system makes every eligibility
 * decision automatically — players never visit a registration counter or
 * answer questions. The admin clicks "Start the draw" to begin the spin.
 */
export function RulesOverlay({ open, onStart, startLabel = 'Start the draw', autoStartMs }: RulesOverlayProps) {
  const onStartRef = useRef(onStart)
  onStartRef.current = onStart

  useEffect(() => {
    if (!open || !autoStartMs) return
    const timer = window.setTimeout(() => onStartRef.current(), autoStartMs)
    return () => window.clearTimeout(timer)
  }, [open, autoStartMs])

  if (!open) return null

  return (
    <div className="rules-overlay" role="dialog" aria-modal="true" aria-label="Raffle rules">
      <div className="rules-panel">
        <h2>Before we draw</h2>
        <ol className="rules-list">
          <li>
            <strong>The draw is final.</strong> Once a number pops up, it stands — no swaps, no
            redraws.
          </li>
          <li>
            <strong>No registration desk, no team to meet.</strong> Qualification is decided by the
            system only — there are no forms to fill and no questions to answer.
          </li>
          <li>
            <strong>Only holders of the special member card are eligible.</strong> Every registered
            card number is in the pool — one number, one equal chance.
          </li>
          <li>
            Each number can <strong>win only once</strong>. Drawn numbers leave the pool.
          </li>
          <li>
            When your number pops up, <strong>come forward with your member card</strong> to claim
            your prize.
          </li>
        </ol>
        <button className="btn btn-accent btn-lg" onClick={onStart}>
          {startLabel}
        </button>
      </div>
    </div>
  )
}
