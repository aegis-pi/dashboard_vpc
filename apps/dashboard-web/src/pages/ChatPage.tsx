import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from 'react'
import { Bot, Factory, Send, User, Zap } from 'lucide-react'
import { Shell } from '../components/Layout'
import { useFactories } from '../hooks/useFactories'
import { adaptSidebarFactory } from '../adapters/factory'
import { sendChatQuery } from '../api/client'
import type { ChatQueryResponse } from '../api/types'

type ChatRole = 'assistant' | 'user'

interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  response?: ChatQueryResponse
  pending?: boolean
  error?: boolean
}

const SUGGESTIONS = [
  'factory-a 지금 상태 어때?',
  'factory-a 왜 위험해?',
  'factory-a 최근 1시간 추이 알려줘',
]

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatEvidenceValue(value: unknown): string {
  if (value == null) return '-'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-'
  if (typeof value === 'string' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function EvidencePanel({ response }: { response: ChatQueryResponse }) {
  const confirmedEntries = Object.entries(response.evidence.confirmed ?? {})
  const inferred = response.evidence.inferred ?? []
  const missing = response.evidence.missing ?? []

  if (!confirmedEntries.length && !inferred.length && !missing.length) return null

  return (
    <div className="chat-evidence">
      {confirmedEntries.length > 0 && (
        <div>
          <div className="chat-evidence-title">확인된 값</div>
          <div className="chat-evidence-grid">
            {confirmedEntries.slice(0, 8).map(([key, value]) => (
              <div key={key} className="chat-evidence-item">
                <span>{key}</span>
                <strong className="mono">{formatEvidenceValue(value)}</strong>
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

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div className={`chat-row assistant ${message.pending ? 'pending' : ''}`}>
      <div className="chat-avatar assistant"><Bot size={16} /></div>
      <div className="chat-message-body">
        <div className="chat-bubble assistant">
          {message.pending ? (
            <span className="chat-typing"><span /> <span /> <span /></span>
          ) : (
            <p>{message.text}</p>
          )}
        </div>
        {message.response && (
          <>
            <div className="chat-meta">
              <span>{message.response.generator === 'bedrock' ? 'Bedrock' : 'Rule fallback'}</span>
              {message.response.model_tier && <span>{message.response.model_tier}</span>}
              <span>{message.response.intent}</span>
              {message.response.factory_id && <span>{message.response.factory_id}</span>}
            </div>
            <EvidencePanel response={message.response} />
          </>
        )}
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
      <div className="chat-avatar user"><User size={15} /></div>
    </div>
  )
}

export function ChatPage() {
  const factories = useFactories()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [question, setQuestion] = useState('')
  const [selectedFactory, setSelectedFactory] = useState('')
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

  const submit = async (override?: string) => {
    const text = (override ?? question).trim()
    if (!text || sending) return

    const userMessage: ChatMessage = { id: messageId(), role: 'user', text }
    const pendingId = messageId()
    setMessages((current) => [
      ...current,
      userMessage,
      { id: pendingId, role: 'assistant', text: '', pending: true },
    ])
    setQuestion('')
    setSending(true)

    try {
      const response = await sendChatQuery(text, selectedFactory)
      setMessages((current) => current.map((message) => (
        message.id === pendingId
          ? { id: pendingId, role: 'assistant', text: response.answer, response }
          : message
      )))
    } catch (err) {
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
        <section className="chat-header">
          <div>
            <div className="eyebrow">Risk Twin · AI</div>
            <h1>AI 채팅</h1>
          </div>
          <div className="chat-header-meta">
            <span className="pill info"><span className="dot" />Evidence grounded</span>
            <span className="pill safe"><span className="dot" />RBAC enforced</span>
          </div>
        </section>

        <section className="chat-surface">
          <div className="chat-thread" aria-live="polite">
            {messages.map((message) => (
              message.role === 'user'
                ? <UserMessage key={message.id} text={message.text} />
                : <AssistantMessage key={message.id} message={message} />
            ))}
          </div>

          <div className="chat-suggestions" aria-label="추천 질문">
            {SUGGESTIONS.map((item) => (
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
            <div className="chat-factory-select">
              <Factory size={14} />
              <select
                value={selectedFactory}
                onChange={(event) => setSelectedFactory(event.target.value)}
                aria-label="공장 선택"
              >
                <option value="">질문에서 식별</option>
                {factoryIds.map((factoryId) => (
                  <option key={factoryId} value={factoryId}>{factoryId}</option>
                ))}
              </select>
            </div>
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={500}
              placeholder="공장 상태나 위험 원인을 물어보세요."
              aria-label="질문 입력"
            />
            <button
              type="submit"
              className="btn primary btn-icon chat-send"
              disabled={!question.trim() || sending}
              aria-label="전송"
              title="전송"
            >
              <Send size={15} />
            </button>
          </form>
        </section>
      </div>
    </Shell>
  )
}
