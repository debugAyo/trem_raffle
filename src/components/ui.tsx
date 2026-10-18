import type { ReactNode } from 'react'
import type { Category } from '../domain/types'
import { formatEventDate } from '../domain/constants'

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || action) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'a' | 'b' | 'muted' }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  )
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'a' | 'b' | 'muted' | 'ok' | 'warn' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function CategoryBadge({ category }: { category: Category }) {
  if (category === 'A') return <Badge tone="a">Category A</Badge>
  if (category === 'B') return <Badge tone="b">Category B</Badge>
  return <Badge tone="muted">Not eligible</Badge>
}

export function Message({ result }: { result: { ok: boolean; error?: string; message?: string } | null }) {
  if (!result) return null
  const text = result.ok ? result.message : result.error
  if (!text) return null
  return <div className={`message ${result.ok ? 'message-ok' : 'message-error'}`} role="alert">{text}</div>
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <p>{title}</p>
      {hint && <span>{hint}</span>}
    </div>
  )
}

/** Five dots showing which event days a participant has attended. */
export function AttendanceDots({ dates, allDates }: { dates: string[]; allDates: string[] }) {
  return (
    <div className="dots" title={dates.map(formatEventDate).join(', ') || 'No attendance yet'}>
      {allDates.map((d) => (
        <span key={d} className={`dot${dates.includes(d) ? ' dot-on' : ''}`} />
      ))}
    </div>
  )
}