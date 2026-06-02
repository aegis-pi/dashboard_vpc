import { describe, expect, it } from 'vitest'
import {
  clampTimelineEndValue,
  clampTimelineStartValue,
  deriveTimelineEvents,
  resolveTimelineRange,
} from '../utils/timeline'
import type { HistoryItem } from '../api/types'

const NOW = new Date('2026-06-02T12:00:00').getTime()

describe('deriveTimelineEvents', () => {
  it('uses previous context for the first custom-range raw point', () => {
    const events = deriveTimelineEvents([
      raw('2026-06-02T11:10:00Z', 70, 'warning'),
    ], raw('2026-06-02T11:00:00Z', 90, 'safe'))

    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe('risk_level')
    expect(events[0]?.title).toContain('안전 → 주의')
  })

  it('creates GRAPH#5M warning events from risk_score_min threshold even when avg drop is small', () => {
    const events = deriveTimelineEvents([
      bucket('2026-06-02T10:05:00Z', 88, 84),
    ], bucket('2026-06-02T10:00:00Z', 90, 88))

    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe('risk_bucket_threshold')
    expect(events[0]?.severity).toBe('warning')
    expect(events[0]?.title).toContain('주의')
  })

  it('creates GRAPH#5M danger events from risk_score_min danger threshold', () => {
    const events = deriveTimelineEvents([
      bucket('2026-06-02T10:05:00Z', 70, 49),
    ], bucket('2026-06-02T10:00:00Z', 72, 70))

    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe('risk_bucket_threshold')
    expect(events[0]?.severity).toBe('danger')
    expect(events[0]?.title).toContain('위험')
  })

  it('still reports safe-range bucket dips that do not cross risk thresholds', () => {
    const events = deriveTimelineEvents([
      bucket('2026-06-02T10:05:00Z', 92, 85),
    ], bucket('2026-06-02T10:00:00Z', 100, 98))

    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe('risk_dip')
  })
})

describe('timeline range helpers', () => {
  it('keeps custom range inside the latest 24 hours', () => {
    const result = resolveTimelineRange('2026-06-01T11:58', '2026-06-02T12:00', NOW)

    expect(result.valid).toBe(false)
    expect(result.message).toContain('최대 24시간')
  })

  it('clamps future start without producing start >= end', () => {
    const result = clampTimelineStartValue('2026-06-02T13:00', '2026-06-02T12:00', NOW)

    expect(result).toEqual({
      start: '2026-06-02T11:00',
      end: '2026-06-02T12:00',
    })
  })

  it('clamps too-old end without producing end <= start', () => {
    const result = clampTimelineEndValue('2026-06-01T10:00', '2026-06-01T12:00', NOW)

    expect(result).toEqual({
      start: '2026-06-01T12:00',
      end: '2026-06-01T13:00',
    })
  })
})

function raw(timestamp: string, risk_score: number, risk_level: HistoryItem['risk_level']): HistoryItem {
  return { timestamp, risk_score, risk_level, top_cause_names: ['temperature'] }
}

function bucket(timestamp: string, risk_score: number, risk_score_min: number): HistoryItem {
  return {
    timestamp,
    bucket_start: timestamp,
    is_bucket: true,
    risk_score,
    risk_score_avg: risk_score,
    risk_score_min,
  }
}
