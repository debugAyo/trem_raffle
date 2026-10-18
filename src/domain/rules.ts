import {
  CATEGORY_A_MIN_DAYS,
  CATEGORY_B_MIN_DAYS,
  REFERRAL_MIN_DAYS,
  isEventDate,
  PRETEST_DATE,
} from './constants'
import type { Category, DateKey, Participant } from './types'

/**
 * All raffle rules live here as pure functions. No React, no storage,
 * no side effects — this is the module the tests exercise directly.
 */

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export function attendanceCount(p: Participant): number {
  // Guard against stored dates that are not real event days.
  return new Set(p.attendance.filter(isEventDate)).size
}

/**
 * Category A: attended all event days.
 * Category B: attended at least 4 event days.
 * A participant reaches only the highest category they qualify for.
 */
export function getCategory(p: Participant): Category {
  const days = attendanceCount(p)
  if (days >= CATEGORY_A_MIN_DAYS) return 'A'
  if (days >= CATEGORY_B_MIN_DAYS) return 'B'
  return null
}

export function isEligible(p: Participant): boolean {
  return getCategory(p) !== null
}

export function hasAttendedOn(p: Participant, date: DateKey): boolean {
  if (date === PRETEST_DATE) return Boolean(p.testAttendance)
  return p.attendance.includes(date)
}

/** Event days still to attend before the participant reaches Category A. */
export function daysRemaining(p: Participant): number {
  return Math.max(0, CATEGORY_A_MIN_DAYS - attendanceCount(p))
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export function getInvitedBy(p: Participant, all: Participant[]): Participant | null {
  if (!p.invitedById) return null
  return all.find((x) => x.id === p.invitedById) ?? null
}

export function getInvitees(p: Participant, all: Participant[]): Participant[] {
  return all.filter((x) => x.invitedById === p.id)
}

/** A referral only becomes valid once the invitee has attended 4+ event days. */
export function isReferralValid(invitee: Participant): boolean {
  return attendanceCount(invitee) >= REFERRAL_MIN_DAYS
}

export function getValidReferrals(p: Participant, all: Participant[]): Participant[] {
  return getInvitees(p, all).filter(isReferralValid)
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export interface EntryBreakdown {
  base: number
  referralBonus: number
  total: number
}

/**
 * Everyone eligible starts with 1 entry.
 * Category A participants earn 1 extra entry per valid referral.
 * Category B and ineligible participants earn no bonus.
 */
export function getEntryBreakdown(p: Participant, all: Participant[]): EntryBreakdown {
  const category = getCategory(p)
  if (category === null) return { base: 0, referralBonus: 0, total: 0 }

  const base = 1
  const referralBonus =
    category === 'A' ? getValidReferrals(p, all).length : 0

  return { base, referralBonus, total: base + referralBonus }
}

export function getEntryCount(p: Participant, all: Participant[]): number {
  return getEntryBreakdown(p, all).total
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function normalise(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Key used to compare raffle numbers and card codes. Ignores case, spaces
 * and dashes so "rf 1001", "RF-1001" and "RF1001" all match one participant.
 */
export function normaliseKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]/g, '')
}

export interface ValidationResult {
  ok: boolean
  error?: string
}

function findBy(
  all: Participant[],
  value: string,
  field: 'raffleNumber' | 'cardCode',
  excludeId?: string,
): Participant | undefined {
  const target = normaliseKey(value)
  return all.find((p) => p.id !== excludeId && normaliseKey(p[field]) === target)
}

/**
 * Check-in requires BOTH a name and a raffle number to match the same
 * participant. A matching number with the wrong name is rejected.
 */
export function validateCheckIn(
  all: Participant[],
  name: string,
  raffleNumber: string,
): ValidationResult {
  const cleanName = name.trim()
  const cleanNumber = raffleNumber.trim()

  if (!cleanName) return { ok: false, error: 'Enter the participant name.' }
  if (!cleanNumber) return { ok: false, error: 'Enter the raffle number.' }

  const byNumber = all.find((p) => normaliseKey(p.raffleNumber) === normaliseKey(cleanNumber))
  if (!byNumber) {
    return { ok: false, error: `Raffle number "${cleanNumber}" was not found.` }
  }
  if (normalise(byNumber.name) !== normalise(cleanName)) {
    return {
      ok: false,
      error: `Raffle number ${cleanNumber} does not belong to "${byNumber.name}".`,
    }
  }
  return { ok: true }
}

/** Raffle numbers must be unique across all participants. */
export function validateRaffleNumber(
  all: Participant[],
  raffleNumber: string,
  excludeId?: string,
): ValidationResult {
  const clean = raffleNumber.trim()
  if (!clean) return { ok: false, error: 'Raffle number is required.' }
  if (clean.length < 3) {
    return { ok: false, error: 'Raffle number must be at least 3 characters.' }
  }
  if (findBy(all, clean, 'raffleNumber', excludeId)) {
    return { ok: false, error: `Raffle number ${clean} is already taken.` }
  }
  return { ok: true }
}

/** Card codes must be unique across all participants. */
export function validateCardCode(
  all: Participant[],
  cardCode: string,
  excludeId?: string,
): ValidationResult {
  const clean = cardCode.trim()
  if (!clean) return { ok: false, error: 'Card code is required.' }
  if (findBy(all, clean, 'cardCode', excludeId)) {
    return { ok: false, error: `Card code ${clean} is already taken.` }
  }
  return { ok: true }
}

export function validateRegistration(
  all: Participant[],
  input: { name: string; raffleNumber: string; cardCode: string },
  existing: Participant[],
): ValidationResult {
  if (!input.name.trim()) return { ok: false, error: 'Participant name is required.' }
  if (existing.some((p) => normalise(p.name) === normalise(input.name))) {
    return { ok: false, error: `${input.name.trim()} is already registered.` }
  }
  const num = validateRaffleNumber(all, input.raffleNumber)
  if (!num.ok) return num
  const card = validateCardCode(all, input.cardCode)
  if (!card.ok) return card
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Aggregate stats
// ---------------------------------------------------------------------------

export interface RaffleStats {
  total: number
  categoryA: number
  categoryB: number
  ineligible: number
  verified: number
  totalEntries: number
  attendanceToday: number
}

export function getStats(all: Participant[], today: DateKey | null): RaffleStats {
  let categoryA = 0
  let categoryB = 0
  let ineligible = 0
  let verified = 0
  let attendanceToday = 0
  let totalEntries = 0

  for (const p of all) {
    const category = getCategory(p)
    if (category === 'A') categoryA++
    else if (category === 'B') categoryB++
    else ineligible++

    if (isEligible(p)) {
      verified++
      totalEntries += getEntryCount(p, all)
    }
    if (today && hasAttendedOn(p, today)) attendanceToday++
  }

  return {
    total: all.length,
    categoryA,
    categoryB,
    ineligible,
    verified,
    totalEntries,
    attendanceToday,
  }
}

/** Group participants by category for the eligibility page. */
export function partitionByCategory(all: Participant[]): Record<'A' | 'B' | 'none', Participant[]> {
  const groups: Record<'A' | 'B' | 'none', Participant[]> = { A: [], B: [], none: [] }
  for (const p of all) {
    const category = getCategory(p)
    groups[category ?? 'none'].push(p)
  }
  return groups
}