import { EVENT_DATES } from '../domain/constants'
import type { Participant, RaffleState, Winner } from '../domain/types'

/**
 * Legacy browser-storage reader, kept only so data created by the earlier
 * localStorage version of the app can be migrated into SQLite.
 * All new writes go to the database via services/api.ts.
 */
export const STORAGE_KEY = 'raffle.event.v1'
export const MIGRATION_FLAG = 'raffle.event.migrated'

export function emptyState(): RaffleState {
  return { version: 1, participants: [], winners: [], numberWinners: [], lastDrawAt: null }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function sanitiseParticipant(raw: unknown): Participant | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Record<string, unknown>
  if (typeof p.id !== 'string' || typeof p.name !== 'string') return null
  if (typeof p.raffleNumber !== 'string' || typeof p.cardCode !== 'string') return null

  return {
    id: p.id,
    name: p.name,
    contact: typeof p.contact === 'string' ? p.contact : undefined,
    cardCode: p.cardCode,
    raffleNumber: p.raffleNumber,
    invitedById: typeof p.invitedById === 'string' ? p.invitedById : null,
    registeredAt: typeof p.registeredAt === 'string' ? p.registeredAt : new Date().toISOString(),
    attendance: isStringArray(p.attendance) ? p.attendance.filter((d) => EVENT_DATES.includes(d)) : [],
  }
}

function sanitiseWinner(raw: unknown): Winner | null {
  if (typeof raw !== 'object' || raw === null) return null
  const w = raw as Record<string, unknown>
  if (typeof w.participantId !== 'string' || typeof w.name !== 'string') return null
  if (w.category !== 'A' && w.category !== 'B') return null
  return {
    participantId: w.participantId,
    name: w.name,
    raffleNumber: typeof w.raffleNumber === 'string' ? w.raffleNumber : '',
    category: w.category,
    winningEntry: typeof w.winningEntry === 'number' ? w.winningEntry : 1,
    drawnAt: typeof w.drawnAt === 'string' ? w.drawnAt : new Date().toISOString(),
  }
}

/**
 * Read the legacy localStorage payload. Unparsable or structurally invalid
 * data is discarded rather than crashing the app.
 */
export function loadLegacyState(): RaffleState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const obj = parsed as Record<string, unknown>
    const participants = Array.isArray(obj.participants)
      ? obj.participants.map(sanitiseParticipant).filter((p): p is Participant => p !== null)
      : []
    const winners = Array.isArray(obj.winners)
      ? obj.winners.map(sanitiseWinner).filter((w): w is Winner => w !== null)
      : []

    return {
      version: 1,
      participants,
      // Guard the one-win-only invariant against a stale payload.
      winners: dedupeWinners(winners),
      numberWinners: [],
      lastDrawAt: typeof obj.lastDrawAt === 'string' ? obj.lastDrawAt : null,
    }
  } catch {
    return null
  }
}

export function dedupeWinners(winners: Winner[]): Winner[] {
  const seen = new Set<string>()
  return winners.filter((w) => {
    if (seen.has(w.participantId)) return false
    seen.add(w.participantId)
    return true
  })
}

export function wasAlreadyMigrated(): boolean {
  try {
    return window.localStorage.getItem(MIGRATION_FLAG) === 'true'
  } catch {
    return false
  }
}

export function markMigrated(): void {
  try {
    window.localStorage.setItem(MIGRATION_FLAG, 'true')
  } catch {
    // ignore
  }
}

export function clearLegacyState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}