import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../services/api'
import {
  clearLegacyState,
  loadLegacyState,
  markMigrated,
  wasAlreadyMigrated,
} from '../services/storage'
import type { NumberWinner, Participant, RaffleState } from '../domain/types'

export interface RegisterInput {
  name: string
  contact: string
  invitedById: string | null
  /** Legacy test inputs accepted for compatibility but no longer shown in the UI. */
  raffleNumber?: string
  cardCode?: string
}

export type Result = { ok: true; message: string } | { ok: false; error: string }

export interface StoreValue {
  state: RaffleState
  /** False until the first load from the database completes. */
  loading: boolean
  /** Set when the database cannot be reached, so the UI can say so. */
  connectionError: string | null
  registerParticipant: (input: RegisterInput) => Promise<Result & { participant?: Participant }>
  checkIn: (name: string, attendanceCode: string, date: string) => Promise<Result>
  removeParticipant: (id: string) => Promise<Result>
  updateParticipant: (id: string, patch: Partial<Participant>) => Promise<Result>
  runDraw: () => Promise<{ ok: boolean; winner?: NumberWinner; error?: string }>
  clearWinners: () => Promise<Result>
  resetDemoData: () => Promise<Result>
  clearAllData: () => Promise<Result>
  refresh: () => Promise<void>
}

const StoreContext = createContext<StoreValue | null>(null)

const EMPTY: RaffleState = { version: 1, participants: [], winners: [], numberWinners: [], lastDrawAt: null }

async function fetchStateWithRetry(attempts = 4): Promise<{ ok: boolean; state?: RaffleState; error?: string }> {
  let lastError: string | undefined

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const res = await api.getState()
    if (res.ok && res.state) return res
    lastError = res.error ?? 'Cannot reach the raffle server.'

    if (attempt < attempts) {
      await new Promise((resolve) => window.setTimeout(resolve, 180 * attempt))
    }
  }

  return { ok: false, error: lastError }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RaffleState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const migrateChecked = useRef(false)

  const applyState = useCallback((next: RaffleState | undefined) => {
    if (next) {
      setState(next)
      setConnectionError(null)
    }
  }, [])

  /** One-time migration of any data created by the old localStorage version. */
  const migrateIfNeeded = useCallback(async () => {
    if (migrateChecked.current || wasAlreadyMigrated()) return
    migrateChecked.current = true

    const legacy = loadLegacyState()
    if (!legacy || legacy.participants.length === 0) return

    // Only import into an empty database, so an existing event is never clobbered.
    const current = await api.getState()
    if (!current.ok || !current.state || current.state.participants.length > 0) {
      markMigrated()
      return
    }

    const res = await api.importState(legacy)
    if (res.ok) {
      clearLegacyState()
      markMigrated()
      if (res.state) setState(res.state)
    }
  }, [])

  const refresh = useCallback(async () => {
    const res = await api.getState()
    if (res.ok && res.state) {
      setState(res.state)
      setConnectionError(null)
    } else {
      setConnectionError(res.error ?? 'Cannot reach the raffle server.')
    }
  }, [])

  // Initial load + migration, then poll so the live display follows the admin.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      await migrateIfNeeded()
      if (cancelled) return

      const res = await fetchStateWithRetry()
      if (cancelled) return

      if (res.ok && res.state) {
        setState(res.state)
        setConnectionError(null)
      } else {
        setConnectionError(res.error ?? 'Cannot reach the raffle server.')
      }
      setLoading(false)
    })()

    const timer = window.setInterval(() => {
      void refresh()
    }, 4000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [migrateIfNeeded, refresh])

  const registerParticipant = useCallback<StoreValue['registerParticipant']>(
    async (input) => {
      const res = await api.registerParticipant({
        name: input.name,
        contact: input.contact,
        raffleNumber: input.raffleNumber,
        cardCode: input.cardCode,
        invitedById: input.invitedById,
      })
      applyState(res.state)
      return res.ok
        ? { ok: true, message: res.message ?? 'Registered.', participant: res.participant }
        : { ok: false, error: res.error ?? 'Registration failed.' }
    },
    [applyState],
  )

  const checkIn = useCallback<StoreValue['checkIn']>(
    async (name, attendanceCode, date) => {
      const res = await api.checkIn({
        name,
        attendanceCode,
        // Keep the old request alias for existing integrations and fixtures.
        raffleNumber: attendanceCode,
        date,
      })
      applyState(res.state)
      return res.ok
        ? { ok: true, message: res.message ?? 'Checked in.' }
        : { ok: false, error: res.error ?? 'Check-in rejected.' }
    },
    [applyState],
  )

  const removeParticipant = useCallback<StoreValue['removeParticipant']>(async (id) => {
    const res = await api.removeParticipant(id)
    applyState(res.state)
    return res.ok
      ? { ok: true, message: res.message ?? 'Participant removed.' }
      : { ok: false, error: res.error ?? 'Could not remove participant.' }
  }, [applyState])

  const updateParticipant = useCallback<StoreValue['updateParticipant']>(
    async (id, patch) => {
      const res = await api.updateParticipant(id, {
        name: patch.name,
        contact: patch.contact,
      })
      applyState(res.state)
      return res.ok
        ? { ok: true, message: res.message ?? 'Participant updated.' }
        : { ok: false, error: res.error ?? 'Update failed.' }
    },
    [applyState],
  )

  const runDraw = useCallback<StoreValue['runDraw']>(async () => {
    const res = await api.runDraw()
    applyState(res.state)
    if (!res.ok || !res.winner) {
      return { ok: false, error: res.error ?? 'The draw failed.' }
    }
    const fresh = await api.getState()
    if (fresh.state) setState(fresh.state)
    return { ok: true, winner: res.winner }
  }, [applyState])

  const clearWinners = useCallback<StoreValue['clearWinners']>(async () => {
    const res = await api.clearWinners()
    applyState(res.state)
    return res.ok
      ? { ok: true, message: res.message ?? 'Winners cleared.' }
      : { ok: false, error: res.error ?? 'Could not clear winners.' }
  }, [applyState])

  const resetDemoData = useCallback<StoreValue['resetDemoData']>(async () => {
    const res = await api.resetDemo()
    applyState(res.state)
    return res.ok
      ? { ok: true, message: res.message ?? 'Demo data restored.' }
      : { ok: false, error: res.error ?? 'Could not reset.' }
  }, [applyState])

  const clearAllData = useCallback<StoreValue['clearAllData']>(async () => {
    const res = await api.clearAll()
    applyState(res.state)
    return res.ok
      ? { ok: true, message: res.message ?? 'All data cleared.' }
      : { ok: false, error: res.error ?? 'Could not clear data.' }
  }, [applyState])

  const value = useMemo<StoreValue>(
    () => ({
      state,
      loading,
      connectionError,
      registerParticipant,
      checkIn,
      removeParticipant,
      updateParticipant,
      runDraw,
      clearWinners,
      resetDemoData,
      clearAllData,
      refresh,
    }),
    [
      state,
      loading,
      connectionError,
      registerParticipant,
      checkIn,
      removeParticipant,
      updateParticipant,
      runDraw,
      clearWinners,
      resetDemoData,
      clearAllData,
      refresh,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}