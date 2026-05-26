// Reports page — daily report viewer (FR-DASH-06, FR-DATA-07/08 mock).
// Sidebar-level page, NOT a factory tab.

function ReportsPage({ role }) {
  const [factoryId, setFactoryId] = React.useState(window.FACTORIES[0].factory_id);
  const [date, setDate] = React.useState(window.TODAY);
  const dateInputRef = React.useRef(null);

  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try { el.showPicker(); return; } catch (_) { /* fall through */ }
    }
    el.focus();
    el.click();
  };

  // Permission gate at page level: if the user can't access the chosen
  // factory, swap to the first accessible one.
  React.useEffect(() => {
    if (!window.canAccessFactory(role, factoryId)) {
      const fb = window.FACTORIES.find(f => window.canAccessFactory(role, f.factory_id));
      if (fb) setFactoryId(fb.factory_id);
    }
  }, [role, factoryId]);

  const report = window.REPORTS[factoryId]?.[date];
  const canExport = report?.status === "ready" && !!report.markdown;

  const doExport = (kind) => {
    if (!canExport) {
      window.showToast?.("ready 상태의 보고서만 내보낼 수 있습니다.", "warn");
      return;
    }
    if (kind === "pdf")  openPrintWindow(factoryId, date, report.markdown);
    if (kind === "word") downloadAsWord(factoryId, date, report.markdown);
  };

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Risk Twin · Reports</div>
        <h1 className="h1">일간 보고서</h1>
        <p className="sub" style={{ margin: "6px 0 0", maxWidth: 620 }}>
          공장·날짜를 선택해 Lambda가 생성한 일간 Markdown 보고서를 확인합니다.
          <span className="mono" style={{ whiteSpace: "nowrap" }}> FR-DASH-06 · FR-DATA-07/08</span>.
        </p>
      </div>

      {/* Selectors */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-bd" style={{
          display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-end",
        }}>
          {/* Factory */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
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
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span className="eyebrow">날짜</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {/* Calendar picker */}
              <label onClick={openDatePicker}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                height: 28, padding: "0 10px",
                border: "1px solid var(--line-3)", borderRadius: 7,
                background: "var(--surface)", cursor: "pointer",
                position: "relative",
                transition: "border-color .12s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ink-4)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--line-3)"; }}>
                <Icon name="events" size={13} style={{ color: "var(--ink-3)" }} />
                <span className="mono tnum" style={{
                  fontSize: 12, color: "var(--ink)", fontWeight: 500,
                }}>{date}</span>
                <Icon name="chevDown" size={10} style={{ color: "var(--ink-4)" }} />
                <input ref={dateInputRef}
                       type="date" value={date} max={window.TODAY}
                       onChange={e => e.target.value && setDate(e.target.value)}
                       tabIndex={-1}
                       style={{
                         position: "absolute", inset: 0,
                         opacity: 0, pointerEvents: "none",
                         border: 0, padding: 0, margin: 0,
                         width: "100%", height: "100%",
                       }} />
              </label>
              <span style={{ width: 1, height: 18, background: "var(--line-3)" }} />
              <div className="seg">
                {window.REPORT_DATES.map(d => (
                  <button key={d} aria-pressed={date === d} onClick={() => setDate(d)}>
                    {d.slice(5)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "flex-end" }}>
            <button className="btn"
                    onClick={() => doExport("pdf")}
                    disabled={!canExport}
                    title={canExport ? "PDF로 내보내기 (인쇄 대화상자)" : "ready 상태의 보고서가 없습니다"}
                    style={{
                      opacity: canExport ? 1 : 0.5,
                      cursor: canExport ? "pointer" : "not-allowed",
                    }}>
              <Icon name="download" size={13} />PDF
            </button>
            <button className="btn"
                    onClick={() => doExport("word")}
                    disabled={!canExport}
                    title={canExport ? "Word(.doc) 다운로드" : "ready 상태의 보고서가 없습니다"}
                    style={{
                      opacity: canExport ? 1 : 0.5,
                      cursor: canExport ? "pointer" : "not-allowed",
                    }}>
              <Icon name="doc" size={13} />Word
            </button>
            {role === "admin" && (
              <button className="btn" onClick={() => window.showToast?.("재생성 요청 전송", "info")}>
                <Icon name="refresh" size={13} />재생성
              </button>
            )}
          </div>
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
      />
      <div className="card-bd">
        <MarkdownView text={report.markdown} />
      </div>
    </div>
  );
}

// ─── Export helpers (PDF · Word) ────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function inlineMdHtml(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/`(.+?)`/g, "<code>$1</code>");
  return s;
}

function markdownToHtml(text) {
  const blocks = parseMarkdown(text || "");
  return blocks.map(b => {
    if (b.kind === "h") {
      return `<h${b.level}>${inlineMdHtml(b.text)}</h${b.level}>`;
    }
    if (b.kind === "p") return `<p>${inlineMdHtml(b.text)}</p>`;
    if (b.kind === "list") {
      const Tag = b.ordered ? "ol" : "ul";
      return `<${Tag}>${b.items.map(it => `<li>${inlineMdHtml(it)}</li>`).join("")}</${Tag}>`;
    }
    if (b.kind === "table") {
      return `<table><thead><tr>${b.head.map(h => `<th>${inlineMdHtml(h)}</th>`).join("")}</tr></thead>`
           + `<tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${inlineMdHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    return "";
  }).join("\n");
}

// Open a print-ready window so the user can Save as PDF via the system dialog.
function openPrintWindow(factoryId, date, markdown) {
  const bodyHtml = markdownToHtml(markdown);
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) {
    window.showToast?.("팝업 차단됨. 팝업을 허용해주세요.", "warn");
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${factoryId} · ${date}</title>
  <style>
    @page { margin: 18mm 16mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
           color: #14181F; max-width: 760px; margin: 0 auto; padding: 28px;
           line-height: 1.55; font-size: 11pt; }
    .meta { font-size: 9pt; color: #56606E; letter-spacing: .08em;
            text-transform: uppercase; margin-bottom: 18pt;
            padding-bottom: 10pt; border-bottom: 1px solid #E4E6EB; }
    h1 { font-size: 22pt; margin: 0 0 12pt; letter-spacing: -0.005em; }
    h2 { font-size: 14pt; margin: 18pt 0 8pt; }
    h3 { font-size: 12pt; margin: 14pt 0 6pt; }
    p  { margin: 0 0 10pt; }
    table { border-collapse: collapse; margin: 8pt 0; width: 100%; }
    td, th { border: 1px solid #D9DCE2; padding: 6pt 10pt; font-size: 10pt; text-align: left; }
    th { background: #F4F5F7; font-weight: 600; }
    code { font-family: "SF Mono", Consolas, monospace; background: #F4F5F7; padding: 1pt 5pt;
           border-radius: 3pt; font-size: 0.92em; }
    ul, ol { padding-left: 20pt; margin: 0 0 10pt; }
    li { margin-bottom: 3pt; }
    strong { color: #14181F; }
  </style>
</head>
<body>
  <div class="meta">Aegis-π Risk Twin · ${factoryId} · ${date} 일간 보고서</div>
  ${bodyHtml}
  <script>window.onload = () => { setTimeout(() => window.print(), 250); };</script>
</body>
</html>`);
  w.document.close();
  window.showToast?.(`PDF 인쇄 대화상자 열기`, "info");
}

// Build an HTML document with msword MIME so it opens directly in Word.
function downloadAsWord(factoryId, date, markdown) {
  const bodyHtml = markdownToHtml(markdown);
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${factoryId} ${date}</title>
  <style>
    body { font-family: Calibri, sans-serif; font-size: 11pt; color: #14181F; }
    h1 { font-size: 22pt; margin-bottom: 12pt; }
    h2 { font-size: 16pt; margin: 18pt 0 8pt; }
    h3 { font-size: 13pt; margin: 14pt 0 6pt; }
    table { border-collapse: collapse; margin: 8pt 0; }
    td, th { border: 1px solid #ccc; padding: 6pt 10pt; font-size: 10pt; }
    th { background: #f5f5f5; }
    code { font-family: Consolas, monospace; background: #f5f5f5; padding: 1pt 4pt; }
    li { margin-bottom: 4pt; }
  </style>
</head>
<body>
  <p style="font-size:9pt;color:#56606E;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid #ccc;padding-bottom:8pt;margin-bottom:16pt">
    Aegis-π Risk Twin · ${factoryId} · ${date} 일간 보고서
  </p>
  ${bodyHtml}
</body>
</html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${factoryId}_${date}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  window.showToast?.(`${factoryId}_${date}.doc 다운로드 시작`, "info");
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
