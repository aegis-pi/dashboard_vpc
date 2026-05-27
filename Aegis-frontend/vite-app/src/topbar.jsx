import React from "react";
import { RoleBadge } from "./auth.jsx";
import { relTime } from "./data.jsx";
import { Icon } from "./icons.jsx";

// Top bar — breadcrumb + connection status + last push + refresh + clock.

const CONN_META = {
  connected:    { label: "WebSocket connected",    tone: "safe", short: "LIVE"   },
  reconnecting: { label: "WebSocket reconnecting", tone: "warn", short: "RECONNECT" },
  fallback:     { label: "Polling fallback",       tone: "warn", short: "POLLING" },
  offline:      { label: "연결 끊김",               tone: "crit", short: "OFFLINE" },
};

function TopBar({ crumbs = [], onBack, conn = "connected", lastPushAt,
                  onRefresh, role, onLogout, onCycleConn }) {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  const meta = CONN_META[conn] || CONN_META.connected;
  const dotColor =
    meta.tone === "safe" ? "var(--safe)" :
    meta.tone === "warn" ? "var(--warn)" : "var(--crit)";
  const isLive = conn === "connected";

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 10,
      background: "color-mix(in srgb, var(--bg) 88%, transparent)",
      backdropFilter: "blur(8px) saturate(140%)",
      WebkitBackdropFilter: "blur(8px) saturate(140%)",
      borderBottom: "1px solid var(--line)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 24px",
      }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {onBack && (
            <button className="btn ghost btn-icon" onClick={onBack} aria-label="Back">
              <Icon name="chevLeft" size={15} />
            </button>
          )}
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Icon name="chevRight" size={12} style={{ color: "var(--ink-5)" }} />}
              <span style={{
                fontSize: 12.5,
                color: i === crumbs.length - 1 ? "var(--ink)" : "var(--ink-3)",
                fontWeight: i === crumbs.length - 1 ? 500 : 400,
                cursor: c.onClick ? "pointer" : "default",
                whiteSpace: "nowrap",
              }} onClick={c.onClick}>{c.label}</span>
            </React.Fragment>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 12 }} />

        {/* Connection pill */}
        <button onClick={onCycleConn} title="Click to cycle connection state (mock)"
                className="btn ghost"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "0 8px", height: 28, borderRadius: 7,
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  fontSize: 11, color: "var(--ink-2)",
                }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", background: dotColor,
            animation: isLive ? "liveBlink 1.6s ease-in-out infinite" : "none",
          }} />
          <span className="mono" style={{ fontSize: 10, letterSpacing: ".08em", fontWeight: 600 }}>
            {meta.short}
          </span>
          {lastPushAt && (
            <>
              <span style={{ color: "var(--ink-5)" }}>·</span>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                {relTime(lastPushAt)}
              </span>
            </>
          )}
        </button>

        {/* Refresh */}
        <button className="btn ghost btn-icon" onClick={onRefresh}
                title="수동 새로고침" aria-label="Refresh">
          <Icon name="refresh" size={14} />
        </button>

        {/* Live clock */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          fontSize: 11.5, color: "var(--ink-3)",
          whiteSpace: "nowrap", flexShrink: 0,
          borderLeft: "1px solid var(--line)",
          marginLeft: 4, paddingLeft: 12,
        }}>
          <span className="mono tnum">{hh}:{mm}:{ss}</span>
        </div>

        {/* Role badge */}
        {role && role !== "guest" && (
          <RoleBadge role={role} onLogout={onLogout} />
        )}
      </div>

      {/* Stale banner when not connected */}
      {!isLive && (
        <div style={{
          padding: "7px 24px",
          background: meta.tone === "crit" ? "var(--crit-tint-2)" : "var(--warn-tint-2)",
          borderTop: `1px solid color-mix(in srgb, ${dotColor} 25%, transparent)`,
          display: "flex", alignItems: "center", gap: 10,
          fontSize: 12, color: "var(--ink-2)",
        }}>
          <Icon name="alert" size={13} style={{ color: dotColor }} />
          <span style={{ fontWeight: 500 }}>{meta.label}</span>
          <span style={{ color: "var(--ink-3)" }}>—</span>
          <span style={{ color: "var(--ink-3)" }}>
            화면의 데이터는 직전 push 기준입니다. 표시값이 최신이 아닐 수 있습니다.
          </span>
          {lastPushAt && (
            <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>
              last push {relTime(lastPushAt)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export { TopBar };
