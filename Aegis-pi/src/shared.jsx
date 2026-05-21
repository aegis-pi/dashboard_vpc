// Reusable atoms — restrained to what the data contract actually needs.

// ─── Status badge: 안전 / 주의 / 위험 ──────────────────────────────
function LevelBadge({ level, size = "md" }) {
  const meta = window.LEVEL_META[level] || { label: "미계산", tone: "unk" };
  const pad = size === "sm" ? "3px 6px" : "4px 8px";
  const font = size === "sm" ? 10.5 : 11.5;
  return (
    <span className={`pill ${meta.tone}`} style={{ padding: pad, fontSize: font }}>
      <span className="dot" />
      {meta.label}
    </span>
  );
}

// ─── Pipeline badge: 정상 / 주의 / 심각 ────────────────────────────
function PipelineBadge({ status }) {
  const meta = window.PIPELINE_META[status] || { label: "미수신", tone: "unk" };
  return (
    <span className={`pill ${meta.tone}`} style={{ padding: "3px 6px", fontSize: 10.5 }}>
      <span className="dot" />
      pipeline · {meta.label}
    </span>
  );
}

// ─── Staleness badge: 데이터 지연 / 미수신 ─────────────────────────
// Rule: factory_state age > 10s OR infra_state age > 40s → stale.
function StalenessBadge({ factory }) {
  const fAge = window.ageSeconds(factory.last_factory_state_at);
  const iAge = window.ageSeconds(factory.last_infra_state_at);
  if (fAge <= 10 && iAge <= 40) return null;
  const crit = iAge > 60;
  return (
    <span className={`pill ${crit ? "crit" : "warn"}`}
          style={{ padding: "3px 6px", fontSize: 10.5 }}>
      <span className="dot" />
      데이터 지연
      <span className="mono tnum" style={{ marginLeft: 4, fontSize: 10 }}>
        infra {iAge}s
      </span>
    </span>
  );
}

// ─── Device chip: shows available + last_seen_at ──────────────────
// device: { available, last_seen_at } | null/undefined
// naWhenEnv: vm-mac/vm-windows 환경에서 false는 "해당 없음"으로 표시
function DeviceChip({ label, device, naWhenEnv = false }) {
  const available = device?.available;
  const lastSeen  = device?.last_seen_at;

  let tone, text;
  if (device == null || available == null) {
    tone = "unk"; text = "미수신";
  } else if (available) {
    tone = "safe"; text = "정상";
  } else if (naWhenEnv) {
    tone = "unk"; text = "해당 없음";
  } else {
    tone = "warn"; text = "확인 필요";
  }
  const dotColor =
    tone === "safe" ? "var(--safe)" :
    tone === "warn" ? "var(--warn)" : "var(--unk)";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px",
      border: "1px solid var(--line)", borderRadius: 8,
      background: "var(--surface)",
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: dotColor, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>{label}</span>
          <span className="micro">{text}</span>
        </div>
        <div className="micro mono" style={{ marginTop: 2 }}>
          {lastSeen
            ? <>last_seen <span style={{ color: "var(--ink-2)" }}>{window.relTime(lastSeen)}</span></>
            : <span style={{ color: "var(--ink-4)" }}>last_seen_at: null</span>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Section header ────────────────────────────────────────────────
function SectionHeader({ title, hint, trailing }) {
  return (
    <div className="card-hd">
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <h2 className="h2">{title}</h2>
        {hint && <span className="micro">{hint}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{trailing}</div>
    </div>
  );
}

// ─── KPI tile (fleet header) ───────────────────────────────────────
function KPITile({ label, value, tone = "ink", sub }) {
  const color =
    tone === "crit" ? "var(--crit)" :
    tone === "warn" ? "var(--warn)" :
    tone === "safe" ? "var(--safe)" :
    tone === "unk"  ? "var(--ink-3)" :
                      "var(--ink)";
  return (
    <div className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="eyebrow">{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="kpi-num" style={{ color, fontSize: 30 }}>{value}</span>
        {sub && <span className="micro">{sub}</span>}
      </div>
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────
function EmptyNote({ text = "선택한 시간 범위에 데이터가 없습니다." }) {
  return (
    <div style={{
      padding: "28px 16px", textAlign: "center",
      color: "var(--ink-4)", fontSize: 12.5,
    }}>{text}</div>
  );
}

// ─── Value-or-미수신 helper ────────────────────────────────────────
function showVal(v, suffix = "") {
  if (v == null) return <span style={{ color: "var(--ink-4)" }}>미수신</span>;
  return <>{v}{suffix}</>;
}

Object.assign(window, {
  LevelBadge, PipelineBadge, StalenessBadge, DeviceChip,
  SectionHeader, KPITile, EmptyNote, showVal,
});
