import type { DateKey } from './types'

/**
 * The five event days. October 17 is deliberately excluded.
 * Single source of truth — everything else derives from this array.
 */
export const EVENT_DATES: DateKey[] = [
  '2026-10-13',
  '2026-10-14',
  '2026-10-15',
  '2026-10-16',
  '2026-10-18',
]

/** Separate registration and identity test date; never counts toward prizes. */
export const PRETEST_DATE: DateKey = '2026-10-11'

export const ATTENDANCE_DATES: DateKey[] = [PRETEST_DATE, ...EVENT_DATES]

export const TOTAL_EVENT_DAYS = EVENT_DATES.length

/** Attendance needed for each category. */
export const CATEGORY_A_MIN_DAYS = 5
export const CATEGORY_B_MIN_DAYS = 4

/** An invited participant needs this many days for the referral to count. */
export const REFERRAL_MIN_DAYS = 4

export function isEventDate(date: DateKey): boolean {
  return EVENT_DATES.includes(date)
}

export function isAttendanceDate(date: DateKey): boolean {
  return ATTENDANCE_DATES.includes(date)
}

/** e.g. 2026-10-13 -> "Tue 13 Oct" */
export function formatEventDate(date: DateKey): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/** Today's date as YYYY-MM-DD in local time. */
export function todayKey(now: Date = new Date()): DateKey {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type EventStatus = 'upcoming' | 'live' | 'finished' | 'draw-ready'

export interface EventProgress {
  currentDate: DateKey | null
  status: EventStatus
  daysElapsed: number
  totalDays: number
  nextDate: DateKey | null
}

export function getEventProgress(now: Date = new Date()): EventProgress {
  const today = todayKey(now)
  const daysElapsed = EVENT_DATES.filter((d) => d <= today).length
  const nextDate = EVENT_DATES.find((d) => d > today) ?? null

  let status: EventStatus = 'upcoming'
  if (EVENT_DATES.includes(today)) status = 'live'
  if (daysElapsed >= TOTAL_EVENT_DAYS) status = 'finished'

  return {
    currentDate: EVENT_DATES.includes(today) ? today : nextDate ?? EVENT_DATES.at(-1) ?? null,
    status,
    daysElapsed,
    totalDays: TOTAL_EVENT_DAYS,
    nextDate,
  }
}