import { useState } from 'react'
import { useStore } from '../state/store'
import { EVENT_DATES, TOTAL_EVENT_DAYS } from '../domain/constants'
import {
  attendanceCount,
  daysRemaining,
  getCategory,
  getEntryBreakdown,
  getStats,
  partitionByCategory,
} from '../domain/rules'
import { AttendanceDots, Badge, Card, CategoryBadge, EmptyState, Stat } from '../components/ui'

export function Eligibility() {
  const { state } = useStore()
  const { participants } = state
  const [filter, setFilter] = useState<'A' | 'B' | 'none'>('A')

  const groups = partitionByCategory(participants)
  const stats = getStats(participants, null)

  function table(list: typeof participants) {
    if (list.length === 0) return <EmptyState title="Nobody in this group yet." />
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Participant</th>
              <th>Sunday raffle code</th>
              <th>Attendance</th>
              <th>Category</th>
              <th>Base entry</th>
              <th>Referral bonus</th>
              <th>Total entries</th>
            </tr>
          </thead>
          <tbody>
            {list
              .slice()
              .sort((a, b) => getEntryBreakdown(b, participants).total - getEntryBreakdown(a, participants).total)
              .map((p) => {
                const breakdown = getEntryBreakdown(p, participants)
                const category = getCategory(p)
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      {category !== null && category !== 'A' && (
                        <div className="hint">
                          {daysRemaining(p) === 0
                            ? 'Qualifies for Category A if they attend every day'
                            : `${daysRemaining(p)} more day(s) needed for Category A`}
                        </div>
                      )}
                    </td>
                    <td className="mono">{p.raffleCode ?? 'Issued on Sunday'}</td>
                    <td>
                      <div className="btn-row">
                        <AttendanceDots dates={p.attendance} allDates={EVENT_DATES} />
                        <span className="muted">
                          {attendanceCount(p)}/{TOTAL_EVENT_DAYS}
                        </span>
                      </div>
                    </td>
                    <td>
                      <CategoryBadge category={category} />
                    </td>
                    <td>{breakdown.base || <span className="muted">—</span>}</td>
                    <td>
                      {breakdown.referralBonus ? (
                        <Badge tone="ok">+{breakdown.referralBonus}</Badge>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <strong>{breakdown.total}</strong>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Eligibility & Entries</h1>
          <p>Who qualifies, and how many raffle entries each participant holds.</p>
        </div>
      </div>

      <div className="grid">
        <Stat label="Category A" value={stats.categoryA} tone="a" hint="attended all 5 days — weighted draw" />
        <Stat label="Category B" value={stats.categoryB} tone="b" hint="attended 4+ days — uniform draw" />
        <Stat label="Not eligible" value={stats.ineligible} tone="muted" hint="fewer than 4 days" />
        <Stat label="Total entries" value={stats.totalEntries} hint="tickets in the draw" />
      </div>

      <Card
        title="Entries"
        action={
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ width: 'auto' }}>
            <option value="A">Category A</option>
            <option value="B">Category B</option>
            <option value="none">Not eligible</option>
          </select>
        }
      >
        {filter === 'A' && table(groups.A)}
        {filter === 'B' && table(groups.B)}
        {filter === 'none' && table(groups.none)}
      </Card>

      <Card title="How entries are calculated">
        <ul className="muted" style={{ lineHeight: 1.8, paddingLeft: '1.1rem', margin: 0 }}>
          <li>Category A: attended all {TOTAL_EVENT_DAYS} event days.</li>
          <li>Category B: attended at least 4 event days.</li>
          <li>A participant qualifies only for the highest category reached.</li>
          <li>Fewer than 4 attendance days means not eligible for any draw.</li>
          <li>Every eligible participant starts with 1 raffle entry.</li>
          <li>A Category A participant earns 1 extra entry per valid referral.</li>
          <li>A referral is valid once the invited participant attends 4+ event days.</li>
          <li>One participant can win only once.</li>
        </ul>
      </Card>
    </>
  )
}