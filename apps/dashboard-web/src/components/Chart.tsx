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
// window=6h/12h/24h → ComposedChart with Area (avg) + Scatter markers (min)
export function RiskScoreChart({ items }: { items: HistoryItem[] }) {
  const sampledItems = subsampleData(items)
  const isBucket = items.length > 0 && items[0]?.is_bucket === true

  if (isBucket) {
    const data = sampledItems
      .map((it) => {
        const score = it.risk_score_avg ?? null
        const scoreMin = it.risk_score_min ?? null
        return {
          ts: fmtTime(it.timestamp),
          score,
          // warn_y / danger_y placed at avg height for visual alignment
          warn_y: scoreMin != null && scoreMin <= 84 && scoreMin > 49 ? score : null,
          danger_y: scoreMin != null && scoreMin <= 49 ? score : null,
        }
      })
      .filter((d) => d.score != null)

    if (data.length === 0) {
      return <EmptyChart message="선택한 시간 범위에 Risk 데이터가 없습니다" />
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const warnDot = (props: any): React.ReactElement => {
      if ((props.payload?.warn_y as number | null) == null) return <g />
      return <circle cx={props.cx as number} cy={props.cy as number} r={5} fill="var(--warn)" opacity={0.85} />
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dangerDot = (props: any): React.ReactElement => {
      if ((props.payload?.danger_y as number | null) == null) return <g />
      return <circle cx={props.cx as number} cy={props.cy as number} r={5} fill="var(--crit)" opacity={0.85} />
    }

    return (
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
            <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--ink-4)' }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={30} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--ink-3)' }}
            />
            <ReferenceLine y={85} stroke="var(--safe)" strokeDasharray="4 2" strokeWidth={1} />
            <ReferenceLine y={50} stroke="var(--warn)" strokeDasharray="4 2" strokeWidth={1} />
            <Area
              type="monotone"
              dataKey="score"
              name="Risk Score (평균)"
              stroke="var(--accent)"
              fill="var(--accent)"
              fillOpacity={0.1}
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 4 }}
            />
            {/* Warning markers: 50 < risk_score_min ≤ 84 */}
            <Line
              type="monotone"
              dataKey="warn_y"
              stroke="none"
              strokeWidth={0}
              dot={warnDot}
              activeDot={false}
              legendType="none"
              isAnimationActive={false}
            />
            {/* Danger markers: risk_score_min ≤ 49 */}
            <Line
              type="monotone"
              dataKey="danger_y"
              stroke="none"
              strokeWidth={0}
              dot={dangerDot}
              activeDot={false}
              legendType="none"
              isAnimationActive={false}
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
export function SensorChart({ items, field, label, unit }: {
  items: HistoryItem[]
  field: 'temperature_celsius_avg' | 'humidity_percent_avg' | 'pressure_hpa_avg'
  label: string
  unit: string
}) {
  const sampledItems = subsampleData(items)
  const data = sampledItems
    .map((it) => {
      const val = it[field] as number | null | undefined
      return { ts: fmtTime(extractTimestamp(it)), value: val ?? null }
    })
    .filter((d) => d.value != null)

  if (data.length === 0) {
    return <EmptyChart message={`${label} 데이터 없음`} />
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
          <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--ink-4)' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: 'var(--ink-4)' }} width={40} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => [`${v} ${unit}`, label]}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={label}
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

// ─── AI score chart ───────────────────────────────────────────────────
export function AIScoreChart({ items }: { items: HistoryItem[] }) {
  const sampledItems = subsampleData(items)
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
