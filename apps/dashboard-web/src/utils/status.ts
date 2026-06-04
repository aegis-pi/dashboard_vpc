export type StatusTone = 'safe' | 'warn' | 'crit' | 'unk'

interface StatusMeta {
  label: string
  tone: StatusTone
}

export function statusMeta(status?: string): StatusMeta {
  const value = (status ?? '').toLowerCase()
  if (value === 'safe' || value === 'normal' || value === 'healthy' || value === 'active') {
    return { label: value === 'active' ? 'active' : '안전', tone: 'safe' }
  }
  if (value === 'warning' || value === 'warn' || value === 'stale') {
    return { label: '주의', tone: 'warn' }
  }
  if (value === 'danger' || value === 'critical' || value === 'failed' || value === 'unhealthy') {
    return { label: '위험', tone: 'crit' }
  }
  if (value === 'disabled') return { label: 'disabled', tone: 'unk' }
  return { label: '미확인', tone: 'unk' }
}
