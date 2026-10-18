import { useState } from 'react'
import { useStore } from '../state/store'
import { EVENT_DATES, formatEventDate } from '../domain/constants'
import { attendanceCount, getCategory, getInvitedBy, getInvitees, normalise } from '../domain/rules'
import { Badge, Card, CategoryBadge, EmptyState } from '../components/ui'

type SortKey = 'name' | 'attendance' | 'registered'

export function Participants() {
  const { state, removeParticipant, updateParticipant } = useStore()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('attendance')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editNumber, setEditNumber] = useState('')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const filtered = state.participants
    .filter((p) => {
      const q = normalise(query)
      if (!q) return true
      return (
        normalise(p.name).includes(q) ||
        normalise(p.raffleNumber).includes(q) ||
        normalise(p.cardCode).includes(q) ||
        (p.contact ? normalise(p.contact).includes(q) : false)
      )
    })
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'attendance') return attendanceCount(b) - attendanceCount(a)
      return a.registeredAt.localeCompare(b.registeredAt)
    })

  function startEdit(id: string, name: string, number: string) {
    setEditingId(id)
    setEditName(name)
    setEditNumber(number)
    setNotice(null)
  }

  async function saveEdit() {
    if (!editingId) return
    const res = await updateParticipant(editingId, { name: editName.trim(), raffleNumber: editNumber })
    setNotice({ ok: res.ok, text: res.ok ? res.message : res.error })
    if (res.ok) setEditingId(null)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Participants</h1>
          <p>{state.participants.length} registered for the event.</p>
        </div>
      </div>

      <Card>
        <div className="form-row">
          <label>
            Search
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, raffle number, card or contact"
            />
          </label>
          <label>
            Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="attendance">Most days attended</option>
              <option value="name">Name A–Z</option>
              <option value="registered">Registration order</option>
            </select>
          </label>
        </div>
      </Card>

      {notice && <div className={`message ${notice.ok ? 'message-ok' : 'message-error'}`}>{notice.text}</div>}

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="No participants match your search." hint="Try a different name or raffle number." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Raffle no.</th>
                  <th>Member card ID</th>
                  <th>Days</th>
                  <th>Invited by</th>
                  <th>Category</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const inviter = getInvitedBy(p, state.participants)
                  const invitees = getInvitees(p, state.participants)
                  const isEditing = editingId === p.id

                  return (
                    <tr key={p.id}>
                      {isEditing ? (
                        <>
                          <td>
                            <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                          </td>
                          <td className="muted">{p.contact ?? '—'}</td>
                          <td>
                            <input
                              value={editNumber}
                              onChange={(e) => setEditNumber(e.target.value)}
                              style={{ width: 110 }}
                            />
                          </td>
                          <td className="mono muted">{p.cardCode}</td>
                          <td>{attendanceCount(p)}/{EVENT_DATES.length}</td>
                          <td className="muted">{inviter?.name ?? '—'}</td>
                          <td>
                            <CategoryBadge category={getCategory(p)} />
                          </td>
                          <td>
                            <div className="btn-row">
                              <button className="btn btn-sm btn-accent" onClick={saveEdit}>
                                Save
                              </button>
                              <button
                                className="btn btn-sm"
                                onClick={() => {
                                  setEditingId(null)
                                  setNotice(null)
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>
                            <strong>{p.name}</strong>
                            {invitees.length > 0 && (
                              <div className="hint">Invited {invitees.length}</div>
                            )}
                          </td>
                          <td className="muted">{p.contact ?? '—'}</td>
                          <td className="mono">{p.raffleNumber}</td>
                          <td className="mono muted">{p.cardCode}</td>
                          <td>
                            <strong>{attendanceCount(p)}</strong>
                            <span className="muted">/{EVENT_DATES.length}</span>
                          </td>
                          <td className="muted">{inviter?.name ?? '—'}</td>
                          <td>
                            <CategoryBadge category={getCategory(p)} />
                          </td>
                          <td>
                            <div className="btn-row">
                              <button
                                className="btn btn-sm"
                                onClick={() => startEdit(p.id, p.name, p.raffleNumber)}
                              >
                                Edit
                              </button>
                              {confirmId === p.id ? (
                                <>
                                  <button
                                    className="btn btn-sm btn-danger"
                                    onClick={async () => {
                                      const res = await removeParticipant(p.id)
                                      setConfirmId(null)
                                      setNotice({ ok: res.ok, text: res.ok ? res.message : res.error })
                                    }}
                                  >
                                    Confirm
                                  </button>
                                  <button className="btn btn-sm" onClick={() => setConfirmId(null)}>
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  className="btn btn-sm btn-danger"
                                  onClick={() => setConfirmId(p.id)}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Attendance legend">
        <div className="btn-row">
          {EVENT_DATES.map((d) => (
            <Badge key={d} tone="muted">
              {formatEventDate(d)}
            </Badge>
          ))}
        </div>
      </Card>
    </>
  )
}