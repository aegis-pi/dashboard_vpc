// Reports page — daily report viewer (FR-DASH-06, FR-DATA-07/08 mock).
// Sidebar-level page, NOT a factory tab.

function ReportsPage({ role }) {
  const [factoryId, setFactoryId] = React.useState(window.FACTORIES[0].factory_id);
  const [date, setDate] = React.useState(window.TODAY);

  // Permission gate at page level: if the user can't access the chosen
  // factory, swap to the first accessible one.
  React.useEffect(() => {
    if (!window.canAccessFactory(role, factoryId)) {
      const fb = window.FACTORIES.find(f => window.canAccessFactory(role, f.factory_id));
      if (fb) setFactoryId(fb.factory_id);
    }
  }, [role, factoryId]);

  const report = window.REPORTS[factoryId]?.[date];

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Risk Twin · Reports</div>
        <h1 className="h1">일간 보고서</h1>
        <p className="sub" style={{ margin: "6px 0 0", maxWidth: 620 }}>
          공장·날짜를 선택해 Lambda가 생성한 일간 Markdown 보고서를 확인합니다.
          <span className="mono"> FR-DASH-06 · FR-DATA-07/08</span>.
        </p>
      </div>

      {/* Selectors */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-bd" style={{
          display: "grid", gridTemplateColumns: "auto 1fr auto auto",
          gap: 16, alignItems: "center",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="eyebrow">공장</span>
            <div className="seg">
              {window.FACTORIES.map(f => {
                const accessible = window.canAccessFactory(role, f.factory_id);
                return (
                  <button key={f.factory_id}
                          aria-pressed={factoryId === f.factory_id}
                          disabled={!accessible}
                          onClick={() => accessible && setFactoryId(f.factory_id)}
                          style={{
                            opacity: accessible ? 1 : 0.4,
                            cursor: accessible ? "pointer" : "not-allowed",
                          }}>
                    {f.factory_id}
                    {!accessible && <Icon name="shield" size={11} style={{ marginLeft: 5 }} />}
                  </button>
                );
              })}
            </div>
          </div>
          <div />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="eyebrow">날짜</span>
            <div className="seg">
              {window.REPORT_DATES.map(d => (
                <button key={d} aria-pressed={date === d} onClick={() => setDate(d)}>
                  {d.slice(5)}
                </button>
              ))}
            </div>
          </div>
          {role === "admin" && (
            <button className="btn" onClick={() => window.showToast?.("재생성 요청 전송", "info")}>
              <Icon name="refresh" size={13} />재생성
            </button>
          )}
        </div>
      </div>

      {/* Report body */}
      <ReportBody report={report} factoryId={factoryId} date={date} role={role} />
    </>
  );
}

function ReportBody({ report, factoryId, date, role }) {
  if (!report || report.status === "none") {
    return (
      <ReportState icon="doc" tone="unk" title="보고서가 없습니다."
                   detail={`${factoryId} · ${date} 일자 보고서가 아직 생성되지 않았습니다.`}>
        {role === "admin" && (
          <button className="btn primary" onClick={() => window.showToast?.("생성 요청 큐 등록", "info")}>
            <Icon name="plus" size={13} />지금 생성
          </button>
        )}
      </ReportState>
    );
  }
  if (report.status === "generating") {
    return (
      <ReportState icon="refresh" tone="warn" title="보고서 생성 중"
                   detail={`Lambda · history aggregator 실행 중. 예상 완료까지 약 20초.`}>
        <span className="mono micro">
          queued_at <span style={{ color: "var(--ink-3)" }}>{window.relTime(report.queued_at)}</span>
        </span>
      </ReportState>
    );
  }
  if (report.status === "failed") {
    return (
      <ReportState icon="alert" tone="crit" title="보고서 생성 실패"
                   detail={report.error ?? "알 수 없는 오류"}>
        <span className="mono micro">
          attempted_at <span style={{ color: "var(--ink-3)" }}>{window.relTime(report.generated_at)}</span>
        </span>
        {role === "admin" && (
          <button className="btn" onClick={() => window.showToast?.("재시도 큐 등록", "info")}>
            <Icon name="refresh" size={13} />재시도
          </button>
        )}
      </ReportState>
    );
  }

  // ready
  return (
    <div className="card">
      <SectionHeader
        title={`${factoryId} · ${date}`}
        hint={`generated ${window.relTime(report.generated_at)}`}
        trailing={role === "admin" && (
          <button className="btn ghost" onClick={() => window.showToast?.("다운로드 시작", "info")}>
            <Icon name="download" size={13} />Markdown
          </button>
        )}
      />
      <div className="card-bd">
        <MarkdownView text={report.markdown} />
      </div>
    </div>
  );
}

function ReportState({ icon, tone, title, detail, children }) {
  const color =
    tone === "safe" ? "var(--safe)" :
    tone === "warn" ? "var(--warn)" :
    tone === "crit" ? "var(--crit)" : "var(--ink-4)";
  const bg =
    tone === "safe" ? "var(--safe-tint-2)" :
    tone === "warn" ? "var(--warn-tint-2)" :
    tone === "crit" ? "var(--crit-tint-2)" : "var(--surface-2)";
  return (
    <div className="card">
      <div style={{
        padding: "48px 32px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: bg, color, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon name={icon} size={24} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{title}</div>
          <div className="micro" style={{ marginTop: 4, maxWidth: 420 }}>{detail}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Tiny markdown renderer (mock-grade, no deps) ──────────────────
function MarkdownView({ text }) {
  const blocks = React.useMemo(() => parseMarkdown(text || ""), [text]);
  return (
    <div className="md" style={{ color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.6 }}>
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  );
}

function parseMarkdown(text) {
  const lines = text.split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    // heading
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ kind: "h", level: h[1].length, text: h[2] }); i++; continue; }
    // table — must start with "|"
    if (line.startsWith("|") && lines[i + 1]?.match(/^\|\s*[:\-]+/)) {
      const head = splitRow(line);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(splitRow(lines[i])); i++;
      }
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    // list
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && (
        (ordered  && /^\s*\d+\.\s+/.test(lines[i])) ||
        (!ordered && /^\s*[-*]\s+/.test(lines[i]))
      )) {
        items.push(lines[i].replace(/^\s*(?:\d+\.|[-*])\s+/, ""));
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    // paragraph (collect until blank or new block)
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#|\||[-*]\s|\d+\.\s)/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    blocks.push({ kind: "p", text: para.join(" ") });
  }
  return blocks;
}

function splitRow(line) {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(s => s.trim());
}

function renderBlock(b, key) {
  if (b.kind === "h") {
    const Tag = `h${b.level}`;
    const sizes = { 1: 22, 2: 17, 3: 14 };
    return (
      <Tag key={key} style={{
        fontSize: sizes[b.level], fontWeight: 600,
        margin: b.level === 1 ? "0 0 12px" : "20px 0 8px",
        color: "var(--ink)", letterSpacing: "-0.005em",
      }}>{inlineMd(b.text)}</Tag>
    );
  }
  if (b.kind === "p") {
    return <p key={key} style={{ margin: "0 0 10px" }}>{inlineMd(b.text)}</p>;
  }
  if (b.kind === "list") {
    const Tag = b.ordered ? "ol" : "ul";
    return (
      <Tag key={key} style={{ margin: "0 0 10px", paddingLeft: 20 }}>
        {b.items.map((it, i) => <li key={i} style={{ marginBottom: 4 }}>{inlineMd(it)}</li>)}
      </Tag>
    );
  }
  if (b.kind === "table") {
    return (
      <div key={key} style={{ margin: "8px 0 14px", overflow: "auto" }}>
        <table className="tbl" style={{ width: "auto", minWidth: "100%" }}>
          <thead><tr>{b.head.map((h, i) => <th key={i}>{inlineMd(h)}</th>)}</tr></thead>
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inlineMd(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

function inlineMd(text) {
  // very small inline parser: **bold**, `code`
  const parts = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    if (text[i] === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > -1) {
        parts.push(<strong key={key++} style={{ color: "var(--ink)" }}>{text.slice(i + 2, end)}</strong>);
        i = end + 2; continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > -1) {
        parts.push(
          <code key={key++} className="mono" style={{
            fontSize: "0.92em", padding: "1px 5px",
            background: "var(--surface-2)", border: "1px solid var(--line-2)",
            borderRadius: 4, color: "var(--ink-2)",
          }}>{text.slice(i + 1, end)}</code>
        );
        i = end + 1; continue;
      }
    }
    // plain
    let j = i + 1;
    while (j < text.length && text[j] !== "*" && text[j] !== "`") j++;
    parts.push(text.slice(i, j));
    i = j;
  }
  return parts;
}

window.ReportsPage = ReportsPage;
