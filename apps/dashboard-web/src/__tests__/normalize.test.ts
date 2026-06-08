import { describe, it, expect } from 'vitest'
import { extractSensor, extractAI, normalizeHistoryItem } from '../utils/normalize'

// ─── extractSensor ────────────────────────────────────────────────────────────

describe('extractSensor', () => {
  it('returns nulls for undefined input', () => {
    expect(extractSensor(undefined)).toEqual({ temperature: null, humidity: null, pressure: null })
  })

  it('reads flat DDB format (temperature_celsius)', () => {
    const fs = { temperature_celsius: 25.5, humidity_percent: 60.0, pressure_hpa: 1013.2 }
    const result = extractSensor(fs)
    expect(result.temperature).toBe(25.5)
    expect(result.humidity).toBe(60.0)
    expect(result.pressure).toBe(1013.2)
  })

  it('reads _avg flat format (temperature_celsius_avg)', () => {
    const fs = { temperature_celsius_avg: 38.2, humidity_percent_avg: 70.0, pressure_hpa_avg: 1010.0 }
    const result = extractSensor(fs)
    expect(result.temperature).toBe(38.2)
    expect(result.humidity).toBe(70.0)
    expect(result.pressure).toBe(1010.0)
  })

  it('reads nested sensor.* format', () => {
    const fs = {
      sensor: {
        temperature_celsius_avg: 22.1,
        humidity_percent_avg: 55.0,
        pressure_hpa_avg: 1005.0,
      },
    }
    const result = extractSensor(fs)
    expect(result.temperature).toBe(22.1)
    expect(result.humidity).toBe(55.0)
    expect(result.pressure).toBe(1005.0)
  })

  it('prefers flat over nested', () => {
    const fs = {
      temperature_celsius: 30.0,
      sensor: { temperature_celsius_avg: 20.0 },
    }
    expect(extractSensor(fs).temperature).toBe(30.0)
  })

  it('coerces numeric strings from API payloads', () => {
    const fs = {
      temperature_celsius: '30.5',
      humidity_percent: '61',
      pressure_hpa: '1009.25',
    } as unknown as Parameters<typeof extractSensor>[0]

    expect(extractSensor(fs)).toEqual({
      temperature: 30.5,
      humidity: 61,
      pressure: 1009.25,
    })
  })
})

// ─── extractAI ────────────────────────────────────────────────────────────────

describe('extractAI', () => {
  it('returns nulls for undefined input', () => {
    expect(extractAI(undefined)).toEqual({ fire: null, fall: null, bend: null, abnormal_sound: null })
  })

  it('reads flat DDB format (fire_score)', () => {
    const fs = { fire_score: 0.8, fall_score: 0.3, bend_score: 0.1, abnormal_sound: 'none' }
    const result = extractAI(fs)
    expect(result.fire).toBe(0.8)
    expect(result.fall).toBe(0.3)
    expect(result.bend).toBe(0.1)
    expect(result.abnormal_sound).toBe('none')
  })

  it('reads nested ai_result.* format', () => {
    const fs = {
      ai_result: {
        fire_score: 0.9,
        fall_score: 0.2,
        bend_score: 0.05,
        abnormal_sound: 'knock',
      },
    }
    const result = extractAI(fs)
    expect(result.fire).toBe(0.9)
    expect(result.fall).toBe(0.2)
    expect(result.bend).toBe(0.05)
    expect(result.abnormal_sound).toBe('knock')
  })

  it('prefers flat over nested', () => {
    const fs = {
      fire_score: 0.5,
      ai_result: { fire_score: 0.9 },
    }
    expect(extractAI(fs).fire).toBe(0.5)
  })

  it('coerces numeric string scores and drops invalid scores', () => {
    const fs = {
      fire_score: '0.8',
      fall_score: '',
      bend_score: 'bad',
      abnormal_sound: 'none',
    } as unknown as Parameters<typeof extractAI>[0]

    expect(extractAI(fs)).toEqual({
      fire: 0.8,
      fall: null,
      bend: null,
      abnormal_sound: 'none',
    })
  })
})

// ─── normalizeHistoryItem ─────────────────────────────────────────────────────

describe('normalizeHistoryItem', () => {
  it('preserves already-flattened items', () => {
    const item = {
      timestamp: '2026-01-01T00:00:00Z',
      risk_score: 42.0,
      risk_level: 'warning' as const,
      temperature_celsius_avg: 28.5,
      fire_score: 0.3,
    }
    const result = normalizeHistoryItem(item)
    expect(result.risk_score).toBe(42.0)
    expect(result.temperature_celsius_avg).toBe(28.5)
    expect(result.fire_score).toBe(0.3)
  })

  it('promotes risk.score and risk.level to top-level', () => {
    const item = {
      timestamp: '2026-01-01T00:00:00Z',
      risk: { score: 55.0, level: 'warning' as const },
    }
    const result = normalizeHistoryItem(item)
    expect(result.risk_score).toBe(55.0)
    expect(result.risk_level).toBe('warning')
  })

  it('extracts temperature from nested factory_state._avg', () => {
    const item = {
      timestamp: '2026-01-01T00:00:00Z',
      factory_state: { temperature_celsius_avg: 22.0 },
    }
    const result = normalizeHistoryItem(item)
    expect(result.temperature_celsius_avg).toBe(22.0)
  })

  it('extracts temperature from flat factory_state.temperature_celsius', () => {
    const item = {
      timestamp: '2026-01-01T00:00:00Z',
      factory_state: { temperature_celsius: 30.0 },
    }
    const result = normalizeHistoryItem(item)
    expect(result.temperature_celsius_avg).toBe(30.0)
  })

  it('coerces string metrics to numbers before chart rendering', () => {
    const item = {
      timestamp: '2026-01-01T00:00:00Z',
      risk_score: '91.5',
      risk_score_avg: '90.5',
      risk_score_min: '75',
      risk_score_max: '99',
      temperature_celsius_avg: '27.5',
      humidity_percent_avg: '58',
      pressure_hpa_avg: '1008.5',
      fire_score: '0.2',
      fall_score: '',
      bend_score: 'invalid',
      fire_score_max: '0.9',
      bucket_minutes: '5',
      sample_count: '42',
    } as unknown as Parameters<typeof normalizeHistoryItem>[0]

    const result = normalizeHistoryItem(item)

    expect(result.risk_score).toBe(91.5)
    expect(result.risk_score_avg).toBe(90.5)
    expect(result.risk_score_min).toBe(75)
    expect(result.risk_score_max).toBe(99)
    expect(result.temperature_celsius_avg).toBe(27.5)
    expect(result.humidity_percent_avg).toBe(58)
    expect(result.pressure_hpa_avg).toBe(1008.5)
    expect(result.fire_score).toBe(0.2)
    expect(result.fall_score).toBeNull()
    expect(result.bend_score).toBeNull()
    expect(result.fire_score_max).toBe(0.9)
    expect(result.bucket_minutes).toBe(5)
    expect(result.sample_count).toBe(42)
  })

  it('promotes numeric string risk score from nested risk', () => {
    const item = {
      timestamp: '2026-01-01T00:00:00Z',
      risk: { score: '55.5', level: 'warning' },
    } as unknown as Parameters<typeof normalizeHistoryItem>[0]

    const result = normalizeHistoryItem(item)

    expect(result.risk_score).toBe(55.5)
    expect(result.risk_level).toBe('warning')
  })
})
