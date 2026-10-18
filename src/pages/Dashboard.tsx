import { useMemo } from 'react'
import { useStore } from '../state/store'
import { EVENT_DATES, TOTAL_EVENT_DAYS, formatEventDate, getEventProgress } from '../domain/constants'
import { getCategory, getEntryCount, getStats, getValidReferrals } from '../domain/rules'
import { Badge, Card, Stat } from '../components/ui'

export function Dashboard({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { state } = useStore()
  const { participants, numberWinners } = state
  const progress = getEventProgress()
  const stats = getStats(participants, progress.currentDate)

  const topReferrers = useMemo(
    () =>
      participants
        .map((p) => ({ p, referrals: getValidReferrals(p, participants) }))
        .filter((x) => x.referrals.length > 0)
        .sort((a, b) => b.referrals.length - a.referrals.length)
        .slice(0, 5),
    [participants],
  )

  return (
    <>
      <section className="event-banner">
        <div>
          <span className="event-kicker">TREM Glory House · 2026</span>
          <h1>We are settled.</h1>
          <p>Five days of presence, participation, and a Sunday celebration.</p>
        </div>
        <div className="event-banner-mark" aria-hidden="true">✦</div>
      </section>
      <div className="page-head">
        <div>
          <h1>Event Dashboard</h1>
          <p>{TOTAL_EVENT_DAYS} event days · October 13–18, 2026 (17th excluded)</p>
        </div>
        <Badge tone={progress.status === 'live' ? 'ok' : progress.status === 'finished' ? 'a' : 'warn'}>
          {progress.status === 'live' ? `Live — ${formatEventDate(progress.currentDate!)}` : progress.status === 'finished' ? 'Event finished' : 'Event upcoming'}
        </Badge>
      </div>

      <div className="grid">
        <Stat label="Participants" value={stats.total} hint="registered overall" />
        <Stat label="Category A" value={stats.categoryA} tone="a" hint="attended all 5 days" />
        <Stat label="Category B" value={stats.categoryB} tone="b" hint="attended 4+ days" />
        <Stat label="Not eligible" value={stats.ineligible} tone="muted" hint="fewer than 4 days" />
        <Stat label="Raffle entries" value={stats.totalEntries} hint="across eligible participants" />
      </div>

      <Card title="Attendance progress" action={<span className="muted">Day {progress.daysElapsed} of {TOTAL_EVENT_DAYS}</span>}>
        {stats.total === 0 ? (
          <p className="muted">No participants registered yet.</p>
        ) : (
          <>
            <div className="progress">
              <span className="bar-a" style={{ width: `${(stats.categoryA / stats.total) * 100}%` }} />
              <span className="bar-b" style={{ width: `${(stats.categoryB / stats.total) * 100}%` }} />
              <span className="bar-none" style={{ width: `${(stats.ineligible / stats.total) * 100}%` }} />
            </div>
            <div className="btn-row" style={{ marginTop: '0.9rem', fontSize: '0.82rem' }}>
              <Badge tone="a">{stats.categoryA} Category A</Badge>
              <Badge tone="b">{stats.categoryB} Category B</Badge>
              <Badge tone="muted">{stats.ineligible} not eligible</Badge>
            </div>
          </>
        )}

        <div className="btn-row" style={{ marginTop: '1.25rem' }}>
          {EVENT_DATES.map((d) => {
            const count = participants.filter((p) => p.attendance.includes(d)).length
            return (
              <Badge key={d} tone={d === progress.currentDate ? 'ok' : 'muted'}>
                {formatEventDate(d)}: {count}
              </Badge>
            )
          })}
        </div>
      </Card>

      <div className="grid">
        <Card title="Top referrers">
          {topReferrers.length === 0 ? (
            <p className="muted">No valid referrals yet.</p>
          ) : (
            topReferrers.map(({ p, referrals }) => (
              <div className="leader-row" key={p.id}>
                <span className="leader-name">{p.name}</span>
                <span />
                <span className="leader-entries">
                  {getCategory(p) === 'A' ? `+${referrals.length}` : '—'}
                </span>
              </div>
            ))
          )}
        </Card>

        <Card title="Draw status">
          {numberWinners.length === 0 ? (
            <>
              <p className="muted">The draw has not been run yet.</p>
              <div className="btn-row" style={{ marginTop: '1rem' }}>
                <button className="btn btn-primary" onClick={() => onNavigate('draw')}>
                  Go to draw screen
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              {[...numberWinners].reverse().slice(0, 5).map((w) => (
                <div key={w.number} className="btn-row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Draw #{w.sequence}</span>
                  <strong className="mono">{w.number}</strong>
                </div>
              ))}
              <button className="btn btn-accent" onClick={() => onNavigate('draw')}>
                View draw screen
              </button>
            </div>
          )}
        </Card>
      </div>

      <Card title="Referral entries at a glance">
        {participants.filter((p) => getCategory(p) === 'A').length === 0 ? (
          <p className="muted">No Category A participants yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Invited by</th>
                  <th>Valid referrals</th>
                  <th>Total entries</th>
                </tr>
              </thead>
              <tbody>
                {participants
                  .filter((p) => getCategory(p) === 'A')
                  .map((p) => {
                    const inviter = participants.find((x) => x.id === p.invitedById)
                    return (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td className="muted">{inviter?.name ?? '—'}</td>
                        <td>{getValidReferrals(p, participants).length}</td>
                        <td>
                          <strong>{getEntryCount(p, participants)}</strong>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}