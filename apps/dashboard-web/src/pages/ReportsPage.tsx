import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Calendar, ChevronDown, Download, FileText,
  RefreshCw, Plus, AlertTriangle,
} from 'lucide-react'
import { Shell } from '../components/Layout'
import { useFactories } from '../hooks/useFactories'
import { fetchReport } from '../api/client'
import { ApiError, AuthError } from '../api/client'
import { recentDates, todayStr } from '../adapters/reports'
import { adaptSidebarFactory } from '../adapters/factory'

// ─── Markdown parser (no external deps) ────────────────────────────────

interface MdBlock {
  kind: 'h' | 'p' | 'list' | 'table'
  level?: number
  text?: string
  ordered?: boolean
  items?: string[]
  head?: string[]
  rows?: string[][]
}

function splitRow(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim())
}

function parseMarkdown(text: string): MdBlock[] {
  const lines = text.split('\n')
  const blocks: MdBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) { i++; continue }
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) { blocks.push({ kind: 'h', level: h[1]!.length, text: h[2] }); i++; continue }
    if (line.startsWith('|') && lines[i + 1]?.match(/^\|\s*[:-]+/)) {
      const head = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i]!.startsWith('|')) { rows.push(splitRow(lines[i]!)); i++ }
      blocks.push({ kind: 'table', head, rows })
      continue
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line)
      const items: string[] = []
      while (i < lines.length && (
        (ordered && /^\s*\d+\.\s+/.test(lines[i]!)) ||
        (!ordered && /^\s*[-*]\s+/.test(lines[i]!))
      )) { items.push(lines[i]!.replace(/^\s*(?:\d+\.|[-*])\s+/, '')); i++ }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }
    const para = [line]; i++
    while (i < lines.length && lines[i]!.trim() && !/^(#|\||[-*]\s|\d+\.\s)/.test(lines[i]!)) {
      para.push(lines[i]!); i++
    }
    blocks.push({ kind: 'p', text: para.join(' ') })
  }
  return blocks
}

function inlineMd(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let i = 0; let key = 0
  while (i < text.length) {
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end > -1) {
        parts.push(<strong key={key++} style={{ color: 'var(--ink)' }}>{text.slice(i + 2, end)}</strong>)
        i = end + 2; continue
      }
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > -1) {
        parts.push(
          <code key={key++} className="mono" style={{
            fontSize: '0.92em', padding: '1px 5px',
            background: 'var(--surface-2)', border: '1px solid var(--line-2)',
            borderRadius: 4, color: 'var(--ink-2)',
          }}>{text.slice(i + 1, end)}</code>
        )
        i = end + 1; continue
      }
    }
    let j = i + 1
    while (j < text.length && text[j] !== '*' && text[j] !== '`') j++
    parts.push(text.slice(i, j)); i = j
  }
  return parts
}

function renderBlock(b: MdBlock, key: number): React.ReactNode {
  if (b.kind === 'h') {
    const sizes: Record<number, number> = { 1: 22, 2: 17, 3: 14 }
    const Tag = `h${b.level}` as 'h1' | 'h2' | 'h3'
    return (
      <Tag key={key} style={{
        fontSize: sizes[b.level!] ?? 14, fontWeight: 600,
        margin: b.level === 1 ? '0 0 12px' : '20px 0 8px',
        color: 'var(--ink)', letterSpacing: '-0.005em',
      }}>{inlineMd(b.text ?? '')}</Tag>
    )
  }
  if (b.kind === 'p') return <p key={key} style={{ margin: '0 0 10px' }}>{inlineMd(b.text ?? '')}</p>
  if (b.kind === 'list') {
    const Tag = b.ordered ? 'ol' : 'ul'
    return (
      <Tag key={key} style={{ margin: '0 0 10px', paddingLeft: 20 }}>
        {b.items!.map((it, i) => <li key={i} style={{ marginBottom: 4 }}>{inlineMd(it)}</li>)}
      </Tag>
    )
  }
  if (b.kind === 'table') {
    return (
      <div key={key} style={{ margin: '8px 0 14px', overflowX: 'auto' }}>
        <table className="tbl" style={{ width: 'auto', minWidth: '100%' }}>
          <thead><tr>{b.head!.map((h, i) => <th key={i}>{inlineMd(h)}</th>)}</tr></thead>
          <tbody>
            {b.rows!.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inlineMd(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return null
}

function MarkdownView({ text }: { text: string }) {
  const blocks = parseMarkdown(text)
  return (
    <div className="md" style={{ color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.6 }}>
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  )
}

// ─── Export helpers ────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c] ?? c
  ))
}

function inlineMdHtml(text: string): string {
  let s = escapeHtml(text)
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/`(.+?)`/g, '<code>$1</code>')
  return s
}

function markdownToHtml(text: string): string {
  return parseMarkdown(text ?? '').map((b) => {
    if (b.kind === 'h') return `<h${b.level}>${inlineMdHtml(b.text ?? '')}</h${b.level}>`
    if (b.kind === 'p') return `<p>${inlineMdHtml(b.text ?? '')}</p>`
    if (b.kind === 'list') {
      const Tag = b.ordered ? 'ol' : 'ul'
      return `<${Tag}>${b.items!.map((it) => `<li>${inlineMdHtml(it)}</li>`).join('')}</${Tag}>`
    }
    if (b.kind === 'table') {
      return `<table><thead><tr>${b.head!.map((h) => `<th>${inlineMdHtml(h)}</th>`).join('')}</tr></thead>`
        + `<tbody>${b.rows!.map((r) => `<tr>${r.map((c) => `<td>${inlineMdHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    }
    return ''
  }).join('\n')
}

function openPrintWindow(factoryId: string, date: string, markdown: string) {
  const bodyHtml = markdownToHtml(markdown)
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) return
  w.document.open()
  w.document.write(`<!doctype html><html lang="ko"><head>
  <meta charset="utf-8"><title>${factoryId} · ${date}</title>
  <style>
    @page { margin: 18mm 16mm; }
    body { font-family: -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;
           color:#14181F; max-width:760px; margin:0 auto; padding:28px;
           line-height:1.55; font-size:11pt; }
    .meta { font-size:9pt; color:#56606E; letter-spacing:.08em; text-transform:uppercase;
            margin-bottom:18pt; padding-bottom:10pt; border-bottom:1px solid #E4E6EB; }
    h1{font-size:22pt;margin:0 0 12pt;} h2{font-size:14pt;margin:18pt 0 8pt;}
    h3{font-size:12pt;margin:14pt 0 6pt;} p{margin:0 0 10pt;}
    table{border-collapse:collapse;margin:8pt 0;width:100%;}
    td,th{border:1px solid #D9DCE2;padding:6pt 10pt;font-size:10pt;text-align:left;}
    th{background:#F4F5F7;font-weight:600;}
    code{font-family:"SF Mono",Consolas,monospace;background:#F4F5F7;padding:1pt 5pt;
         border-radius:3pt;font-size:0.92em;}
    ul,ol{padding-left:20pt;margin:0 0 10pt;} li{margin-bottom:3pt;}
  </style></head><body>
  <div class="meta">Aegis-π Risk Twin · ${factoryId} · ${date} 일간 보고서</div>
  ${bodyHtml}
  <script>window.onload=()=>{setTimeout(()=>window.print(),250);};</script>
</body></html>`)
  w.document.close()
}

function downloadAsWord(factoryId: string, date: string, markdown: string) {
  const bodyHtml = markdownToHtml(markdown)
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${factoryId} ${date}</title>
<style>
  body{font-family:Calibri,sans-serif;font-size:11pt;color:#14181F;}
  h1{font-size:22pt;margin-bottom:12pt;} h2{font-size:16pt;margin:18pt 0 8pt;}
  h3{font-size:13pt;margin:14pt 0 6pt;}
  table{border-collapse:collapse;margin:8pt 0;} td,th{border:1px solid #ccc;padding:6pt 10pt;font-size:10pt;}
  th{background:#f5f5f5;} code{font-family:Consolas,monospace;background:#f5f5f5;padding:1pt 4pt;}
  li{margin-bottom:4pt;}
</style></head><body>
  <p style="font-size:9pt;color:#56606E;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid #ccc;padding-bottom:8pt;margin-bottom:16pt">
    Aegis-π Risk Twin · ${factoryId} · ${date} 일간 보고서</p>
  ${bodyHtml}
</body></html>`
  const blob = new Blob(['﻿', html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${factoryId}_${date}.doc`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ─── Report state display ──────────────────────────────────────────────

function ReportEmptyState({
  icon: Icon, tone, title, detail, children,
}: {
  icon: React.ElementType
  tone: 'unk' | 'warn' | 'crit'
  title: string
  detail: string
  children?: React.ReactNode
}) {
  const color = tone === 'warn' ? 'var(--warn)' : tone === 'crit' ? 'var(--crit)' : 'var(--ink-4)'
  const bg    = tone === 'warn' ? 'var(--warn-tint-2)' : tone === 'crit' ? 'var(--crit-tint-2)' : 'var(--surface-2)'
  return (
    <div className="card">
      <div style={{
        padding: '48px 32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: bg, color, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={24} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
          <div className="micro" style={{ marginTop: 4, maxWidth: 420 }}>{detail}</div>
        </div>
        {children && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>{children}</div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────

const REPORT_DATES = recentDates(7)
const TODAY = todayStr()

export function ReportsPage() {
  const { data: fleetData } = useFactories()
  const factories = (fleetData?.factories ?? []).map(adaptSidebarFactory)
  const factoryIds = factories.map((f) => f.factory_id)

  const [selectedFactory, setSelectedFactory] = useState<string>('')
  const [date, setDate] = useState<string>(TODAY)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const factoryIdsKey = factoryIds.join(',')
  const activeFactory = selectedFactory || factoryIds[0] || ''

  // Auto-select first factory when list loads
  useEffect(() => {
    if (!selectedFactory && factoryIdsKey) {
      setSelectedFactory(factoryIdsKey.split(',')[0] ?? '')
    }
  }, [selectedFactory, factoryIdsKey])

  // Report fetch state
  const [reportLoading, setReportLoading] = useState(false)
  const [reportContent, setReportContent] = useState<string | null>(null)
  const [reportError, setReportError] = useState<'not_found' | 'error' | null>(null)

  const fetchReportData = useCallback(async (fid: string, d: string) => {
    if (!fid) return
    setReportLoading(true)
    setReportContent(null)
    setReportError(null)
    try {
      const md = await fetchReport(d, fid)
      setReportContent(md || null)
      if (!md) setReportError('not_found')
    } catch (e) {
      if (e instanceof ApiError && (e as ApiError).status === 404) {
        setReportError('not_found')
      } else if (e instanceof AuthError) {
        setReportError('error')
      } else {
        setReportError('not_found')
      }
    } finally {
      setReportLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeFactory) void fetchReportData(activeFactory, date)
  }, [activeFactory, date, fetchReportData])

  const openDatePicker = () => {
    const el = dateInputRef.current
    if (!el) return
    if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
      try { (el as HTMLInputElement & { showPicker: () => void }).showPicker(); return } catch { /* fall through */ }
    }
    el.focus(); el.click()
  }

  const canExport = reportContent != null
  const doExport = (kind: 'pdf' | 'word') => {
    if (!canExport || !activeFactory) return
    if (kind === 'pdf') openPrintWindow(activeFactory, date, reportContent!)
    if (kind === 'word') downloadAsWord(activeFactory, date, reportContent!)
  }

  return (
    <Shell
      factories={factories}
      crumbs={[{ label: 'Aegis-π' }, { label: '일간 보고서' }]}
    >
      {/* Page header */}
      <div className="page-header">
        <div className="eyebrow page-eyebrow">Risk Twin · Reports</div>
        <h1 className="page-title">일간 보고서</h1>
        <p className="page-desc">
          공장·날짜를 선택해 Lambda가 생성한 일간 Markdown 보고서를 확인합니다.{' '}
          <span className="mono" style={{ whiteSpace: 'nowrap' }}>FR-DASH-06 · FR-DATA-07/08</span>
        </p>
      </div>

      {/* Selectors card */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-bd" style={{
          display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end',
        }}>
          {/* Factory selector */}
          {factoryIds.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="eyebrow">공장</span>
              <div className="seg">
                {factoryIds.map((fid) => (
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
          )}

          {/* Date selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="eyebrow">날짜</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {/* Calendar picker button */}
              <label
                onClick={openDatePicker}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  height: 28, padding: '0 10px',
                  border: '1px solid var(--line-3)', borderRadius: 7,
                  background: 'var(--surface)', cursor: 'pointer',
                  position: 'relative', transition: 'border-color .12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--ink-4)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line-3)' }}
              >
                <Calendar size={13} style={{ color: 'var(--ink-3)' }} />
                <span className="mono tnum" style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>
                  {date}
                </span>
                <ChevronDown size={10} style={{ color: 'var(--ink-4)' }} />
                <input
                  ref={dateInputRef}
                  type="date" value={date} max={TODAY}
                  onChange={(e) => { if (e.target.value) setDate(e.target.value) }}
                  tabIndex={-1}
                  style={{
                    position: 'absolute', inset: 0,
                    opacity: 0, pointerEvents: 'none',
                    border: 0, padding: 0, margin: 0, width: '100%', height: '100%',
                  }}
                />
              </label>

              <span style={{ width: 1, height: 18, background: 'var(--line-3)' }} />

              {/* Quick date buttons */}
              <div className="seg">
                {REPORT_DATES.map((d) => (
                  <button key={d} aria-pressed={date === d} onClick={() => setDate(d)}>
                    {d.slice(5)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Export buttons */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button
              className="btn"
              onClick={() => doExport('pdf')}
              disabled={!canExport}
              title={canExport ? 'PDF로 내보내기 (인쇄 대화상자)' : 'ready 상태의 보고서가 없습니다'}
              style={{ opacity: canExport ? 1 : 0.5 }}
            >
              <Download size={13} />PDF
            </button>
            <button
              className="btn"
              onClick={() => doExport('word')}
              disabled={!canExport}
              title={canExport ? 'Word(.doc) 다운로드' : 'ready 상태의 보고서가 없습니다'}
              style={{ opacity: canExport ? 1 : 0.5 }}
            >
              <FileText size={13} />Word
            </button>
            <button
              className="btn"
              onClick={() => { if (activeFactory) void fetchReportData(activeFactory, date) }}
              title="새로고침"
            >
              <RefreshCw size={13} />새로고침
            </button>
          </div>
        </div>
      </div>

      {/* Report body */}
      {reportLoading && (
        <div className="card">
          <div className="empty-state">
            <div className="spinner" />
            <span className="sub">보고서 로드 중...</span>
          </div>
        </div>
      )}

      {!reportLoading && reportError === 'not_found' && (
        <ReportEmptyState
          icon={FileText}
          tone="unk"
          title="보고서가 없습니다."
          detail={`${activeFactory} · ${date} 일자 보고서가 아직 생성되지 않았습니다.`}
        >
          <button className="btn primary" onClick={() => void fetchReportData(activeFactory, date)}>
            <Plus size={13} />재시도
          </button>
        </ReportEmptyState>
      )}

      {!reportLoading && reportError === 'error' && (
        <ReportEmptyState
          icon={AlertTriangle}
          tone="crit"
          title="보고서 로드 실패"
          detail="API 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
        >
          <button className="btn" onClick={() => void fetchReportData(activeFactory, date)}>
            <RefreshCw size={13} />다시 시도
          </button>
        </ReportEmptyState>
      )}

      {!reportLoading && !reportError && reportContent && (
        <div className="card">
          <div className="card-hd">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
              <h2 className="h2" style={{ whiteSpace: 'nowrap' }}>{activeFactory} · {date}</h2>
            </div>
          </div>
          <div className="card-bd">
            <MarkdownView text={reportContent} />
          </div>
        </div>
      )}

      {!reportLoading && !reportError && !reportContent && !activeFactory && (
        <ReportEmptyState
          icon={FileText}
          tone="unk"
          title="공장을 선택해주세요."
          detail="왼쪽 사이드바 또는 상단 셀렉터에서 공장을 선택하면 보고서가 표시됩니다."
        />
      )}
    </Shell>
  )
}
