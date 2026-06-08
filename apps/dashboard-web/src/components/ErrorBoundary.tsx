import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dashboard render error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="login-wrap">
        <div className="card" style={{ padding: 28, maxWidth: 520 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--crit)', marginBottom: 10 }}>
            <AlertTriangle size={20} />
            <strong>화면 렌더링 오류</strong>
          </div>
          <p className="sub" style={{ marginBottom: 12 }}>
            화면 데이터를 그리는 중 오류가 발생했습니다. 새로고침하면 현재 세션으로 다시 시도합니다.
          </p>
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            padding: 12,
            border: '1px solid var(--line)',
            borderRadius: 8,
            background: 'var(--surface-2)',
            color: 'var(--ink-2)',
            fontSize: 11,
            marginBottom: 14,
            maxHeight: 180,
            overflow: 'auto',
          }}>
            {this.state.error.message}
          </pre>
          <button className="btn primary" onClick={() => window.location.reload()}>
            <RefreshCw size={13} />새로고침
          </button>
        </div>
      </div>
    )
  }
}
