// Sidebar navigation chrome.

const SIDEBAR_NAV = [
  { sect: "Operations", items: [
    { key: "fleet",      label: "Fleet overview",  icon: "grid",   badge: null },
    { key: "factories",  label: "Factories",       icon: "factory",badge: null },
    { key: "alerts",     label: "Alerts",          icon: "alert",  badge: "11" },
    { key: "incidents",  label: "Incidents",       icon: "shield", badge: null },
  ]},
  { sect: "Risk Twin", items: [
    { key: "environmental",  label: "Environmental",   icon: "drop",     badge: null },
    { key: "infrastructure", label: "Infrastructure",  icon: "server",   badge: null },
    { key: "operational",    label: "Operational",     icon: "activity", badge: null },
    { key: "timeline",       label: "Event timeline",  icon: "events",   badge: null },
  ]},
  { sect: "Workspace", items: [
    { key: "reports",   label: "Reports",  icon: "report",   badge: null },
    { key: "runbooks",  label: "Runbooks", icon: "doc",      badge: null },
    { key: "models",    label: "Twin models", icon: "layers",badge: null },
  ]},
];

function Sidebar({ active, onNav }) {
  return (
    <aside style={{
      background: "var(--chrome)",
      borderRight: "1px solid var(--chrome-line)",
      color: "var(--chrome-ink)",
      display: "flex", flexDirection: "column",
      position: "sticky", top: 0, height: "100vh",
    }}>
      {/* logo */}
      <div style={{ padding: "16px 16px 14px", display: "flex", alignItems: "center", gap: 9, borderBottom: "1px solid var(--chrome-line)" }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: "var(--chrome-accent)",
          border: "1px solid var(--chrome-accent-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 6h14M9 6v12M16 6v9a3 3 0 0 0 3 3" />
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--chrome-ink)", letterSpacing: "-0.005em" }}>
            Aegis<span style={{ color: "var(--chrome-ink-3)" }}>·</span><span className="serif" style={{ fontSize: 17 }}>π</span>
          </span>
          <span style={{ fontSize: 10, color: "var(--chrome-ink-3)", fontFamily: "Geist Mono, monospace", letterSpacing: ".08em", marginTop: 2 }}>
            RISK TWIN · v4.2
          </span>
        </div>
        <button className="btn ghost btn-icon" style={{
          marginLeft: "auto", height: 24, width: 24,
          color: "var(--chrome-ink-3)", background: "transparent", border: 0,
        }} aria-label="Workspace switcher">
          <Icon name="chevDown" size={12} />
        </button>
      </div>

      {/* env selector */}
      <div style={{ padding: "12px 12px 6px" }}>
        <button style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px", background: "var(--chrome-2)",
          border: "1px solid var(--chrome-line)", borderRadius: 8,
          color: "var(--chrome-ink-2)", fontSize: 12, cursor: "pointer", textAlign: "left",
        }}>
          <Icon name="globe" size={14} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <span style={{ fontSize: 10, color: "var(--chrome-ink-3)", fontFamily: "Geist Mono, monospace", letterSpacing: ".06em" }}>ORG · ENV</span>
            <span style={{ color: "var(--chrome-ink)", fontWeight: 500 }}>Mitsuwa Industrial · prod</span>
          </div>
          <Icon name="chevDown" size={12} />
        </button>
      </div>

      {/* nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "4px 8px 12px" }}>
        {SIDEBAR_NAV.map((group, gi) => (
          <div key={gi}>
            <div className="nav-section">{group.sect}</div>
            {group.items.map((it) => (
              <div key={it.key}
                   className={`nav-item ${active === it.key ? "active" : ""}`}
                   onClick={() => onNav(it.key)}>
                <Icon name={it.icon} size={15} className="nav-icon" />
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.badge && (
                  <span style={{
                    background: it.key === "alerts" ? "var(--crit-tint)" : "var(--chrome-3)",
                    color: it.key === "alerts" ? "var(--crit)" : "var(--chrome-ink-2)",
                    fontSize: 10, fontFamily: "Geist Mono, monospace",
                    padding: "1px 6px", borderRadius: 4, fontWeight: 600,
                  }}>{it.badge}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </nav>

      {/* status footer */}
      <div style={{
        borderTop: "1px solid var(--chrome-line)",
        padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6,
        fontSize: 11,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--chrome-ink-2)" }}>
          <span className="live-dot" />
          <span>Stream healthy</span>
          <span style={{ marginLeft: "auto", color: "var(--chrome-ink-3)", fontFamily: "Geist Mono, monospace" }}>
            42ms
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--chrome-ink-3)", fontSize: 10.5, fontFamily: "Geist Mono, monospace" }}>
          <span>EU-WEST-2</span>
          <span style={{ color: "var(--chrome-line)" }}>·</span>
          <span>build 4.2.118</span>
        </div>
      </div>

      {/* user */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        borderTop: "1px solid var(--chrome-line)",
        background: "var(--chrome-2)",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "var(--chrome-accent)",
          color: "#fff", fontSize: 11.5, fontWeight: 600,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>NK</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "var(--chrome-ink)", fontWeight: 500 }}>Naoko Kitamura</div>
          <div style={{ fontSize: 10.5, color: "var(--chrome-ink-3)" }}>Ops · Tier 1</div>
        </div>
        <button className="btn ghost btn-icon" style={{
          color: "var(--chrome-ink-3)", background: "transparent", border: 0, height: 24, width: 24,
        }} aria-label="Settings">
          <Icon name="settings" size={14} />
        </button>
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
