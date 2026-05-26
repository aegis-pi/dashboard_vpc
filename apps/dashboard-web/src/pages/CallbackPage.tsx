import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { handleCallback } from '../auth/auth'

export function CallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    handleCallback()
      .then(() => navigate('/', { replace: true }))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
      })
  }, [navigate])

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg)', padding: 24,
      }}>
        <div className="card" style={{ padding: '28px 24px', maxWidth: 400, textAlign: 'center' }}>
          <div style={{ color: 'var(--crit)', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
            인증 실패
          </div>
          <p className="sub" style={{ marginBottom: 16 }}>{error}</p>
          <button className="btn" onClick={() => navigate('/login')}>
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div className="spinner" />
        <span className="sub">인증 처리 중...</span>
      </div>
    </div>
  )
}
