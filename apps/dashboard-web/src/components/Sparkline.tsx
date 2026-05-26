interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  strokeWidth?: number
}

export function Sparkline({
  data,
  width = 80,
  height = 28,
  color = 'var(--accent)',
  strokeWidth = 1.5,
}: SparklineProps) {
  if (!data || data.length < 2) {
    return <svg width={width} height={height} />
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  })

  const polyline = pts.join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} overflow="visible">
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Last dot */}
      {pts.length > 0 && (() => {
        const last = pts[pts.length - 1]!.split(',')
        return (
          <circle
            cx={parseFloat(last[0] ?? '0')}
            cy={parseFloat(last[1] ?? '0')}
            r={2.5}
            fill={color}
          />
        )
      })()}
    </svg>
  )
}
