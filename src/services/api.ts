import type { CardPoolSummary, NumberWinner, Participant, RaffleState } from '../domain/types'

const BASE = '/api'

interface ApiResponse {
  ok: boolean
  error?: string
  message?: string
  state?: RaffleState
  participant?: Participant
  winner?: NumberWinner
  winners?: RaffleState['winners']
  cardPool?: CardPoolSummary
}

async function request(path: string, init?: RequestInit): Promise<ApiResponse> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    return {
      ok: false,
      error: 'Cannot reach the raffle server. Is it running? Start it with "npm run dev".',
    }
  }

  try {
    return (await response.json()) as ApiResponse
  } catch {
    return { ok: false, error: `Unexpected server response (${response.status}).` }
  }
}

const post = (path: string, body?: unknown) =>
  request(path, { method: 'POST', body: JSON.stringify(body ?? {}) })

export const api = {
  getState: () => request('/state'),

  getCards: () => request('/cards'),

  initializeCards: () => post('/cards/initialize'),

  registerParticipant: (input: {
    name: string
    contact: string
    raffleNumber?: string
    cardCode?: string
    invitedById: string | null
  }) => post('/participants', input),

  checkIn: (input: { name: string; attendanceCode: string; raffleNumber?: string; date: string }) =>
    post('/attendance', input),

  updateParticipant: (
    id: string,
    patch: { name?: string; raffleNumber?: string; contact?: string },
  ) => request(`/participants/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  removeParticipant: (id: string) => request(`/participants/${id}`, { method: 'DELETE' }),

  runDraw: () => post('/draw'),

  clearWinners: () => request('/winners', { method: 'DELETE' }),

  importState: (state: RaffleState) => post('/import', { state }),

  resetDemo: () => post('/reset-demo'),

  clearAll: () => post('/clear'),
}