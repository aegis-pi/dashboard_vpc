// Main app — wires routing, theme, density.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "#10B981",
  "density": "regular"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState({ name: "fleet", id: null });

  // Apply theme + density + accent at the root
  React.useEffect(() => {
    document.documentElement.dataset.theme = t.theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.density = t.density;
    document.documentElement.style.setProperty("--accent", t.accent);
    document.documentElement.style.setProperty(
      "--accent-tint",
      `color-mix(in srgb, ${t.accent} 12%, transparent)`
    );
  }, [t.theme, t.density, t.accent]);

  const goFleet = () => setRoute({ name: "fleet", id: null });
  const goFactory = (id) => setRoute({ name: "factory", id });
  const goAlerts  = () => setRoute({ name: "alerts", id: null });

  const factory = route.name === "factory"
    ? window.FACTORIES.find(f => f.id === route.id) : null;

  const crumbs = route.name === "fleet"
    ? [
        { label: "Mitsuwa Industrial" },
        { label: "Risk Twin" },
        { label: "Fleet overview" },
      ]
    : route.name === "alerts"
    ? [
        { label: "Mitsuwa Industrial" },
        { label: "Risk Twin" },
        { label: "Alerts" },
      ]
    : [
        { label: "Mitsuwa Industrial" },
        { label: "Risk Twin" },
        { label: "Fleet overview", onClick: goFleet },
        { label: factory?.name ?? "Factory" },
      ];

  return (
    <div className="shell">
      <Sidebar
        active={route.name === "alerts" ? "alerts"
              : route.name === "fleet"  ? "fleet"
              : "factories"}
        onNav={(k) => {
          if (k === "fleet" || k === "factories") goFleet();
          else if (k === "alerts") goAlerts();
        }}
      />
      <main className="main">
        <TopBar
          crumbs={crumbs}
          onBack={route.name === "factory" ? goFleet : null}
        />
        <div className="content">
          {route.name === "fleet" && <FleetOverview onOpenFactory={goFactory} onOpenAlerts={goAlerts} />}
          {route.name === "factory" && <FactoryDetail factoryId={route.id} onBack={goFleet} />}
          {route.name === "alerts" && <AlertsPage onOpenFactory={goFactory} />}
        </div>
      </main>

      <TweaksPanel>
        <TweakSection label="Theme">
          <TweakRadio label="Mode" value={t.theme}
                      options={["light", "dark"]}
                      onChange={(v) => setTweak("theme", v)} />
          <TweakColor label="Accent" value={t.accent}
                      options={["#10B981", "#22C55E", "#2563EB", "#7A5AE0"]}
                      onChange={(v) => setTweak("accent", v)} />
        </TweakSection>
        <TweakSection label="Layout">
          <TweakRadio label="Density" value={t.density}
                      options={["compact", "regular", "comfortable"]}
                      onChange={(v) => setTweak("density", v)} />
        </TweakSection>
        <TweakSection label="Navigation">
          <TweakButton label="Open Stuttgart (critical)"
                       onClick={() => goFactory("fac-stuttgart-04")} />
          <TweakButton label="Open Osaka (stable)" secondary
                       onClick={() => goFactory("fac-osaka-01")} />
          <TweakButton label="Alerts page" secondary
                       onClick={goAlerts} />
          <TweakButton label="Back to Fleet" secondary
                       onClick={goFleet} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
