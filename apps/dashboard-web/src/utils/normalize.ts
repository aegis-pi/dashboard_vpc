import type { FactoryDetail, HistoryItem } from '../api/types'

// ─── Sensor normalization ─────────────────────────────────────────────────────
// Handles three DDB variants:
//   1. flat:   factory_state.temperature_celsius  (real data-processor output)
//   2. avg:    factory_state.temperature_celsius_avg  (intermediate / test data)
//   3. nested: factory_state.sensor.temperature_celsius_avg  (legacy nested format)

export interface NormalizedSensor {
  temperature: number | null
  humidity: number | null
  pressure: number | null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = toFiniteNumber(value)
    if (parsed != null) return parsed
  }
  return null
}

export function extractSensor(fs: FactoryDetail['factory_state'] | undefined | null): NormalizedSensor {
  if (!fs) return { temperature: null, humidity: null, pressure: null }
  return {
    temperature: pickNumber(
      fs.temperature_celsius ??
      fs.temperature_celsius_avg ??
      fs.sensor?.temperature_celsius_avg,
    ),
    humidity: pickNumber(
      fs.humidity_percent ??
      fs.humidity_percent_avg ??
      fs.sensor?.humidity_percent_avg,
    ),
    pressure: pickNumber(
      fs.pressure_hpa ??
      fs.pressure_hpa_avg ??
      fs.sensor?.pressure_hpa_avg,
    ),
  }
}

// ─── AI score normalization ───────────────────────────────────────────────────
// Handles flat (factory_state.fire_score) and nested (factory_state.ai_result.fire_score).

export interface NormalizedAI {
  fire: number | null
  fall: number | null
  bend: number | null
  abnormal_sound: string | null
}

export function extractAI(fs: FactoryDetail['factory_state'] | undefined | null): NormalizedAI {
  if (!fs) return { fire: null, fall: null, bend: null, abnormal_sound: null }
  return {
    fire:   pickNumber(fs.fire_score, fs.ai_result?.fire_score),
    fall:   pickNumber(fs.fall_score, fs.ai_result?.fall_score),
    bend:   pickNumber(fs.bend_score, fs.ai_result?.bend_score),
    abnormal_sound: fs.abnormal_sound ?? fs.ai_result?.abnormal_sound ?? null,
  }
}

// ─── History item sensor normalization ───────────────────────────────────────
// Backend _extract() now returns flat fields; this is a defensive fallback for
// history items that may carry only the nested factory_state sub-object.

type FS = Record<string, unknown> | null | undefined

function _fsGet(fs: FS, ...keys: string[]): number | null {
  if (!fs) return null
  for (const key of keys) {
    const parts = key.split('.')
    let v: unknown = fs
    for (const p of parts) {
      if (v == null || typeof v !== 'object') { v = undefined; break }
      v = (v as Record<string, unknown>)[p]
    }
    const parsed = toFiniteNumber(v)
    if (parsed != null) return parsed
  }
  return null
}

export function normalizeHistoryItem(item: HistoryItem): HistoryItem {
  const fs = item.factory_state as FS
  const risk = item.risk as Record<string, unknown> | undefined
  const payload = item.payload as Record<string, unknown> | undefined
  return {
    ...item,
    temperature_celsius_avg: pickNumber(
      item.temperature_celsius_avg,
      _fsGet(fs, 'temperature_celsius', 'temperature_celsius_avg', 'sensor.temperature_celsius_avg'),
    ),
    humidity_percent_avg: pickNumber(
      item.humidity_percent_avg,
      _fsGet(fs, 'humidity_percent', 'humidity_percent_avg', 'sensor.humidity_percent_avg'),
    ),
    pressure_hpa_avg: pickNumber(
      item.pressure_hpa_avg,
      _fsGet(fs, 'pressure_hpa', 'pressure_hpa_avg', 'sensor.pressure_hpa_avg'),
    ),
    fire_score: pickNumber(
      item.fire_score,
      _fsGet(fs, 'fire_score', 'ai_result.fire_score'),
    ),
    fall_score: pickNumber(
      item.fall_score,
      _fsGet(fs, 'fall_score', 'ai_result.fall_score'),
    ),
    bend_score: pickNumber(
      item.bend_score,
      _fsGet(fs, 'bend_score', 'ai_result.bend_score'),
    ),
    risk_score: pickNumber(item.risk_score, risk?.['score'], payload?.['risk_score']) ?? undefined,
    risk_score_avg: pickNumber(item.risk_score_avg) ?? null,
    risk_score_min: pickNumber(item.risk_score_min) ?? null,
    risk_score_max: pickNumber(item.risk_score_max) ?? null,
    temperature_celsius_min: pickNumber(item.temperature_celsius_min) ?? null,
    humidity_percent_min: pickNumber(item.humidity_percent_min) ?? null,
    pressure_hpa_min: pickNumber(item.pressure_hpa_min) ?? null,
    temperature_celsius_max: pickNumber(item.temperature_celsius_max) ?? null,
    humidity_percent_max: pickNumber(item.humidity_percent_max) ?? null,
    pressure_hpa_max: pickNumber(item.pressure_hpa_max) ?? null,
    fire_score_max: pickNumber(item.fire_score_max) ?? null,
    fall_score_max: pickNumber(item.fall_score_max) ?? null,
    bend_score_max: pickNumber(item.bend_score_max) ?? null,
    bucket_minutes: pickNumber(item.bucket_minutes) ?? null,
    sample_count: pickNumber(item.sample_count) ?? null,
    risk_level:
      item.risk_level ??
      (risk?.['level'] as string | undefined) as import('../api/types').RiskLevel | undefined,
  }
}
