# Raffle HQ

A locally hosted raffle and attendance app for the **October 11–18, 2026** event. October 11 is a
separate pre-test and October 17 is excluded.

The Vite frontend runs alongside a local Express API. Participant, attendance, and winner data is
stored in SQLite at `data/raffle.db`, so refreshing the browser does not erase the event.

---

## Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:5180**. The API runs on **http://localhost:5175** and is proxied by Vite.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Typecheck and build for production into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |

---

## The event dates

October 11 is a registration and identity pre-test. It never counts toward attendance categories,
referrals, or prizes. The five real raffle attendance dates are October 13, 14, 15, 16, and 18.

The five event days are defined in one place — `src/domain/constants.ts`:

```ts
export const EVENT_DATES = [
  '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-18',
]
```

**October 17 is deliberately not in this list.** Attendance on any other date is ignored, so a
mistyped date can never push someone into a winning category. If you need to change the dates,
edit that one array.

---

## The rules

All of these live in `src/domain/rules.ts` as pure functions with no React and no storage, so they
can be tested directly.

**Attendance categories**

| Category | Requirement |
| --- | --- |
| A | Attended all 5 event days |
| B | Attended at least 4 event days |
| — | Fewer than 4 days — **not eligible** for the draw |

A participant qualifies only for the highest category they reach. Someone who gets to 5 days is
Category A only — they are not also counted as Category B.

**Referrals**

- Every participant is registered under the person who invited them.
- A referral becomes **valid** once the invited participant has attended **4 or more** event days.
- Referral stats feed the leaderboard and eligibility tracking; the draw itself no longer weights by entries.

**Draw**

- The draw pool is the **120 registered member-card numbers**. No entries, no weights — every number has one equal chance.
- One number is drawn at random per spin. The admin can spin again for the next winner.
- **A number can win only once** — drawn numbers are removed from the pool for later spins.
- A **rules screen** shows before every spin (equal chance · the system decides eligibility automatically · no counters or questions · claim with your card).
- The winning number **pops up** with a slot-machine reel animation and confetti. Only the number is shown — the card holder claims the prize.
- The winning number, draw order and draw time are saved.

---

## Pages

| Page | What it is for |
| --- | --- |
| **Dashboard** | Headline stats, attendance progress per day, top referrers, draw status |
| **Register** | Add a participant with name, optional contact, and inviter; codes are generated automatically |
| **Daily attendance** | Pick a day, verify name + date-specific attendance code, record check-in, view full attendance history |
| **Participants** | Searchable list with search, sort, inline edit and delete |
| **Referral leaderboard** | Ranked by valid referrals or total entries, plus the full referral tree |
| **Eligibility & entries** | Exactly who is Category A / B / not eligible, and how many entries each holds |
| **Number draw** | Rules screen, slot-machine spin, pop-up reveal, and the drawn-numbers history |
| **Live display** | Projector-friendly screen — see below |

Navigate with the sidebar, or directly by URL hash: `/#/checkin`, `/#/draw`, `/#/live`, etc.

---

## Attendance and raffle codes

Registration automatically creates one attendance code per participant for every attendance date,
including the October 11 pre-test. Attendance codes belong to both the participant and the date, so
a code cannot be reused on another day or by another person.

The **member card number is the raffle number**. Every registered participant is assigned one of the
120 permanent six-digit card numbers, and that is the number the draw picks from — no separate
Sunday raffle codes are issued.

Legacy card and raffle-number fields remain supported for old database records, but new registration
uses generated date-specific attendance codes.

---

## Opening the live display

The live display is designed for a second screen or projector.

1. Start the app with `npm run dev`.
2. Open **http://localhost:5180/#/live**, or click **Live display** in the sidebar.
3. Click **Full screen** (or press `F11`).

It shows the current event date, a status pill, the day counter, verified participants, Category A
and B counts, today's check-ins, numbers drawn, the eligibility progress bar, per-day attendance
counts, the referral leaderboard, and the number-draw animation (rules → slot-machine reels →
pop-up reveal) with the winning number. Admin controls are stripped out of this view.

Both windows read the same local SQLite database, so anything the admin records appears on the display.

---

## Demo data and resetting

The app starts with realistic demo data (18 participants across referral chains, mixed eligibility
states) so every screen has something to show immediately.

- **Reset demo data** — sidebar, bottom left. Wipes everything and restores the demo set.
- **Clear all data** — sidebar, bottom left. Wipes everything and leaves you with an empty app, so
  you can start registering for real. Asks for confirmation.

The database file is `data/raffle.db`. Use **Clear all data** in the sidebar to empty it, or stop the
dev server and remove that file to create a completely fresh database. Refreshing the browser never
erases your data because every check-in and registration is written immediately to SQLite.

---

## Project structure

```
src/
  domain/          Pure business logic — no UI, no storage
    types.ts         Participant, Winner, NumberWinner, RaffleState
    constants.ts     Event dates, pre-test date, category thresholds, event status
    rules.ts         Categories, referral validity, entry counts, validation
    numberDraw.ts    Uniform number pick from the pool, drawn-number exclusion
  services/        Browser-facing helpers
    storage.ts       localStorage read/write with a corruption guard
    cardCode.ts      Card code generation and normalisation
    seed.ts          Demo data
  state/
    store.tsx        React context for the local API-backed state
  components/      Shared UI (cards, badges, messages, draw animation)
  pages/           One file per screen
  test/            Test helpers
```

`src/domain/` is deliberately free of React and storage imports — that is what makes the rules
straightforward to test and safe to change.

---

## Tests

```bash
npm test
```

Tests covering the behaviour that matters:

- **Number draw** — uniform pick from the 120-number pool, drawn numbers excluded, empty pool returns null, deterministic with an injected RNG, and every pick stays inside the pool.
- **Draw persistence** — drawn numbers survive a reload, duplicates are ignored (a number can never win twice), clearing winners returns every number to the pool, and wipeAll empties the draw.
- **Attendance categories** — 5 days → A, 4 days → B, 3 or fewer → ineligible; highest category only;
  non-event dates ignored; repeated dates not double-counted.
- **Duplicate check-ins** — date-specific attendance codes, separate October 11 pre-test, the same
  person cannot be checked in twice on the same date, and October 17 is rejected.
- **Invalid numbers** — unknown raffle number, right number with the wrong name, right name with the
  wrong number, empty input, duplicate raffle numbers, duplicate card codes.
- **Referral entries** — a referral only counts once the invitee reaches 4 days; Category A gets one
  bonus entry per valid referral; Category B gets none; ineligible gets nothing; multi-level chains.
- **Persistence** — data survives a reload, corrupt JSON is handled gracefully.

---

## Extending it

The number-draw logic is deliberately isolated in `src/domain/numberDraw.ts` — a pure uniform pick
with no UI or storage imports. To change the draw (for example, to draw multiple numbers per spin),
edit that module; the rules screen and reel animation in `src/components/NumberSpin.tsx` stay
untouched. Adding a new category means adding a constant in `constants.ts` and a branch in
`getCategory` in `rules.ts` — categories still drive eligibility tracking and the leaderboard.

Because the local SQLite file is the system of record, back up `data/raffle.db` before clearing or
replacing the event data.