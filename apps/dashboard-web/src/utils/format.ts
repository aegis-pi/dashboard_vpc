export function relTime(ts?: string): string {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 5) return '방금'
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  return `${Math.floor(diff / 3600)}시간 전`
}

export function riskColor(level?: string): string {
  if (level === 'danger') return 'var(--crit)'
  if (level === 'warning') return 'var(--warn)'
  if (level === 'safe') return 'var(--safe)'
  return 'var(--ink-4)'
}
