import type { TrendPoint } from '../utils/trend'

const TREND_WINDOW_MS = 10 * 60 * 1000

export function CompactTrendChart({ data, color }: { data: TrendPoint[]; color: string }) {
  const VW = 260, VH = 86
  const pL = 26, pR = 12, pT = 12, pB = 20
  const cW = VW - pL - pR
  const cH = VH - pT - pB

  const hasData = data.length >= 1
  const hasLine = data.length >= 2
  const now = Date.now()
  const start = now - TREND_WINDOW_MS
  const xOf = (timestamp: string) => {
    const ts = Date.parse(timestamp)
    if (!Number.isFinite(ts)) return pL + cW
    const ratio = Math.max(0, Math.min(1, (ts - start) / TREND_WINDOW_MS))
    return pL + ratio * cW
  }
  const yOf = (v: number) => pT + cH - (Math.max(0, Math.min(100, v)) / 100) * cH

  const pts = data.map((p) => `${xOf(p.timestamp).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(' ')
  const areaD = hasLine
    ? `M ${xOf(data[0]!.timestamp).toFixed(1)},${pT + cH} L ${
        data.map((p) => `${xOf(p.timestamp).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(' L ')
      } L ${xOf(data[data.length - 1]!.timestamp).toFixed(1)},${pT + cH} Z`
    : ''
  const last = hasData ? data[data.length - 1]! : null
  const lastV = last?.value ?? null
  const lastX = last ? xOf(last.timestamp) : 0
  const lastY = lastV != null ? yOf(lastV) : 0

  return (
    <svg
      width="100%" viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      {[50, 85].map((v) => (
        <line
          key={v}
          x1={pL} x2={pL + cW} y1={yOf(v)} y2={yOf(v)}
          stroke="var(--line-2)" strokeWidth={0.8} strokeDasharray="3,3"
        />
      ))}
      <line x1={pL} x2={pL} y1={pT} y2={pT + cH} stroke="var(--line-2)" strokeWidth={0.8} />
      <line x1={pL} x2={pL + cW} y1={pT + cH} y2={pT + cH} stroke="var(--line-2)" strokeWidth={0.8} />
      {[0, 50, 100].map((v) => (
        <text key={v} x={pL - 4} y={yOf(v) + 2.5} textAnchor="end" fontSize={7} fill="var(--ink-4)" fontFamily="monospace">
          {v}
        </text>
      ))}
      <text x={7} y={pT + cH / 2} textAnchor="middle" fontSize={7.5} fill="var(--ink-4)" transform={`rotate(-90, 7, ${pT + cH / 2})`}>
        안전 점수
      </text>
      {hasLine && <path d={areaD} fill={color} opacity={0.1} />}
      {hasLine && (
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {hasData && lastV != null && (
        <circle cx={lastX} cy={lastY} r={3} fill={color} />
      )}
      <text x={pL} y={pT + cH + 12} textAnchor="middle" fontSize={7.5} fill="var(--ink-5)">10m 전</text>
      <text x={pL + cW} y={pT + cH + 12} textAnchor="middle" fontSize={7.5} fill="var(--ink-5)">현재</text>
      <text x={pL + cW / 2} y={VH - 3} textAnchor="middle" fontSize={8} fill="var(--ink-4)">시간</text>
      {!hasData && (
        <text x={VW / 2} y={pT + cH / 2 + 3} textAnchor="middle" fontSize={9} fill="var(--ink-5)">
          데이터 없음
        </text>
      )}
    </svg>
  )
}
