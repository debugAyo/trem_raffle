import { describe, expect, it } from 'vitest'
import {
  attendanceCount,
  getCategory,
  getEntryBreakdown,
  getEntryCount,
  getInvitees,
  getValidReferrals,
  hasAttendedOn,
  isReferralValid,
  validateCardCode,
  validateCheckIn,
  validateRaffleNumber,
  validateRegistration,
  daysRemaining,
} from '../domain/rules'
import { EVENT_DATES } from '../domain/constants'
import { makeParticipant } from '../test/factories'

describe('attendance categories', () => {
  it('gives Category A only to someone who attended all 5 days', () => {
    const p = makeParticipant({ name: 'All Five', days: 5 })
    expect(getCategory(p)).toBe('A')
    expect(attendanceCount(p)).toBe(5)
  })

  it('gives Category B at exactly 4 days', () => {
    expect(getCategory(makeParticipant({ name: 'Four Days', days: 4 }))).toBe('B')
  })

  it('does not qualify anyone with fewer than 4 days', () => {
    expect(getCategory(makeParticipant({ name: 'Three Days', days: 3 }))).toBeNull()
    expect(getCategory(makeParticipant({ name: 'None', days: 0 }))).toBeNull()
  })

  it('awards only the highest category reached', () => {
    // Someone on day 4 holds B, but if they reach day 5 they become A only.
    const atFour = makeParticipant({ name: 'Climber', days: 4 })
    expect(getCategory(atFour)).toBe('B')

    const atFive = { ...atFour, attendance: [...EVENT_DATES] }
    expect(getCategory(atFive)).toBe('A')
  })

  it('ignores attendance on non-event days', () => {
    const p = makeParticipant({
      name: 'Cheater',
      attendance: ['2026-10-12', '2026-10-17', '2026-10-19'],
    })
    expect(attendanceCount(p)).toBe(0)
    expect(getCategory(p)).toBeNull()
  })

  it('does not double-count a repeated attendance entry', () => {
    const p = makeParticipant({
      name: 'Repeater',
      attendance: [EVENT_DATES[0], EVENT_DATES[0], EVENT_DATES[1]],
    })
    expect(attendanceCount(p)).toBe(2)
    expect(hasAttendedOn(p, EVENT_DATES[0])).toBe(true)
    expect(hasAttendedOn(p, EVENT_DATES[2])).toBe(false)
  })

  it('reports days remaining toward Category A', () => {
    expect(daysRemaining(makeParticipant({ name: 'Three', days: 3 }))).toBe(2)
    expect(daysRemaining(makeParticipant({ name: 'Four', days: 4 }))).toBe(1)
    expect(daysRemaining(makeParticipant({ name: 'Five', days: 5 }))).toBe(0)
  })
})

describe('duplicate check-ins', () => {
  const p = makeParticipant({ name: 'Ada Lovelace', days: 1 })

  it('rejects a second check-in on the same date', () => {
    // A Set-backed attendance list can never hold the same date twice.
    const recorded = [...p.attendance]
    expect(recorded.includes(EVENT_DATES[0])).toBe(true)
    expect(hasAttendedOn(p, EVENT_DATES[0])).toBe(true)
    expect(hasAttendedOn(p, EVENT_DATES[1])).toBe(false)
  })

  it('allows check-in on a different date', () => {
    const nextDay = EVENT_DATES[1]
    expect(p.attendance.includes(nextDay)).toBe(false)
  })
})

describe('invalid numbers and codes', () => {
  const all = [
    makeParticipant({ name: 'Ada', raffleNumber: 'RF-1001', cardCode: '111111' }),
    makeParticipant({ name: 'Bob', raffleNumber: 'RF-1002', cardCode: '222222' }),
  ]

  it('rejects a raffle number that belongs to nobody', () => {
    const res = validateCheckIn(all, 'Ada', 'RF-9999')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/not found/i)
  })

  it('rejects a valid number paired with the wrong name', () => {
    const res = validateCheckIn(all, 'Charlie', 'RF-1001')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/does not belong/i)
  })

  it('rejects a valid name paired with the wrong number', () => {
    const res = validateCheckIn(all, 'Ada', 'RF-1002')
    expect(res.ok).toBe(false)
  })

  it('rejects an empty name or number', () => {
    expect(validateCheckIn(all, '', 'RF-1001').ok).toBe(false)
    expect(validateCheckIn(all, 'Ada', '   ').ok).toBe(false)
  })

  it('accepts a matching name and number, case-insensitively', () => {
    expect(validateCheckIn(all, '  ada ', 'rf-1001').ok).toBe(true)
  })

  it('rejects duplicate raffle numbers on registration', () => {
    const res = validateRaffleNumber(all, 'RF-1001')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/already taken/i)
  })

  it('rejects duplicate card codes on registration', () => {
    const res = validateCardCode(all, '111111')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/already taken/i)
  })

  it('allows a participant to keep their own number when edited', () => {
    expect(validateRaffleNumber(all, 'RF-1001', all[0].id).ok).toBe(true)
    expect(validateCardCode(all, '111111', all[0].id).ok).toBe(true)
  })

  it('rejects duplicate participant names', () => {
    const res = validateRegistration(
      all,
      { name: 'Ada', raffleNumber: 'RF-2000', cardCode: '333333' },
      all,
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/already registered/i)
  })

  it('accepts a clean registration', () => {
    const res = validateRegistration(
      all,
      { name: 'Cleo', raffleNumber: 'RF-2000', cardCode: '333333' },
      all,
    )
    expect(res.ok).toBe(true)
  })
})

describe('referral entries', () => {
  it('counts a referral only once the invitee reaches 4 days', () => {
    const inviter = makeParticipant({ name: 'Inviter', days: 5 })
    const almost = makeParticipant({ name: 'Almost', days: 3, invitedById: inviter.id })
    const all = [inviter, almost]

    expect(isReferralValid(almost)).toBe(false)
    expect(getValidReferrals(inviter, all)).toHaveLength(0)
    expect(getEntryCount(inviter, all)).toBe(1)

    const qualified = { ...almost, attendance: EVENT_DATES.slice(0, 4) }
    expect(isReferralValid(qualified)).toBe(true)
    expect(getValidReferrals(inviter, [inviter, qualified])).toHaveLength(1)
  })

  it('gives a Category A participant one bonus entry per valid referral', () => {
    const inviter = makeParticipant({ name: 'Amara', days: 5 })
    const referrals = [
      makeParticipant({ name: 'R1', days: 5, invitedById: inviter.id }),
      makeParticipant({ name: 'R2', days: 4, invitedById: inviter.id }),
      makeParticipant({ name: 'R3', days: 5, invitedById: inviter.id }),
    ]
    const all = [inviter, ...referrals]

    expect(getEntryBreakdown(inviter, all)).toEqual({ base: 1, referralBonus: 3, total: 4 })
    expect(getEntryCount(inviter, all)).toBe(4)
  })

  it('excludes invalid referrals from the bonus', () => {
    const inviter = makeParticipant({ name: 'Amara', days: 5 })
    const all = [
      inviter,
      makeParticipant({ name: 'Good', days: 5, invitedById: inviter.id }),
      makeParticipant({ name: 'Short', days: 2, invitedById: inviter.id }),
    ]
    expect(getEntryBreakdown(inviter, all)).toEqual({ base: 1, referralBonus: 1, total: 2 })
  })

  it('does not give a Category B participant any bonus', () => {
    const inviter = makeParticipant({ name: 'Grace', days: 4 })
    const all = [
      inviter,
      makeParticipant({ name: 'Ref', days: 5, invitedById: inviter.id }),
    ]
    expect(getCategory(inviter)).toBe('B')
    expect(getEntryBreakdown(inviter, all)).toEqual({ base: 1, referralBonus: 0, total: 1 })
  })

  it('gives an ineligible participant no entries at all', () => {
    const nobody = makeParticipant({ name: 'Nobody', days: 1 })
    expect(getEntryBreakdown(nobody, [nobody])).toEqual({ base: 0, referralBonus: 0, total: 0 })
  })

  it('does not reward a referral chain unless each link qualifies', () => {
    // Amara -> Chidi -> Emeka. Emeka qualifies, but Amara does not.
    const amara = makeParticipant({ name: 'Amara', days: 3 })
    const chidi = makeParticipant({ name: 'Chidi', days: 5, invitedById: amara.id })
    const emeka = makeParticipant({ name: 'Emeka', days: 5, invitedById: chidi.id })
    const all = [amara, chidi, emeka]

    expect(getInvitees(amara, all).map((p) => p.name)).toEqual(['Chidi'])
    expect(getValidReferrals(amara, all)).toHaveLength(1)
    expect(getEntryCount(amara, all)).toBe(0)
    expect(getEntryCount(chidi, all)).toBe(2)
  })
})