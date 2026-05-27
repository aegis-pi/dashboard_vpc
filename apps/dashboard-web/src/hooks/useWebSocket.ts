import { useState, useEffect, useRef, useCallback } from 'react'
import { getAccessToken } from '../auth/auth'

export type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

const WS_BASE = (import.meta.env.VITE_WS_BASE_URL as string | undefined) ?? ''
const MAX_RETRIES = 5
const RETRY_BASE_MS = 2000

export function useWebSocket(factoryId: string) {
  const [status, setStatus] = useState<WsStatus>('connecting')
  const [lastMessage, setLastMessage] = useState<Record<string, unknown> | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const unmountedRef = useRef(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(async () => {
    if (unmountedRef.current) return
    if (!WS_BASE) {
      setStatus('offline')
      return
    }

    const token = await getAccessToken()
    if (!token) {
      setStatus('offline')
      return
    }

    const url = `${WS_BASE}/ws/factories/${factoryId}?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return }
      setStatus('connected')
      retryRef.current = 0
    }

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>
        setLastMessage(data)
      } catch {
        // ignore non-JSON frames
      }
    }

    ws.onerror = () => {
      if (!unmountedRef.current) setStatus('reconnecting')
    }

    ws.onclose = (event) => {
      if (unmountedRef.current) return
      if (event.code === 4001) {
        setStatus('offline')
        return
      }
      const attempt = retryRef.current
      if (attempt >= MAX_RETRIES) {
        setStatus('offline')
        return
      }
      setStatus('reconnecting')
      retryRef.current += 1
      const delay = RETRY_BASE_MS * Math.pow(1.5, attempt)
      retryTimerRef.current = setTimeout(() => { void connect() }, delay)
    }
  }, [factoryId])

  useEffect(() => {
    unmountedRef.current = false
    void connect()
    return () => {
      unmountedRef.current = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { status, lastMessage }
}
