import type { HistoryItem } from '../api/types'
import type { HistoryWindow } from '../hooks/useFactoryHistory'

export const TIMELINE_PRESETS: HistoryWindow[] = ['10m', '1h']
export const TIMELINE_MAX_RANGE_MS = 24 * 60 * 60 * 1000
const TIMELINE_RAW_RANGE_MS = 60 * 60 * 1000
const TIMELINE_PICKER_GRACE_MS = 60 * 1000
const TIMELINE_AUTO_RANGE_MS = 60 * 60 * 1000
export const TIMELINE_RAW_LIMIT = 2000

export interface TimelineEvent {
  kind: string
  severity: 'info' | 'warning' | 'danger'
  title: string
  detail: string
  ts: number
}

export function deriveTimelineEvents(history: HistoryItem[], prevContext?: HistoryItem): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const startIdx = prevContext ? 0 : 1
  for (let i = startIdx; i < history.length; i++) {
    const prev = i === 0 ? prevContext! : history[i - 1]!
    const curr = history[i]!
    const tsMs = curr.timestamp ? new Date(curr.timestamp).getTime() : Date.now()
    const riskDiff =
      curr.risk_score != null && prev.risk_score != null
        ? curr.risk_score - prev.risk_score
        : null
    const causeDetail = formatTopCauses(curr.top_cause_names)
    let pushed = false

    if (curr.risk_level && prev.risk_level && curr.risk_level !== prev.risk_level) {
      const sev: TimelineEvent['severity'] =
        curr.risk_level === 'danger' ? 'danger' :
        curr.risk_level === 'warning' ? 'warning' : 'info'
      events.push({
        kind: 'risk_level',
        severity: sev,
        title: `Risk Level ${levelKr(prev.risk_level)} → ${levelKr(curr.risk_level)}`,
        detail: `risk_score: ${formatRiskMove(prev.risk_score, curr.risk_score, riskDiff)} · ${causeDetail}`,
        ts: tsMs,
      })
      continue
    }

    if (riskDiff != null) {
      const diff = riskDiff
      if (diff <= -10) {
        events.push({
          kind: 'risk_drop',
          severity: 'danger',
          title: `Risk Score 급락 ${diff.toFixed(1)}`,
          detail: `${formatRiskMove(prev.risk_score, curr.risk_score, diff)} · ${causeDetail}`,
          ts: tsMs,
        })
        pushed = true
      } else if (diff >= 10) {
        events.push({
          kind: 'recovery',
          severity: 'info',
          title: `Risk Score 회복 +${diff.toFixed(1)}`,
          detail: `${formatRiskMove(prev.risk_score, curr.risk_score, diff)} · ${causeDetail}`,
          ts: tsMs,
        })
        pushed = true
      }
    }

    if (!pushed && curr.is_bucket && curr.risk_score_min != null) {
      const minLevel = riskLevelFromScore(curr.risk_score_min)
      if (minLevel !== 'safe') {
        events.push({
          kind: 'risk_bucket_threshold',
          severity: minLevel === 'danger' ? 'danger' : 'warning',
          title: `Risk Score 구간 내 ${levelKr(minLevel)} 피크 (최저 ${curr.risk_score_min.toFixed(1)})`,
          detail: `구간 평균: ${formatScore(curr.risk_score)} · 구간 최저: ${curr.risk_score_min.toFixed(1)} · 5분 집계 · top_causes 없음`,
          ts: tsMs,
        })
        pushed = true
      }
    }

    if (!pushed && curr.is_bucket && curr.risk_score_min != null && prev.risk_score != null) {
      const dipFromPrev = prev.risk_score - curr.risk_score_min
      if (dipFromPrev >= 15) {
        events.push({
          kind: 'risk_dip',
          severity: dipFromPrev >= 30 ? 'danger' : 'warning',
          title: `Risk Score 구간 내 급락 (최저 ${curr.risk_score_min.toFixed(1)})`,
          detail: `이전 평균: ${prev.risk_score.toFixed(1)} · 구간 최저: ${curr.risk_score_min.toFixed(1)} · 낙폭: -${dipFromPrev.toFixed(1)} · 5분 집계`,
          ts: tsMs,
        })
      }
    }
  }
  return events.reverse()
}

export function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function resolveTimelineRange(startValue: string, endValue: string, nowMs = Date.now()): {
  valid: boolean
  message: string
  startMs: number
  endMs: number
  window: HistoryWindow
} {
  const startMs = new Date(startValue).getTime()
  const endMs = new Date(endValue).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { valid: false, message: '시작/종료 시간을 입력하세요.', startMs, endMs, window: '1h' }
  }
  if (startMs >= endMs) {
    return { valid: false, message: '시작 시간은 종료 시간보다 이전이어야 합니다.', startMs, endMs, window: '1h' }
  }
  if (endMs > nowMs + 60 * 1000) {
    return { valid: false, message: '미래 시간은 선택할 수 없습니다.', startMs, endMs, window: '1h' }
  }
  const ageMs = nowMs - startMs
  if (ageMs > TIMELINE_MAX_RANGE_MS + TIMELINE_PICKER_GRACE_MS) {
    return { valid: false, message: 'Timeline은 최신 기준 최대 24시간까지만 조회합니다.', startMs, endMs, window: '24h' }
  }

  const minutesFromStart = Math.max(1, Math.ceil(ageMs / 60_000))
  const window = ageMs <= TIMELINE_RAW_RANGE_MS + TIMELINE_PICKER_GRACE_MS
    ? ageMs > TIMELINE_RAW_RANGE_MS ? '1h' : `${minutesFromStart}m`
    : `${Math.min(24, Math.ceil(minutesFromStart / 60))}h`
  return { valid: true, message: '', startMs, endMs, window: window as HistoryWindow }
}

export function clampTimelineStartValue(
  inputValue: string,
  currentEndValue: string,
  nowMs = Date.now(),
): { start: string; end?: string } | null {
  const inputMs = new Date(inputValue).getTime()
  if (!Number.isFinite(inputMs)) return null

  const minMs = nowMs - TIMELINE_MAX_RANGE_MS
  const maxMs = nowMs
  let startMs = clampMs(inputMs, minMs, maxMs)
  const currentEndMs = new Date(currentEndValue).getTime()
  let endMs = Number.isFinite(currentEndMs) ? clampMs(currentEndMs, minMs, maxMs) : maxMs

  if (startMs >= endMs) {
    endMs = Math.min(startMs + TIMELINE_AUTO_RANGE_MS, maxMs)
    if (startMs >= endMs) {
      startMs = Math.max(endMs - TIMELINE_AUTO_RANGE_MS, minMs)
    }
  }

  return {
    start: toDatetimeLocalValue(new Date(startMs)),
    end: toDatetimeLocalValue(new Date(endMs)),
  }
}

export function clampTimelineEndValue(
  inputValue: string,
  currentStartValue: string,
  nowMs = Date.now(),
): { end: string; start?: string } | null {
  const inputMs = new Date(inputValue).getTime()
  if (!Number.isFinite(inputMs)) return null

  const minMs = nowMs - TIMELINE_MAX_RANGE_MS
  const maxMs = nowMs
  let endMs = clampMs(inputMs, minMs, maxMs)
  const currentStartMs = new Date(currentStartValue).getTime()
  let startMs = Number.isFinite(currentStartMs) ? clampMs(currentStartMs, minMs, maxMs) : minMs

  if (endMs <= startMs) {
    startMs = Math.max(endMs - TIMELINE_AUTO_RANGE_MS, minMs)
    if (endMs <= startMs) {
      endMs = Math.min(startMs + TIMELINE_AUTO_RANGE_MS, maxMs)
    }
  }

  return {
    end: toDatetimeLocalValue(new Date(endMs)),
    start: toDatetimeLocalValue(new Date(startMs)),
  }
}

export function filterTimelineHistory(history: HistoryItem[], startMs: number, endMs: number) {
  return history.filter((item) => {
    const ts = item.timestamp ? new Date(item.timestamp).getTime() : NaN
    return Number.isFinite(ts) && ts >= startMs && ts <= endMs
  })
}

function riskLevelFromScore(score: number) {
  if (score <= 49) return 'danger'
  if (score <= 84) return 'warning'
  return 'safe'
}

function formatScore(score?: number | null) {
  return score == null ? '—' : score.toFixed(1)
}

function formatRiskMove(prev?: number | null, curr?: number | null, diff?: number | null) {
  const delta = diff == null ? '' : ` (${diff >= 0 ? '+' : ''}${diff.toFixed(1)})`
  return `${prev ?? '—'} → ${curr ?? '—'}${delta}`
}

function formatTopCauses(causes?: string[]) {
  const names = (causes ?? []).filter(Boolean)
  return names.length > 0 ? `top_causes: ${names.slice(0, 3).join(', ')}` : 'top_causes 없음'
}

function levelKr(l?: string) {
  return l === 'safe' ? '안전' : l === 'warning' ? '주의' : l === 'danger' ? '위험' : l ?? '—'
}

function clampMs(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
