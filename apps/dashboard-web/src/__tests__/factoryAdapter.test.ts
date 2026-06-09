import { describe, expect, it } from 'vitest'
import { adaptFactorySummary, aiDetectionLabel } from '../adapters/factory'
import type { FactorySummary } from '../api/types'

describe('aiDetectionLabel', () => {
  it('maps stored AI labels to Korean display names', () => {
    expect(aiDetectionLabel('fire_score')).toBe('화재')
    expect(aiDetectionLabel('fall_score')).toBe('넘어짐')
    expect(aiDetectionLabel('fallen_detected')).toBe('넘어짐')
    expect(aiDetectionLabel('bend_score')).toBe('굽힘')
    expect(aiDetectionLabel('bending_detected')).toBe('굽힘')
    expect(aiDetectionLabel('temperature')).toBe('temperature')
  })
})

describe('adaptFactorySummary', () => {
  it('normalizes AI top cause names for display', () => {
    const result = adaptFactorySummary({
      factory_id: 'factory-a',
      top_causes: [
        'bend_score',
        { name: 'fire_score', value: 0.8 },
        { field: 'fall_score', value: 0.6 },
      ],
    } as FactorySummary)

    expect(result.top_causes.map((c) => c.name)).toEqual(['굽힘', '화재', '넘어짐'])
  })
})
