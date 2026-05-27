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
})
