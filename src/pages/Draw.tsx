import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { NumberSpin } from '../components/NumberSpin'
import { RulesOverlay } from '../components/RulesOverlay'
import { Card, EmptyState, Message, Stat } from '../components/ui'
import { api } from '../services/api'
import type { CardPoolSummary } from '../domain/types'

export function Draw() {
  const { state, runDraw, clearWinners } = useStore()
  const [running, setRunning] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [target, setTarget] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; error?: string; message?: string } | null>(null)
  const [pool, setPool] = useState<CardPoolSummary | null>(null)

  const loadPool = useCallback(async () => {
    const response = await api.getCards()
    if (response.ok && response.cardPool) setPool(response.cardPool)
  }, [])

  useEffect(() => {
    void loadPool()
  }, [loadPool])

  const numberWinners = state.numberWinners
  const latest = numberWinners.length > 0 ? numberWinners[numberWinners.length - 1] : null
  const total = pool?.total ?? 0
  const remaining = total > 0 ? Math.max(0, total - numberWinners.length) : 0
  const displayTarget = target ?? latest?.number ?? null

  async function handleStart() {
    setRulesOpen(false)
    const res = await runDraw()
    if (!res.ok || !res.winner) {
      setResult({ ok: false, error: res.error })
      return
    }
    setResult(null)
    setTarget(res.winner.number)
    setRunning(true)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Number Draw</h1>
          <p>One random number wins. No entries, no weights — every number is equal.</p>
        </div>
        <button className="btn btn-accent" onClick={() => window.open('/#/live', '_blank')}>
          Open live display
        </button>
      </div>

      <div className="grid">
        <Stat label="Number pool" value={total || '—'} hint="registered member cards" />
        <Stat label="Remaining" value={total ? remaining : '—'} tone="a" hint="still in the draw" />
        <Stat label="Drawn so far" value={numberWinners.length} tone="b" />
        <Stat label="Winners" value={numberWinners.length} tone="muted" hint="one number each" />
      </div>

      <Card title="Draw">
        <NumberSpin
          target={displayTarget}
          running={running}
          onComplete={() => setRunning(false)}
        />

        <Message result={result} />

        <div className="btn-row" style={{ marginTop: '1.5rem' }}>
          <button
            className="btn btn-primary"
            onClick={() => setRulesOpen(true)}
            disabled={running || (total > 0 && remaining === 0)}
          >
            {running ? 'Drawing…' : numberWinners.length ? 'Draw again' : 'Run the draw'}
          </button>
          {numberWinners.length > 0 && (
            <button
              className="btn btn-danger"
              onClick={async () => {
                const res = await clearWinners()
                setResult(res.ok ? { ok: true, message: res.message } : { ok: false, error: res.error })
                setRunning(false)
                setTarget(null)
              }}
              disabled={running}
            >
              Clear winners
            </button>
          )}
          {total > 0 && remaining === 0 && (
            <span className="muted">Every number has been drawn.</span>
          )}
          {total === 0 && <span className="muted">Prepare the 120-card pool first.</span>}
        </div>
      </Card>

      {numberWinners.length > 0 && (
        <Card title="Drawn numbers">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Draw</th>
                  <th>Winning number</th>
                  <th>Drawn at</th>
                </tr>
              </thead>
              <tbody>
                {[...numberWinners].reverse().map((w) => (
                  <tr key={w.number}>
                    <td>#{w.sequence}</td>
                    <td>
                      <strong className="mono">{w.number}</strong>
                    </td>
                    <td className="muted">{new Date(w.drawnAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {total === 0 && (
        <Card title="Number pool">
          <EmptyState
            title="No numbers in the pool yet."
            hint="Open Member Cards and prepare the 120-card pool before drawing."
          />
        </Card>
      )}

      <RulesOverlay open={rulesOpen} onStart={() => void handleStart()} />
    </>
  )
}
