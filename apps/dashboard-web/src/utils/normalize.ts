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

export function extractSensor(fs: FactoryDetail['factory_state'] | undefined | null): NormalizedSensor {
  if (!fs) return { temperature: null, humidity: null, pressure: null }
  return {
    temperature:
      fs.temperature_celsius ??
      fs.temperature_celsius_avg ??
      fs.sensor?.temperature_celsius_avg ??
      null,
    humidity:
      fs.humidity_percent ??
      fs.humidity_percent_avg ??
      fs.sensor?.humidity_percent_avg ??
      null,
    pressure:
      fs.pressure_hpa ??
      fs.pressure_hpa_avg ??
      fs.sensor?.pressure_hpa_avg ??
      null,
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
    fire:   fs.fire_score  ?? fs.ai_result?.fire_score  ?? null,
    fall:   fs.fall_score  ?? fs.ai_result?.fall_score  ?? null,
    bend:   fs.bend_score  ?? fs.ai_result?.bend_score  ?? null,
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
    if (v != null && typeof v === 'number') return v
  }
  return null
}

export function normalizeHistoryItem(item: HistoryItem): HistoryItem {
  const fs = item.factory_state as FS
  return {
    ...item,
    temperature_celsius_avg:
      (item.temperature_celsius_avg as number | null | undefined) ??
      _fsGet(fs, 'temperature_celsius', 'temperature_celsius_avg', 'sensor.temperature_celsius_avg'),
    humidity_percent_avg:
      (item.humidity_percent_avg as number | null | undefined) ??
      _fsGet(fs, 'humidity_percent', 'humidity_percent_avg', 'sensor.humidity_percent_avg'),
    pressure_hpa_avg:
      (item.pressure_hpa_avg as number | null | undefined) ??
      _fsGet(fs, 'pressure_hpa', 'pressure_hpa_avg', 'sensor.pressure_hpa_avg'),
    fire_score:
      (item.fire_score as number | null | undefined) ??
      _fsGet(fs, 'fire_score', 'ai_result.fire_score'),
    fall_score:
      (item.fall_score as number | null | undefined) ??
      _fsGet(fs, 'fall_score', 'ai_result.fall_score'),
    bend_score:
      (item.bend_score as number | null | undefined) ??
      _fsGet(fs, 'bend_score', 'ai_result.bend_score'),
    risk_score:
      (item.risk_score as number | null | undefined) ??
      ((item.risk as Record<string, unknown> | undefined)?.['score'] as number | undefined) ??
      undefined,
    risk_level:
      item.risk_level ??
      ((item.risk as Record<string, unknown> | undefined)?.['level'] as string | undefined) as import('../api/types').RiskLevel | undefined,
  }
}
