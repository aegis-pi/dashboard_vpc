// Top navigation bar — breadcrumb, search, region/time selectors, profile.

function TopBar({ crumbs = [], onBack, primary }) {
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
        padding: "11px 24px",
      }}>
        {/* breadcrumb */}
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
                fontSize: 12.5, color: i === crumbs.length - 1 ? "var(--ink)" : "var(--ink-3)",
                fontWeight: i === crumbs.length - 1 ? 500 : 400,
                cursor: c.onClick ? "pointer" : "default"
              }} onClick={c.onClick}>{c.label}</span>
            </React.Fragment>
          ))}
        </div>

        {/* search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          marginLeft: 18, padding: "0 10px",
          height: 30, width: 320, flexShrink: 0,
          background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: 7, color: "var(--ink-4)",
        }}>
          <Icon name="search" size={14} />
          <span style={{ fontSize: 12.5, color: "var(--ink-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>Search factories, alerts, runbooks…</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 3, flexShrink: 0 }}>
            <kbd className="mono" style={{
              fontSize: 10, padding: "1px 5px",
              border: "1px solid var(--line-3)", borderRadius: 3, color: "var(--ink-4)"
            }}>⌘</kbd>
            <kbd className="mono" style={{
              fontSize: 10, padding: "1px 5px",
              border: "1px solid var(--line-3)", borderRadius: 3, color: "var(--ink-4)"
            }}>K</kbd>
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 12 }} />

        {/* live clock */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--ink-3)", whiteSpace: "nowrap", flexShrink: 0 }}>
          <span className="live-dot" />
          <span className="mono tnum">14:08:42 UTC</span>
        </div>

        {/* time range */}
        <div className="seg">
          <button aria-pressed="false">1H</button>
          <button aria-pressed="false">6H</button>
          <button aria-pressed="true">24H</button>
          <button aria-pressed="false">7D</button>
          <button aria-pressed="false">30D</button>
        </div>

        <button className="btn">
          <Icon name="download" size={14} />
          Export
        </button>

        <button className="btn ghost btn-icon" aria-label="Notifications" style={{ position: "relative" }}>
          <Icon name="bell" size={15} />
          <span style={{
            position: "absolute", top: 4, right: 4,
            width: 6, height: 6, borderRadius: "50%", background: "var(--crit)",
            boxShadow: "0 0 0 2px var(--bg)",
          }} />
        </button>

        {primary}
      </div>
    </div>
  );
}

window.TopBar = TopBar;
