export const CARD_CODE_LENGTH = 6

const MIN = 0
const MAX = 999_999

/** Generate a random 6-digit card code, e.g. "483920". */
export function generateCardCode(): string {
  const n = MIN + Math.floor(Math.random() * (MAX - MIN + 1))
  return String(n).padStart(CARD_CODE_LENGTH, '0')
}

/**
 * Generate a card code that is not already used.
 * Retries a bounded number of times before falling back to a linear probe,
 * so it can never loop forever on a nearly-full namespace.
 */
export function generateUniqueCardCode(
  taken: Iterable<string>,
  rng: () => number = Math.random,
  maxAttempts = 200,
): string {
  const used = new Set<string>()
  for (const code of taken) used.add(code)

  for (let i = 0; i < maxAttempts; i++) {
    const n = MIN + Math.floor(rng() * (MAX - MIN + 1))
    const code = String(n).padStart(CARD_CODE_LENGTH, '0')
    if (!used.has(code)) return code
  }

  for (let n = MIN; n <= MAX; n++) {
    const code = String(n).padStart(CARD_CODE_LENGTH, '0')
    if (!used.has(code)) return code
  }
  throw new Error('No card codes available')
}

/**
 * Normalise user-typed card codes: strip spaces and dashes.
 * A 6-digit code is kept as digits; anything else is left as typed
 * so organizers can use their own printed format.
 */
export function normaliseCardCode(value: string): string {
  const cleaned = value.trim().replace(/[\s-]/g, '')
  if (/^\d{1,6}$/.test(cleaned)) return cleaned.padStart(CARD_CODE_LENGTH, '0')
  return cleaned
}

/**
 * Raffle numbers keep their dashes and spacing — only case and surrounding
 * whitespace are normalised, so the number stays recognisable to the
 * organizer and can be written on a physical card.
 */
export function normaliseRaffleNumber(value: string): string {
  return value.trim().toUpperCase()
}