import { EVENT_DATES, TOTAL_EVENT_DAYS } from '../domain/constants'
import type { Participant } from '../domain/types'

export interface ParticipantSpec extends Partial<Omit<Participant, 'id'>> {
  name: string
  /** Overrides the generated id. */
  id?: string
  /** Number of leading event days to mark as attended. */
  days?: number
}

/** Test helper: build a participant with the first `days` event days attended. */
export function makeParticipant(spec: ParticipantSpec): Participant {
  const { name, days, attendance, ...rest } = spec
  const id = rest.id ?? `id-${name.toLowerCase().replace(/\W+/g, '-')}`

  return {
    id,
    name,
    contact: rest.contact ?? '',
    cardCode: rest.cardCode ?? '000000',
    raffleNumber: rest.raffleNumber ?? `RF-${name.toUpperCase().slice(0, 4)}`,
    invitedById: rest.invitedById ?? null,
    registeredAt: rest.registeredAt ?? new Date(2026, 9, 1).toISOString(),
    attendance: attendance ?? EVENT_DATES.slice(0, days ?? 0),
  }
}

expect(TOTAL_EVENT_DAYS).toBe(5)