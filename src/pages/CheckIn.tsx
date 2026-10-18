import { useState } from 'react'
import { useStore } from '../state/store'
import {
  ATTENDANCE_DATES,
  EVENT_DATES,
  formatEventDate,
  getEventProgress,
  PRETEST_DATE,
  todayKey,
} from '../domain/constants'
import { getCategory, getStats, attendanceCount } from '../domain/rules'
import { Badge, Card, CategoryBadge, Message, Stat } from '../components/ui'

export function CheckIn() {
  const { state, checkIn } = useStore()
  const progress = getEventProgress()
  const today = todayKey()

  const defaultDate = ATTENDANCE_DATES.includes(today)
    ? today
    : (ATTENDANCE_DATES.find((d) => d >= today) ?? EVENT_DATES[0])

  const [date, setDate] = useState(defaultDate)
  const [name, setName] = useState('')
  const [attendanceCode, setAttendanceCode] = useState('')
  const [result, setResult] = useState<{ ok: boolean; error?: string; message?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const presentToday = state.participants
    .filter((p) => date === PRETEST_DATE ? p.testAttendance : p.attendance.includes(date))
    .sort((a, b) => a.name.localeCompare(b.name))
  const stats = getStats(state.participants, date)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await checkIn(name, attendanceCode, date)
    setBusy(false)
    setResult(res)
    if (res.ok) {
      setName('')
      setAttendanceCode('')
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Daily Attendance</h1>
          <p>Use the participant's permanent member card ID to verify attendance.</p>
        </div>
        {today === PRETEST_DATE && <Badge tone="ok">Today is the pre-test</Badge>}
        {EVENT_DATES.includes(today) && <Badge tone="ok">Today is an event day</Badge>}
      </div>

      <div className="date-tabs">
        {ATTENDANCE_DATES.map((d) => (
          <button
            key={d}
            className={`date-tab${d === date ? ' active' : ''}`}
            onClick={() => {
              setDate(d)
              setResult(null)
            }}
          >
            {formatEventDate(d)}
            <span className="muted" style={{ marginLeft: '0.4rem', fontWeight: 500 }}>
              {state.participants.filter((p) => d === PRETEST_DATE ? p.testAttendance : p.attendance.includes(d)).length}
            </span>
          </button>
        ))}
      </div>

      <div className="grid">
        <Stat label="Present" value={stats.attendanceToday} hint={formatEventDate(date)} />
        <Stat label="Not yet in" value={state.participants.length - stats.attendanceToday} tone="muted" />
        <Stat label="Category A" value={stats.categoryA} tone="a" hint="all 5 days" />
        <Stat label="Category B" value={stats.categoryB} tone="b" hint="4+ days" />
      </div>

      <Card title={`Check in — ${formatEventDate(date)}`}>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Participant name (optional)
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name as registered"
                autoComplete="off"
              />
            </label>
            <label>
              Member card ID or attendance code *
              <input
                value={attendanceCode}
                onChange={(e) => setAttendanceCode(e.target.value)}
                placeholder="123456 or ATT-XXXXXXXX"
                autoComplete="off"
                required
              />
              <span className="hint">A member card ID works for every event day; attendance codes remain supported.</span>
            </label>
          </div>

          <Message result={result} />

          <div className="btn-row" style={{ marginTop: '1.25rem' }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify & check in'}
            </button>
          </div>
        </form>
      </Card>

      <Card title={`Attendance list — ${formatEventDate(date)} (${presentToday.length})`}>
        {presentToday.length === 0 ? (
          <p className="muted">Nobody has checked in for this day yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Attendance code</th>
                  <th>Days attended</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {presentToday.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="mono">{p.attendanceCodes?.[date] ?? '—'}</td>
                    <td>
                      {attendanceCount(p)} / {EVENT_DATES.length}
                    </td>
                    <td>
                      <CategoryBadge category={getCategory(p)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Attendance history — all participants">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                {EVENT_DATES.map((d) => (
                  <th key={d} title={formatEventDate(d)}>
                    {formatEventDate(d).split(' ')[1]}
                  </th>
                ))}
                <th>Total</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {[...state.participants]
                .sort((a, b) => attendanceCount(b) - attendanceCount(a))
                .map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    {EVENT_DATES.map((d) => (
                      <td key={d} style={{ textAlign: 'center' }}>
                        {p.attendance.includes(d) ? '✓' : <span className="muted">·</span>}
                      </td>
                    ))}
                    <td>
                      <strong>{attendanceCount(p)}</strong>
                    </td>
                    <td>
                      <CategoryBadge category={getCategory(p)} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {state.participants.length === 0 && <p className="muted">No participants registered yet.</p>}
      </Card>

      <p className="hint">
        Event status: {progress.status} · day {progress.daysElapsed} of {EVENT_DATES.length}
      </p>
    </>
  )
}