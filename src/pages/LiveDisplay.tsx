import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { NumberSpin } from '../components/NumberSpin'
import { RulesOverlay } from '../components/RulesOverlay'
import { api } from '../services/api'

const RULES_MS = 6000
const FACT_MS = 10_000

/** Rotating mix of live pool facts and event trivia. */
function buildFunFacts(total: number | null, drawn: number): string[] {
  const facts: string[] = []
  const remaining = total !== null ? Math.max(0, total - drawn) : null

  if (remaining !== null && remaining > 0) {
    facts.push(`You have a 1-in-${remaining} chance right now — ${remaining} numbers still in the pool!`)
  } else if (remaining === 0) {
    facts.push('Every number has been drawn — the pool is complete!')
  }
  if (drawn > 0) {
    facts.push(`${drawn} number${drawn === 1 ? '' : 's'} already drawn — and they can never win twice.`)
  }
  if (total !== null) {
    facts.push(`The pool holds ${total} special member-card numbers — one number, one equal chance.`)
  }
  facts.push('The draw uses cryptographic randomness — provably fair, nobody can game it.')
  facts.push('Qualification is tracked automatically from daily check-ins — no forms, no queues.')
  facts.push('Hold on to your special member card — it is your claim ticket.')
  facts.push('One number, one winner, one moment — the draw is final!')
  return facts
}

export function LiveDisplay() {
  const { state, runDraw } = useStore()
  const { numberWinners } = state

  // Re-run the reveal animation once per draw, when a new draw is detected.
  // Sequence: rules (brief) → spin → pop, mirroring the admin draw screen.
  const seenDrawRef = useRef<string | null>(state.lastDrawAt)
  // True while this screen is drawing its own number — the poll must not
  // re-open the rules screen for the very draw we are already revealing.
  const localDrawPendingRef = useRef(false)
  const [rulesPhase, setRulesPhase] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [pendingLocal, setPendingLocal] = useState(false)
  const [drawError, setDrawError] = useState<string | null>(null)
  const [liveTarget, setLiveTarget] = useState<string | null>(null)

  const latest = numberWinners.length > 0 ? numberWinners[numberWinners.length - 1] : null

  useEffect(() => {
    if (localDrawPendingRef.current) return
    if (state.lastDrawAt && state.lastDrawAt !== seenDrawRef.current) {
      seenDrawRef.current = state.lastDrawAt
      const winner = state.numberWinners[state.numberWinners.length - 1]
      if (winner) {
        setLiveTarget(winner.number)
        setRulesPhase(true)
      }
    }
  }, [state.lastDrawAt, state.numberWinners])

  async function handleRulesStart() {
    setRulesPhase(false)
    if (!pendingLocal) {
      // Draw was started elsewhere (admin page) — the winner is already picked.
      setSpinning(true)
      return
    }

    // Operator started the draw from this screen: pick a number now.
    setPendingLocal(false)
    setDrawing(true)
    setDrawError(null)
    localDrawPendingRef.current = true
    const res = await runDraw()
    localDrawPendingRef.current = false
    setDrawing(false)
    if (!res.ok || !res.winner) {
      setDrawError(res.error ?? 'The draw failed — try again.')
      return
    }
    // Mark this draw as seen so the 4s poll does not re-open the rules screen.
    seenDrawRef.current = res.winner.drawnAt
    setLiveTarget(res.winner.number)
    setSpinning(true)
  }

  function handleDrawAgain() {
    setDrawError(null)
    setPendingLocal(true)
    setRulesPhase(true)
  }

  const displayTarget = liveTarget ?? latest?.number ?? null

  // Pool total for the fun-fact odds line.
  const [poolTotal, setPoolTotal] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await api.getCards()
      if (!cancelled && response.ok && response.cardPool) setPoolTotal(response.cardPool.total)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Fun-fact ticker: rotate every FACT_MS with a fade-in per fact.
  const facts = buildFunFacts(poolTotal, numberWinners.length)
  const [factIndex, setFactIndex] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => {
      setFactIndex((i) => (i + 1) % Math.max(1, facts.length))
    }, FACT_MS)
    return () => window.clearInterval(id)
  }, [facts.length])
  const fact = facts[factIndex % facts.length]

  const remaining = poolTotal !== null ? Math.max(0, poolTotal - numberWinners.length) : null

  return (
    <div className="live live-hero">
      <section className="instruction-banner" aria-label="Raffle instructions">
        <div className="ib-title">📋 Please note</div>
        <ul className="ib-list">
          <li>
            <strong>The draw is final</strong> — once a number pops up, it stands. No swaps, no
            redraws.
          </li>
          <li>
            <strong>No registration desk to visit, no team to meet</strong> — all qualification is
            decided by the system only.
          </li>
          <li>
            <strong>Eligible: holders of the special member card</strong> — hold your card and watch
            your number.
          </li>
        </ul>
      </section>

      <section className="hero-draw">
        <NumberSpin
          target={displayTarget}
          running={spinning}
          onComplete={() => setSpinning(false)}
          hero
        />
        {latest && !spinning && (
          <p className="hero-draw-meta">
            Draw #{latest.sequence} · {numberWinners.length} drawn
            {remaining !== null && ` · ${remaining} numbers still in the pool`}
          </p>
        )}
      </section>

      <section className="fun-fact" key={factIndex} aria-live="polite">
        <span className="fun-fact-icon" aria-hidden="true">
          📡
        </span>
        <span className="fun-fact-text">{fact}</span>
      </section>

      <footer className="live-footer">
        <span className="live-sub">Updates automatically</span>
        <div className="btn-row">
          {remaining === 0 ? (
            <span className="muted">Every number has been drawn.</span>
          ) : (
            <button
              className="btn btn-accent"
              onClick={handleDrawAgain}
              disabled={drawing || spinning || rulesPhase}
            >
              {drawing
                ? 'Drawing…'
                : numberWinners.length
                  ? '🔄 Draw again'
                  : '🎬 Run the draw'}
            </button>
          )}
          {drawError && <span className="live-draw-error">{drawError}</span>}
        </div>
      </footer>

      <RulesOverlay
        open={rulesPhase}
        onStart={() => void handleRulesStart()}
        startLabel="Start the draw"
        autoStartMs={pendingLocal ? undefined : RULES_MS}
      />
    </div>
  )
}
