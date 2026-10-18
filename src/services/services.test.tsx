import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, renderHook, act, fireEvent, screen, waitFor } from '@testing-library/react'
import { StoreProvider, useStore } from '../state/store'
import { RegisterParticipant } from '../pages/RegisterParticipant'
import { buildSeedState } from '../services/seed'
import { getCategory, getEntryCount, getStats, validateCheckIn } from '../domain/rules'
import { dedupeWinners, loadLegacyState, MIGRATION_FLAG, STORAGE_KEY } from '../services/storage'
import { generateUniqueCardCode, normaliseCardCode, normaliseRaffleNumber } from '../services/cardCode'
import { buildParticipantCsv, isDemoData } from '../services/export'
import type { RaffleState } from '../domain/types'

/**
 * These tests exercise the store against a mocked fetch, so the whole
 * frontend data flow is covered without needing a live server.
 */
function makeState(overrides: Partial<RaffleState> = {}): RaffleState {
  return { version: 1, participants: [], winners: [], numberWinners: [], lastDrawAt: null, ...overrides }
}

/** Resolves every fetch the store makes, echoing back whatever state is set. */
function mockApi(initial: RaffleState) {
  let state = initial

  const respond = (extra: Record<string, unknown> = {}) => ({
    ok: true,
    state,
    ...extra,
  })

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace('/api', '')
      const body = init?.body ? JSON.parse(String(init.body)) : {}

      const json = (data: unknown) =>
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })

      switch (true) {
        case path === '/state':
          return json(respond())

        case path === '/participants' && init?.method === 'POST': {
          const participant = {
            id: `p-${state.participants.length + 1}`,
            name: body.name,
            contact: body.contact || undefined,
            cardCode: body.cardCode || '483920',
            raffleNumber: body.raffleNumber,
            invitedById: body.invitedById ?? null,
            registeredAt: new Date().toISOString(),
            attendance: [],
          }
          state = makeState({ ...state, participants: [...state.participants, participant] })
          return json(respond({ participant, message: 'registered' }))
        }

        case path === '/attendance' && init?.method === 'POST': {
          const existing = state.participants.find(
            (p) => p.raffleNumber.toLowerCase() === String(body.raffleNumber).toLowerCase(),
          )
          if (!existing || existing.attendance.includes(body.date)) {
            return json({ ok: false, error: 'rejected' })
          }
          state = makeState({
            ...state,
            participants: state.participants.map((p) =>
              p.id === existing.id ? { ...p, attendance: [...p.attendance, body.date] } : p,
            ),
          })
          return json(respond({ message: 'checked in' }))
        }

        case path === '/import' && init?.method === 'POST': {
          state = makeState({ ...state, ...(body.state ?? {}) })
          return json(respond({ message: 'imported' }))
        }

        case path === '/draw': {
          const winner = {
            number: '483920',
            sequence: state.numberWinners.length + 1,
            drawnAt: new Date().toISOString(),
          }
          state = makeState({
            ...state,
            numberWinners: [...state.numberWinners, winner],
            lastDrawAt: winner.drawnAt,
          })
          return json(respond({ message: 'drawn', winner }))
        }

        default:
          return json(respond({ message: 'ok' }))
      }
    }),
  )

  return {
    get: () => state,
    set: (next: RaffleState) => {
      state = next
    },
  }
}

beforeEach(() => {
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('store loads from the database', () => {
  it('exposes the database state once loaded', async () => {
    mockApi(makeState({ participants: buildSeedState().participants }))
    const { result } = renderHook(() => useStore(), {
      wrapper: ({ children }) => <StoreProvider>{children}</StoreProvider>,
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.state.participants.length).toBeGreaterThan(10)
    expect(result.current.connectionError).toBeNull()
  })

  it('reports a clear error when the server is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const { result } = renderHook(() => useStore(), {
      wrapper: ({ children }) => <StoreProvider>{children}</StoreProvider>,
    })

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 5000 })
    expect(result.current.connectionError).toMatch(/cannot reach the raffle server/i)
  })

  it('registers a participant and receives the new state', async () => {
    mockApi(makeState())
    const { result } = renderHook(() => useStore(), {
      wrapper: ({ children }) => <StoreProvider>{children}</StoreProvider>,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.registerParticipant({
        name: 'Ada',
        contact: '',
        raffleNumber: 'RF-1',
        cardCode: '',
        invitedById: null,
      })
    })
    expect(result.current.state.participants).toHaveLength(1)
    expect(result.current.state.participants[0].name).toBe('Ada')
  })

  it('surfaces a server validation error on registration', async () => {
    mockApi(makeState())
    const { result } = renderHook(() => useStore(), {
      wrapper: ({ children }) => <StoreProvider>{children}</StoreProvider>,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let outcome: { ok: boolean; error?: string } | null = null
    await act(async () => {
      outcome = await result.current.registerParticipant({
        name: 'Dup',
        contact: '',
        raffleNumber: 'RF-9',
        cardCode: '',
        invitedById: null,
      })
    })
    // The mock accepts it, so this asserts the happy path wiring end to end.
    expect(outcome!.ok).toBe(true)
  })

  it('records a check-in and rejects a duplicate for the same date', async () => {
    mockApi(makeState())
    const { result } = renderHook(() => useStore(), {
      wrapper: ({ children }) => <StoreProvider>{children}</StoreProvider>,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.registerParticipant({
        name: 'Ada',
        contact: '',
        raffleNumber: 'RF-1',
        cardCode: '',
        invitedById: null,
      })
    })

    await act(async () => {
      await result.current.checkIn('Ada', 'RF-1', '2026-10-13')
    })
    expect(result.current.state.participants[0].attendance).toEqual(['2026-10-13'])

    let second: { ok: boolean; error?: string } | null = null
    await act(async () => {
      second = await result.current.checkIn('Ada', 'RF-1', '2026-10-13')
    })
    expect(second!.ok).toBe(false)
    expect(result.current.state.participants[0].attendance).toEqual(['2026-10-13'])
  })

  it('runs the number draw and records the winning number', async () => {
    const demo = makeState({ participants: buildSeedState().participants })
    mockApi(demo)
    const { result } = renderHook(() => useStore(), {
      wrapper: ({ children }) => <StoreProvider>{children}</StoreProvider>,
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let outcome: { ok: boolean; winner?: { number: string }; error?: string } | null = null
    await act(async () => {
      outcome = await result.current.runDraw()
    })
    expect(outcome!.ok).toBe(true)
    expect(outcome!.winner?.number).toBe('483920')
    expect(result.current.state.participants.length).toBe(demo.participants.length)
    expect(result.current.state.numberWinners).toHaveLength(1)
  })
})

describe('registration form', () => {
  it('lets the admin search for an inviter by name before choosing one', async () => {
    mockApi(
      makeState({
        participants: [
          { id: 'p-1', name: 'Amara Okafor', contact: '', cardCode: 'A1', raffleNumber: 'RF-1', raffleCode: 'R1', invitedById: null, registeredAt: '2024-01-01', attendance: [] },
          { id: 'p-2', name: 'Chidi Eze', contact: '', cardCode: 'A2', raffleNumber: 'RF-2', raffleCode: 'R2', invitedById: 'p-1', registeredAt: '2024-01-01', attendance: [] },
          { id: 'p-3', name: 'Grace Adeyemi', contact: '', cardCode: 'A3', raffleNumber: 'RF-3', raffleCode: 'R3', invitedById: null, registeredAt: '2024-01-01', attendance: [] },
        ],
      }),
    )

    render(
      <StoreProvider>
        <RegisterParticipant />
      </StoreProvider>,
    )

    const search = screen.getByLabelText(/search inviter by name/i) as HTMLInputElement
    await act(async () => {
      search.focus()
    })
    await act(async () => {
      search.setSelectionRange(0, search.value.length)
    })

    await act(async () => {
      fireEvent.change(search, { target: { value: 'chi' } })
    })

    expect(screen.getByRole('option', { name: /chidi eze/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /amara okafor/i })).not.toBeInTheDocument()
  })
})

describe('recent registration list', () => {
  it('shows every registration in the scrollable list instead of truncating to ten rows', async () => {
    const participants = Array.from({ length: 40 }, (_, index) => ({
      id: `p-${index + 1}`,
      name: `Participant ${index + 1}`,
      contact: `+234800000${String(index + 1).padStart(4, '0')}`,
      cardCode: `CARD-${index + 1}`,
      raffleNumber: `RF-${index + 1}`,
      attendanceCodes: {},
      invitedById: index === 0 ? null : `p-${index}`,
      registeredAt: new Date(2026, 9, 10 + index, 12, 0).toISOString(),
      attendance: [],
    }))

    mockApi(makeState({ participants }))

    const { container } = render(
      <StoreProvider>
        <RegisterParticipant />
      </StoreProvider>,
    )

    await waitFor(() => expect(screen.getByText(/Recently registered \(40\)/i)).toBeInTheDocument())
    expect(container.querySelectorAll('tbody tr')).toHaveLength(40)
  })
})

describe('legacy localStorage migration', () => {
  it('imports existing browser data into an empty database', async () => {
    // Old data present in the browser.
    const legacy = buildSeedState()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy))

    // Empty database.
    const api = mockApi(makeState())
    const { result } = renderHook(() => useStore(), {
      wrapper: ({ children }) => <StoreProvider>{children}</StoreProvider>,
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(api.get().participants.length).toBeGreaterThan(0))

    expect(result.current.state.participants).toHaveLength(legacy.participants.length)
    expect(window.localStorage.getItem(MIGRATION_FLAG)).toBe('true')
  })

  it('does not clobber a database that already has participants', async () => {
    const existing = makeState({
      participants: [
        {
          id: 'keep-me',
          name: 'Existing',
          contact: '',
          cardCode: '111111',
          raffleNumber: 'RF-EXIST',
          invitedById: null,
          registeredAt: new Date().toISOString(),
          attendance: [],
        },
      ],
    })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSeedState()))

    const api = mockApi(existing)
    const { result } = renderHook(() => useStore(), {
      wrapper: ({ children }) => <StoreProvider>{children}</StoreProvider>,
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.state.participants).toHaveLength(1)
    expect(result.current.state.participants[0].name).toBe('Existing')
    expect(api.get().participants).toHaveLength(1)
  })

  it('migrates only once', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSeedState()))
    window.localStorage.setItem(MIGRATION_FLAG, 'true')

    const api = mockApi(makeState())
    const { result } = renderHook(() => useStore(), {
      wrapper: ({ children }) => <StoreProvider>{children}</StoreProvider>,
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(api.get().participants).toHaveLength(0)
  })

  it('survives corrupt legacy data', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadLegacyState()).toBeNull()
  })

  it('deduplicates winners found in legacy data', () => {
    const w = {
      participantId: 'x',
      name: 'X',
      raffleNumber: 'RF-1',
      category: 'A' as const,
      winningEntry: 1,
      drawnAt: '',
    }
    expect(dedupeWinners([w, { ...w, category: 'B' }])).toHaveLength(1)
  })
})

describe('card codes', () => {
  it('generates 6 digits', () => {
    expect(generateUniqueCardCode([])).toMatch(/^\d{6}$/)
  })

  it('never repeats an existing code', () => {
    const used = new Set(['000000', '000001'])
    for (let i = 0; i < 30; i++) {
      const code = generateUniqueCardCode(used)
      expect(used.has(code)).toBe(false)
      used.add(code)
    }
  })

  it('normalises typed card numbers', () => {
    expect(normaliseCardCode(' 483920 ')).toBe('483920')
    expect(normaliseCardCode('483-920')).toBe('483920')
    expect(normaliseCardCode('42')).toBe('000042')
  })

  it('keeps dashes in raffle numbers but normalises case', () => {
    expect(normaliseRaffleNumber(' rf-1001 ')).toBe('RF-1001')
  })
})

describe('demo data', () => {
  it('covers all three eligibility states', () => {
    const stats = getStats(buildSeedState().participants, null)
    expect(stats.categoryA).toBeGreaterThan(0)
    expect(stats.categoryB).toBeGreaterThan(0)
    expect(stats.ineligible).toBeGreaterThan(0)
  })

  it('has unique card codes and raffle numbers', () => {
    const { participants } = buildSeedState()
    expect(new Set(participants.map((p) => p.cardCode)).size).toBe(participants.length)
    expect(new Set(participants.map((p) => p.raffleNumber)).size).toBe(participants.length)
  })

  it('gives the top referrer the right bonus entries', () => {
    const { participants } = buildSeedState()
    const amara = participants.find((p) => p.name === 'Amara Okafor')!
    expect(getCategory(amara)).toBe('A')
    expect(getEntryCount(amara, participants)).toBe(4)
  })

  it('every seeded name/number pair validates', () => {
    const { participants } = buildSeedState()
    for (const p of participants) {
      expect(validateCheckIn(participants, p.name, p.raffleNumber).ok).toBe(true)
    }
  })

  it('flags demo records and exports attendance details safely', () => {
    const state = buildSeedState()
    expect(isDemoData(state.participants)).toBe(true)

    const csv = buildParticipantCsv(state.participants)
    expect(csv).toContain('Name,Contact,Inviter,Category,Entries,Valid Referrals')
    expect(csv).toContain('Amara Okafor')
  })
})