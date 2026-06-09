import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Brain, Check, ChevronDown, Database, Factory, FileSearch, Search, Send, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { Shell } from '../components/Layout'
import { useFactories } from '../hooks/useFactories'
import { adaptSidebarFactory, aiDetectionLabel } from '../adapters/factory'
import { riskLevelKr } from '../adapters/risk'
import { sendChatQuery } from '../api/client'
import { parseInline, parseMarkdown, type MdBlock } from '../utils/markdown'
import type { ChatModelPreference, ChatQueryResponse } from '../api/types'

type ChatRole = 'assistant' | 'user'

interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  response?: ChatQueryResponse
  pending?: boolean
  error?: boolean
  progressIndex?: number
}

const SUGGESTION_TEMPLATES = [
  (factoryId: string) => `${factoryId} 지금 상태 어때?`,
  (factoryId: string) => `${factoryId} 왜 위험해?`,
  (factoryId: string) => `${factoryId} 최근 1시간 추이 알려줘`,
]

const MODEL_OPTIONS: Array<{ value: ChatModelPreference; label: string }> = [
  { value: 'auto', label: '자동 선택' },
  { value: 'fast', label: '빠른 답변' },
  { value: 'precise', label: '정밀 분석' },
]

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Grow the composer with its content (Perplexity-style), capped at the CSS max.
function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`
}

const CHAT_PROGRESS_STEPS = [
  { label: '질문 해석', detail: '공장, 시점, 의도를 정리하는 중', icon: Search },
  { label: '접근 범위 확인', detail: '사용자 권한과 공장 범위를 확인하는 중', icon: ShieldCheck },
  { label: 'DynamoDB 조회', detail: '최신/이력/집계 데이터를 찾는 중', icon: Database },
  { label: 'S3 상세 확인', detail: '필요한 경우 processed 상세 근거를 확인하는 중', icon: FileSearch },
  { label: '답변 정리', detail: '확인값과 추정을 분리해 정리하는 중', icon: Sparkles },
]

interface ConfirmedRow {
  label: string
  value: string
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// Turn the raw confirmed evidence map into a small, readable set of rows:
// Korean labels, units, and composite rows (최저~최고, 점수 변화). Internal /
// duplicate keys (*_policy, *_level, time_range_kst, top_causes ...) are dropped
// because they are already reflected in the answer body or the meta row.
function buildConfirmedRows(c: Record<string, unknown>): ConfirmedRow[] {
  const rows: ConfirmedRow[] = []
  const withLevel = (score: string, levelKey: string) => {
    const raw = c[levelKey]
    return typeof raw === 'string' ? `${score} (${riskLevelKr(raw)})` : score
  }

  if (asNumber(c.risk_score) != null) {
    rows.push({ label: '안전점수', value: withLevel(`${c.risk_score}점`, 'risk_level') })
  }
  if (asNumber(c.risk_score_avg) != null) {
    rows.push({ label: '평균 안전점수', value: withLevel(`${c.risk_score_avg}점`, 'risk_score_avg_level') })
  }
  if (asNumber(c.risk_score_min) != null && asNumber(c.risk_score_max) != null) {
    // NBSP keeps the range on one piece; it breaks as a whole, never mid-token.
    rows.push({ label: '최저~최고', value: `${c.risk_score_min}\u00A0~\u00A0${c.risk_score_max}점` })
  }
  const delta = asNumber(c.risk_score_delta)
  if (delta != null) {
    let value = '변화 없음'
    if (delta !== 0) {
      const sign = delta > 0 ? '+' : '-'
      // NBSP inside each part so a wrap only ever happens between the
      // "start → end" segment and the "(변화 …)" segment — never mid-token.
      value = `${c.risk_score_start}점\u00A0→\u00A0${c.risk_score_end}점 (변화\u00A0${sign}${Math.abs(delta)}점)`
    }
    rows.push({ label: '점수 변화', value })
  }
  if (asNumber(c.sample_count) != null) {
    rows.push({ label: '표본 수', value: `${c.sample_count}개` })
  }
  if (c.pipeline_status) {
    rows.push({ label: '파이프라인', value: String(c.pipeline_status) })
  }
  if (asNumber(c.temperature_celsius) != null) {
    rows.push({ label: '온도', value: `${c.temperature_celsius}°C` })
  }
  if (asNumber(c.temperature_avg) != null) {
    rows.push({ label: '평균 온도', value: `${c.temperature_avg}°C` })
  }
  if (asNumber(c.ai_detection_max_score) != null) {
    const source = typeof c.ai_detection_max_source === 'string' ? aiDetectionLabel(c.ai_detection_max_source) : null
    rows.push({ label: 'AI 탐지 최대', value: source ? `${source} ${c.ai_detection_max_score}` : String(c.ai_detection_max_score) })
  }
  return rows
}

function inlineMd(text: string): ReactNode[] {
  return parseInline(text).map((span, key) => {
    if (span.bold) return <strong key={key}>{span.text}</strong>
    if (span.code) return <code key={key} className="mono">{span.text}</code>
    return <span key={key}>{span.text}</span>
  })
}

function renderMarkdownBlock(block: MdBlock, key: number): ReactNode {
  if (block.kind === 'h') return <p key={key} className="chat-md-heading">{inlineMd(block.text ?? '')}</p>
  if (block.kind === 'p') return <p key={key}>{inlineMd(block.text ?? '')}</p>
  if (block.kind === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul'
    return (
      <Tag key={key}>
        {block.items?.map((item, index) => <li key={index}>{inlineMd(item)}</li>)}
      </Tag>
    )
  }
  if (block.kind === 'table') {
    return (
      <div key={key} className="chat-md-table-wrap">
        <table className="chat-md-table">
          <thead>
            <tr>{block.head?.map((cell, index) => <th key={index}>{inlineMd(cell)}</th>)}</tr>
          </thead>
          <tbody>
            {block.rows?.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{inlineMd(cell)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return null
}

function MarkdownMessage({ text }: { text: string }) {
  const blocks = parseMarkdown(text)
  return <div className="chat-md">{blocks.map((block, index) => renderMarkdownBlock(block, index))}</div>
}

function EvidencePanel({ response }: { response: ChatQueryResponse }) {
  const confirmedRows = buildConfirmedRows(response.evidence.confirmed ?? {})
  const inferred = response.evidence.inferred ?? []
  const missing = response.evidence.missing ?? []

  if (!confirmedRows.length && !inferred.length && !missing.length) return null

  return (
    <div className="chat-evidence">
      {confirmedRows.length > 0 && (
        <div>
          <div className="chat-evidence-title">확인된 값</div>
          <div className="chat-evidence-grid">
            {confirmedRows.map((row) => (
              <div key={row.label} className="chat-evidence-item">
                <span>{row.label}</span>
                <strong className="mono">{row.value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
      {inferred.length > 0 && (
        <div>
          <div className="chat-evidence-title">추정</div>
          <ul>{inferred.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      )}
      {missing.length > 0 && (
        <div>
          <div className="chat-evidence-title">데이터 한계</div>
          <ul>{missing.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

interface ChatSelectOption {
  value: string
  label: string
}

// Perplexity-style pill selector with a custom popover menu (native <select>
// can't be styled, so we render our own listbox that opens upward).
function ChatSelect({
  icon,
  value,
  options,
  onChange,
  ariaLabel,
}: {
  icon: ReactNode
  value: string
  options: readonly ChatSelectOption[]
  onChange: (value: string) => void
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const current = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="chat-select" ref={ref}>
      <button
        type="button"
        className={`chat-select-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {icon}
        <span className="chat-select-value">{current?.label ?? ''}</span>
        <ChevronDown size={14} className="chat-select-caret" />
      </button>
      {open && (
        <div className="chat-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`chat-select-option${option.value === value ? ' selected' : ''}`}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div className={`chat-row assistant ${message.pending ? 'pending' : ''}`}>
      <div className="chat-message-body">
        <div className="chat-bubble assistant">
          {message.pending ? (
            <ChatProgress activeIndex={message.progressIndex ?? 0} />
          ) : (
            <MarkdownMessage text={message.text} />
          )}
        </div>
        {message.response && <EvidencePanel response={message.response} />}
      </div>
    </div>
  )
}

function ChatProgress({ activeIndex }: { activeIndex: number }) {
  const bounded = Math.max(0, Math.min(activeIndex, CHAT_PROGRESS_STEPS.length - 1))
  return (
    <div className="chat-progress" aria-label="응답 생성 진행 상태">
      <div className="chat-progress-head">
        <span className="chat-typing" aria-hidden="true"><span /> <span /> <span /></span>
        <strong>{CHAT_PROGRESS_STEPS[bounded].detail}</strong>
      </div>
      <div className="chat-progress-list">
        {CHAT_PROGRESS_STEPS.map((step, index) => {
          const Icon = step.icon
          const state = index < bounded ? 'done' : index === bounded ? 'active' : 'waiting'
          return (
            <div key={step.label} className={`chat-progress-step ${state}`}>
              <span className="chat-progress-icon">
                {state === 'done' ? <Check size={14} /> : <Icon size={14} />}
              </span>
              <span>{step.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="chat-row user">
      <div className="chat-message-body">
        <div className="chat-bubble user"><p>{text}</p></div>
      </div>
    </div>
  )
}

export function ChatPage() {
  const factories = useFactories()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const progressTimers = useRef<Record<string, number>>({})
  const [question, setQuestion] = useState('')
  const [selectedFactory, setSelectedFactory] = useState('')
  const [modelPreference, setModelPreference] = useState<ChatModelPreference>('auto')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: '공장 상태, 위험도 추이, 원인 분석을 물어볼 수 있습니다.',
    },
  ])

  const sidebarFactories = useMemo(() => (
    (factories.data?.factories ?? [])
      .map(adaptSidebarFactory)
      .sort((a, b) => a.factory_id.localeCompare(b.factory_id))
  ), [factories.data?.factories])

  const factoryIds = useMemo(() => (
    [...new Set((factories.data?.factories ?? []).map((item) => item.factory_id))]
      .sort((a, b) => a.localeCompare(b))
  ), [factories.data?.factories])

  const factoryOptions = useMemo<ChatSelectOption[]>(() => (
    [{ value: '', label: '질문에서 식별' }, ...factoryIds.map((id) => ({ value: id, label: id }))]
  ), [factoryIds])

  const suggestionFactoryId = selectedFactory || factoryIds[0] || 'factory-a'
  const suggestions = useMemo(
    () => SUGGESTION_TEMPLATES.map((template) => template(suggestionFactoryId)),
    [suggestionFactoryId],
  )

  useEffect(() => () => {
    Object.values(progressTimers.current).forEach((timer) => window.clearInterval(timer))
    progressTimers.current = {}
  }, [])

  // Follow the conversation: smoothly scroll the thread to the bottom whenever
  // a message is added or updated (new question, pending, or answer).
  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [messages])

  const submit = async (override?: string) => {
    const text = (override ?? question).trim()
    if (!text || sending) return

    const userMessage: ChatMessage = { id: messageId(), role: 'user', text }
    const pendingId = messageId()
    setMessages((current) => [
      ...current,
      userMessage,
      { id: pendingId, role: 'assistant', text: '', pending: true, progressIndex: 0 },
    ])
    setQuestion('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setSending(true)
    progressTimers.current[pendingId] = window.setInterval(() => {
      setMessages((current) => current.map((message) => {
        if (message.id !== pendingId || !message.pending) return message
        const currentIndex = message.progressIndex ?? 0
        return {
          ...message,
          progressIndex: Math.min(currentIndex + 1, CHAT_PROGRESS_STEPS.length - 1),
        }
      }))
    }, 900)

    try {
      const response = await sendChatQuery(text, selectedFactory, modelPreference)
      window.clearInterval(progressTimers.current[pendingId])
      delete progressTimers.current[pendingId]
      setMessages((current) => current.map((message) => (
        message.id === pendingId
          ? { id: pendingId, role: 'assistant', text: response.answer, response }
          : message
      )))
    } catch (err) {
      window.clearInterval(progressTimers.current[pendingId])
      delete progressTimers.current[pendingId]
      const detail = err instanceof Error ? err.message : '요청을 처리하지 못했습니다.'
      setMessages((current) => current.map((message) => (
        message.id === pendingId
          ? { id: pendingId, role: 'assistant', text: detail, error: true }
          : message
      )))
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submit()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <Shell factories={sidebarFactories} crumbs={[{ label: 'Workspace' }, { label: 'AI 채팅' }]}>
      <div className="chat-page">
        <section className="chat-surface">
          <div className="chat-thread" aria-live="polite" ref={threadRef}>
            {messages.map((message) => (
              message.role === 'user'
                ? <UserMessage key={message.id} text={message.text} />
                : <AssistantMessage key={message.id} message={message} />
            ))}
          </div>

          <div className="chat-dock">
          <div className="chat-suggestions" aria-label="추천 질문">
            {suggestions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => { void submit(item) }}
                disabled={sending}
              >
                <Zap size={13} />
                <span>{item}</span>
              </button>
            ))}
          </div>

          <form className="chat-composer" onSubmit={onSubmit}>
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value)
                autoGrowTextarea(event.target)
              }}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={500}
              placeholder="공장 상태나 위험 원인을 물어보세요."
              aria-label="질문 입력"
            />
            <div className="chat-composer-row">
              <div className="chat-composer-tools">
                <ChatSelect
                  icon={<Factory size={14} />}
                  value={selectedFactory}
                  options={factoryOptions}
                  onChange={setSelectedFactory}
                  ariaLabel="공장 선택"
                />
                <ChatSelect
                  icon={<Brain size={14} />}
                  value={modelPreference}
                  options={MODEL_OPTIONS}
                  onChange={(value) => setModelPreference(value as ChatModelPreference)}
                  ariaLabel="응답 모드 선택"
                />
              </div>
              <button
                type="submit"
                className="btn primary btn-icon chat-send"
                disabled={!question.trim() || sending}
                aria-label="전송"
                title="전송"
              >
                <Send size={16} />
              </button>
            </div>
          </form>
          </div>
        </section>
      </div>
    </Shell>
  )
}
