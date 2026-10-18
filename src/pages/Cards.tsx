import { useEffect, useState } from 'react'
import { Card } from '../components/ui'
import { api } from '../services/api'
import type { CardPoolSummary } from '../domain/types'

export function Cards() {
  const [pool, setPool] = useState<CardPoolSummary | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const response = await api.getCards()
    if (response.ok && response.cardPool) setPool(response.cardPool)
    else setNotice({ ok: false, text: response.error ?? 'Could not load member cards.' })
  }

  useEffect(() => {
    void load()
  }, [])

  async function initialize() {
    setBusy(true)
    const response = await api.initializeCards()
    setBusy(false)
    if (response.ok && response.cardPool) {
      setPool(response.cardPool)
      setNotice({ ok: true, text: response.message ?? 'The card pool is ready.' })
    } else {
      setNotice({ ok: false, text: response.error ?? 'Could not initialize member cards.' })
    }
  }

  const cardPages = pool
    ? Array.from({ length: Math.ceil(pool.cards.length / 30) }, (_, pageIndex) =>
        pool.cards.slice(pageIndex * 30, pageIndex * 30 + 30),
      )
    : []

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Member Cards</h1>
          <p>Print the permanent six-digit IDs used to identify participants.</p>
        </div>
        <button className="btn btn-accent" onClick={() => window.print()} disabled={!pool}>
          Print cards
        </button>
      </div>

      {notice && <div className={`message ${notice.ok ? 'message-ok' : 'message-error'}`}>{notice.text}</div>}

      <Card title="Card pool">
        <div className="grid card-stats">
          <div className="stat"><span className="stat-label">Total cards</span><strong className="stat-value">{pool?.total ?? '—'}</strong></div>
          <div className="stat stat-a"><span className="stat-label">Assigned</span><strong className="stat-value">{pool?.assigned ?? '—'}</strong></div>
          <div className="stat stat-b"><span className="stat-label">Available</span><strong className="stat-value">{pool?.available ?? '—'}</strong></div>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => void initialize()} disabled={busy}>
            {busy ? 'Preparing…' : 'Prepare 120 cards'}
          </button>
          <span className="hint">Preparing again returns the same numbers and does not replace assigned cards.</span>
        </div>
      </Card>

      {cardPages.map((page, pageIndex) => (
        <section className="print-card-sheet" aria-label={`Printable member cards page ${pageIndex + 1}`} key={pageIndex}>
          {page.map((card) => (
            <article className="print-card" key={card.code}>
              <div className="print-card-brand">TREM Glory House</div>
              <div className="print-card-service">Alpha and Omega Service</div>
              <div className="print-card-schedule">Tuesday–Sunday · Saturday: Medical Outreach</div>
              <div className="print-card-label">Member card</div>
              <div className="print-card-code">{card.code}</div>
              <div className="print-card-name">{card.participantName ?? 'Name: ____________________'}</div>
            </article>
          ))}
        </section>
      ))}

      {pool && (
        <Card title={`Card assignments (${pool.assigned}/${pool.total})`}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Card ID</th><th>Assigned participant</th><th>Status</th></tr></thead>
              <tbody>
                {pool.cards.map((card) => (
                  <tr key={card.code}>
                    <td className="mono">{card.code}</td>
                    <td>{card.participantName ?? <span className="muted">Not assigned</span>}</td>
                    <td><span className={`badge ${card.participantId ? 'badge-ok' : 'badge-muted'}`}>{card.participantId ? 'Assigned' : 'Available'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}