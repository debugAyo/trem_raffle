import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './state/store'
import { Dashboard } from './pages/Dashboard'
import { RegisterParticipant } from './pages/RegisterParticipant'
import { CheckIn } from './pages/CheckIn'
import { Participants } from './pages/Participants'
import { Leaderboard } from './pages/Leaderboard'
import { Eligibility } from './pages/Eligibility'
import { Draw } from './pages/Draw'
import { LiveDisplay } from './pages/LiveDisplay'
import { Cards } from './pages/Cards'
import { Card } from './components/ui'
import { downloadParticipantCsv, isDemoData } from './services/export'

type View =
  | 'dashboard'
  | 'register'
  | 'checkin'
  | 'participants'
  | 'leaderboard'
  | 'eligibility'
  | 'draw'
  | 'live'
  | 'cards'

const NAV: { key: View; label: string; icon: string; group: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊', group: 'Overview' },
  { key: 'leaderboard', label: 'Leaderboard', icon: '🏅', group: 'Overview' },
  { key: 'eligibility', label: 'Eligibility', icon: '🎟️', group: 'Overview' },
  { key: 'register', label: 'Register', icon: '➕', group: 'Manage' },
  { key: 'checkin', label: 'Daily attendance', icon: '✅', group: 'Manage' },
  { key: 'participants', label: 'Participants', icon: '👥', group: 'Manage' },
  { key: 'draw', label: 'Number draw', icon: '🎰', group: 'Raffle' },
  { key: 'live', label: 'Live display', icon: '📺', group: 'Raffle' },
  { key: 'cards', label: 'Member cards', icon: '🪪', group: 'Manage' },
]

function readHash(): View {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return NAV.some((n) => n.key === raw) ? (raw as View) : 'dashboard'
}

function Shell() {
  const [view, setView] = useState<View>(readHash)
  const { resetDemoData, clearAllData, state, loading, connectionError } = useStore()
  const [notice, setNotice] = useState<string | null>(null)
  const dataMode = isDemoData(state.participants) ? 'Demo data' : 'Live event data'

  // Hash routing keeps the live display reachable in a second window/projector.
  useEffect(() => {
    const onHash = () => setView(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function navigate(next: string) {
    window.location.hash = `/${next}`
    setView(next as View)
  }

  // Full-bleed projector mode — no admin chrome at all.
  if (view === 'live') {
    return (
      <>
        <div className="btn-row" style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--line)' }}>
          <button className="btn btn-sm" onClick={() => navigate('dashboard')}>
            ← Back to admin
          </button>
          <button
            className="btn btn-sm"
            onClick={() => document.documentElement.requestFullscreen?.()}
          >
            Full screen
          </button>
          <span className="hint">Admin controls are hidden on this screen.</span>
        </div>
        <LiveDisplay />
      </>
    )
  }

  const groups = [...new Set(NAV.map((n) => n.group))]

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">🎟️</span>
          <span>
            TREM Glory House
            <small>Raffle week · October 2026</small>
          </span>
        </div>

        <nav className="nav">
          {groups.map((group) => (
            <div key={group}>
              <div className="nav-section">{group}</div>
              {NAV.filter((n) => n.group === group).map((n) => (
                <button
                  key={n.key}
                  className={view === n.key ? 'active' : ''}
                  onClick={() => navigate(n.key)}
                >
                  <span className="nav-icon">{n.icon}</span>
                  {n.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div style={{ marginTop: 'auto' }}>
          <div className="nav-section">Data</div>
          <div
            className="data-mode"
            aria-live="polite"
            title={
              isDemoData(state.participants)
                ? 'Demo records are currently loaded. Real registrations should be started after clearing demo data.'
                : 'This database is holding live registration data.'
            }
          >
            <span className="data-mode-pill">{dataMode}</span>
          </div>
          <button
            onClick={() => {
              downloadParticipantCsv(
                state.participants,
                `trem-participants-${new Date().toISOString().slice(0, 10)}.csv`,
              )
              setNotice('Attendance report downloaded as CSV.')
            }}
          >
            ⤓ Export CSV report
          </button>
          <button
            onClick={async () => {
              const res = await resetDemoData()
              setNotice(res.ok ? res.message : res.error)
            }}
          >
            ↺ Reset demo data
          </button>
          <button
            onClick={async () => {
              if (
                window.confirm(
                  'Delete ALL participants, attendance and winners? This cannot be undone.',
                )
              ) {
                const res = await clearAllData()
                setNotice(res.ok ? res.message : res.error)
                navigate('dashboard')
              }
            }}
          >
            🗑 Clear all data
          </button>
          <p className="hint" style={{ padding: '0.5rem 0.7rem' }}>
            {state.participants.length} participants · saved to the raffle database
          </p>
        </div>
      </aside>

      <main className="main">
        {connectionError && (
          <div className="message message-error" role="alert">
            {connectionError}
          </div>
        )}
        {notice && (
          <div className="message message-ok" role="status">
            {notice}
          </div>
        )}
        {loading ? (
          <Card title="Loading">
            <p className="muted">Reading the raffle database…</p>
          </Card>
        ) : (
          <>
            {view === 'dashboard' && <Dashboard onNavigate={navigate} />}
            {view === 'register' && <RegisterParticipant />}
            {view === 'checkin' && <CheckIn />}
            {view === 'participants' && <Participants />}
            {view === 'leaderboard' && <Leaderboard />}
            {view === 'eligibility' && <Eligibility />}
            {view === 'draw' && <Draw />}
            {view === 'cards' && <Cards />}
          </>
        )}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}