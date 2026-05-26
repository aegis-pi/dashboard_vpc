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
  factories?: { factory_id: string; risk_level?: string }[]
}

export function Sidebar({ factories = [] }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const isFleet = location.pathname === '/'
  const isReports = location.pathname === '/reports'

  return (
    <nav className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">π</div>
        <div>
          <div className="sidebar-title">Aegis·π</div>
          <div className="sidebar-subtitle">Risk Twin</div>
        </div>
      </div>

      {/* Navigation */}
      <div className="sidebar-nav">
        <div className="sidebar-nav-label">관제</div>

        <button
          className={`nav-item ${isFleet ? 'active' : ''}`}
          onClick={() => navigate('/')}
        >
          <LayoutGrid size={15} />
          Fleet Overview
        </button>

        {factories.length > 0 && (
          <>
            <div className="sidebar-nav-label" style={{ marginTop: 8 }}>Factories</div>
            {factories.map((f) => {
              const isActive = location.pathname === `/factory/${f.factory_id}`
              const tone =
                f.risk_level === 'danger' ? 'crit' :
                f.risk_level === 'warning' ? 'warn' : ''
              return (
                <button
                  key={f.factory_id}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => navigate(`/factory/${f.factory_id}`)}
                >
                  <span className="mono" style={{ fontSize: 12 }}>{f.factory_id}</span>
                  {tone && (
                    <span className={`nav-item-badge ${tone}`}>
                      {f.risk_level === 'danger' ? '위험' : '주의'}
                    </span>
                  )}
                </button>
              )
            })}
          </>
        )}

        <div className="sidebar-nav-label" style={{ marginTop: 8 }}>보고서</div>
        <button
          className={`nav-item ${isReports ? 'active' : ''}`}
          onClick={() => navigate('/reports')}
        >
          <FileText size={15} />
          일간 보고서
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
          <button className="btn" onClick={onRefresh}>
            <RefreshCw size={13} />
            새로고침
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Shell layout wrapper ─────────────────────────────────────────────
interface ShellProps {
  children: React.ReactNode
  factories?: { factory_id: string; risk_level?: string }[]
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
