/**
 * Core domain types. Kept free of any browser or UI concerns so the rules
 * module stays trivially testable in isolation.
 */

/** YYYY-MM-DD */
export type DateKey = string

export type Category = 'A' | 'B' | null

export interface Participant {
  id: string
  name: string
  /** Optional phone / email / any contact detail. */
  contact?: string
  /** Legacy physical card number, retained for existing records. */
  cardCode: string
  /** Legacy registration number, retained for existing records. */
  raffleNumber: string
  /** One generated attendance code per date. */
  attendanceCodes?: Record<DateKey, string>
  /** Whether the participant completed the separate October 11 pre-test. */
  testAttendance?: boolean
  /** Issued on Sunday only for participants who qualify for a category. */
  raffleCode?: string
  /** Id of the participant who invited them, or null for a root inviter. */
  invitedById: string | null
  registeredAt: string
  /** Set of event dates this participant was checked in on. */
  attendance: DateKey[]
}

export interface Winner {
  participantId: string
  name: string
  raffleNumber: string
  raffleCode?: string
  category: Exclude<Category, null>
  /** Which raffle entry won (1-based, or the referral-bonus entry index). */
  winningEntry: number
  drawnAt: string
}

/** A single number-draw result: the winning card number and when it was drawn. */
export interface NumberWinner {
  /** The six-digit card number that was drawn, e.g. "483920". */
  number: string
  /** 1-based position in the draw order (first number drawn = 1). */
  sequence: number
  drawnAt: string
}

export interface RaffleState {
  version: number
  participants: Participant[]
  winners: Winner[]
  /** Number-draw winners, in draw order. */
  numberWinners: NumberWinner[]
  /** Date the admin last ran the draw, ISO string. */
  lastDrawAt: string | null
}

export interface CardPoolItem {
  code: string
  participantId: string | null
  participantName?: string
  assignedAt?: string
}

export interface CardPoolSummary {
  total: number
  assigned: number
  available: number
  cards: CardPoolItem[]
}