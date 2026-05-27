import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutGrid,
  FileText,
  LogOut,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react'
import { logout } from '../auth/auth'
import type { WsStatus } from '../hooks/useWebSocket'
import { ConnStatus } from './ConnStatus'

// ─── Sidebar ──────────────────────────────────────────────────────────
interface SidebarProps {
  factories?: { factory_id: string; risk_level?: string; risk_score?: number }[]
}

export function Sidebar({ factories = [] }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const isFleet = location.pathname === '/'
  const isReports = location.pathname === '/reports'

  // Parse current factory ID from the URL so the Factories section never
  // disappears during loading — even on direct URL access or page refresh.
  const urlFactoryId = location.pathname.startsWith('/factory/')
    ? location.pathname.slice('/factory/'.length).split('/')[0] ?? null
    : null

  // If the prop list is empty but we're on a factory route, show a placeholder
  // row for the current factory so the section header stays visible.
  const visibleFactories =
    factories.length > 0
      ? factories
      : urlFactoryId
        ? [{ factory_id: urlFactoryId, risk_level: undefined as string | undefined, risk_score: undefined as number | undefined }]
        : []

  return (
    <nav className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">
          <span className="serif" style={{ fontSize: 18, lineHeight: 1 }}>π</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <div className="sidebar-title">
            Aegis<span style={{ color: 'var(--chrome-ink-3)' }}>·</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17 }}>π</span>
          </div>
          <div className="sidebar-subtitle">Risk Twin</div>
        </div>
      </div>

      {/* Navigation */}
      <div className="sidebar-nav">
        <div className="sidebar-nav-label">Fleet</div>

        <button
          className={`nav-item ${isFleet ? 'active' : ''}`}
          onClick={() => navigate('/')}
        >
          <LayoutGrid size={15} />
          <span style={{ flex: 1 }}>전체 개요</span>
          {factories.length > 0 && (
            <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--chrome-ink-3)' }}>
              {factories.length}
            </span>
          )}
        </button>

        {visibleFactories.length > 0 && (
          <>
            <div className="sidebar-nav-label" style={{ marginTop: 8 }}>Factories</div>
            {visibleFactories.map((f) => {
              const isActive = location.pathname === `/factory/${f.factory_id}`
              const dotColor =
                f.risk_level === 'danger' ? 'var(--crit)' :
                f.risk_level === 'warning' ? 'var(--warn)' :
                f.risk_level === 'safe' ? 'var(--safe)' : 'var(--chrome-ink-3)'
              return (
                <button
                  key={f.factory_id}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => navigate(`/factory/${f.factory_id}`)}
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: dotColor, flexShrink: 0,
                  }} />
                  <span style={{ flex: 1 }}>{f.factory_id}</span>
                  {f.risk_score != null && (
                    <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--chrome-ink-3)' }}>
                      {f.risk_score}
                    </span>
                  )}
                </button>
              )
            })}
          </>
        )}

        <div className="sidebar-nav-label" style={{ marginTop: 8 }}>Workspace</div>
        <button
          className={`nav-item ${isReports ? 'active' : ''}`}
          onClick={() => navigate('/reports')}
        >
          <FileText size={15} />
          <span style={{ flex: 1 }}>일간 보고서</span>
        </button>
      </div>

      {/* Footer: logout */}
      <div className="sidebar-footer">
        <button
          className="nav-item"
          style={{ width: '100%' }}
          onClick={() => { void logout() }}
        >
          <LogOut size={14} />
          로그아웃
        </button>
      </div>
    </nav>
  )
}

// ─── TopBar ───────────────────────────────────────────────────────────
interface Crumb {
  label: string
  href?: string
}

interface TopBarProps {
  crumbs: Crumb[]
  onBack?: (() => void) | null
  wsStatus?: WsStatus
  wsMessage?: Record<string, unknown> | null
  onRefresh?: () => void
}

export function TopBar({ crumbs, onBack, wsStatus, wsMessage, onRefresh }: TopBarProps) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')

  return (
    <div className="topbar">
      {onBack && (
        <button className="btn ghost" onClick={onBack} style={{ padding: '4px 6px' }}>
          <ChevronLeft size={16} />
        </button>
      )}

      <div className="topbar-breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span className="sep">/</span>}
            <span className={`crumb ${i === crumbs.length - 1 ? 'current' : ''} ${c.href ? 'clickable' : ''}`}>
              {c.label}
            </span>
          </span>
        ))}
      </div>

      <div className="topbar-actions">
        {wsStatus && <ConnStatus status={wsStatus} lastMessage={wsMessage} />}

        {onRefresh && (
          <button className="btn ghost" onClick={onRefresh} title="수동 새로고침" style={{ padding: '4px 8px' }}>
            <RefreshCw size={13} />
          </button>
        )}

        {/* Live clock */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          fontSize: 11.5, color: 'var(--ink-3)',
          whiteSpace: 'nowrap', flexShrink: 0,
          borderLeft: '1px solid var(--line)',
          marginLeft: 4, paddingLeft: 12,
        }}>
          <span className="mono tnum">{hh}:{mm}:{ss}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Shell layout wrapper ─────────────────────────────────────────────
interface ShellProps {
  children: React.ReactNode
  factories?: { factory_id: string; risk_level?: string; risk_score?: number }[]
  crumbs: Crumb[]
  onBack?: (() => void) | null
  wsStatus?: WsStatus
  wsMessage?: Record<string, unknown> | null
  onRefresh?: () => void
}

export function Shell({
  children,
  factories,
  crumbs,
  onBack,
  wsStatus,
  wsMessage,
  onRefresh,
}: ShellProps) {
  return (
    <div className="shell">
      <Sidebar factories={factories} />
      <div className="main">
        <TopBar
          crumbs={crumbs}
          onBack={onBack}
          wsStatus={wsStatus}
          wsMessage={wsMessage}
          onRefresh={onRefresh}
        />
        <div className="content">
          {children}
        </div>
      </div>
    </div>
  )
}
