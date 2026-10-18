import Database from 'better-sqlite3'
import type {
  CardPoolSummary,
  DateKey,
  NumberWinner,
  Participant,
  RaffleState,
  Winner,
} from '../src/domain/types'
import { EVENT_DATES } from '../src/domain/constants'
import { generateUniqueCardCode } from '../src/services/cardCode'

/**
 * SQLite storage. Invariants that the app depends on are enforced by the
 * schema itself, not only by application code:
 *   - attendance has a composite PK, so a duplicate check-in is impossible
 *   - winners.participant_id is UNIQUE, so nobody can win twice
 *   - raffle_number and card_code are UNIQUE
 */
export function openDatabase(file: string): Database.Database {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      contact       TEXT,
      card_code     TEXT NOT NULL UNIQUE,
      raffle_number TEXT NOT NULL UNIQUE,
      attendance_codes TEXT NOT NULL DEFAULT '{}',
      test_attended INTEGER NOT NULL DEFAULT 0,
      raffle_code TEXT,
      invited_by_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
      registered_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      date           TEXT NOT NULL,
      PRIMARY KEY (participant_id, date)
    );

    CREATE TABLE IF NOT EXISTS winners (
      participant_id TEXT PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      raffle_number  TEXT NOT NULL,
      raffle_code    TEXT,
      category       TEXT NOT NULL CHECK (category IN ('A','B')),
      winning_entry  INTEGER NOT NULL DEFAULT 1,
      drawn_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS card_pool (
      code          TEXT PRIMARY KEY,
      participant_id TEXT,
      assigned_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS draw_winners (
      number   TEXT PRIMARY KEY,
      sequence INTEGER NOT NULL,
      drawn_at TEXT NOT NULL
    );
  `)

  const columns = new Set(
    (db.prepare(`PRAGMA table_info(participants)`).all() as { name: string }[]).map(
      (column) => column.name,
    ),
  )
  if (!columns.has('attendance_codes')) {
    db.exec(`ALTER TABLE participants ADD COLUMN attendance_codes TEXT NOT NULL DEFAULT '{}'`)
  }
  if (!columns.has('test_attended')) {
    db.exec(`ALTER TABLE participants ADD COLUMN test_attended INTEGER NOT NULL DEFAULT 0`)
  }
  if (!columns.has('raffle_code')) {
    db.exec(`ALTER TABLE participants ADD COLUMN raffle_code TEXT`)
  }

  const winnerColumns = new Set(
    (db.prepare(`PRAGMA table_info(winners)`).all() as { name: string }[]).map(
      (column) => column.name,
    ),
  )
  if (!winnerColumns.has('raffle_code')) {
    db.exec(`ALTER TABLE winners ADD COLUMN raffle_code TEXT`)
  }

  return db
}

const eventDateSet = new Set(EVENT_DATES)

export function readState(db: Database.Database): RaffleState {
  const participants = db
    .prepare(
            `SELECT p.id, p.name, p.contact, p.card_code, p.raffle_number,
              p.attendance_codes, p.test_attended, p.raffle_code,
              p.invited_by_id, p.registered_at,
              COALESCE(
                (SELECT group_concat(a.date) FROM attendance a WHERE a.participant_id = p.id),
                ''
              ) AS dates
       FROM participants p
       ORDER BY p.registered_at`,
    )
    .all()
    .map((row) => {
      const r = row as Record<string, string | null>
      let attendanceCodes: Record<string, string> = {}
      try {
        attendanceCodes = JSON.parse(r.attendance_codes ?? '{}') as Record<string, string>
      } catch {
        attendanceCodes = {}
      }
      const attendance = r.dates
        ? r.dates
            .split(',')
            .filter((d) => eventDateSet.has(d))
            .sort((a, b) => EVENT_DATES.indexOf(a) - EVENT_DATES.indexOf(b))
        : []

      return {
        id: r.id!,
        name: r.name!,
        contact: r.contact ?? undefined,
        cardCode: r.card_code!,
        raffleNumber: r.raffle_number!,
        attendanceCodes,
        testAttendance: Boolean(Number(r.test_attended ?? 0)),
        raffleCode: r.raffle_code ?? undefined,
        invitedById: r.invited_by_id ?? null,
        registeredAt: r.registered_at!,
        attendance,
      } as Participant
    })

  const winners = (
    db
      .prepare(
        `SELECT participant_id, name, raffle_number, raffle_code, category, winning_entry, drawn_at
         FROM winners ORDER BY drawn_at`,
      )
      .all() as Record<string, string | number>[]
  ).map(
    (w): Winner => ({
      participantId: w.participant_id as string,
      name: w.name as string,
      raffleNumber: w.raffle_number as string,
      raffleCode: (w.raffle_code as string | null) ?? undefined,
      category: w.category as 'A' | 'B',
      winningEntry: Number(w.winning_entry),
      drawnAt: w.drawn_at as string,
    }),
  )

  const lastDraw = db.prepare(`SELECT value FROM meta WHERE key = 'last_draw_at'`).get() as
    | { value: string | null }
    | undefined

  const numberWinners = (
    db
      .prepare(`SELECT number, sequence, drawn_at FROM draw_winners ORDER BY sequence`)
      .all() as Record<string, string | number>[]
  ).map(
    (w): NumberWinner => ({
      number: w.number as string,
      sequence: Number(w.sequence),
      drawnAt: w.drawn_at as string,
    }),
  )

  return {
    version: 1,
    participants,
    // The UNIQUE constraint on participant_id guarantees one win each.
    winners,
    numberWinners,
    lastDrawAt: lastDraw?.value ?? null,
  }
}

export function readCardPool(db: Database.Database): CardPoolSummary {
  const cards = db
    .prepare(
      `SELECT c.code, c.participant_id, p.name AS participant_name, c.assigned_at
       FROM card_pool c
       LEFT JOIN participants p ON p.id = c.participant_id
       ORDER BY c.code`,
    )
    .all() as { code: string; participant_id: string | null; participant_name?: string; assigned_at?: string }[]

  return {
    total: cards.length,
    assigned: cards.filter((card) => card.participant_id !== null).length,
    available: cards.filter((card) => card.participant_id === null).length,
    cards: cards.map((card) => ({
      code: card.code,
      participantId: card.participant_id,
      participantName: card.participant_name,
      assignedAt: card.assigned_at,
    })),
  }
}

export function initializeCardPool(db: Database.Database, size = 120): CardPoolSummary {
  const existing = readCardPool(db)
  if (existing.total > 0) return existing

  const taken = new Set(
    (db.prepare(`SELECT card_code FROM participants`).all() as { card_code: string }[]).map(
      (row) => row.card_code,
    ),
  )
  const insert = db.prepare(`INSERT INTO card_pool (code) VALUES (?)`)
  const tx = db.transaction(() => {
    for (let index = 0; index < size; index += 1) {
      const code = generateUniqueCardCode(taken)
      taken.add(code)
      insert.run(code)
    }
  })
  tx()
  return readCardPool(db)
}

export function claimAvailableCard(db: Database.Database, participantId: string): string {
  const card = db
    .prepare(`SELECT code FROM card_pool WHERE participant_id IS NULL ORDER BY rowid LIMIT 1`)
    .get() as { code: string } | undefined
  if (!card) throw new Error('All 120 member cards have already been assigned.')

  db.prepare(
    `UPDATE card_pool SET participant_id = ?, assigned_at = ? WHERE code = ? AND participant_id IS NULL`,
  ).run(participantId, new Date().toISOString(), card.code)
  return card.code
}

export function insertParticipant(db: Database.Database, p: Participant): void {
  db.prepare(
    `INSERT INTO participants (id, name, contact, card_code, raffle_number, attendance_codes, test_attended, raffle_code, invited_by_id, registered_at)
     VALUES (@id, @name, @contact, @cardCode, @raffleNumber, @attendanceCodes, @testAttendance, @raffleCode, @invitedById, @registeredAt)`,
  ).run({
    id: p.id,
    name: p.name,
    contact: p.contact ?? null,
    cardCode: p.cardCode,
    raffleNumber: p.raffleNumber,
    attendanceCodes: JSON.stringify(p.attendanceCodes ?? {}),
    testAttendance: p.testAttendance ? 1 : 0,
    raffleCode: p.raffleCode ?? null,
    invitedById: p.invitedById,
    registeredAt: p.registeredAt,
  })
}

export function addAttendance(db: Database.Database, participantId: string, date: DateKey): void {
  db.prepare(`INSERT INTO attendance (participant_id, date) VALUES (?, ?)`).run(participantId, date)
}

export function markTestAttendance(db: Database.Database, participantId: string): void {
  db.prepare(`UPDATE participants SET test_attended = 1 WHERE id = ?`).run(participantId)
}

export function setAttendanceCode(
  db: Database.Database,
  participantId: string,
  date: DateKey,
  code: string,
): void {
  const row = db
    .prepare(`SELECT attendance_codes FROM participants WHERE id = ?`)
    .get(participantId) as { attendance_codes: string } | undefined
  if (!row) throw new Error('Participant not found.')
  let codes: Record<string, string> = {}
  try {
    codes = JSON.parse(row.attendance_codes || '{}') as Record<string, string>
  } catch {
    codes = {}
  }
  codes[date] = code
  db.prepare(`UPDATE participants SET attendance_codes = ? WHERE id = ?`).run(
    JSON.stringify(codes),
    participantId,
  )
}

export function setRaffleCode(db: Database.Database, participantId: string, code: string): void {
  db.prepare(`UPDATE participants SET raffle_code = ? WHERE id = ?`).run(code, participantId)
}

export function updateParticipantRow(
  db: Database.Database,
  id: string,
  patch: {
    name?: string
    raffleNumber?: string
    cardCode?: string
    contact?: string | null
    raffleCode?: string | null
  },
): void {
  const sets: string[] = []
  const values: Record<string, unknown> = { id }

  if (patch.name !== undefined) {
    sets.push('name = @name')
    values.name = patch.name
  }
  if (patch.raffleNumber !== undefined) {
    sets.push('raffle_number = @raffleNumber')
    values.raffleNumber = patch.raffleNumber
  }
  if (patch.cardCode !== undefined) {
    sets.push('card_code = @cardCode')
    values.cardCode = patch.cardCode
  }
  if (patch.contact !== undefined) {
    sets.push('contact = @contact')
    values.contact = patch.contact
  }
  if (patch.raffleCode !== undefined) {
    sets.push('raffle_code = @raffleCode')
    values.raffleCode = patch.raffleCode
  }
  if (sets.length === 0) return

  db.prepare(`UPDATE participants SET ${sets.join(', ')} WHERE id = @id`).run(values)
}

export function deleteParticipantRow(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM participants WHERE id = ?`).run(id)
}

export function clearWinnersRows(db: Database.Database): void {
  db.prepare(`DELETE FROM winners`).run()
}

/** Save one number-draw winner and stamp the draw time. */
export function saveNumberWinner(db: Database.Database, winner: NumberWinner, lastDrawAt: string): void {
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO draw_winners (number, sequence, drawn_at) VALUES (?, ?, ?)`,
    ).run(winner.number, winner.sequence, winner.drawnAt)
    db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('last_draw_at', ?)`).run(lastDrawAt)
  })
  tx()
}

/** Remove every number-draw winner, returning all numbers to the pool. */
export function clearNumberWinnerRows(db: Database.Database): void {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM draw_winners`).run()
    db.prepare(`DELETE FROM meta WHERE key = 'last_draw_at'`).run()
  })
  tx()
}

export function saveWinners(db: Database.Database, winners: Winner[], lastDrawAt: string): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO winners (participant_id, name, raffle_number, raffle_code, category, winning_entry, drawn_at)
     VALUES (@participantId, @name, @raffleNumber, @raffleCode, @category, @winningEntry, @drawnAt)`,
  )
  const tx = db.transaction(() => {
    for (const w of winners) insert.run(w)
    db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('last_draw_at', ?)`).run(lastDrawAt)
  })
  tx()
}

export function wipeAll(db: Database.Database): void {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM winners`).run()
    db.prepare(`DELETE FROM draw_winners`).run()
    db.prepare(`DELETE FROM attendance`).run()
    db.prepare(`DELETE FROM participants`).run()
    db.prepare(`DELETE FROM meta`).run()
    db.prepare(`UPDATE card_pool SET participant_id = NULL, assigned_at = NULL`).run()
  })
  tx()
}

/** Replace everything with the given state — used by import and demo reset. */
export function replaceAll(db: Database.Database, state: RaffleState): void {
  const tx = db.transaction(() => {
    wipeAll(db)

    // Insert each participant only after their inviter is present. This works
    // for referral chains of any depth, not just one parent-child level.
    const pending = [...state.participants]
    const inserted = new Set<string>()
    while (pending.length > 0) {
      const ready = pending.filter(
        (p) => !p.invitedById || inserted.has(p.invitedById),
      )
      if (ready.length === 0) {
        throw new Error('Cannot import participants with an invalid referral chain.')
      }
      for (const p of ready) {
        insertParticipant(db, p)
        inserted.add(p.id)
        pending.splice(pending.indexOf(p), 1)
      }
    }
    for (const p of state.participants) {
      for (const date of p.attendance) addAttendance(db, p.id, date)
    }

    const seen = new Set<string>()
    const unique = state.winners.filter((w) => {
      if (seen.has(w.participantId)) return false
      seen.add(w.participantId)
      return true
    })
    for (const w of unique) {
      db.prepare(
        `INSERT OR IGNORE INTO winners (participant_id, name, raffle_number, raffle_code, category, winning_entry, drawn_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        w.participantId,
        w.name,
        w.raffleNumber,
        w.raffleCode ?? null,
        w.category,
        w.winningEntry,
        w.drawnAt,
      )
    }

    const seenNumbers = new Set<string>()
    for (const w of state.numberWinners ?? []) {
      if (seenNumbers.has(w.number)) continue
      seenNumbers.add(w.number)
      db.prepare(
        `INSERT OR IGNORE INTO draw_winners (number, sequence, drawn_at) VALUES (?, ?, ?)`,
      ).run(w.number, w.sequence, w.drawnAt)
    }

    if (state.lastDrawAt) {
      db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('last_draw_at', ?)`).run(state.lastDrawAt)
    }
  })
  tx()
}