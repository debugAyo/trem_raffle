import express from 'express'
import { randomInt, randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ATTENDANCE_DATES, isAttendanceDate } from '../src/domain/constants'
import {
  normalise,
  validateCardCode,
  validateRegistration,
  validateRaffleNumber,
} from '../src/domain/rules'
import { pickNumber } from '../src/domain/numberDraw'
import type { NumberWinner, Participant, RaffleState } from '../src/domain/types'
import { buildSeedState } from '../src/services/seed'
import {
  addAttendance,
  claimAvailableCard,
  clearNumberWinnerRows,
  deleteParticipantRow,
  initializeCardPool,
  markTestAttendance,
  openDatabase,
  readCardPool,
  readState,
  replaceAll,
  saveNumberWinner,
  updateParticipantRow,
  wipeAll,
} from './db'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_FILE = process.env.DB_FILE ?? path.join(__dirname, '..', 'data', 'raffle.db')
const PORT = Number(process.env.PORT ?? 5175)

import { mkdirSync } from 'node:fs'
mkdirSync(path.dirname(DB_FILE), { recursive: true })

const db = openDatabase(DB_FILE)
initializeCardPool(db)
const app = express()
app.use(express.json({ limit: '2mb' }))

function uniqueCode(prefix: string, used: Set<string>): string {
  let code = ''
  do {
    code = `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`
  } while (used.has(code))
  return code
}

function allAttendanceCodes(state: RaffleState): Set<string> {
  return new Set(
    state.participants.flatMap((participant) =>
      Object.values(participant.attendanceCodes ?? {}).map((code) => code.toLowerCase()),
    ),
  )
}

/** Wraps a handler so thrown errors become a 400 with a readable message. */
function handle(fn: (req: express.Request, res: express.Response) => void) {
  return (req: express.Request, res: express.Response) => {
    try {
      fn(req, res)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error'
      res.status(400).json({ ok: false, error: message })
    }
  }
}

app.get('/api/state', (_req, res) => {
  res.json({ ok: true, state: readState(db) })
})

app.get('/api/cards', (_req, res) => {
  res.json({ ok: true, cardPool: readCardPool(db) })
})

app.post(
  '/api/cards/initialize',
  handle((_req, res) => {
    res.json({ ok: true, message: 'The 120-card pool is ready.', cardPool: initializeCardPool(db) })
  }),
)

app.post(
  '/api/participants',
  handle((req, res) => {
    const { name, contact, raffleNumber, cardCode, invitedById } = req.body ?? {}
    const state = readState(db)

    const cleanName = String(name ?? '').trim()
    let cleanNumber = String(raffleNumber ?? '').trim()
    const suppliedCard = String(cardCode ?? '').trim()

    const id = `p-${randomUUID().slice(0, 8)}`
    if (!cleanNumber) cleanNumber = `LEGACY-${id}`

    let cleanCard = suppliedCard

    const check = validateRegistration(
      state.participants,
      { name: cleanName, raffleNumber: cleanNumber, cardCode: cleanCard },
      state.participants,
    )
    if (!check.ok) {
      res.status(400).json({ ok: false, error: check.error })
      return
    }

    if (invitedById && !state.participants.some((p) => p.id === invitedById)) {
      res.status(400).json({ ok: false, error: 'The inviter you selected no longer exists.' })
      return
    }

    const usedCodes = allAttendanceCodes(state)
    const attendanceCodes = Object.fromEntries(
      ATTENDANCE_DATES.map((date) => {
        const code = uniqueCode('ATT', usedCodes)
        usedCodes.add(code.toLowerCase())
        return [date, code]
      }),
    )

    const insert = db.transaction(() => {
      if (!cleanCard) cleanCard = claimAvailableCard(db, id)
      const participant: Participant = {
        id,
        name: cleanName,
        contact: String(contact ?? '').trim() || undefined,
        cardCode: cleanCard,
        raffleNumber: cleanNumber,
        attendanceCodes,
        testAttendance: false,
        invitedById: invitedById || null,
        registeredAt: new Date().toISOString(),
        attendance: [],
      }
      db.prepare(
        `INSERT INTO participants (id, name, contact, card_code, raffle_number, attendance_codes, test_attended, raffle_code, invited_by_id, registered_at)
        VALUES (@id, @name, @contact, @cardCode, @raffleNumber, @attendanceCodes, @testAttendance, @raffleCode, @invitedById, @registeredAt)`,
      ).run({
        id: participant.id,
        name: participant.name,
        contact: participant.contact ?? null,
        cardCode: participant.cardCode,
        raffleNumber: participant.raffleNumber,
        attendanceCodes: JSON.stringify(participant.attendanceCodes ?? {}),
        testAttendance: participant.testAttendance ? 1 : 0,
        raffleCode: participant.raffleCode ?? null,
        invitedById: participant.invitedById,
        registeredAt: participant.registeredAt,
      })
      return participant
    })
    const participant = insert()

    res.json({
      ok: true,
      message: `${participant.name} registered with permanent member card ${participant.cardCode}. Their test-day attendance code is ${attendanceCodes['2026-10-11']}.`,
      participant,
      state: readState(db),
    })
  }),
)

app.post(
  '/api/attendance',
  handle((req, res) => {
    const { name, attendanceCode, raffleNumber, date } = req.body ?? {}
    const state = readState(db)
    const dateKey = String(date ?? '')

    if (!isAttendanceDate(dateKey)) {
      res.status(400).json({ ok: false, error: 'That date is not an attendance day.' })
      return
    }

    const suppliedCode = String(attendanceCode ?? raffleNumber ?? '').trim()
    const participant = state.participants.find(
      (candidate) =>
        (normalise(candidate.name) === normalise(String(name ?? '')) &&
          normalise(candidate.attendanceCodes?.[dateKey] ?? '') === normalise(suppliedCode)) ||
        (normalise(candidate.cardCode) === normalise(suppliedCode) &&
          (!name || normalise(candidate.name) === normalise(String(name)))) ,
    )
    if (!participant) {
      res.status(400).json({ ok: false, error: 'The name and attendance code do not match for this date.' })
      return
    }

    if (dateKey === '2026-10-11' && participant.testAttendance) {
      res.status(400).json({ ok: false, error: `${participant.name} has already completed the pre-test.` })
      return
    }
    if (dateKey !== '2026-10-11' && participant.attendance.includes(dateKey)) {
      res
        .status(400)
        .json({ ok: false, error: `${participant.name} is already checked in for this day.` })
      return
    }

    const record = db.transaction(() => {
      if (dateKey === '2026-10-11') markTestAttendance(db, participant.id)
      else addAttendance(db, participant.id, dateKey)
    })
    record()

    res.json({
      ok: true,
      message:
        dateKey === '2026-10-11'
          ? `${participant.name} completed the pre-test. This day does not count toward the raffle.`
          : `${participant.name} checked in — ${participant.attendance.length + 1} of 5 days recorded.`,
      state: readState(db),
    })
  }),
)

app.patch(
  '/api/participants/:id',
  handle((req, res) => {
    const id = String(req.params.id)
    const state = readState(db)
    const existing = state.participants.find((p) => p.id === id)
    if (!existing) {
      res.status(404).json({ ok: false, error: 'Participant not found.' })
      return
    }

    const { name, raffleNumber, cardCode, contact } = req.body ?? {}

    const nextName = name !== undefined ? String(name).trim() : existing.name
    if (
      state.participants.some(
        (p) => p.id !== id && normalise(p.name) === normalise(nextName),
      )
    ) {
      res.status(400).json({ ok: false, error: `${nextName} is already registered.` })
      return
    }

    if (raffleNumber !== undefined) {
      const check = validateRaffleNumber(state.participants, String(raffleNumber), id)
      if (!check.ok) {
        res.status(400).json({ ok: false, error: check.error })
        return
      }
    }

    if (cardCode !== undefined) {
      const check = validateCardCode(state.participants, String(cardCode), id)
      if (!check.ok) {
        res.status(400).json({ ok: false, error: check.error })
        return
      }
    }

    updateParticipantRow(db, String(id), {
      name: name !== undefined ? nextName : undefined,
      raffleNumber: raffleNumber !== undefined ? String(raffleNumber).trim() : undefined,
      cardCode: cardCode !== undefined ? String(cardCode).trim() : undefined,
      contact: contact !== undefined ? String(contact).trim() || null : undefined,
    })

    res.json({ ok: true, message: 'Participant updated.', state: readState(db) })
  }),
)

app.delete(
  '/api/participants/:id',
  handle((req, res) => {
    deleteParticipantRow(db, String(req.params.id))
    res.json({ ok: true, message: 'Participant removed.', state: readState(db) })
  }),
)

app.post(
  '/api/draw',
  handle((_req, res) => {
    const pool = readCardPool(db)
    if (pool.total === 0) {
      res.status(400).json({ ok: false, error: 'The number pool is empty — prepare the 120 cards first.' })
      return
    }

    const state = readState(db)
    const drawnNumbers = state.numberWinners.map((w) => w.number)
    const codes = pool.cards.map((card) => card.code)

    // Cryptographically fair pick: every remaining number has an equal chance.
    const number = pickNumber(codes, drawnNumbers, () => randomInt(1_000_000) / 1_000_000)
    if (!number) {
      res.status(400).json({
        ok: false,
        error: 'Every number in the pool has already been drawn.',
      })
      return
    }

    const drawnAt = new Date().toISOString()
    const winner: NumberWinner = {
      number,
      sequence: drawnNumbers.length + 1,
      drawnAt,
    }
    saveNumberWinner(db, winner, drawnAt)

    res.json({
      ok: true,
      message: `Number ${number} wins — draw #${winner.sequence}.`,
      winner,
      state: readState(db),
    })
  }),
)

app.delete(
  '/api/winners',
  handle((_req, res) => {
    clearNumberWinnerRows(db)
    res.json({ ok: true, message: 'Winners cleared.', state: readState(db) })
  }),
)

app.post(
  '/api/import',
  handle((req, res) => {
    const incoming = req.body?.state as RaffleState | undefined
    if (!incoming || !Array.isArray(incoming.participants)) {
      res.status(400).json({ ok: false, error: 'Nothing to import.' })
      return
    }
    replaceAll(db, incoming)
    res.json({ ok: true, message: 'Imported from browser storage.', state: readState(db) })
  }),
)

app.post(
  '/api/reset-demo',
  handle((_req, res) => {
    replaceAll(db, buildSeedState())
    res.json({ ok: true, message: 'Demo data restored.', state: readState(db) })
  }),
)

app.post(
  '/api/clear',
  handle((_req, res) => {
    wipeAll(db)
    res.json({ ok: true, message: 'All data cleared.', state: readState(db) })
  }),
)

app.listen(PORT, () => {
  console.log(`  Raffle API ready on http://localhost:${PORT}`)
  console.log(`  Database: ${DB_FILE}`)
})