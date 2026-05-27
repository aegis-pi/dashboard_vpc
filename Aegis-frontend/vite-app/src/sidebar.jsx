import React from "react";
import { FACTORIES, LEVEL_META, canAccessFactory } from "./data.jsx";
import { Icon } from "./icons.jsx";

// Sidebar — logo + Fleet/Factories/Reports nav + lock icons for restricted.

function Sidebar({ route, role, onGoFleet, onGoFactory, onGoReports }) {
  const isFleet   = route.name === "fleet";
  const isReports = route.name === "reports";

  return (
    <aside style={{
      background: "var(--chrome)",
      borderRight: "1px solid var(--chrome-line)",
      color: "var(--chrome-ink)",
      display: "flex", flexDirection: "column",
      position: "sticky", top: 0, height: "100vh",
    }}>
      {/* Logo */}
      <div style={{
        padding: "16px 16px 14px",
        display: "flex", alignItems: "center", gap: 9,
        borderBottom: "1px solid var(--chrome-line)",
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: "var(--chrome-accent)",
          border: "1px solid var(--chrome-accent-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
          flexShrink: 0,
        }}>
          <span className="serif" style={{ fontSize: 18, lineHeight: 1 }}>π</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{
            fontWeight: 600, fontSize: 13.5,
            color: "var(--chrome-ink)", letterSpacing: "-0.005em",
          }}>
            Aegis<span style={{ color: "var(--chrome-ink-3)" }}>·</span>
            <span className="serif" style={{ fontSize: 17 }}>π</span>
          </span>
          <span className="mono" style={{
            fontSize: 10, color: "var(--chrome-ink-3)",
            letterSpacing: ".08em", marginTop: 2,
          }}>
            RISK TWIN
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
        <div className="nav-section">Fleet</div>
        <div className={`nav-item ${isFleet ? "active" : ""}`} onClick={onGoFleet}>
          <Icon name="grid" size={15} className="nav-icon" />
          <span style={{ flex: 1 }}>전체 개요</span>
          <span className="mono tnum" style={{ fontSize: 10.5, color: "var(--chrome-ink-3)" }}>
            {FACTORIES.length}
          </span>
        </div>

        <div className="nav-section">Factories</div>
        {FACTORIES.map(f => {
          const isActive = route.name === "factory" && route.id === f.factory_id;
          const tone = LEVEL_META[f.risk.level].tone;
          const accessible = canAccessFactory(role, f.factory_id);
          return (
            <div key={f.factory_id}
                 className={`nav-item ${isActive ? "active" : ""}`}
                 onClick={() => onGoFactory(f.factory_id)}
                 title={accessible ? null : "admin 권한 필요"}
                 style={{ opacity: accessible ? 1 : 0.65 }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                background: tone === "safe" ? "var(--safe)"
                          : tone === "warn" ? "var(--warn)" : "var(--crit)",
              }} />
              <span style={{ flex: 1 }}>{f.factory_id}</span>
              {!accessible && (
                <Icon name="shield" size={12} style={{ color: "var(--chrome-ink-3)" }} />
              )}
              <span className="mono tnum" style={{
                fontSize: 10.5, color: "var(--chrome-ink-3)",
              }}>{f.risk.score}</span>
            </div>
          );
        })}

        <div className="nav-section">Workspace</div>
        <div className={`nav-item ${isReports ? "active" : ""}`} onClick={onGoReports}>
          <Icon name="report" size={15} className="nav-icon" />
          <span style={{ flex: 1 }}>일간 보고서</span>
        </div>
      </nav>

      {/* Role footer */}
      {role && role !== "guest" && (
        <div style={{
          borderTop: "1px solid var(--chrome-line)",
          padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 11.5, color: "var(--chrome-ink-3)",
        }}>
          <span className="mono" style={{
            fontSize: 9.5, letterSpacing: ".08em", fontWeight: 600,
            color: role === "admin" ? "#fff" : "var(--chrome-ink-2)",
            padding: "2px 6px",
            background: role === "admin" ? "var(--chrome-accent)" : "var(--chrome-3)",
            border: `1px solid ${role === "admin" ? "var(--chrome-accent-border)" : "var(--chrome-line)"}`,
            borderRadius: 4,
          }}>{role.toUpperCase()}</span>
          <span style={{ flex: 1 }}>{role === "admin" ? "모든 권한" : "조회 전용"}</span>
        </div>
      )}
    </aside>
  );
}

export { Sidebar };
