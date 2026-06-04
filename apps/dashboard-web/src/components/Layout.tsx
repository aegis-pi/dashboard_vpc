import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutGrid,
  FileText,
  LogOut,
  ChevronLeft,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Server,
  Users,
} from 'lucide-react'
import { logout } from '../auth/auth'
import type { WsStatus } from '../hooks/useWebSocket'
import { useCloudInfra } from '../hooks/useCloudInfra'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { cloudInfraDotColor } from '../adapters/cloudInfra'
import { ConnStatus } from './ConnStatus'

// ─── Sidebar ──────────────────────────────────────────────────────────
interface SidebarProps {
  factories?: { factory_id: string; risk_level?: string; risk_score?: number }[]
  collapsed?: boolean
  onNavigate?: () => void
}

function riskDotColor(level?: string): string {
  if (level === 'danger' || level === 'critical') return 'var(--crit)'
  if (level === 'warning') return 'var(--warn)'
  if (level === 'safe' || level === 'normal' || level === 'active') return 'var(--safe)'
  return 'var(--unk)'
}

function factoryShortLabel(factoryId: string): string {
  const lastSegment = factoryId.split(/[-_]/).filter(Boolean).pop() ?? factoryId
  return lastSegment.slice(0, 2).toUpperCase()
}

export function Sidebar({ factories = [], collapsed = false, onNavigate }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const currentUser = useCurrentUser()
  const canViewSystem = currentUser.data?.can_view_system === true
  const canManageUsers = currentUser.data?.can_manage_users === true
  const { data: cloudInfra } = useCloudInfra(canViewSystem)

  const isFleet = location.pathname === '/'
  const isReports = location.pathname === '/reports'
  const isCloudInfra = location.pathname === '/cloud-infra'
  const isAdminUsers = location.pathname === '/admin/users'
  const cloudStatus = cloudInfra?.available ? cloudInfra.overall_status : undefined

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

  const go = (path: string) => {
    navigate(path)
    onNavigate?.()
  }

  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="주요 탐색">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">
          <span className="serif" style={{ fontSize: 18, lineHeight: 1 }}>π</span>
        </div>
        <div className="sidebar-titleblock" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
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
          onClick={() => go('/')}
          aria-label="전체 개요"
          title="전체 개요"
        >
          <LayoutGrid size={15} />
          <span className="nav-item-label" style={{ flex: 1 }}>전체 개요</span>
          {factories.length > 0 && (
            <span className="mono tnum nav-item-count" style={{ fontSize: 10.5, color: 'var(--chrome-ink-3)' }}>
              {factories.length}
            </span>
          )}
        </button>

        {visibleFactories.length > 0 && (
          <>
            <div className="sidebar-nav-label" style={{ marginTop: 8 }}>Factories</div>
            {visibleFactories.map((f) => {
              const isActive = location.pathname === `/factory/${f.factory_id}`
              const dotColor = riskDotColor(f.risk_level)
              return (
                <button
                  key={f.factory_id}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => go(`/factory/${f.factory_id}`)}
                  aria-label={`${f.factory_id} 공장 상세`}
                  title={`${f.factory_id} · ${f.risk_score ?? '미수신'}`}
                >
                  <span className="nav-factory-mark">
                    <span className="nav-risk-dot" style={{ background: dotColor }} />
                    <span className="nav-factory-short">{factoryShortLabel(f.factory_id)}</span>
                  </span>
                  <span className="nav-item-label" style={{ flex: 1 }}>{f.factory_id}</span>
                  {f.risk_score != null && (
                    <span className="mono tnum nav-item-count" style={{ fontSize: 10.5, color: 'var(--chrome-ink-3)' }}>
                      {f.risk_score}
                    </span>
                  )}
                </button>
              )
            })}
          </>
        )}

        {(canViewSystem || canManageUsers) && (
          <>
            <div className="sidebar-nav-label" style={{ marginTop: 8 }}>System</div>
            {canViewSystem && (
              <button
                className={`nav-item ${isCloudInfra ? 'active' : ''}`}
                onClick={() => go('/cloud-infra')}
                aria-label="클라우드 인프라"
                title="클라우드 인프라"
              >
                <span className="nav-status-icon">
                  <Server size={15} />
                  <span
                    className="nav-status-dot"
                    style={{ background: cloudInfraDotColor(cloudStatus) }}
                  />
                </span>
                <span className="nav-item-label" style={{ flex: 1 }}>클라우드 인프라</span>
                <span
                  className="nav-item-count nav-expanded-dot"
                  style={{ background: cloudInfraDotColor(cloudStatus) }}
                />
              </button>
            )}
            {canManageUsers && (
              <button
                className={`nav-item ${isAdminUsers ? 'active' : ''}`}
                onClick={() => go('/admin/users')}
                aria-label="사용자 관리"
                title="사용자 관리"
              >
                <Users size={15} />
                <span className="nav-item-label" style={{ flex: 1 }}>사용자 관리</span>
              </button>
            )}
          </>
        )}

        <div className="sidebar-nav-label" style={{ marginTop: 8 }}>Workspace</div>
        <button
          className={`nav-item ${isReports ? 'active' : ''}`}
          onClick={() => go('/reports')}
          aria-label="일간 보고서"
          title="일간 보고서"
        >
          <FileText size={15} />
          <span className="nav-item-label" style={{ flex: 1 }}>일간 보고서</span>
        </button>
      </div>

      {/* Footer: logout */}
      <div className="sidebar-footer">
        <button
          className="nav-item"
          style={{ width: '100%' }}
          onClick={() => { void logout() }}
          aria-label="로그아웃"
          title="로그아웃"
        >
          <LogOut size={14} />
          <span className="nav-item-label">로그아웃</span>
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
  refreshInterval?: number
  onIntervalChange?: (ms: number) => void
  onSidebarToggle?: () => void
  sidebarVisible?: boolean
}

export const REFRESH_INTERVAL_OPTIONS = [
  { label: 'Refresh: Off', value: 0 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 },
] as const

export type RefreshIntervalMs = (typeof REFRESH_INTERVAL_OPTIONS)[number]['value']

function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return <span className="mono tnum">{hh}:{mm}:{ss}</span>
}

export function TopBar({
  crumbs,
  onBack,
  wsStatus,
  wsMessage,
  onRefresh,
  refreshInterval = 0,
  onIntervalChange,
  onSidebarToggle,
  sidebarVisible = true,
}: TopBarProps) {
  return (
    <div className="topbar">
      {onSidebarToggle && (
        <button
          type="button"
          className="btn ghost btn-icon topbar-sidebar-toggle"
          onClick={onSidebarToggle}
          aria-label={sidebarVisible ? '사이드바 닫기' : '사이드바 열기'}
          title={sidebarVisible ? '사이드바 닫기' : '사이드바 열기'}
        >
          {sidebarVisible ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
      )}

      {onBack && (
        <button className="btn ghost btn-icon" onClick={onBack} aria-label="이전 화면" title="이전 화면">
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

        {onRefresh && onIntervalChange && (
          <select
            className="refresh-select"
            value={refreshInterval}
            onChange={(e) => onIntervalChange(Number(e.target.value))}
            title="자동 새로고침 간격"
          >
            {REFRESH_INTERVAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        {onRefresh && (
          <button className="btn ghost btn-icon" onClick={onRefresh} title="수동 새로고침" aria-label="수동 새로고침">
            <RefreshCw size={13} />
          </button>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          fontSize: 11.5, color: 'var(--ink-3)',
          whiteSpace: 'nowrap', flexShrink: 0,
          borderLeft: '1px solid var(--line)',
          marginLeft: 4, paddingLeft: 12,
        }}>
          <LiveClock />
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
  refreshInterval?: number
  onIntervalChange?: (ms: number) => void
}

export function Shell({
  children,
  factories,
  crumbs,
  onBack,
  wsStatus,
  wsMessage,
  onRefresh,
  refreshInterval,
  onIntervalChange,
}: ShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem('aegis.sidebar.collapsed') === 'true')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [isMobileShell, setIsMobileShell] = useState(() => window.matchMedia('(max-width: 800px)').matches)

  useEffect(() => {
    window.localStorage.setItem('aegis.sidebar.collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)')
    const update = () => {
      setIsMobileShell(media.matches)
      if (!media.matches) setMobileSidebarOpen(false)
    }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const toggleSidebar = () => {
    if (isMobileShell) {
      setMobileSidebarOpen((value) => !value)
    } else {
      setSidebarCollapsed((value) => !value)
    }
  }

  return (
    <div className={`shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileSidebarOpen ? 'sidebar-mobile-open' : ''}`}>
      <Sidebar
        factories={factories}
        collapsed={sidebarCollapsed}
        onNavigate={() => setMobileSidebarOpen(false)}
      />
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="탐색 메뉴 닫기"
        onClick={() => setMobileSidebarOpen(false)}
      />
      <div className="main">
        <TopBar
          crumbs={crumbs}
          onBack={onBack}
          wsStatus={wsStatus}
          wsMessage={wsMessage}
          onRefresh={onRefresh}
          refreshInterval={refreshInterval}
          onIntervalChange={onIntervalChange}
          onSidebarToggle={toggleSidebar}
          sidebarVisible={isMobileShell ? mobileSidebarOpen : !sidebarCollapsed}
        />
        <div className="content">
          {children}
        </div>
      </div>
    </div>
  )
}
