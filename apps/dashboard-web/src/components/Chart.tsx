import {
  LineChart,
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
export function RiskScoreChart({ items }: { items: HistoryItem[] }) {
  const data = items
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
          {/* Threshold bands */}
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
  const data = items
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
  const data = items
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
export function NodeResourceChart({ items, field, label }: {
  items: HistoryItem[]
  field: 'cpu_usage_percent' | 'memory_usage_percent' | 'disk_usage_percent'
  label: string
}) {
  // Extract per-node series
  const nodeIds = new Set<string>()
  items.forEach((it) => {
    if (Array.isArray(it.nodes)) {
      it.nodes.forEach((n) => nodeIds.add(n.node_id))
    }
  })

  const data = items.map((it) => {
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

  if (data.length === 0 || nodeIds.size === 0) {
    return <EmptyChart message={`${label} 데이터 없음`} />
  }

  const COLORS = ['var(--accent)', 'var(--warn)', 'var(--safe)', 'var(--crit)']

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
              stroke={COLORS[i % COLORS.length]}
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
