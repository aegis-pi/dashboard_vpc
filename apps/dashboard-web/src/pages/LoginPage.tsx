import { login } from '../auth/auth'
import { ShieldCheck } from 'lucide-react'

export function LoginPage() {
  const handleLogin = () => { void login() }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(140deg, #2A6BD8 0%, #143F8E 100%)',
            border: '1px solid #2557C0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            fontFamily: 'var(--font-serif)',
            fontSize: 24,
          }}>π</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
              Aegis·π Risk Twin
            </div>
            <div className="mono micro" style={{ letterSpacing: '.08em' }}>
              CONTROL CENTER
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <ShieldCheck size={18} style={{ color: 'var(--safe)' }} />
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            Cognito 인증 후 본사 관제 화면에 접근할 수 있습니다.
          </p>
        </div>

        <p className="sub" style={{ marginBottom: 22, lineHeight: 1.6 }}>
          로그인 버튼을 누르면 AWS Cognito 인증 화면으로 이동합니다.
          인증 완료 후 자동으로 돌아옵니다.
        </p>

        <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}
          onClick={handleLogin}>
          Cognito로 로그인
        </button>

        <div className="micro" style={{ marginTop: 16, textAlign: 'center', color: 'var(--ink-4)' }}>
          Aegis-Pi Risk Twin · 본사 관제 전용
        </div>
      </div>
    </div>
  )
}
