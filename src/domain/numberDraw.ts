/**
 * Number-draw logic. Pure functions only — the caller supplies the random
 * source, which makes every outcome reproducible in tests.
 *
 * The draw pool is the set of registered card-pool numbers. Every number has
 * an equal chance; numbers that have already been drawn are excluded.
 */
export type Rng = () => number

/**
 * Pick one number uniformly at random from `pool`, skipping any number that
 * appears in `drawn`. Returns null when nothing is left to draw.
 */
export function pickNumber(pool: string[], drawn: readonly string[], rng: Rng = Math.random): string | null {
  const drawnSet = new Set(drawn)
  const remaining = pool.filter((code) => !drawnSet.has(code))
  if (remaining.length === 0) return null
  return remaining[Math.floor(rng() * remaining.length)]
}

/** How many numbers are still in the pool after the drawn ones are removed. */
export function remainingCount(pool: string[], drawn: readonly string[]): number {
  const drawnSet = new Set(drawn)
  return pool.filter((code) => !drawnSet.has(code)).length
}
