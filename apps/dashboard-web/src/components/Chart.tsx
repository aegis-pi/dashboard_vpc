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
  ReferenceLine,
} from 'recharts'
import type { HistoryItem } from '../api/types'
import { subsampleData } from '../utils/subsample'

const NODE_COLORS = ['var(--accent)', 'var(--warn)', 'var(--safe)', 'var(--crit)']

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

// ─── Risk score chart ─────────────────────────────────────────────────
// window=1h  → LineChart (raw snapshots)
// window=6h/12h/24h → ComposedChart: avg solid + max dashed + avg-to-max band
export function RiskScoreChart({ items }: { items: HistoryItem[] }) {
  const sampledItems = subsampleData(items)
  const isBucket = items.length > 0 && items[0]?.is_bucket === true

  if (isBucket) {
    const data = sampledItems
      .map((it) => ({
        ts: fmtTimeShort(it.bucket_start || it.timestamp),
        avg: it.risk_score_avg ?? null,
        max: it.risk_score_max ?? null,
        sample_count: it.sample_count ?? null,
        bucket_minutes: it.bucket_minutes ?? null,
        bucket_start: it.bucket_start,
        bucket_end: it.bucket_end,
      }))
      .filter((d) => d.avg != null || d.max != null)

    if (data.length === 0) {
      return <EmptyChart message="선택한 시간 범위에 Risk 데이터가 없습니다" />
    }

    return (
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <Area
              type="monotone"
              dataKey="max"
              fill="var(--accent)"
              fillOpacity={0.12}
              stroke="none"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="avg"
              fill="var(--surface)"
              fillOpacity={0.96}
              stroke="none"
              isAnimationActive={false}
            />
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
            <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--ink-4)' }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={30} />
            <Tooltip content={(props) => (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <RiskBandTooltip {...props as any} />
            )} />
            <ReferenceLine y={85} stroke="var(--safe)" strokeDasharray="4 2" strokeWidth={1} />
            <ReferenceLine y={50} stroke="var(--warn)" strokeDasharray="4 2" strokeWidth={1} />
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
              dataKey="max"
              name="안전 점수 최대"
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray="4 2"
              strokeOpacity={0.65}
              dot={false}
              activeDot={false}
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
          <ReferenceLine y={50} stroke="var(--warn)" strokeDasharray="4 2" strokeWidth={1} />
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
// window=6h/12h/24h → ComposedChart: avg solid + max dashed + avg-to-max band

type SensorAvgField = 'temperature_celsius_avg' | 'humidity_percent_avg' | 'pressure_hpa_avg'
type SensorMaxField = 'temperature_celsius_max' | 'humidity_percent_max' | 'pressure_hpa_max'

const SENSOR_MAX_FIELD: Record<SensorAvgField, SensorMaxField> = {
  temperature_celsius_avg: 'temperature_celsius_max',
  humidity_percent_avg: 'humidity_percent_max',
  pressure_hpa_avg: 'pressure_hpa_max',
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
  const max = (payload.find((p: any) => p.dataKey === 'max')?.value as number | undefined) ?? null

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
      {max != null && (
        <div style={{ color: 'var(--ink-2)' }}>
          최대&nbsp;<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink)' }}>
            {max.toFixed(2)}
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SensorBandTooltip({ active, payload, unit }: { active?: boolean; payload?: any[]; label?: string; unit: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as Record<string, unknown> | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const avg = (payload.find((p: any) => p.dataKey === 'avg')?.value as number | undefined) ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const max = (payload.find((p: any) => p.dataKey === 'max')?.value as number | undefined) ?? null

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

export function SensorChart({ items, field, label, unit }: {
  items: HistoryItem[]
  field: SensorAvgField
  label: string
  unit: string
}) {
  const sampledItems = subsampleData(items)
  const isBucket = items.length > 0 && items[0]?.is_bucket === true
  const maxField = SENSOR_MAX_FIELD[field]
  const bucketMinutes = isBucket ? (items[0]?.bucket_minutes ?? 5) : null
  const is24h = bucketMinutes === 20

  if (isBucket) {
    const data = sampledItems
      .map((it) => ({
        ts: fmtTimeShort(it.bucket_start || it.timestamp),
        avg: (it[field] as number | null | undefined) ?? null,
        max: (it[maxField] as number | null | undefined) ?? null,
        sample_count: it.sample_count ?? null,
        bucket_minutes: it.bucket_minutes ?? null,
        bucket_start: it.bucket_start,
        bucket_end: it.bucket_end,
      }))
      .filter((d) => d.avg != null || d.max != null)

    if (data.length === 0) return <EmptyChart message={`${label} 데이터 없음`} />

    const fillOpacity = is24h ? 0.08 : 0.15

    return (
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            {/* max area fills 0→max; avg area paints over 0→avg (reveals only avg-to-max band) */}
            <Area
              type="monotone" dataKey="max"
              fill="var(--accent)" fillOpacity={fillOpacity}
              stroke="none" isAnimationActive={false}
            />
            <Area
              type="monotone" dataKey="avg"
              fill="var(--surface)" fillOpacity={0.95}
              stroke="none" isAnimationActive={false}
            />
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
            <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--ink-4)' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={40} />
            <Tooltip content={(props) => (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <SensorBandTooltip {...props as any} unit={unit} />
            )} />
            {/* avg: solid bold line */}
            <Line
              type="monotone" dataKey="avg" name={`${label} 평균`}
              stroke="var(--accent)" strokeWidth={2}
              dot={false} activeDot={{ r: 4 }}
            />
            {/* max: thin dashed line */}
            <Line
              type="monotone" dataKey="max" name={`${label} 최대`}
              stroke="var(--accent)" strokeWidth={1} strokeDasharray="4 2"
              dot={false} activeDot={false} strokeOpacity={0.65}
            />
          </ComposedChart>
        </ResponsiveContainer>
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

// ─── AI score chart ───────────────────────────────────────────────────
// window=1h  → LineChart (raw snapshots, instant values)
// window=6h/12h/24h → ComposedChart: mean lines + spike dot markers (max ≥ 0.8)
export function AIScoreChart({ items }: { items: HistoryItem[] }) {
  const sampledItems = subsampleData(items)
  const isBucket = items.length > 0 && items[0]?.is_bucket === true

  if (isBucket) {
    const data = sampledItems
      .map((it) => {
        const fireMax = (it.fire_score_max as number | null | undefined) ?? null
        const fallMax = (it.fall_score_max as number | null | undefined) ?? null
        const bendMax = (it.bend_score_max as number | null | undefined) ?? null
        return {
          ts: fmtTime(extractTimestamp(it)),
          fire: it.fire_score ?? null,
          fall: it.fall_score ?? null,
          bend: it.bend_score ?? null,
          fire_spike: fireMax != null && fireMax >= 0.8 ? fireMax : null,
          fall_spike: fallMax != null && fallMax >= 0.8 ? fallMax : null,
          bend_spike: bendMax != null && bendMax >= 0.8 ? bendMax : null,
        }
      })
      .filter((d) => d.fire != null || d.fall != null || d.bend != null)

    if (data.length === 0) {
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
            <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--ink-4)' }} interval="preserveStartEnd" />
            <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={30} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
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
export function NodeResourceChart({ items, field, label }: {
  items: HistoryItem[]
  field: 'cpu_usage_percent' | 'memory_usage_percent' | 'disk_usage_percent'
  label: string
}) {
  const sampledItems = subsampleData(items)
  const nodeIds = new Set<string>()
  sampledItems.forEach((it) => {
    if (Array.isArray(it.nodes)) {
      it.nodes.forEach((n) => nodeIds.add(n.node_id))
    }
  })

  // GRAPH#5M fallback: use pre-aggregated infra mean/last values
  if (nodeIds.size === 0) {
    const aggField =
      field === 'cpu_usage_percent' ? 'cpu_usage_percent_mean' :
      field === 'memory_usage_percent' ? 'memory_usage_percent_mean' :
      'disk_usage_percent_last'
    const aggLabel = field === 'disk_usage_percent' ? `${label} (last)` : `${label} (평균)`

    const aggData = sampledItems
      .map((it) => ({
        ts: fmtTime(extractTimestamp(it)),
        value: (it[aggField] as number | null | undefined) ?? null,
      }))
      .filter((d) => d.value != null)

    if (aggData.length === 0) {
      return <EmptyChart message={`${label} 데이터 없음`} />
    }

    return (
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={aggData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
            <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--ink-4)' }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={30}
              tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => [`${v?.toFixed(1)}%`, aggLabel]}
            />
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

  // window=1h: per-node series
  const data = sampledItems.map((it) => {
    const row: Record<string, string | number | null> = {
      ts: fmtTime(extractTimestamp(it)),
    }
    nodeIds.forEach((nid) => {
      const node = Array.isArray(it.nodes)
        ? it.nodes.find((n) => n.node_id === nid)
        : undefined
      row[nid] = node?.[field] ?? null
    })
    return row
  })

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
          <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--ink-4)' }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={30}
            tickFormatter={(v: number) => `${v}%`} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => [`${v?.toFixed(1)}%`, label]}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          {[...nodeIds].map((nid, i) => (
            <Line
              key={nid}
              type="monotone"
              dataKey={nid}
              name={nid}
              stroke={NODE_COLORS[i % NODE_COLORS.length]}
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
