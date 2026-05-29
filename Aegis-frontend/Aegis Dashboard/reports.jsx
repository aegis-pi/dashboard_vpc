// ─── Reports page (pages/ReportsPage.tsx) ───────────────────────────────
function recentDates(count = 7) {
  return Array.from({ length: count }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().slice(0, 10) })
}
const REPORT_DATES = recentDates(7)
const TODAY = REPORT_DATES[0]

// ─── Minimal markdown parser ──────────────────────────────────────────────
function splitRow(line) { return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim()) }
function parseMarkdown(text) {
  const lines = text.split('\n'), blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) { blocks.push({ kind: 'h', level: h[1].length, text: h[2] }); i++; continue }
    if (line.startsWith('|') && lines[i + 1]?.match(/^\|\s*[:-]+/)) {
      const head = splitRow(line); i += 2; const rows = []
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(splitRow(lines[i])); i++ }
      blocks.push({ kind: 'table', head, rows }); continue
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line); const items = []
      while (i < lines.length && ((ordered && /^\s*\d+\.\s+/.test(lines[i])) || (!ordered && /^\s*[-*]\s+/.test(lines[i])))) { items.push(lines[i].replace(/^\s*(?:\d+\.|[-*])\s+/, '')); i++ }
      blocks.push({ kind: 'list', ordered, items }); continue
    }
    const para = [line]; i++
    while (i < lines.length && lines[i].trim() && !/^(#|\||[-*]\s|\d+\.\s)/.test(lines[i])) { para.push(lines[i]); i++ }
    blocks.push({ kind: 'p', text: para.join(' ') })
  }
  return blocks
}
function inlineMd(text) {
  const parts = []; let i = 0, key = 0
  while (i < text.length) {
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end > -1) { parts.push(<strong key={key++} style={{ color: 'var(--ink)' }}>{text.slice(i + 2, end)}</strong>); i = end + 2; continue }
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > -1) { parts.push(<code key={key++} className="mono" style={{ fontSize: '0.92em', padding: '1px 5px', background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 4, color: 'var(--ink-2)' }}>{text.slice(i + 1, end)}</code>); i = end + 1; continue }
    }
    let j = i + 1
    while (j < text.length && text[j] !== '*' && text[j] !== '`') j++
    parts.push(text.slice(i, j)); i = j
  }
  return parts
}
function renderBlock(b, key) {
  if (b.kind === 'h') {
    const sizes = { 1: 22, 2: 17, 3: 14 }
    const Tag = `h${b.level}`
    return <Tag key={key} style={{ fontSize: sizes[b.level] ?? 14, fontWeight: 600, margin: b.level === 1 ? '0 0 12px' : '20px 0 8px', color: 'var(--ink)', letterSpacing: '-0.005em' }}>{inlineMd(b.text ?? '')}</Tag>
  }
  if (b.kind === 'p') return <p key={key} style={{ margin: '0 0 10px' }}>{inlineMd(b.text ?? '')}</p>
  if (b.kind === 'list') {
    const Tag = b.ordered ? 'ol' : 'ul'
    return <Tag key={key} style={{ margin: '0 0 10px', paddingLeft: 20 }}>{b.items.map((it, i) => <li key={i} style={{ marginBottom: 4 }}>{inlineMd(it)}</li>)}</Tag>
  }
  if (b.kind === 'table') {
    return (
      <div key={key} style={{ margin: '8px 0 14px', overflowX: 'auto' }}>
        <table className="tbl" style={{ width: 'auto', minWidth: '100%' }}>
          <thead><tr>{b.head.map((h, i) => <th key={i}>{inlineMd(h)}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inlineMd(c)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    )
  }
  return null
}
function MarkdownView({ text }) {
  return <div className="md" style={{ color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.6 }}>{parseMarkdown(text).map((b, i) => renderBlock(b, i))}</div>
}

function ReportEmptyState({ icon, tone, title, detail, children }) {
  const color = tone === 'warn' ? 'var(--warn)' : tone === 'crit' ? 'var(--crit)' : 'var(--ink-4)'
  const bg = tone === 'warn' ? 'var(--warn-tint-2)' : tone === 'crit' ? 'var(--crit-tint-2)' : 'var(--surface-2)'
  return (
    <div className="card">
      <div style={{ padding: '48px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: bg, color, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={24} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
          <div className="micro" style={{ marginTop: 4, maxWidth: 420 }}>{detail}</div>
        </div>
        {children && <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>{children}</div>}
      </div>
    </div>
  )
}

function ReportsPage() {
  const factories = [...window.MOCK.FACTORIES].sort((a, b) => a.factory_id.localeCompare(b.factory_id))
  const factoryIds = factories.map((f) => f.factory_id)
  const sidebarFactories = factories.map((f) => ({ factory_id: f.factory_id, risk_level: f.level, risk_score: f.score }))
  const [selectedFactory, setSelectedFactory] = useState('ULSAN-F6')
  const [date, setDate] = useState(TODAY)
  const dateInputRef = useRef(null)
  const activeFactory = selectedFactory || factoryIds[0]
  // Only ULSAN-F6 + today has a sample report; everything else is "not found"
  const hasReport = activeFactory === 'ULSAN-F6'
  const reportContent = hasReport ? window.MOCK.SAMPLE_REPORT : null

  const openDatePicker = () => {
    const el = dateInputRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') { try { el.showPicker(); return } catch (e) {} }
    el.focus(); el.click()
  }

  return (
    <Shell factories={sidebarFactories} crumbs={[{ label: 'Aegis-π' }, { label: '일간 보고서' }]}>
      <div className="page-header">
        <div className="eyebrow page-eyebrow">Risk Twin · Reports</div>
        <h1 className="page-title">일간 보고서</h1>
        <p className="page-desc">공장·날짜를 선택해 Lambda가 생성한 일간 Markdown 보고서를 확인합니다. <span className="mono" style={{ whiteSpace: 'nowrap' }}>FR-DASH-06 · FR-DATA-07/08</span></p>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-bd" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="eyebrow">공장</span>
            <div className="seg">{factoryIds.map((fid) => <button key={fid} aria-pressed={activeFactory === fid} onClick={() => setSelectedFactory(fid)}>{fid}</button>)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="eyebrow">날짜</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <label onClick={openDatePicker} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 10px', border: '1px solid var(--line-3)', borderRadius: 7, background: 'var(--surface)', cursor: 'pointer', position: 'relative' }}>
                <Icon name="calendar" size={13} style={{ color: 'var(--ink-3)' }} />
                <span className="mono tnum" style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>{date}</span>
                <Icon name="chevron-down" size={10} style={{ color: 'var(--ink-4)' }} />
                <input ref={dateInputRef} type="date" value={date} max={TODAY} onChange={(e) => { if (e.target.value) setDate(e.target.value) }} tabIndex={-1} style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none', border: 0, padding: 0, margin: 0, width: '100%', height: '100%' }} />
              </label>
              <span style={{ width: 1, height: 18, background: 'var(--line-3)' }} />
              <div className="seg">{REPORT_DATES.map((d) => <button key={d} aria-pressed={date === d} onClick={() => setDate(d)}>{d.slice(5)}</button>)}</div>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button className="btn" disabled={!hasReport} style={{ opacity: hasReport ? 1 : 0.5 }}><Icon name="download" size={13} />PDF</button>
            <button className="btn" disabled={!hasReport} style={{ opacity: hasReport ? 1 : 0.5 }}><Icon name="file-text" size={13} />Word</button>
            <button className="btn"><Icon name="refresh-cw" size={13} />새로고침</button>
          </div>
        </div>
      </div>
      {reportContent ? (
        <div className="card">
          <div className="card-hd"><div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}><h2 className="h2" style={{ whiteSpace: 'nowrap' }}>{activeFactory} · {date}</h2></div></div>
          <div className="card-bd"><MarkdownView text={reportContent} /></div>
        </div>
      ) : (
        <ReportEmptyState icon="file-text" tone="unk" title="보고서가 없습니다." detail={`${activeFactory} · ${date} 일자 보고서가 아직 생성되지 않았습니다. (데모: ULSAN-F6 선택 시 샘플 보고서 표시)`}>
          <button className="btn primary" onClick={() => setSelectedFactory('ULSAN-F6')}><Icon name="plus" size={13} />샘플 보기</button>
        </ReportEmptyState>
      )}
    </Shell>
  )
}

// ─── Login page (pages/LoginPage.tsx) ───────────────────────────────────
function LoginPage() {
  const { navigate } = useRouter()
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(140deg, #2A6BD8 0%, #143F8E 100%)', border: '1px solid #2557C0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--font-serif)', fontSize: 24 }}>π</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Aegis·π Risk Twin</div>
            <div className="mono micro" style={{ letterSpacing: '.08em' }}>CONTROL CENTER</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Icon name="shield-check" size={18} style={{ color: 'var(--safe)' }} />
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Cognito 인증 후 본사 관제 화면에 접근할 수 있습니다.</p>
        </div>
        <p className="sub" style={{ marginBottom: 22, lineHeight: 1.6 }}>로그인 버튼을 누르면 AWS Cognito 인증 화면으로 이동합니다. 인증 완료 후 자동으로 돌아옵니다.</p>
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }} onClick={() => navigate('/')}>Cognito로 로그인</button>
        <div className="micro" style={{ marginTop: 16, textAlign: 'center', color: 'var(--ink-4)' }}>Aegis-Pi Risk Twin · 본사 관제 전용</div>
      </div>
    </div>
  )
}

Object.assign(window, { ReportsPage, LoginPage })
