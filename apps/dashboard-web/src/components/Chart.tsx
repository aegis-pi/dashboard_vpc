import React from 'react'
import {
  LineChart,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from 'recharts'
import type { HistoryItem } from '../api/types'
import type { HistoryWindow } from '../hooks/useFactoryHistory'
import { subsampleData } from '../utils/subsample'

const NODE_COLORS = [
  'var(--accent)',
  '#D6A100',
  'var(--safe)',
  '#7C3AED',
  '#0891B2',
  '#CA8A04',
  '#475569',
  '#4F46E5',
]

function colorForNode(nodeId: string): string {
  const normalized = nodeId.toLowerCase()
  if (/\bmaster\b|(^|[-_])master($|[-_])/.test(normalized)) return NODE_COLORS[0]
  if (/\bworker[-_]?1\b|(^|[-_])worker[-_]?1($|[-_])/.test(normalized)) return NODE_COLORS[1]
  if (/\bworker[-_]?2\b|(^|[-_])worker[-_]?2($|[-_])/.test(normalized)) return NODE_COLORS[2]

  let hash = 0
  for (let i = 0; i < nodeId.length; i += 1) {
    hash = (hash * 31 + nodeId.charCodeAt(i)) >>> 0
  }
  return NODE_COLORS[hash % NODE_COLORS.length]
}

// ─── Helpers ──────────────────────────────────────────────────────────
function extractTimestamp(item: HistoryItem): string | undefined {
  if (item.timestamp) return item.timestamp
  // sk = HISTORY#STATE#<ISO>
  if (item.sk && typeof item.sk === 'string') {
    const parts = item.sk.split('#')
    return parts[parts.length - 1]
  }
  return undefined
}

function fmtTime(ts?: string): string {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ts.substring(11, 19)
  }
}

const BUCKET_WINDOW_MS: Partial<Record<HistoryWindow, number>> = {
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
}

type BucketAxis = {
  windowStartMs: number
  windowEndMs: number
  firstDataMs: number
  bucketMs: number
  ticks: number[]
}

type BucketChartRow = {
  x: number | null
  ts: string
  bucket_start?: string
  bucket_end?: string
  sample_count?: number | null
}
type NodeChartRow = BucketChartRow & Record<string, string | number | null | undefined>

function toTimeMs(ts?: string): number | null {
  if (!ts) return null
  const value = Date.parse(ts)
  return Number.isFinite(value) ? value : null
}

function resolveBucketAxis(items: HistoryItem[], window?: HistoryWindow): BucketAxis | null {
  const durationMs = window ? BUCKET_WINDOW_MS[window] : undefined
  if (!durationMs) return null

  const firstDataMs = items
    .map((it) => toTimeMs(it.bucket_start || it.timestamp || extractTimestamp(it)))
    .find((value): value is number => value != null)
  if (firstDataMs == null) return null

  const nowMs = Date.now()
  const bucketEndValues = items
    .map((it) => toTimeMs(it.bucket_end))
    .filter((value): value is number => value != null)
  const lastBucketEndMs = bucketEndValues.length > 0 ? bucketEndValues[bucketEndValues.length - 1] : null
  const windowEndMs = Math.max(nowMs, lastBucketEndMs ?? nowMs)
  const windowStartMs = windowEndMs - durationMs
  const bucketMs = (items[0]?.bucket_minutes ?? 5) * 60 * 1000
  const tickStepMs =
    window === '24h' ? 4 * 60 * 60 * 1000 :
    window === '12h' ? 2 * 60 * 60 * 1000 :
    60 * 60 * 1000
  const ticks = [windowStartMs]
  for (let value = windowStartMs + tickStepMs; value < windowEndMs; value += tickStepMs) {
    ticks.push(value)
  }
  ticks.push(windowEndMs)

  return {
    windowStartMs,
    windowEndMs,
    firstDataMs,
    bucketMs,
    ticks,
  }
}

function bucketXAxisProps(axis: BucketAxis | null) {
  return {
    dataKey: 'x',
    type: 'number' as const,
    scale: 'time' as const,
    domain: axis ? [axis.windowStartMs, axis.windowEndMs] : ['dataMin', 'dataMax'],
    ticks: axis?.ticks,
    allowDataOverflow: true,
    tickFormatter: (value: number) => fmtTimeShort(new Date(value).toISOString()),
    tick: { fontSize: 10, fill: 'var(--ink-4)' },
    interval: 'preserveStartEnd' as const,
  }
}

function hasBucketSamples(row: { sample_count?: number | null }): boolean {
  return typeof row.sample_count === 'number' && row.sample_count > 0
}

function makeNoDataBucketRow<T extends BucketChartRow>(x: number): T {
  const iso = new Date(x).toISOString()
  return {
    x,
    ts: fmtTimeShort(iso),
    bucket_start: iso,
    bucket_end: iso,
    sample_count: 0,
  } as T
}

function withBucketAxisGaps<T extends BucketChartRow>(data: T[], axis: BucketAxis | null): T[] {
  if (!axis || data.length === 0) return data
  const gapRows = resolveNoDataGaps(data, axis).flatMap((gap) => [
    makeNoDataBucketRow<T>(gap.start),
    makeNoDataBucketRow<T>(gap.end),
  ])
  return [
    makeNoDataBucketRow<T>(axis.windowStartMs),
    ...data,
    ...gapRows,
    makeNoDataBucketRow<T>(axis.windowEndMs),
  ].sort((a, b) => {
    const ax = a.x ?? 0
    const bx = b.x ?? 0
    if (ax !== bx) return ax - bx
    return hasBucketSamples(a) === hasBucketSamples(b) ? 0 : hasBucketSamples(a) ? 1 : -1
  })
}

function resolveNoDataGaps(rows: BucketChartRow[], axis: BucketAxis | null): { start: number; end: number }[] {
  if (!axis) return []
  const realRows = rows
    .filter(hasBucketSamples)
    .map((row) => {
      const start = row.x
      const end = toTimeMs(row.bucket_end) ?? (start == null ? null : start + axis.bucketMs)
      return start == null || end == null || end <= start ? null : { start, end }
    })
    .filter((row): row is { start: number; end: number } => row != null)
    .sort((a, b) => a.start - b.start)

  const threshold = axis.bucketMs / 2
  const gaps: { start: number; end: number }[] = []
  let cursor = axis.windowStartMs
  realRows.forEach((row) => {
    const start = Math.max(row.start, axis.windowStartMs)
    const end = Math.min(row.end, axis.windowEndMs)
    if (start > cursor + threshold) {
      gaps.push({ start: cursor, end: start })
    }
    cursor = Math.max(cursor, end)
  })
  if (axis.windowEndMs > cursor + threshold) {
    gaps.push({ start: cursor, end: axis.windowEndMs })
  }
  return gaps
}

function NoDataAreas({ rows, axis }: { rows: BucketChartRow[]; axis: BucketAxis | null }) {
  return (
    <>
      {resolveNoDataGaps(rows, axis).map((gap, index) => (
        <ReferenceArea
          key={`${gap.start}-${gap.end}`}
          x1={gap.start}
          x2={gap.end}
          fill="var(--ink-5)"
          fillOpacity={0.12}
          strokeOpacity={0}
          label={{
            value: '데이터 없음',
            position: 'insideTop',
            fill: 'var(--ink-4)',
            fontSize: 11,
            offset: index === 0 ? 8 : 2,
          }}
        />
      ))}
    </>
  )
}

// ─── Risk score chart ─────────────────────────────────────────────────
// window=1h  → LineChart (raw snapshots)
// window=6h/12h/24h → ComposedChart: avg solid + min dashed/dots + avg-to-min band
export function RiskScoreChart({ items, window }: { items: HistoryItem[]; window?: HistoryWindow }) {
  const sampledItems = subsampleData(items)
  const isBucket = items.length > 0 && items[0]?.is_bucket === true

  if (isBucket) {
    const axis = resolveBucketAxis(items, window)
    const bucketRows = sampledItems
      .map((it) => ({
        x: toTimeMs(it.bucket_start || it.timestamp || extractTimestamp(it)),
        ts: fmtTimeShort(it.bucket_start || it.timestamp),
        avg: hasBucketSamples(it) ? it.risk_score_avg ?? null : null,
        min: hasBucketSamples(it) ? it.risk_score_min ?? null : null,
        sample_count: it.sample_count ?? null,
        bucket_minutes: it.bucket_minutes ?? null,
        bucket_start: it.bucket_start,
        bucket_end: it.bucket_end,
      }))
      .filter((d) => d.x != null)
    const data = withBucketAxisGaps(bucketRows, axis)

    if (!bucketRows.some((d) => hasBucketSamples(d) && (d.avg != null || d.min != null))) {
      return <EmptyChart message="선택한 시간 범위에 Risk 데이터가 없습니다" />
    }

    return (
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <Area
              type="monotone"
              dataKey="avg"
              fill="var(--accent)"
              fillOpacity={0.12}
              stroke="none"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="min"
              fill="var(--surface)"
              fillOpacity={0.96}
              stroke="none"
              isAnimationActive={false}
            />
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
            <XAxis {...bucketXAxisProps(axis)} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={30} />
            <Tooltip content={(props) => (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <RiskBandTooltip {...props as any} />
            )} />
            <NoDataAreas rows={data} axis={axis} />
            <ReferenceLine y={85} stroke="var(--safe)" strokeDasharray="4 2" strokeWidth={1} />
            <ReferenceLine y={50} stroke="var(--crit)" strokeDasharray="4 2" strokeWidth={1} />
            <Line
              type="monotone"
              dataKey="avg"
              name="안전 점수 평균"
              stroke="var(--accent)"
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="min"
              name="안전 점수 최소"
              stroke="var(--warn)"
              strokeWidth={1.4}
              strokeDasharray="4 2"
              strokeOpacity={0.9}
              dot={{ r: 2.8, fill: 'var(--warn)', stroke: 'var(--surface)', strokeWidth: 1 }}
              activeDot={{ r: 4.5, fill: 'var(--warn)', stroke: 'var(--surface)', strokeWidth: 1 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // window=1h: raw LineChart
  const data = sampledItems
    .map((it) => ({
      ts: fmtTime(extractTimestamp(it)),
      score: it.risk_score ?? (it.payload as Record<string, unknown> | undefined)?.['risk_score'],
    }))
    .filter((d) => d.score != null)

  if (data.length === 0) {
    return <EmptyChart message="선택한 시간 범위에 Risk 데이터가 없습니다" />
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
          <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--ink-4)' }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={30} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: 'var(--ink-3)' }}
          />
          <ReferenceLine y={85} stroke="var(--safe)" strokeDasharray="4 2" strokeWidth={1} />
          <ReferenceLine y={50} stroke="var(--crit)" strokeDasharray="4 2" strokeWidth={1} />
          <Line
            type="monotone"
            dataKey="score"
            name="Risk Score"
            stroke="var(--accent)"
            strokeWidth={1.8}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Sensor chart (temp / humidity / pressure) ────────────────────────
// window=1h  → simple LineChart (avg only)
// window=6h/12h/24h → ComposedChart: avg line + risk-relevant extreme/range band

type SensorAvgField = 'temperature_celsius_avg' | 'humidity_percent_avg' | 'pressure_hpa_avg'
type SensorMinField = 'temperature_celsius_min' | 'humidity_percent_min' | 'pressure_hpa_min'
type SensorMaxField = 'temperature_celsius_max' | 'humidity_percent_max' | 'pressure_hpa_max'

const SENSOR_MIN_FIELD: Record<SensorAvgField, SensorMinField> = {
  temperature_celsius_avg: 'temperature_celsius_min',
  humidity_percent_avg: 'humidity_percent_min',
  pressure_hpa_avg: 'pressure_hpa_min',
}

const SENSOR_MAX_FIELD: Record<SensorAvgField, SensorMaxField> = {
  temperature_celsius_avg: 'temperature_celsius_max',
  humidity_percent_avg: 'humidity_percent_max',
  pressure_hpa_avg: 'pressure_hpa_max',
}

const SENSOR_DISPLAY_RANGE: Record<SensorAvgField, { min: number; max: number }> = {
  temperature_celsius_avg: { min: 20, max: 50 },
  humidity_percent_avg: { min: 30, max: 80 },
  pressure_hpa_avg: { min: 950, max: 1050 },
}

const SENSOR_GRAPH_KEY: Record<SensorAvgField, 'temperature_celsius' | 'humidity_percent' | 'pressure_hpa'> = {
  temperature_celsius_avg: 'temperature_celsius',
  humidity_percent_avg: 'humidity_percent',
  pressure_hpa_avg: 'pressure_hpa',
}

const SENSOR_CHART_ACCENT: Record<SensorAvgField, string> = {
  temperature_celsius_avg: 'oklch(0.65 0.18 30)',
  humidity_percent_avg: 'oklch(0.65 0.15 230)',
  pressure_hpa_avg: 'oklch(0.55 0.10 280)',
}

function fmtTimeShort(ts?: string): string {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ts.substring(11, 16)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RiskBandTooltip({ active, payload }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as Record<string, unknown> | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const avg = (payload.find((p: any) => p.dataKey === 'avg')?.value as number | undefined) ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const min = (payload.find((p: any) => p.dataKey === 'min')?.value as number | undefined) ?? null

  const timeStr = (d?.bucket_start && d?.bucket_end)
    ? `${fmtTimeShort(d.bucket_start as string)} ~ ${fmtTimeShort(d.bucket_end as string)}`
    : (d?.ts as string | undefined) ?? ''

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--ink-3)', marginBottom: 6, fontSize: 11 }}>{timeStr}</div>
      {avg != null && (
        <div style={{ color: 'var(--ink-2)' }}>
          평균&nbsp;<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink)' }}>
            {avg.toFixed(2)}
          </span>
        </div>
      )}
      {min != null && (
        <div style={{ color: 'var(--ink-2)' }}>
          최소&nbsp;<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink)' }}>
            {min.toFixed(2)}
          </span>
        </div>
      )}
      {(d?.sample_count as number | null) != null && (
        <div style={{ color: 'var(--ink-4)', fontSize: 11, marginTop: 4 }}>
          샘플 {d!.sample_count as number}개
        </div>
      )}
      {(d?.bucket_minutes as number | null) != null && (
        <div style={{ color: 'var(--ink-5)', fontSize: 10 }}>
          {d!.bucket_minutes as number}분 집계
        </div>
      )}
    </div>
  )
}

type TooltipPayloadItem = {
  payload?: Record<string, unknown>
}

function SensorBandTooltip({ active, payload, unit }: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
  unit: string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as Record<string, unknown> | undefined
  const avg = (d?.avgRaw as number | null | undefined) ?? null
  const min = (d?.minRaw as number | null | undefined) ?? null
  const max = (d?.maxRaw as number | null | undefined) ?? null

  const timeStr = (d?.bucket_start && d?.bucket_end)
    ? `${fmtTimeShort(d.bucket_start as string)} ~ ${fmtTimeShort(d.bucket_end as string)}`
    : (d?.ts as string | undefined) ?? ''

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--ink-3)', marginBottom: 6, fontSize: 11 }}>{timeStr}</div>
      {avg != null && (
        <div style={{ color: 'var(--ink-2)' }}>
          평균&nbsp;<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink)' }}>
            {avg.toFixed(2)}
          </span>&nbsp;<span style={{ color: 'var(--ink-4)' }}>{unit}</span>
        </div>
      )}
      {max != null && (
        <div style={{ color: 'var(--ink-2)' }}>
          최대&nbsp;<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink)' }}>
            {max.toFixed(2)}
          </span>&nbsp;<span style={{ color: 'var(--ink-4)' }}>{unit}</span>
        </div>
      )}
      {min != null && (
        <div style={{ color: 'var(--ink-2)' }}>
          최소&nbsp;<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink)' }}>
            {min.toFixed(2)}
          </span>&nbsp;<span style={{ color: 'var(--ink-4)' }}>{unit}</span>
        </div>
      )}
      {min != null && max != null && (
        <div style={{ color: 'var(--ink-4)', fontSize: 11, marginTop: 4 }}>
          변동폭&nbsp;<span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>
            {(max - min).toFixed(2)} {unit}
          </span>
        </div>
      )}
      {(d?.sample_count as number | null) != null && (
        <div style={{ color: 'var(--ink-4)', fontSize: 11, marginTop: 4 }}>
          샘플 {d!.sample_count as number}개
        </div>
      )}
      {(d?.bucket_minutes as number | null) != null && (
        <div style={{ color: 'var(--ink-5)', fontSize: 10 }}>
          {d!.bucket_minutes as number}분 집계
        </div>
      )}
    </div>
  )
}

export function SensorChart({ items, field, label, unit, window }: {
  items: HistoryItem[]
  field: SensorAvgField
  label: string
  unit: string
  window?: HistoryWindow
}) {
  const sampledItems = subsampleData(items)
  const isBucket = items.length > 0 && items[0]?.is_bucket === true
  const minField = SENSOR_MIN_FIELD[field]
  const maxField = SENSOR_MAX_FIELD[field]
  const bucketMinutes = isBucket ? (items[0]?.bucket_minutes ?? 5) : null
  const is24h = bucketMinutes === 20
  const displayRange = SENSOR_DISPLAY_RANGE[field]
  const clamp = (value: number | null) => (
    value == null ? null : Math.max(displayRange.min, Math.min(displayRange.max, value))
  )
  const sensorKey = SENSOR_GRAPH_KEY[field]
  const readBucketValue = (it: HistoryItem, flatField: string, metric: 'mean' | 'min' | 'max') => {
    const flatValue = (it as Record<string, unknown>)[flatField]
    if (typeof flatValue === 'number') return flatValue

    const sensor = (it as Record<string, unknown>).sensor as Record<string, unknown> | undefined
    const nested = sensor?.[sensorKey] as Record<string, unknown> | undefined
    const nestedValue = nested?.[metric]
    return typeof nestedValue === 'number' ? nestedValue : null
  }

  if (isBucket) {
    const axis = resolveBucketAxis(items, window)
    const bucketRows = sampledItems
      .map((it) => {
        const hasSamples = hasBucketSamples(it)
        const avgRaw = readBucketValue(it, field, 'mean')
        const minRaw = readBucketValue(it, minField, 'min')
        const maxRaw = readBucketValue(it, maxField, 'max')
        const avg = hasSamples ? clamp(avgRaw) : null
        const min = hasSamples ? clamp(minRaw) : null
        const max = hasSamples ? clamp(maxRaw) : null
        return {
          x: toTimeMs(it.bucket_start || it.timestamp || extractTimestamp(it)),
          ts: fmtTimeShort(it.bucket_start || it.timestamp),
          avg,
          min,
          max,
          avgRaw: hasSamples ? avgRaw : null,
          minRaw: hasSamples ? minRaw : null,
          maxRaw: hasSamples ? maxRaw : null,
          maxOutlier: hasSamples && maxRaw != null && maxRaw > displayRange.max ? displayRange.max : null,
          minOutlier: hasSamples && minRaw != null && minRaw < displayRange.min ? displayRange.min : null,
          sample_count: it.sample_count ?? null,
          bucket_minutes: it.bucket_minutes ?? null,
          bucket_start: it.bucket_start,
          bucket_end: it.bucket_end,
        }
      })
      .filter((d) => d.x != null)
    const data = withBucketAxisGaps(bucketRows, axis)

    if (!bucketRows.some((d) => hasBucketSamples(d) && (d.avg != null || d.max != null || d.min != null))) {
      return <EmptyChart message={`${label} 데이터 없음`} />
    }

    const fillOpacity = is24h ? 0.12 : 0.2
    const rangeLabel = `${displayRange.min}~${displayRange.max}${unit}`
    const chartAccent = SENSOR_CHART_ACCENT[field]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const boundaryDot = (props: any): React.ReactElement => {
      if (props.value == null) return <g />
      return <circle cx={props.cx as number} cy={props.cy as number} r={4.5} fill="var(--crit)" stroke="var(--surface)" strokeWidth={1.2} />
    }

    return (
      <div style={{
        border: '1px solid var(--line-2)',
        borderRadius: 8,
        padding: '10px 12px 12px',
        background: 'var(--surface)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ width: 4, height: 20, borderRadius: 2, background: chartAccent, flexShrink: 0 }} />
            <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{label}</strong>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>{unit}</span>
            <span style={{ color: 'var(--ink-4)', fontSize: 11.5, whiteSpace: 'nowrap' }}>
              표시 범위 {rangeLabel}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: 'var(--ink-3)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <span style={{ width: 16, height: 2, background: 'var(--crit)' }} />최대
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <span style={{ width: 16, height: 2, background: 'var(--accent)' }} />평균
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <span style={{ width: 16, height: 2, background: 'var(--safe)' }} />최소
            </span>
          </div>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <Area
                type="monotone"
                dataKey={(row) => row.avg != null && row.max != null ? [row.avg, row.max] : null}
                name={`${label} 최대~평균`}
                fill="var(--crit)" fillOpacity={fillOpacity}
                stroke="none" isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey={(row) => row.min != null && row.avg != null ? [row.min, row.avg] : null}
                name={`${label} 평균~최소`}
                fill="var(--safe)" fillOpacity={fillOpacity}
                stroke="none" isAnimationActive={false}
              />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
              <XAxis {...bucketXAxisProps(axis)} />
              <YAxis domain={[displayRange.min, displayRange.max]} tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={40} />
              <Tooltip content={(props) => (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <SensorBandTooltip {...props as any} unit={unit} />
              )} />
              <NoDataAreas rows={data} axis={axis} />
              <Line
                type="monotone" dataKey="max" name={`${label} 최대`}
                stroke="var(--crit)" strokeWidth={1.5}
                dot={{ r: 2.2, fill: 'var(--crit)', stroke: 'var(--surface)', strokeWidth: 0.8 }}
                activeDot={{ r: 4 }}
                strokeOpacity={0.9}
              />
              <Line
                type="monotone" dataKey="avg" name={`${label} 평균`}
                stroke="var(--accent)" strokeWidth={2}
                dot={false} activeDot={{ r: 4 }}
              />
              <Line
                type="monotone" dataKey="min" name={`${label} 최소`}
                stroke="var(--safe)" strokeWidth={1.5}
                dot={{ r: 2.2, fill: 'var(--safe)', stroke: 'var(--surface)', strokeWidth: 0.8 }}
                activeDot={{ r: 4 }}
                strokeOpacity={0.9}
              />
              <Line type="monotone" dataKey="maxOutlier" stroke="none" strokeWidth={0} dot={boundaryDot} activeDot={false} legendType="none" isAnimationActive={false} />
              <Line type="monotone" dataKey="minOutlier" stroke="none" strokeWidth={0} dot={boundaryDot} activeDot={false} legendType="none" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  // window=1h: raw LineChart (avg only, no max available)
  const data = sampledItems
    .map((it) => ({
      ts: fmtTime(extractTimestamp(it)),
      avg: (it[field] as number | null | undefined) ?? null,
    }))
    .filter((d) => d.avg != null)

  if (data.length === 0) return <EmptyChart message={`${label} 데이터 없음`} />

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
          <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--ink-4)' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={40} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => [`${v.toFixed(2)} ${unit}`, label]}
          />
          <Line
            type="monotone" dataKey="avg" name={label}
            stroke="var(--accent)" strokeWidth={1.8}
            dot={false} activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AIScoreBucketTooltip({ active, payload }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as Record<string, unknown> | undefined
  if (!d) return null

  const timeStr = (d.bucket_start && d.bucket_end)
    ? `${fmtTimeShort(d.bucket_start as string)} ~ ${fmtTimeShort(d.bucket_end as string)}`
    : (d.ts as string | undefined) ?? ''

  const rows = [
    { label: '화재', avg: d.fire as number | null | undefined, max: d.fire_max as number | null | undefined, color: 'var(--crit)' },
    { label: '넘어짐', avg: d.fall as number | null | undefined, max: d.fall_max as number | null | undefined, color: 'var(--warn)' },
    { label: '굽힘', avg: d.bend as number | null | undefined, max: d.bend_max as number | null | undefined, color: 'var(--accent)' },
  ].filter((row) => row.avg != null || row.max != null)

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
      minWidth: 180,
    }}>
      <div style={{ color: 'var(--ink-3)', marginBottom: 6, fontSize: 11 }}>{timeStr}</div>
      {rows.map((row) => (
        <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '56px 1fr 1fr', gap: 8, alignItems: 'baseline' }}>
          <span style={{ color: row.color, fontWeight: 600 }}>{row.label}</span>
          <span style={{ color: 'var(--ink-2)' }}>
            평균&nbsp;<span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>
              {row.avg == null ? '—' : row.avg.toFixed(3)}
            </span>
          </span>
          <span style={{ color: 'var(--ink-2)' }}>
            최대&nbsp;<span style={{
              fontFamily: 'var(--font-mono)',
              color: row.max != null && row.max >= 0.8 ? 'var(--crit)' : 'var(--ink)',
              fontWeight: row.max != null && row.max >= 0.8 ? 700 : 500,
            }}>
              {row.max == null ? '—' : row.max.toFixed(3)}
            </span>
          </span>
        </div>
      ))}
      {(d.sample_count as number | null) != null && (
        <div style={{ color: 'var(--ink-4)', fontSize: 11, marginTop: 6 }}>
          샘플 {d.sample_count as number}개
        </div>
      )}
      {(d.bucket_minutes as number | null) != null && (
        <div style={{ color: 'var(--ink-5)', fontSize: 10 }}>
          {d.bucket_minutes as number}분 집계
        </div>
      )}
    </div>
  )
}

// ─── AI score chart ───────────────────────────────────────────────────
// window=1h  → LineChart (raw snapshots, instant values)
// window=6h/12h/24h → ComposedChart: mean lines + spike dot markers (max ≥ 0.8)
export function AIScoreChart({ items, window }: { items: HistoryItem[]; window?: HistoryWindow }) {
  const sampledItems = subsampleData(items)
  const isBucket = items.length > 0 && items[0]?.is_bucket === true

  if (isBucket) {
    const axis = resolveBucketAxis(items, window)
    const bucketRows = sampledItems
      .map((it) => {
        const hasSamples = hasBucketSamples(it)
        const fireMax = (it.fire_score_max as number | null | undefined) ?? null
        const fallMax = (it.fall_score_max as number | null | undefined) ?? null
        const bendMax = (it.bend_score_max as number | null | undefined) ?? null
        return {
          x: toTimeMs(it.bucket_start || it.timestamp || extractTimestamp(it)),
          ts: fmtTime(extractTimestamp(it)),
          fire: hasSamples ? it.fire_score ?? null : null,
          fall: hasSamples ? it.fall_score ?? null : null,
          bend: hasSamples ? it.bend_score ?? null : null,
          fire_max: hasSamples ? fireMax : null,
          fall_max: hasSamples ? fallMax : null,
          bend_max: hasSamples ? bendMax : null,
          fire_spike: hasSamples && fireMax != null && fireMax >= 0.8 ? fireMax : null,
          fall_spike: hasSamples && fallMax != null && fallMax >= 0.8 ? fallMax : null,
          bend_spike: hasSamples && bendMax != null && bendMax >= 0.8 ? bendMax : null,
          sample_count: it.sample_count ?? null,
          bucket_minutes: it.bucket_minutes ?? null,
          bucket_start: it.bucket_start,
          bucket_end: it.bucket_end,
        }
      })
      .filter((d) => d.x != null)
    const data = withBucketAxisGaps(bucketRows, axis)

    if (!bucketRows.some((d) => hasBucketSamples(d) && (d.fire != null || d.fall != null || d.bend != null))) {
      return <EmptyChart message="AI Score 데이터 없음" />
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fireSpikeDot = (props: any): React.ReactElement => {
      if ((props.payload?.fire_spike as number | null) == null) return <g />
      return <circle cx={props.cx as number} cy={props.cy as number} r={5} fill="var(--crit)" opacity={0.9} />
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fallSpikeDot = (props: any): React.ReactElement => {
      if ((props.payload?.fall_spike as number | null) == null) return <g />
      return <circle cx={props.cx as number} cy={props.cy as number} r={5} fill="var(--warn)" opacity={0.9} />
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bendSpikeDot = (props: any): React.ReactElement => {
      if ((props.payload?.bend_spike as number | null) == null) return <g />
      return <circle cx={props.cx as number} cy={props.cy as number} r={5} fill="var(--accent)" opacity={0.9} />
    }

    return (
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
            <XAxis {...bucketXAxisProps(axis)} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={30} />
            <Tooltip content={(props) => (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <AIScoreBucketTooltip {...props as any} />
            )} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
            <NoDataAreas rows={data} axis={axis} />
            <ReferenceLine y={0.8} stroke="var(--crit)" strokeDasharray="4 2" strokeWidth={1} />
            <ReferenceLine y={0.3} stroke="var(--warn)" strokeDasharray="4 2" strokeWidth={1} />
            {/* Mean lines */}
            <Line type="monotone" dataKey="fire" name="화재(평균)" stroke="var(--crit)" strokeWidth={1.6} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="fall" name="넘어짐(평균)" stroke="var(--warn)" strokeWidth={1.6} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="bend" name="굽힘(평균)" stroke="var(--accent)" strokeWidth={1.6} dot={false} activeDot={{ r: 4 }} />
            {/* Spike markers: 5분 최대값 ≥ 0.8 */}
            <Line type="monotone" dataKey="fire_spike" stroke="none" strokeWidth={0} dot={fireSpikeDot} activeDot={false} legendType="none" isAnimationActive={false} />
            <Line type="monotone" dataKey="fall_spike" stroke="none" strokeWidth={0} dot={fallSpikeDot} activeDot={false} legendType="none" isAnimationActive={false} />
            <Line type="monotone" dataKey="bend_spike" stroke="none" strokeWidth={0} dot={bendSpikeDot} activeDot={false} legendType="none" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // window=1h: raw LineChart
  const data = sampledItems
    .map((it) => ({
      ts: fmtTime(extractTimestamp(it)),
      fire:  it.fire_score ?? null,
      fall:  it.fall_score ?? null,
      bend:  it.bend_score ?? null,
    }))
    .filter((d) => d.fire != null || d.fall != null || d.bend != null)

  if (data.length === 0) {
    return <EmptyChart message="AI Score 데이터 없음" />
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
          <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--ink-4)' }} interval="preserveStartEnd" />
          <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={30} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <ReferenceLine y={0.8} stroke="var(--crit)" strokeDasharray="4 2" strokeWidth={1} />
          <ReferenceLine y={0.3} stroke="var(--warn)" strokeDasharray="4 2" strokeWidth={1} />
          <Line type="monotone" dataKey="fire" name="화재" stroke="var(--crit)" strokeWidth={1.6} dot={false} />
          <Line type="monotone" dataKey="fall" name="넘어짐" stroke="var(--warn)" strokeWidth={1.6} dot={false} />
          <Line type="monotone" dataKey="bend" name="굽힘" stroke="var(--accent)" strokeWidth={1.6} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Node CPU/memory chart ────────────────────────────────────────────
// window=1h  → per-node series from HISTORY#STATE nodes[]
// window=6h/12h/24h → single aggregate line from GRAPH#5M infra.*_mean
export function NodeResourceChart({ items, field, label, window }: {
  items: HistoryItem[]
  field: 'cpu_usage_percent' | 'memory_usage_percent' | 'disk_usage_percent'
  label: string
  window?: HistoryWindow
}) {
  const sampledItems = subsampleData(items)
  const isBucket = items.length > 0 && items[0]?.is_bucket === true
  const axis = isBucket ? resolveBucketAxis(items, window) : null

  // HISTORY#STATE (1h): per-node raw series
  const nodeIds = new Set<string>()
  sampledItems.forEach((it) => {
    if (Array.isArray(it.nodes)) {
      it.nodes.forEach((n) => nodeIds.add(n.node_id))
    }
  })

  // GRAPH#5M (6h/12h/24h): per-node mean series
  const nodeIdsMean = new Set<string>()
  sampledItems.forEach((it) => {
    if (Array.isArray(it.nodes_mean)) {
      it.nodes_mean.forEach((n) => nodeIdsMean.add(n.node_id))
    }
  })

  // Fallback: whole-infra aggregate when no per-node data at all
  if (nodeIds.size === 0 && nodeIdsMean.size === 0) {
    const aggField =
      field === 'cpu_usage_percent' ? 'cpu_usage_percent_mean' :
      field === 'memory_usage_percent' ? 'memory_usage_percent_mean' :
      'disk_usage_percent_last'
    const aggLabel = field === 'disk_usage_percent' ? `${label} (last)` : `${label} (평균)`

    const aggRows = sampledItems
      .map((it) => ({
        x: isBucket ? toTimeMs(it.bucket_start || it.timestamp || extractTimestamp(it)) : null,
        ts: isBucket ? fmtTimeShort(it.bucket_start || it.timestamp) : fmtTime(extractTimestamp(it)),
        value: !isBucket || hasBucketSamples(it) ? (it[aggField] as number | null | undefined) ?? null : null,
        sample_count: it.sample_count ?? null,
        bucket_start: it.bucket_start,
        bucket_end: it.bucket_end,
      }))
      .filter((d) => (isBucket ? d.x != null : d.value != null))
    const aggData = isBucket ? withBucketAxisGaps(aggRows, axis) : aggRows

    if (!aggRows.some((d) => (!isBucket || hasBucketSamples(d)) && d.value != null)) {
      return <EmptyChart message={`${label} 데이터 없음`} />
    }

    return (
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={aggData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
            {isBucket
              ? <XAxis {...bucketXAxisProps(axis)} />
              : <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--ink-4)' }} interval="preserveStartEnd" />}
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={30}
              tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => [`${v?.toFixed(1)}%`, aggLabel]}
            />
            {isBucket && <NoDataAreas rows={aggData} axis={axis} />}
            <Line
              type="monotone"
              dataKey="value"
              name={aggLabel}
              stroke={NODE_COLORS[0]}
              strokeWidth={1.6}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // Resolve active node set and data source
  const activeIds = nodeIds.size > 0 ? nodeIds : nodeIdsMean
  const activeNodeIds = [...activeIds].sort((a, b) => a.localeCompare(b))
  const useMean = nodeIds.size === 0

  const rows = sampledItems
    .map((it) => {
      const hasSamples = !isBucket || hasBucketSamples(it)
      const row: NodeChartRow = {
        x: isBucket ? toTimeMs(it.bucket_start || it.timestamp || extractTimestamp(it)) : null,
        ts: isBucket ? fmtTimeShort(it.bucket_start || it.timestamp) : fmtTime(extractTimestamp(it)),
        sample_count: it.sample_count ?? null,
        bucket_start: it.bucket_start,
        bucket_end: it.bucket_end,
      }
      activeNodeIds.forEach((nid) => {
        if (!hasSamples) {
          row[nid] = null
        } else if (useMean) {
          const node = Array.isArray(it.nodes_mean)
            ? it.nodes_mean.find((n) => n.node_id === nid)
            : undefined
          row[nid] = node?.[field] ?? null
        } else {
          const node = Array.isArray(it.nodes)
            ? it.nodes.find((n) => n.node_id === nid)
            : undefined
          row[nid] = node?.[field] ?? null
        }
      })
      return row
    })
    .filter((row) => !isBucket || row.x != null)
  const data = isBucket ? withBucketAxisGaps(rows, axis) : rows

  if (!rows.some((row) => (!isBucket || hasBucketSamples(row)) && activeNodeIds.some((nid) => row[nid] != null))) {
    return <EmptyChart message={`${label} 데이터 없음`} />
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
          {isBucket
            ? <XAxis {...bucketXAxisProps(axis)} />
            : <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--ink-4)' }} interval="preserveStartEnd" />}
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={30}
            tickFormatter={(v: number) => `${v}%`} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => [`${v?.toFixed(1)}%`, label]}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          {isBucket && <NoDataAreas rows={data} axis={axis} />}
          {activeNodeIds.map((nid) => (
            <Line
              key={nid}
              type="monotone"
              dataKey={nid}
              name={nid}
              stroke={colorForNode(nid)}
              strokeWidth={1.6}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Empty chart placeholder ──────────────────────────────────────────
function EmptyChart({ message }: { message: string }) {
  return (
    <div className="chart-wrap" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--surface-2)', borderRadius: 8,
      border: '1px solid var(--line-2)',
    }}>
      <span className="micro">{message}</span>
    </div>
  )
}
