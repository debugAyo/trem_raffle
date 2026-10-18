import { describe, expect, it } from 'vitest'
import { pickNumber, remainingCount } from './numberDraw'

/** Deterministic rng: returns the given values in order, repeating the last. */
function sequenceRng(values: number[]) {
  let i = 0
  return () => {
    const value = values[Math.min(i, values.length - 1)]
    i += 1
    return value
  }
}

const POOL = ['000001', '000002', '000003', '000004', '000005']

describe('pickNumber', () => {
  it('picks uniformly from the pool', () => {
    // rng 0 → first element, rng just under 1 → last element.
    expect(pickNumber(POOL, [], () => 0)).toBe('000001')
    expect(pickNumber(POOL, [], () => 0.999999)).toBe('000005')
  })

  it('skips numbers that have already been drawn', () => {
    // With 000001 and 000002 drawn, the remaining pool is 3, 4, 5.
    expect(pickNumber(POOL, ['000001', '000002'], () => 0)).toBe('000003')
    expect(pickNumber(POOL, ['000001', '000002'], () => 0.999999)).toBe('000005')
  })

  it('returns null when nothing is left to draw', () => {
    expect(pickNumber(POOL, POOL, () => 0)).toBeNull()
    expect(pickNumber([], [], () => 0)).toBeNull()
  })

  it('never returns the same number twice in a row of draws', () => {
    const rng = sequenceRng([0, 0, 0, 0, 0])
    const drawn: string[] = []
    for (let i = 0; i < POOL.length; i += 1) {
      const pick = pickNumber(POOL, drawn, rng)
      expect(pick).not.toBeNull()
      expect(drawn).not.toContain(pick!)
      drawn.push(pick!)
    }
    expect(drawn).toHaveLength(POOL.length)
    expect(new Set(drawn).size).toBe(POOL.length)
  })

  it('spreads picks across the whole pool over many draws', () => {
    // Deterministic sweep: each rng value maps to a distinct pool position.
    const counts = new Map<string, number>()
    for (let i = 0; i < 500; i += 1) {
      const rng = () => (i % 5) / 5 + 0.05
      const pick = pickNumber(POOL, [], rng)!
      counts.set(pick, (counts.get(pick) ?? 0) + 1)
    }
    expect(counts.size).toBe(POOL.length)
    for (const count of counts.values()) expect(count).toBe(100)
  })

  it('works with a drawn list that contains unknown numbers', () => {
    expect(pickNumber(POOL, ['999999', '000001'], () => 0)).toBe('000002')
  })
})

describe('remainingCount', () => {
  it('counts pool numbers that have not been drawn', () => {
    expect(remainingCount(POOL, [])).toBe(5)
    expect(remainingCount(POOL, ['000001', '000002'])).toBe(3)
    expect(remainingCount(POOL, POOL)).toBe(0)
    expect(remainingCount(POOL, ['999999'])).toBe(5)
  })
})
