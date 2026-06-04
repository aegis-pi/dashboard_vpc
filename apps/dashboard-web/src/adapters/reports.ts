// Report adapter — wraps raw API text into a UI-friendly shape.

export type ReportStatus = 'loading' | 'ready' | 'not_found' | 'error'

export interface ReportState {
  status: ReportStatus
  content: string | null
  error: string | null
}

export function recentDates(count = 7, startOffsetDays = 0): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - startOffsetDays - i)
    return d.toISOString().slice(0, 10)
  })
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
