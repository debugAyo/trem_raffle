import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { EVENT_DATES, formatEventDate } from '../domain/constants'
import { getCategory } from '../domain/rules'
import { Badge, Card, CategoryBadge, Message } from '../components/ui'

export function RegisterParticipant() {
  const { state, registerParticipant } = useStore()
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [inviterSearch, setInviterSearch] = useState('')
  const [invitedById, setInvitedById] = useState('')
  const [result, setResult] = useState<{ ok: boolean; error?: string; message?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const inviterOptions = useMemo(
    () =>
      [...state.participants]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ id: p.id, name: p.name, category: getCategory(p) })),
    [state.participants],
  )

  const filteredInviterOptions = useMemo(() => {
    const query = inviterSearch.trim().toLowerCase()
    if (!query) return inviterOptions
    return inviterOptions.filter((option) => option.name.toLowerCase().includes(query))
  }, [inviterOptions, inviterSearch])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await registerParticipant({
      name,
      contact,
      invitedById: invitedById || null,
    })
    setBusy(false)
    setResult(res)
    if (res.ok) {
      setName('')
      setContact('')
      setInvitedById('')
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Register Participant</h1>
          <p>Registration creates a private attendance code for each event date.</p>
        </div>
      </div>

      <Card title="New participant">
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Full name *
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amara Okafor" required />
            </label>
            <label>
              Phone / contact (optional)
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+234 801 555 0101" />
            </label>
          </div>

          <div className="form-row" style={{ marginTop: '1rem' }}>
            <label htmlFor="inviter-search">Search inviter by name</label>
            <input
              id="inviter-search"
              type="search"
              value={inviterSearch}
              onChange={(e) => setInviterSearch(e.target.value)}
              placeholder="Type a name to filter the list"
            />
            <label>
              Registered by / invited by
              <select value={invitedById} onChange={(e) => setInvitedById(e.target.value)}>
                <option value="">— No inviter (top of the chain) —</option>
                {filteredInviterOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.category ? ` (Category ${o.category})` : ''}
                  </option>
                ))}
              </select>
              <span className="hint">
                A referral only becomes valid once this participant attends 4 or more event days.
              </span>
            </label>
          </div>

          <Message result={result} />

          <div className="btn-row" style={{ marginTop: '1.25rem' }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Registering…' : 'Register participant'}
            </button>
          </div>
        </form>
      </Card>

      <Card title={`Recently registered (${state.participants.length})`}>
        {state.participants.length === 0 ? (
          <p className="muted">No participants yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Member card ID</th>
                  <th>Invited by</th>
                  <th>Sunday raffle code</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {state.participants
                  .slice()
                  .reverse()
                  .map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="mono">{p.cardCode}</td>
                      <td className="muted">
                        {state.participants.find((x) => x.id === p.invitedById)?.name ?? '—'}
                      </td>
                      <td className="mono muted">{p.raffleCode ?? 'Issued on Sunday'}</td>
                      <td>
                        <CategoryBadge category={getCategory(p)} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint" style={{ marginTop: '0.9rem' }}>
          Event days: {EVENT_DATES.map(formatEventDate).join(' · ')}
        </p>
        <Badge tone="muted">October 17 is excluded</Badge>
      </Card>
    </>
  )
}