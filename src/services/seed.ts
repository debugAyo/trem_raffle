import { EVENT_DATES } from '../domain/constants'
import type { DateKey, Participant } from '../domain/types'
import { emptyState } from './storage'
import type { RaffleState } from '../domain/types'

/**
 * Demo data. Mixes participants across all three states — Category A with
 * successful referrals, Category B, and ineligible — so every screen has
 * something meaningful to show before real registration starts.
 */
interface SeedSpec {
  name: string
  contact: string
  invitedBy: string | null
  days: number
}

const SEEDS: SeedSpec[] = [
  // Root inviters
  { name: 'Amara Okafor', contact: '+234 801 555 0101', invitedBy: null, days: 5 },
  { name: 'Daniel Mensah', contact: '+233 24 555 0102', invitedBy: null, days: 5 },
  { name: 'Grace Adeyemi', contact: 'grace.a@example.com', invitedBy: null, days: 4 },
  { name: 'Kwame Boateng', contact: '+233 55 555 0104', invitedBy: null, days: 3 },

  // Amara's tree — all three referrals reach 5 days, so she gets bonus entries
  { name: 'Chidi Eze', contact: '+234 803 555 0105', invitedBy: 'Amara Okafor', days: 5 },
  { name: 'Fatima Bello', contact: '+234 802 555 0106', invitedBy: 'Amara Okafor', days: 5 },
  { name: 'Yusuf Ali', contact: '+234 805 555 0107', invitedBy: 'Amara Okafor', days: 5 },

  // Amara's referral that fell short — must NOT earn her a bonus entry
  { name: 'Ngozi Obi', contact: '+234 806 555 0108', invitedBy: 'Amara Okafor', days: 2 },

  // Daniel's tree — two valid, one short
  { name: 'Samuel Kone', contact: '+225 07 555 0109', invitedBy: 'Daniel Mensah', days: 5 },
  { name: 'Aminata Diallo', contact: '+224 62 555 0110', invitedBy: 'Daniel Mensah', days: 4 },
  { name: 'Ibrahim Toure', contact: '+223 76 555 0111', invitedBy: 'Daniel Mensah', days: 1 },

  // Grace's single valid referral
  { name: 'Mariam Traore', contact: '+223 78 555 0112', invitedBy: 'Grace Adeyemi', days: 5 },

  // Deeper chain — invitation-of-an-invitation
  { name: 'Emeka Nwosu', contact: '+234 807 555 0113', invitedBy: 'Chidi Eze', days: 5 },
  { name: 'Zainab Yusuf', contact: '+234 808 555 0114', invitedBy: 'Fatima Bello', days: 4 },

  // Not eligible yet
  { name: 'Peter Mwangi', contact: '+254 722 555 0115', invitedBy: 'Daniel Mensah', days: 2 },
  { name: 'Lindiwe Ndlovu', contact: '+27 82 555 0116', invitedBy: 'Grace Adeyemi', days: 3 },
  { name: 'Tomás Silva', contact: '+351 91 555 0117', invitedBy: 'Amara Okafor', days: 0 },
  { name: 'Hana Novak', contact: '+420 601 555 0118', invitedBy: 'Kwame Boateng', days: 1 },
]

const idFor = (name: string) => `seed-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`

export function buildSeedState(): RaffleState {
  const participants: Participant[] = SEEDS.map((spec, index) => ({
    id: idFor(spec.name),
    name: spec.name,
    contact: spec.contact,
    // Six-digit card codes, deterministic so demo data is reproducible.
    cardCode: String(100000 + index * 1373).slice(0, 6),
    raffleNumber: `RF-${String(1001 + index)}`,
    invitedById: spec.invitedBy ? idFor(spec.invitedBy) : null,
    registeredAt: new Date(2026, 9, 1, 9, index).toISOString(),
    attendance: EVENT_DATES.slice(0, spec.days) as DateKey[],
  }))

  return { ...emptyState(), participants }
}