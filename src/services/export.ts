import { EVENT_DATES } from '../domain/constants'
import { getCategory, getEntryCount, getValidReferrals } from '../domain/rules'
import type { Participant } from '../domain/types'

export function isDemoData(participants: Participant[]): boolean {
  return participants.some((participant) => /^seed-/i.test(participant.id))
}

function escapeCsv(value: string | undefined): string {
  const raw = (value ?? '').replace(/"/g, '""')
  return /[",\n]/.test(raw) ? `"${raw}"` : raw
}

export function buildParticipantCsv(participants: Participant[]): string {
  const rows = participants.map((participant) => {
    const inviterName =
      participants.find((candidate) => candidate.id === participant.invitedById)?.name ?? '—'
    const category = getCategory(participant) ?? 'Not eligible'
    const attendanceDays = participant.attendance.length
      ? [...participant.attendance].sort((a, b) => EVENT_DATES.indexOf(a) - EVENT_DATES.indexOf(b)).join('; ')
      : '—'
    const codes = Object.entries(participant.attendanceCodes ?? {})
      .sort(([left], [right]) => EVENT_DATES.indexOf(left) - EVENT_DATES.indexOf(right))
      .map(([date, code]) => `${date}:${code}`)
      .join(' | ')

    return [
      escapeCsv(participant.name),
      escapeCsv(participant.contact ?? ''),
      escapeCsv(inviterName),
      escapeCsv(category),
      String(getEntryCount(participant, participants)),
      String(getValidReferrals(participant, participants).length),
      escapeCsv(attendanceDays),
      escapeCsv(codes || '—'),
      escapeCsv(participant.raffleCode ?? ''),
      escapeCsv(participant.testAttendance ? 'Passed' : 'Not yet'),
      escapeCsv(participant.registeredAt),
    ].join(',')
  })

  const header = [
    'Name',
    'Contact',
    'Inviter',
    'Category',
    'Entries',
    'Valid Referrals',
    'Attendance Days',
    'Attendance Codes',
    'Raffle Code',
    'Pre-test',
    'Registered At',
  ].join(',')

  return [header, ...rows].join('\n')
}

export function downloadParticipantCsv(
  participants: Participant[],
  fileName = 'trem-attendance-report.csv',
): void {
  if (typeof window === 'undefined') return
  const csv = buildParticipantCsv(participants)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
