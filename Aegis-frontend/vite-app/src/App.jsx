// Main app — routing (fleet · factory · reports), auth gates, connection state.

import React from "react";
import { NOW, FACTORIES, canAccessFactory } from "./data.jsx";
import { LoginGate, NoAccessGate } from "./auth.jsx";
import { Sidebar } from "./sidebar.jsx";
import { TopBar } from "./topbar.jsx";
import { FleetOverview } from "./fleet.jsx";
import { FactoryDetail } from "./factory.jsx";
import { ReportsPage } from "./reports.jsx";
import {
  useTweaks, TweaksPanel, TweakSection,
  TweakRadio, TweakColor, TweakButton, TweakSelect,
} from "./tweaks-panel.jsx";

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "#2563EB",
  "density": "regular",
  "role": "viewer",
  "conn": "connected",
  "pulseDemo": "off"
}/*EDITMODE-END*/;

const CONN_CYCLE = ["connected", "reconnecting", "fallback", "offline"];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState({ name: "fleet", id: null });
  const [lastPushAt, setLastPushAt] = React.useState(NOW - 3_000);
  const [toasts, setToasts] = React.useState([]);

  // Toast helper — exposed on window so any module can call window.showToast(...)
  React.useEffect(() => {
    window.showToast = (text, kind = "info") => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, text, kind }]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 2800);
    };
  }, []);

  // Theme / density / accent
  React.useEffect(() => {
    document.documentElement.dataset.theme = t.theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.density = t.density;
    document.documentElement.style.setProperty("--accent", t.accent);
    document.documentElement.style.setProperty(
      "--accent-tint",
      `color-mix(in srgb, ${t.accent} 14%, transparent)`
    );
  }, [t.theme, t.density, t.accent]);

  // Simulate push tick when "connected"
  React.useEffect(() => {
    if (t.conn !== "connected") return;
    const id = setInterval(() => setLastPushAt(Date.now()), 3_000);
    return () => clearInterval(id);
  }, [t.conn]);

  const goFleet   = () => setRoute({ name: "fleet",   id: null });
  const goFactory = (id) => setRoute({ name: "factory", id });
  const goReports = () => setRoute({ name: "reports", id: null });

  const cycleConn = () => {
    const i = CONN_CYCLE.indexOf(t.conn);
    setTweak("conn", CONN_CYCLE[(i + 1) % CONN_CYCLE.length]);
  };

  const refresh = () => {
    setLastPushAt(Date.now());
    window.showToast?.("최신 데이터 수신", "info");
  };

  const logout = () => setTweak("role", "guest");

  // ─── Gate: not logged in ───────────────────────────────────
  if (t.role === "guest") {
    return <LoginGate onLogin={(r) => setTweak("role", r)} />;
  }

  const factory = route.name === "factory"
    ? FACTORIES.find(f => f.factory_id === route.id)
    : null;
  const hasAccess = route.name !== "factory"
    || (factory && canAccessFactory(t.role, factory.factory_id));

  const crumbs = route.name === "factory"
    ? [
        { label: "Aegis-π" },
        { label: "Fleet", onClick: goFleet },
        { label: factory?.factory_id ?? "Factory" },
      ]
    : route.name === "reports"
    ? [
        { label: "Aegis-π" },
        { label: "일간 보고서" },
      ]
    : [
        { label: "Aegis-π" },
        { label: "Fleet overview" },
      ];

  return (
    <div className="shell">
      <Sidebar
        route={route}
        role={t.role}
        onGoFleet={goFleet}
        onGoFactory={goFactory}
        onGoReports={goReports}
      />
      <main className="main">
        <TopBar
          crumbs={crumbs}
          onBack={route.name !== "fleet" ? goFleet : null}
          conn={t.conn}
          lastPushAt={lastPushAt}
          onRefresh={refresh}
          role={t.role}
          onLogout={logout}
          onCycleConn={cycleConn}
        />
        <div className="content">
          {route.name === "fleet" && (
            <FleetOverview onOpenFactory={goFactory} pulseDemo={t.pulseDemo} />
          )}
          {route.name === "factory" && !hasAccess && (
            <NoAccessGate factoryId={route.id} role={t.role} onBack={goFleet} />
          )}
          {route.name === "factory" && hasAccess && factory && (
            <FactoryDetail factoryId={route.id} onBack={goFleet} role={t.role} />
          )}
          {route.name === "reports" && (
            <ReportsPage role={t.role} />
          )}
        </div>
      </main>

      <TweaksPanel>
        <TweakSection label="Theme">
          <TweakRadio label="Mode" value={t.theme}
                      options={["light", "dark"]}
                      onChange={(v) => setTweak("theme", v)} />
          <TweakColor label="Accent" value={t.accent}
                      options={["#2563EB", "#4F46E5", "#0EA5E9", "#7A5AE0"]}
                      onChange={(v) => setTweak("accent", v)} />
        </TweakSection>
        <TweakSection label="Layout">
          <TweakRadio label="Density" value={t.density}
                      options={["compact", "regular", "comfortable"]}
                      onChange={(v) => setTweak("density", v)} />
        </TweakSection>
        <TweakSection label="Auth (mock)">
          <TweakRadio label="역할" value={t.role}
                      options={["viewer", "admin"]}
                      onChange={(v) => setTweak("role", v)} />
          <TweakButton label="로그아웃 (guest로)" secondary onClick={logout} />
        </TweakSection>
        <TweakSection label="실시간 연결 (mock)">
          <TweakSelect label="WebSocket" value={t.conn}
                       options={CONN_CYCLE}
                       onChange={(v) => setTweak("conn", v)} />
        </TweakSection>
        <TweakSection label="Pulse 시뮬레이션 (동률 확인용)">
          <TweakSelect label="점수 동률" value={t.pulseDemo}
                       options={["off", "tie2", "tie3"]}
                       onChange={(v) => setTweak("pulseDemo", v)} />
          <TweakButton label="off 로 되돌리기" secondary
                       onClick={() => setTweak("pulseDemo", "off")} />
        </TweakSection>
        <TweakSection label="Jump to">
          <TweakButton label="Fleet overview" secondary onClick={goFleet} />
          <TweakButton label="factory-a (warning)"
                       onClick={() => goFactory("factory-a")} secondary />
          <TweakButton label="factory-b (warning)"
                       onClick={() => goFactory("factory-b")} secondary />
          <TweakButton label="factory-c (admin only)"
                       onClick={() => goFactory("factory-c")} />
          <TweakButton label="일간 보고서" secondary onClick={goReports} />
        </TweakSection>
      </TweaksPanel>

      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="dot" />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
