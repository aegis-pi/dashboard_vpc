import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  ExternalLink,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react'
import { Shell } from '../components/Layout'
import { useFactories } from '../hooks/useFactories'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { fetchImageSnapshotRange, fetchImageSnapshots } from '../api/client'
import type { ImageSnapshotItem } from '../api/types'
import { adaptSidebarFactory } from '../adapters/factory'
import {
  TIMELINE_MAX_RANGE_MS,
  buildTimelineDateOptions,
  buildTimelineTimeOptions,
  resolveTimelineSelectValue,
  toDatetimeLocalValue,
} from '../utils/timeline'

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  }))
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function formatBytes(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-'
  if (value < 1024) return `${value} B`
  const kib = value / 1024
  if (kib < 1024) return `${kib.toFixed(1)} KiB`
  return `${(kib / 1024).toFixed(1)} MiB`
}

function resolveSnapshotRange(startValue: string, endValue: string, minValue: string, nowMs: number) {
  const startMs = new Date(startValue).getTime()
  const endMs = new Date(endValue).getTime()
  const minMs = new Date(minValue).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { valid: false, message: '시작/종료 시간을 입력하세요.', startMs, endMs }
  }
  if (Number.isFinite(minMs) && startMs < minMs) {
    return { valid: false, message: '시작 시간은 S3에 이미지가 존재하는 첫 시간 이후여야 합니다.', startMs, endMs }
  }
  if (startMs >= endMs) {
    return { valid: false, message: '시작 시간은 종료 시간보다 이전이어야 합니다.', startMs, endMs }
  }
  if (endMs > nowMs + 60 * 1000) {
    return { valid: false, message: '미래 시간은 선택할 수 없습니다.', startMs, endMs }
  }
  return { valid: true, message: '', startMs, endMs }
}

function SnapshotEmptyState({
  icon: Icon,
  title,
  detail,
  tone = 'neutral',
  action,
}: {
  icon: React.ElementType
  title: string
  detail: string
  tone?: 'neutral' | 'critical'
  action?: React.ReactNode
}) {
  return (
    <div className="card">
      <div className={`snapshot-empty ${tone}`}>
        <div className="snapshot-empty-icon"><Icon size={24} /></div>
        <div>
          <div className="snapshot-empty-title">{title}</div>
          <div className="snapshot-empty-detail">{detail}</div>
        </div>
        {action}
      </div>
    </div>
  )
}

function SnapshotCard({ item }: { item: ImageSnapshotItem }) {
  return (
    <article className="snapshot-card">
      <a className="snapshot-image-link" href={item.url} target="_blank" rel="noreferrer">
        <img src={item.url} alt={item.filename} loading="lazy" />
      </a>
      <div className="snapshot-card-bd">
        <div className="snapshot-card-title-row">
          <div className="snapshot-card-title" title={item.filename}>{item.filename}</div>
          <a className="btn btn-icon" href={item.url} target="_blank" rel="noreferrer" title="원본 열기">
            <ExternalLink size={13} />
          </a>
        </div>
        <div className="snapshot-meta-grid">
          <span>탐지</span><strong>{item.detection_type ?? '미분류'}</strong>
          <span>수정</span><strong>{formatDateTime(item.last_modified)}</strong>
          <span>크기</span><strong>{formatBytes(item.size_bytes)}</strong>
        </div>
      </div>
    </article>
  )
}

export function ImageSnapshotsPage() {
  const now = new Date()
  const { data: fleetData } = useFactories()
  const currentUser = useCurrentUser()
  const canViewSystem = currentUser.data?.can_view_system === true
  const [nowTick, setNowTick] = useState(() => Date.now())

  const factories = useMemo(() => (
    [...(fleetData?.factories ?? [])]
      .sort((a, b) => a.factory_id.localeCompare(b.factory_id, undefined, {
        numeric: true,
        sensitivity: 'base',
      }))
      .map(adaptSidebarFactory)
  ), [fleetData?.factories])

  const factoryIds = useMemo(() => sortIds(unique(factories.map((f) => f.factory_id))), [factories])
  const [selectedFactory, setSelectedFactory] = useState('')
  const [customStart, setCustomStart] = useState(() => toDatetimeLocalValue(new Date(now.getTime() - 60 * 60 * 1000)))
  const [customEnd, setCustomEnd] = useState(() => toDatetimeLocalValue(now))
  const [items, setItems] = useState<ImageSnapshotItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<'forbidden' | 'error' | null>(null)
  const [availableStart, setAvailableStart] = useState<string | null>(null)
  const [rangeLoading, setRangeLoading] = useState(false)

  const activeFactory = selectedFactory || factoryIds[0] || 'factory-a'
  const pickerMax = toDatetimeLocalValue(new Date(nowTick))
  const fallbackPickerMin = toDatetimeLocalValue(new Date(nowTick - TIMELINE_MAX_RANGE_MS))
  const pickerMin = availableStart ?? fallbackPickerMin
  const startPickerMax = toDatetimeLocalValue(new Date(Math.max(
    new Date(customEnd).getTime() - 60_000,
    new Date(pickerMin).getTime(),
  )))
  const endPickerMin = toDatetimeLocalValue(new Date(Math.min(
    new Date(customStart).getTime() + 60_000,
    nowTick,
  )))
  const customRange = resolveSnapshotRange(customStart, customEnd, pickerMin, nowTick)
  const rangeLabel = customRange.valid
    ? `${formatDateTime(new Date(customRange.startMs).toISOString())} ~ ${formatDateTime(new Date(customRange.endMs).toISOString())}`
    : '유효하지 않은 범위'

  useEffect(() => {
    if (!selectedFactory && factoryIds.length > 0) {
      setSelectedFactory(factoryIds[0]!)
    }
  }, [factoryIds, selectedFactory])

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!activeFactory || !canViewSystem) return
    let cancelled = false
    setRangeLoading(true)
    void fetchImageSnapshotRange(activeFactory)
      .then((range) => {
        if (cancelled) return
        const nextStart = range.available_start
        setAvailableStart(nextStart)
        if (nextStart) {
          const nextStartMs = new Date(nextStart).getTime()
          if (Number.isFinite(nextStartMs)) {
            setCustomStart((current) => {
              const currentStartMs = new Date(current).getTime()
              return Number.isFinite(currentStartMs) && currentStartMs < nextStartMs ? nextStart : current
            })
          }
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableStart(null)
      })
      .finally(() => {
        if (!cancelled) setRangeLoading(false)
      })
    return () => { cancelled = true }
  }, [activeFactory, canViewSystem])

  const handleStartChange = useCallback((val: string) => {
    const inputMs = new Date(val).getTime()
    const minMs = new Date(pickerMin).getTime()
    const maxMs = new Date(startPickerMax).getTime()
    if (!Number.isFinite(inputMs) || !Number.isFinite(minMs) || !Number.isFinite(maxMs)) return
    const nextMs = Math.min(Math.max(inputMs, minMs), maxMs)
    setCustomStart(toDatetimeLocalValue(new Date(nextMs)))
  }, [pickerMin, startPickerMax])

  const handleEndChange = useCallback((val: string) => {
    const inputMs = new Date(val).getTime()
    const minMs = new Date(customStart).getTime() + 60_000
    if (!Number.isFinite(inputMs) || !Number.isFinite(minMs)) return
    const nextMs = Math.min(Math.max(inputMs, minMs), nowTick)
    setCustomEnd(toDatetimeLocalValue(new Date(nextMs)))
  }, [customStart, nowTick])

  const loadSnapshots = useCallback(async () => {
    if (!activeFactory || !canViewSystem || !customRange.valid) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchImageSnapshots(activeFactory, customStart, customEnd)
      setItems(result.items ?? [])
    } catch (e) {
      const status = typeof e === 'object' && e !== null && 'status' in e
        ? (e as { status?: number }).status
        : undefined
      setError(status === 403 ? 'forbidden' : 'error')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [activeFactory, canViewSystem, customEnd, customRange.valid, customStart])

  useEffect(() => {
    void loadSnapshots()
  }, [loadSnapshots])

  return (
    <Shell
      factories={factories}
      crumbs={[{ label: 'Aegis-π' }, { label: '이미지 스냅샷' }]}
    >
      <div className="page-head">
        <div>
          <div className="eyebrow">Risk Twin · Image Snapshots</div>
          <h1 className="h1">이미지 스냅샷</h1>
        </div>
        <button className="btn" onClick={() => void loadSnapshots()} disabled={loading || !canViewSystem}>
          <RefreshCw size={13} />새로고침
        </button>
      </div>

      {!canViewSystem && (
        <SnapshotEmptyState
          icon={AlertTriangle}
          title="시스템 조회 권한이 필요합니다."
          detail="이미지 스냅샷은 System 권한 사용자만 조회할 수 있습니다."
          tone="critical"
        />
      )}

      {canViewSystem && (
        <>
          <div className="snapshot-toolbar card">
            <div className="snapshot-control">
              <span className="eyebrow">공장</span>
              <div className="seg">
                {(factoryIds.length > 0 ? factoryIds : ['factory-a']).map((fid) => (
                  <button
                    key={fid}
                    aria-pressed={activeFactory === fid}
                    onClick={() => setSelectedFactory(fid)}
                  >
                    {fid}
                  </button>
                ))}
              </div>
            </div>

            <div className="snapshot-control">
              <span className="eyebrow">시작</span>
              <SnapshotDateInput value={customStart} min={pickerMin} max={startPickerMax} onChange={handleStartChange} />
            </div>

            <div className="snapshot-control">
              <span className="eyebrow">종료</span>
              <SnapshotDateInput value={customEnd} min={endPickerMin} max={pickerMax} onChange={handleEndChange} />
            </div>

            <div className="snapshot-toolbar-summary">
              <span className="mono tnum">{items.length}</span>
              <span>images</span>
            </div>
          </div>
          <div className="snapshot-range-caption">
            <span className="eyebrow">range</span>
            <span className="mono tnum">{rangeLabel}</span>
            <span className="micro">
              {rangeLoading ? 'S3 범위 확인 중' : availableStart ? 'S3 데이터 시작 시각부터 선택' : 'S3 데이터 범위 미확인 · 최근 24시간 기준'}
            </span>
          </div>

          {!customRange.valid && (
            <SnapshotEmptyState
              icon={AlertTriangle}
              title="시간 범위를 확인해주세요."
              detail={customRange.message}
              tone="critical"
            />
          )}

          {customRange.valid && loading && (
            <div className="card">
              <div className="empty-state">
                <div className="spinner" />
                <span className="sub">스냅샷 로드 중...</span>
              </div>
            </div>
          )}

          {customRange.valid && !loading && error === 'error' && (
            <SnapshotEmptyState
              icon={AlertTriangle}
              title="이미지 목록을 불러오지 못했습니다."
              detail="S3 조회가 지연됐거나 API 오류가 발생했습니다."
              tone="critical"
              action={<button className="btn" onClick={() => void loadSnapshots()}><RefreshCw size={13} />다시 시도</button>}
            />
          )}

          {customRange.valid && !loading && error === 'forbidden' && (
            <SnapshotEmptyState
              icon={AlertTriangle}
              title="접근이 거부되었습니다."
              detail="현재 계정에 System 조회 권한이 없습니다."
              tone="critical"
            />
          )}

          {customRange.valid && !loading && !error && items.length === 0 && (
            <SnapshotEmptyState
              icon={ImageIcon}
              title="선택한 시간 범위의 이미지가 없습니다."
              detail={`${activeFactory} · ${rangeLabel} 범위에 저장된 snapshot 객체가 없습니다.`}
              action={<button className="btn" onClick={() => void loadSnapshots()}><Camera size={13} />다시 확인</button>}
            />
          )}

          {customRange.valid && !loading && !error && items.length > 0 && (
            <div className="snapshot-gallery">
              {items.map((item) => <SnapshotCard key={item.s3_key} item={item} />)}
            </div>
          )}
        </>
      )}
    </Shell>
  )
}

function SnapshotDateInput({ value, min, max, onChange }: {
  value: string
  min: string
  max: string
  onChange: (value: string) => void
}) {
  const selectedDate = value.slice(0, 10)
  const selectedTime = value.slice(11, 16)
  const dateOptions = buildTimelineDateOptions(min, max)
  const activeDate = dateOptions.some((option) => option.value === selectedDate)
    ? selectedDate
    : dateOptions[0]?.value ?? selectedDate
  const timeOptions = buildTimelineTimeOptions(activeDate, min, max, value)
  const activeTime = timeOptions.some((option) => option.value === selectedTime)
    ? selectedTime
    : timeOptions[0]?.value ?? selectedTime

  const handleDateChange = (dateValue: string) => {
    const next = resolveTimelineSelectValue(dateValue, activeTime, min, max)
    if (next) onChange(next)
  }

  const handleTimeChange = (timeValue: string) => {
    const next = resolveTimelineSelectValue(activeDate, timeValue, min, max)
    if (next) onChange(next)
  }

  return (
    <span className="snapshot-date-pair">
      <select value={activeDate} onChange={(ev) => handleDateChange(ev.target.value)} aria-label="날짜">
        {dateOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <select value={activeTime} onChange={(ev) => handleTimeChange(ev.target.value)} aria-label="시간">
        {timeOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </span>
  )
}
