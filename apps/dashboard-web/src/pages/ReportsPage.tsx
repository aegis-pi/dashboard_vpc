import { FileText } from 'lucide-react'
import { Shell } from '../components/Layout'
import { useFactories } from '../hooks/useFactories'
import type { FactorySummary } from '../api/types'

function normalizeFactory(f: FactorySummary) {
  return {
    factory_id: f.factory_id,
    risk_level: f.risk_level ?? f.risk?.level,
  }
}

export function ReportsPage() {
  const { data } = useFactories()

  const sidebarFactories = (data?.factories ?? []).map(normalizeFactory)

  return (
    <Shell
      factories={sidebarFactories}
      crumbs={[{ label: 'Aegis-π' }, { label: '일간 보고서' }]}
    >
      <div className="page-header">
        <div className="eyebrow page-eyebrow">Risk Twin · Reports</div>
        <h1 className="page-title">일간 보고서</h1>
        <p className="page-desc">
          공장별 일간 자동 생성 보고서. 안전 점수 추이 · 이상 이벤트 · 권고 사항 포함.
        </p>
      </div>

      <div className="card" style={{ padding: '48px 32px', textAlign: 'center' }}>
        <FileText
          size={40}
          style={{ color: 'var(--ink-4)', marginBottom: 16, display: 'block', margin: '0 auto 16px' }}
        />
        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink-2)', marginBottom: 8 }}>
          보고서 기능 준비 중
        </div>
        <p className="sub" style={{ maxWidth: 400, margin: '0 auto', lineHeight: 1.65 }}>
          LLM 기반 일간 보고서 생성 기능은 Phase 1 Step 9에서 활성화됩니다.
          <br />
          현재는 위험 이벤트 타임라인을 Factory 상세 페이지의 <strong>Timeline</strong> 탭에서 확인할 수 있습니다.
        </p>
        <div
          className="pill info"
          style={{ display: 'inline-flex', marginTop: 20, fontSize: 12 }}
        >
          Coming in Step 9
        </div>
      </div>
    </Shell>
  )
}
