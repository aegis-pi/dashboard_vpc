import { describe, it, expect } from 'vitest'
import { subsampleData } from '../utils/subsample'

describe('subsampleData', () => {
  it('returns same reference when length <= maxPoints', () => {
    const data = [1, 2, 3]
    expect(subsampleData(data, 5)).toBe(data)
  })

  it('returns same reference when length === maxPoints', () => {
    const data = [1, 2, 3, 4, 5]
    expect(subsampleData(data, 5)).toBe(data)
  })

  it('handles empty array', () => {
    expect(subsampleData([], 10)).toEqual([])
  })

  it('returns empty array when maxPoints <= 0', () => {
    const data = [1, 2, 3]
    expect(subsampleData(data, 0)).toEqual([])
    expect(subsampleData(data, -1)).toEqual([])
  })

  it('returns empty array for empty input even when maxPoints <= 1', () => {
    expect(subsampleData([], 0)).toEqual([])
    expect(subsampleData([], 1)).toEqual([])
  })

  it('returns only the latest point when maxPoints === 1', () => {
    const data = [1, 2, 3]
    expect(subsampleData(data, 1)).toEqual([3])
  })

  it('always includes the first element', () => {
    const data = Array.from({ length: 200 }, (_, i) => i)
    const result = subsampleData(data, 10)
    expect(result[0]).toBe(0)
  })

  it('always includes the last element', () => {
    const data = Array.from({ length: 200 }, (_, i) => i)
    const result = subsampleData(data, 10)
    expect(result[result.length - 1]).toBe(199)
  })

  it('returns at most maxPoints elements', () => {
    const data = Array.from({ length: 500 }, (_, i) => i)
    const result = subsampleData(data, 120)
    expect(result.length).toBeLessThanOrEqual(120)
  })

  it('produces no duplicate values', () => {
    const data = Array.from({ length: 200 }, (_, i) => i)
    const result = subsampleData(data, 10)
    expect(new Set(result).size).toBe(result.length)
  })

  it('preserves original order', () => {
    const data = Array.from({ length: 200 }, (_, i) => i)
    const result = subsampleData(data, 10)
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!).toBeGreaterThan(result[i - 1]!)
    }
  })

  it('uniformly samples across the range', () => {
    const data = Array.from({ length: 100 }, (_, i) => i)
    const result = subsampleData(data, 5)
    // With maxPoints=5: indices should be 0, ~25, ~50, ~75, 99
    expect(result[0]).toBe(0)
    expect(result[result.length - 1]).toBe(99)
    expect(result.length).toBe(5)
  })
})
