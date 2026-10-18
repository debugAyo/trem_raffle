import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

import {
  addAttendance,
  claimAvailableCard,
  clearNumberWinnerRows,
  initializeCardPool,
  openDatabase,
  readCardPool,
  readState,
  replaceAll,
  saveNumberWinner,
  wipeAll,
} from '../server/db'
import { getCategory } from '../src/domain/rules'
import { pickNumber } from '../src/domain/numberDraw'
import { buildSeedState } from '../src/services/seed'
import { EVENT_DATES } from '../src/domain/constants'
import { makeParticipant } from '../src/test/factories'

let db: Database.Database
let file: string

beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'raffle-test-')), 'test.db')
  db = openDatabase(file)
})

afterEach(() => {
  db.close()
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
})

describe('database schema constraints', () => {
  it('creates an idempotent pool of 120 unique cards without changing participants', () => {
    const state = buildSeedState()
    replaceAll(db, state)
    const before = readState(db)

    const first = initializeCardPool(db)
    const second = initializeCardPool(db)

    expect(first.total).toBe(120)
    expect(first.assigned).toBe(0)
    expect(new Set(first.cards.map((card) => card.code)).size).toBe(120)
    expect(first.cards.every((card) => /^\d{6}$/.test(card.code))).toBe(true)
    expect(second).toEqual(first)
    expect(readState(db)).toEqual(before)
  })

  it('keeps Sunday raffle fields when the card pool is initialized', () => {
    const state = buildSeedState()
    state.participants[0].raffleCode = 'RFL-SUNDAY'
    state.winners = [{
      participantId: state.participants[0].id,
      name: state.participants[0].name,
      raffleNumber: state.participants[0].raffleNumber,
      raffleCode: 'RFL-SUNDAY',
      category: 'A',
      winningEntry: 1,
      drawnAt: new Date().toISOString(),
    }]
    replaceAll(db, state)
    const before = readState(db)

    initializeCardPool(db)

    const after = readState(db)
    expect(after.participants[0].raffleCode).toBe(before.participants[0].raffleCode)
    expect(after.winners).toEqual(before.winners)
    expect(readCardPool(db).available).toBe(120)
  })

  it('claims one permanent card and leaves the rest available', () => {
    initializeCardPool(db)

    const code = claimAvailableCard(db, 'participant-1')
    const pool = readCardPool(db)

    expect(code).toMatch(/^\d{6}$/)
    expect(pool.assigned).toBe(1)
    expect(pool.available).toBe(119)
    expect(pool.cards.find((card) => card.code === code)?.participantId).toBe('participant-1')
  })

  it('refuses a duplicate raffle number', () => {
    const state = buildSeedState()
    replaceAll(db, state)

    const dup = { ...state.participants[0], id: 'other', name: 'Other', raffleNumber: state.participants[0].raffleNumber }
    expect(() =>
      db
        .prepare(
          `INSERT INTO participants (id, name, contact, card_code, raffle_number, invited_by_id, registered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(dup.id, dup.name, null, '999999', dup.raffleNumber, null, new Date().toISOString()),
    ).toThrow()
  })

  it('refuses a duplicate card code', () => {
    const state = buildSeedState()
    replaceAll(db, state)

    expect(() =>
      db
        .prepare(
          `INSERT INTO participants (id, name, contact, card_code, raffle_number, invited_by_id, registered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('other', 'Other', null, state.participants[0].cardCode, 'UNIQUE-1', null, new Date().toISOString()),
    ).toThrow()
  })

  it('refuses a duplicate attendance row for the same participant and date', () => {
    replaceAll(db, buildSeedState())
    const p = readState(db).participants[0]
    const before = p.attendance.length

    expect(() => addAttendance(db, p.id, EVENT_DATES[0])).toThrow()
    expect(readState(db).participants.find((x) => x.id === p.id)!.attendance).toHaveLength(before)
  })

  it('refuses to store the same participant as a legacy winner twice', () => {
    replaceAll(db, buildSeedState())
    const p = readState(db).participants[0]

    const insert = (category: string) =>
      db
        .prepare(
          `INSERT INTO winners (participant_id, name, raffle_number, category, winning_entry, drawn_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(p.id, p.name, 'RF-X', category, 1, new Date().toISOString())

    expect(() => insert('A')).not.toThrow()
    // Same person again, even under the other category.
    expect(() => insert('B')).toThrow()
    expect(readState(db).winners).toHaveLength(1)
  })

  it('only allows Category A or B in the legacy winners table', () => {
    replaceAll(db, buildSeedState())
    expect(() =>
      db
        .prepare(
          `INSERT INTO winners (participant_id, name, raffle_number, category, winning_entry, drawn_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run('x', 'X', 'RF-X', 'Z', 1, new Date().toISOString()),
    ).toThrow()
  })
})

describe('number-draw winners', () => {
  it('saves a drawn number with its sequence and stamps last_draw_at', () => {
    const drawnAt = new Date().toISOString()
    saveNumberWinner(db, { number: '483920', sequence: 1, drawnAt }, drawnAt)

    const state = readState(db)
    expect(state.numberWinners).toEqual([{ number: '483920', sequence: 1, drawnAt }])
    expect(state.lastDrawAt).toBe(drawnAt)
  })

  it('ignores a duplicate number so the same number cannot win twice', () => {
    saveNumberWinner(db, { number: '483920', sequence: 1, drawnAt: '2026-10-18T10:00:00.000Z' }, '2026-10-18T10:00:00.000Z')
    saveNumberWinner(db, { number: '483920', sequence: 2, drawnAt: '2026-10-18T11:00:00.000Z' }, '2026-10-18T11:00:00.000Z')

    const state = readState(db)
    expect(state.numberWinners).toHaveLength(1)
    expect(state.numberWinners[0].sequence).toBe(1)
  })

  it('clears every number winner and returns numbers to the pool', () => {
    saveNumberWinner(db, { number: '111111', sequence: 1, drawnAt: '2026-10-18T10:00:00.000Z' }, '2026-10-18T10:00:00.000Z')
    saveNumberWinner(db, { number: '222222', sequence: 2, drawnAt: '2026-10-18T11:00:00.000Z' }, '2026-10-18T11:00:00.000Z')

    clearNumberWinnerRows(db)

    const state = readState(db)
    expect(state.numberWinners).toHaveLength(0)
    expect(state.lastDrawAt).toBeNull()
  })

  it('restores number winners through replaceAll and deduplicates them', () => {
    replaceAll(db, {
      ...buildSeedState(),
      numberWinners: [
        { number: '111111', sequence: 1, drawnAt: '2026-10-18T10:00:00.000Z' },
        { number: '111111', sequence: 2, drawnAt: '2026-10-18T11:00:00.000Z' },
        { number: '222222', sequence: 3, drawnAt: '2026-10-18T12:00:00.000Z' },
      ],
      lastDrawAt: '2026-10-18T12:00:00.000Z',
    })

    const state = readState(db)
    expect(state.numberWinners.map((w) => w.number)).toEqual(['111111', '222222'])
    expect(state.lastDrawAt).toBe('2026-10-18T12:00:00.000Z')
  })

  it('wipeAll removes number winners along with everything else', () => {
    saveNumberWinner(db, { number: '483920', sequence: 1, drawnAt: '2026-10-18T10:00:00.000Z' }, '2026-10-18T10:00:00.000Z')
    wipeAll(db)

    const state = readState(db)
    expect(state.numberWinners).toHaveLength(0)
    expect(state.lastDrawAt).toBeNull()
  })
})

describe('state round trip', () => {
  it('preserves participants, chains and attendance', () => {
    const state = buildSeedState()
    replaceAll(db, state)
    const loaded = readState(db)

    expect(loaded.participants).toHaveLength(state.participants.length)
    expect(loaded.participants.map((p) => p.name)).toEqual(state.participants.map((p) => p.name))

    const amara = loaded.participants.find((p) => p.name === 'Amara Okafor')!
    const chidi = loaded.participants.find((p) => p.name === 'Chidi Eze')!
    expect(chidi.invitedById).toBe(amara.id)
    expect(amara.attendance).toEqual(EVENT_DATES)
  })

  it('preserves legacy winners', () => {
    const state = buildSeedState()
    replaceAll(db, state)
    const p = readState(db).participants[0]

    db.prepare(
      `INSERT OR IGNORE INTO winners (participant_id, name, raffle_number, category, winning_entry, drawn_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(p.id, p.name, p.raffleNumber, 'A', 1, new Date().toISOString())

    expect(readState(db).winners).toHaveLength(1)
  })

  it('drops attendance when a participant is deleted', () => {
    replaceAll(db, buildSeedState())
    const p = readState(db).participants[0]
    db.prepare(`DELETE FROM participants WHERE id = ?`).run(p.id)

    const rows = db
      .prepare(`SELECT COUNT(*) AS n FROM attendance WHERE participant_id = ?`)
      .get(p.id) as { n: number }
    expect(rows.n).toBe(0)
  })

  it('clears invitees to null rather than leaving a dangling inviter', () => {
    replaceAll(db, buildSeedState())
    const loaded = readState(db)
    const inviter = loaded.participants.find((p) => p.name === 'Amara Okafor')!

    db.prepare(`DELETE FROM participants WHERE id = ?`).run(inviter.id)

    const chidi = readState(db).participants.find((p) => p.name === 'Chidi Eze')!
    expect(chidi.invitedById).toBeNull()
  })

  it('wipeAll empties every table', () => {
    replaceAll(db, buildSeedState())
    wipeAll(db)
    const state = readState(db)
    expect(state.participants).toHaveLength(0)
    expect(state.winners).toHaveLength(0)
    expect(state.numberWinners).toHaveLength(0)
    expect(state.lastDrawAt).toBeNull()
  })

  it('ignores attendance stored on a non-event day', () => {
    const p = makeParticipant({ name: 'Odd', attendance: [...EVENT_DATES, '2026-10-17'] })
    replaceAll(db, { version: 1, participants: [p], winners: [], numberWinners: [], lastDrawAt: null })

    const loaded = readState(db).participants[0]
    expect(loaded.attendance).toEqual(EVENT_DATES)
    expect(getCategory(loaded)).toBe('A')
  })

  it('persists across reopening the database file', () => {
    replaceAll(db, buildSeedState())
    const count = readState(db).participants.length
    db.close()

    db = openDatabase(file)
    expect(readState(db).participants).toHaveLength(count)
  })
})

describe('pickNumber against the real pool', () => {
  it('always returns a number from the pool and never a drawn one', () => {
    initializeCardPool(db)
    const codes = readCardPool(db).cards.map((card) => card.code)

    const drawn: string[] = []
    for (let i = 0; i < 25; i += 1) {
      const pick = pickNumber(codes, drawn)
      expect(pick).not.toBeNull()
      expect(codes).toContain(pick!)
      expect(drawn).not.toContain(pick!)
      drawn.push(pick!)
    }
  })

  it('returns null once every number has been drawn', () => {
    const codes = ['000001', '000002', '000003']
    expect(pickNumber(codes, ['000001', '000002', '000003'])).toBeNull()
  })
})
