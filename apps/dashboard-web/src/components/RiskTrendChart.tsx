export function CompactTrendChart({ data, color }: { data: number[]; color: string }) {
  const VW = 260, VH = 86
  const pL = 26, pR = 12, pT = 12, pB = 20
  const cW = VW - pL - pR
  const cH = VH - pT - pB

  const hasData = data.length >= 1
  const hasLine = data.length >= 2
  const xOf = (i: number) => pL + (data.length < 2 ? cW : (i / (data.length - 1)) * cW)
  const yOf = (v: number) => pT + cH - (Math.max(0, Math.min(100, v)) / 100) * cH

  const pts = data.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')
  const areaD = hasLine
    ? `M ${xOf(0).toFixed(1)},${pT + cH} L ${
        data.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' L ')
      } L ${xOf(data.length - 1).toFixed(1)},${pT + cH} Z`
    : ''
  const lastV = hasData ? data[data.length - 1]! : null
  const lastX = hasData ? xOf(data.length - 1) : 0
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
