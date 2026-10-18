import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { getCategory, getEntryCount, getInvitees, getInvitedBy, getValidReferrals } from '../domain/rules'
import { Badge, Card, CategoryBadge, EmptyState, Stat } from '../components/ui'

export function Leaderboard() {
  const { state } = useStore()
  const [scope, setScope] = useState<'referrals' | 'entries'>('referrals')
  const { participants } = state

  const rows = useMemo(() => {
    const withStats = participants.map((p) => ({
      p,
      referrals: getValidReferrals(p, participants).length,
      invited: getInvitees(p, participants).length,
      entries: getEntryCount(p, participants),
      category: getCategory(p),
    }))

    return withStats.sort((a, b) =>
      scope === 'referrals'
        ? b.referrals - a.referrals || b.invited - a.invited || a.p.name.localeCompare(b.p.name)
        : b.entries - a.entries || a.p.name.localeCompare(b.p.name),
    )
  }, [participants, scope])

  const shown = scope === 'referrals' ? rows.filter((r) => r.invited > 0) : rows.filter((r) => r.category !== null)

  const totalValid = rows.reduce((sum, r) => sum + r.referrals, 0)
  const catA = rows.filter((r) => r.category === 'A').length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Referral Leaderboard</h1>
          <p>A referral counts once the invited participant attends 4 or more event days.</p>
        </div>
      </div>

      <div className="grid">
        <Stat label="Valid referrals" value={totalValid} hint="invitees with 4+ days" />
        <Stat label="Category A" value={catA} tone="a" hint="eligible for bonus entries" />
        <Stat
          label="Bonus entries"
          value={rows.filter((r) => r.category === 'A').reduce((s, r) => s + r.referrals, 0)}
          tone="b"
          hint="earned by Category A"
        />
        <Stat label="Participants" value={participants.length} tone="muted" />
      </div>

      <Card
        title="Ranking"
        action={
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'referrals' | 'entries')}
            style={{ width: 'auto' }}
          >
            <option value="referrals">By referrals</option>
            <option value="entries">By raffle entries</option>
          </select>
        }
      >
        {shown.length === 0 ? (
          <EmptyState
            title={scope === 'referrals' ? 'No referrals recorded yet.' : 'No eligible participants yet.'}
            hint="Register participants and record their attendance to build the board."
          />
        ) : (
          <div>
            {shown.map((row, i) => (
              <div className="leader-row" key={row.p.id}>
                <span className="leader-rank">{i + 1}</span>
                <span>
                  <span className="leader-name">{row.p.name}</span>
                  <div className="btn-row" style={{ marginTop: '0.3rem' }}>
                    <CategoryBadge category={row.category} />
                    <Badge tone="muted">
                      invited {row.invited} · valid {row.referrals}
                    </Badge>
                  </div>
                </span>
                <span className="leader-entries">
                  {scope === 'entries' ? `${row.entries} entries` : `${row.referrals}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Referral relationships">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Invited by</th>
                <th>Invited</th>
                <th>Valid referrals</th>
                <th>Bonus entry</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => {
                const inviter = getInvitedBy(p, participants)
                const invitees = getInvitees(p, participants)
                const valid = getValidReferrals(p, participants)
                const earns = getCategory(p) === 'A'
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="muted">{inviter ? inviter.name : '—'}</td>
                    <td>{invitees.length || <span className="muted">0</span>}</td>
                    <td>
                      {valid.length ? (
                        <div>
                          <strong>{valid.length}</strong>
                          <div className="hint">{valid.map((v) => v.name).join(', ')}</div>
                        </div>
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                    <td>
                      {valid.length === 0 ? (
                        <span className="muted">—</span>
                      ) : earns ? (
                        <Badge tone="ok">+{valid.length} entries</Badge>
                      ) : (
                        <Badge tone="warn">No bonus — not Category A</Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {participants.length === 0 && <p className="muted">No participants registered yet.</p>}
      </Card>
    </>
  )
}