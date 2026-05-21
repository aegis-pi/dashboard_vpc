// Fleet Overview — refined design (A: pulse track, B: serif numbers, C: cards).
// Data sources unchanged: FACTORIES[] (LATEST docs) + FLEET_RECENT + buildHistory.

const SERIF_FONT = '"Instrument Serif", ui-serif, Georgia, serif';

function FleetOverview({ onOpenFactory, pulseDemo = "off" }) {
  return (
    <>
      {/* ─── Page header — editorial serif h1 ──────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Risk Twin · Fleet</div>
        <h1 style={{
          font: `400 36px/1.05 ${SERIF_FONT}`,
          letterSpacing: "-0.01em",
          color: "var(--ink)",
          margin: 0,
        }}>전체 개요</h1>
        <p className="sub" style={{ margin: "8px 0 0", maxWidth: 620 }}>
          공장 3개의 LATEST 문서 — risk·pipeline·infra 요약.
          <span className="mono"> factory_state</span> 3초, <span className="mono">infra_state</span> 20초 주기로 갱신.
        </p>
      </div>

      {/* ─── A: Fleet Safety Pulse ────────────────────────────── */}
      <FleetPulse demoMode={pulseDemo} />

      {/* ─── Factory cards (3) ────────────────────────────────── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          marginBottom: 12,
        }}>
          <h2 className="h2">Factories</h2>
          <span className="micro">안전 점수 오름차순 · 위험한 것 먼저</span>
        </div>
        <div className="grid row3">
          {[...window.FACTORIES]
            .sort((a, b) => a.risk.score - b.risk.score)
            .map(f => <FactoryCard key={f.factory_id} f={f} onOpen={onOpenFactory} />)
          }
        </div>
      </div>

      {/* ─── Recent risk_level changes ────────────────────────── */}
      <div className="card">
        <SectionHeader
          title="최근 상태 변화"
          hint={`HISTORY#RISK · risk_level 변화 ${window.FLEET_RECENT.length}건`}
        />
        <div>
          {window.FLEET_RECENT.length === 0
            ? <EmptyNote text="최근 24시간 내 변화가 없습니다." />
            : window.FLEET_RECENT.map((e, i) => (
                <RecentRow key={i} e={e} onOpen={onOpenFactory} />
              ))
          }
        </div>
      </div>
    </>
  );
}

// ─── A · Fleet Safety Pulse ──────────────────────────────────────
// One horizontal 0–100 axis. Bands shaded by status. Dots at each
// factory's score with serif labels. Replaces dry KPI strip.

function FleetPulse({ demoMode = "off" }) {
  const counts = window.fleetCounts();
  const factories = applyPulseDemo(window.FACTORIES, demoMode);

  // The three bands: 0–49 위험, 50–84 주의, 85–100 안전
  const bands = [
    { from: 0,  to: 49,  color: "var(--crit)", label: "위험" },
    { from: 50, to: 84,  color: "var(--warn)", label: "주의" },
    { from: 85, to: 100, color: "var(--safe)", label: "안전" },
  ];

  // Sort factories by score for layout — leftmost is most dangerous.
  const sorted = [...factories].sort((a, b) => a.risk.score - b.risk.score);

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      {/* Header row: title + compact stats */}
      <div style={{
        padding: "16px 22px 6px",
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 16, flexWrap: "wrap",
      }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Fleet Safety Pulse</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
            오른쪽에 가까울수록 안전. 점은 각 공장의 현재 안전 점수.
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "baseline" }}>
          <PulseStat label="공장"        value={counts.total}   tone="ink" />
          <PulseStat label="위험"        value={counts.danger}  tone={counts.danger > 0 ? "crit" : "ink-mute"} />
          <PulseStat label="주의"        value={counts.warning} tone={counts.warning > 0 ? "warn" : "ink-mute"} />
          <PulseStat label="안전"        value={counts.safe}    tone={counts.safe > 0 ? "safe" : "ink-mute"} />
          <PulseStat label="데이터 지연" value={counts.stale}   tone={counts.stale > 0 ? "warn" : "ink-mute"} />
        </div>
      </div>

      {/* The pulse track */}
      <div style={{ padding: "16px 22px 22px" }}>
        <div style={{ position: "relative", padding: "8px 6px 0" }}>
          {/* Track w/ band tints */}
          <div style={{
            position: "relative", height: 44, borderRadius: 10,
            border: "1px solid var(--line-2)", overflow: "hidden",
            background: "var(--surface-2)",
          }}>
            {bands.map((b, i) => (
              <div key={i} style={{
                position: "absolute",
                left: `${b.from}%`,
                width: `${b.to - b.from + 1}%`,
                top: 0, bottom: 0,
                background: `color-mix(in srgb, ${b.color} 7%, transparent)`,
              }} />
            ))}
            {/* Band labels */}
            <div style={{ position: "absolute", inset: 0, display: "flex" }}>
              <BandLabel from={0}  to={49}  color="var(--crit)" label="위험" />
              <BandLabel from={50} to={84}  color="var(--warn)" label="주의" />
              <BandLabel from={85} to={100} color="var(--safe)" label="안전" />
            </div>
            {/* Threshold gridlines */}
            <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--line-3)" }} />
            <div style={{ position: "absolute", left: "85%", top: 0, bottom: 0, width: 1, background: "var(--line-3)" }} />
          </div>

          {/* Anti-collision label area — dots at top edge, labels at bottom,
              connected by leader lines via SVG. Labels shift only when their
              dots would collide; otherwise sit directly under each dot. */}
          {(() => {
            const dotXs = sorted.map(f => Math.max(2, Math.min(98, f.risk.score)));
            // Vertical stack index for tied dots so identical scores remain visible
            const dotStack = sorted.map((_, i) => {
              let s = 0;
              for (let j = 0; j < i; j++) {
                if (Math.abs(dotXs[i] - dotXs[j]) < 0.4) s++;
              }
              return s;
            });
            const labelXs = computeLabelPositions(dotXs, 11);
            const baseAreaH = 88;
            const maxStack = Math.max(0, ...dotStack);
            const areaH = baseAreaH + maxStack * 18;
            return (
              <div style={{ position: "relative", height: areaH, marginTop: 6 }}>
                {/* Leader lines */}
                <svg width="100%" height={areaH}
                     viewBox={`0 0 100 ${areaH}`} preserveAspectRatio="none"
                     style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  {sorted.map((f, i) => {
                    const x1 = dotXs[i];
                    const x2 = labelXs[i];
                    const y1 = 4 + dotStack[i] * 18;
                    const y2 = areaH - 30;
                    const same = Math.abs(x1 - x2) < 0.2;
                    const d = same
                      ? `M ${x1} ${y1} L ${x2} ${y2}`
                      : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;
                    return (
                      <path key={f.factory_id} d={d}
                            fill="none" stroke="var(--line-3)"
                            strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    );
                  })}
                </svg>

                {/* Dots — anchored to band edge; tied dots stack downward */}
                {sorted.map((f, i) => {
                  const x = dotXs[i];
                  const stackIdx = dotStack[i];
                  const tone = window.LEVEL_META[f.risk.level].tone;
                  const color =
                    tone === "safe" ? "var(--safe)" :
                    tone === "warn" ? "var(--warn)" :
                    "var(--crit)";
                  return (
                    <div key={`dot-${f.factory_id}`} style={{
                      position: "absolute", left: `${x}%`,
                      top: -7 + stackIdx * 18,
                      transform: "translateX(-50%)",
                      pointerEvents: "none",
                    }}>
                      <div style={{
                        width: 14, height: 14, borderRadius: "50%",
                        background: color,
                        boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent), 0 0 0 1px var(--surface)`,
                      }} />
                    </div>
                  );
                })}

                {/* Labels — anchored to bottom of area at labelX positions */}
                {sorted.map((f, i) => {
                  const lx = labelXs[i];
                  const tone = window.LEVEL_META[f.risk.level].tone;
                  const color =
                    tone === "safe" ? "var(--safe)" :
                    tone === "warn" ? "var(--warn)" :
                    "var(--crit)";
                  return (
                    <div key={`lbl-${f.factory_id}`} style={{
                      position: "absolute", left: `${lx}%`, bottom: 0,
                      transform: "translateX(-50%)",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    }}>
                      <span className="tnum" style={{
                        fontFamily: SERIF_FONT,
                        fontSize: 30, lineHeight: 0.85, color: color,
                        letterSpacing: "-0.01em",
                        display: "inline-block",
                        transform: "scaleY(0.84) scaleX(1.06)",
                        transformOrigin: "center bottom",
                      }}>{f.risk.score}</span>
                      <span className="mono" style={{
                        fontSize: 10.5, color: "var(--ink-2)",
                        letterSpacing: ".03em",
                        marginTop: 4, fontWeight: 500,
                      }}>{f.factory_id}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Scale axis */}
          <div style={{
            position: "relative", height: 14, marginTop: 8,
            fontSize: 10, color: "var(--ink-4)",
            borderTop: "1px dashed var(--line-2)", paddingTop: 4,
          }}>
            <div className="mono" style={{ position: "absolute", left: 0,    transform: "translateX(0)"   }}>0</div>
            <div className="mono" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>50</div>
            <div className="mono" style={{ position: "absolute", left: "85%", transform: "translateX(-50%)" }}>85</div>
            <div className="mono" style={{ position: "absolute", right: 0,   transform: "translateX(0)"   }}>100</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Label anti-collision helper ─────────────────────────────────
// Given dot x-positions (0–100), returns label x-positions that don't overlap.
// Dots within minGap of each other form a "cluster"; labels in the cluster
// are evenly spread around the cluster's center. Isolated dots keep their
// natural position so most factories appear directly under their dot.
function computeLabelPositions(dots, minGap = 11) {
  if (!dots.length) return [];
  const labels = [...dots];
  // Step 1: cluster spreading
  const clusters = [];
  let cur = [0];
  for (let i = 1; i < dots.length; i++) {
    if (dots[i] - dots[i - 1] < minGap) cur.push(i);
    else { clusters.push(cur); cur = [i]; }
  }
  clusters.push(cur);
  for (const c of clusters) {
    if (c.length === 1) continue;
    const first = dots[c[0]];
    const last  = dots[c[c.length - 1]];
    const center = (first + last) / 2;
    const total = minGap * (c.length - 1);
    let startX = center - total / 2;
    if (startX < 6)            startX = 6;
    if (startX + total > 94)   startX = 94 - total;
    for (let j = 0; j < c.length; j++) labels[c[j]] = startX + j * minGap;
  }
  // Step 2: global enforcement — catch cluster-to-cluster spillovers.
  for (let i = 1; i < labels.length; i++) {
    if (labels[i] - labels[i - 1] < minGap) labels[i] = labels[i - 1] + minGap;
  }
  for (let i = labels.length - 1; i >= 0; i--) {
    if (labels[i] > 94) labels[i] = 94;
    if (i < labels.length - 1 && labels[i + 1] - labels[i] < minGap) {
      labels[i] = labels[i + 1] - minGap;
    }
  }
  if (labels[0] < 6) {
    const shift = 6 - labels[0];
    for (let i = 0; i < labels.length; i++) labels[i] += shift;
  }
  return labels;
}

// Demo override for the Pulse visualization. Used by the Tweaks panel to
// preview how tied scores render. Only affects the Pulse track; the factory
// cards and recent-changes list keep real data.
function applyPulseDemo(factories, mode) {
  if (mode === "tie2") {
    return factories.map(f =>
      f.factory_id === "factory-c"
        ? { ...f, risk: { ...f.risk, score: 78, level: "warning" } }
        : f
    );
  }
  if (mode === "tie3") {
    return factories.map(f => ({
      ...f, risk: { ...f.risk, score: 78, level: "warning" },
    }));
  }
  return factories;
}

function BandLabel({ from, to, color, label }) {
  return (
    <div style={{
      position: "absolute", left: `${from}%`, width: `${to - from + 1}%`,
      top: 0, bottom: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      pointerEvents: "none",
    }}>
      <span className="mono" style={{
        fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase",
        color, fontWeight: 600, opacity: 0.55,
      }}>{label}</span>
    </div>
  );
}

// Note: dot+label rendering is now inline within FleetPulse, with a separate
// legend row below. The previous PulseDot helper has been replaced.

function PulseStat({ label, value, tone }) {
  const color =
    tone === "crit" ? "var(--crit)" :
    tone === "warn" ? "var(--warn)" :
    tone === "safe" ? "var(--safe)" :
    tone === "ink-mute" ? "var(--ink-4)" : "var(--ink)";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <span className="mono tnum" style={{
        fontSize: 18, fontWeight: 500, color,
        letterSpacing: "-0.01em", lineHeight: 1,
      }}>{value}</span>
      <span className="micro" style={{ fontSize: 10, letterSpacing: ".04em" }}>{label}</span>
    </div>
  );
}

// ─── C · Factory card — refined ──────────────────────────────────
// • 3px left stripe in status color
// • Big serif score number (B)
// • Mini 24h sparkline beside it
// • Thinner borders, slight elevation on hover

function FactoryCard({ f, onOpen }) {
  const tone = window.LEVEL_META[f.risk?.level]?.tone ?? "unk";
  const scoreColor =
    tone === "safe" ? "var(--safe)" :
    tone === "warn" ? "var(--warn)" :
    tone === "crit" ? "var(--crit)" : "var(--ink-3)";
  const ns = f.infra_state?.node_summary;
  const causes = f.risk?.top_causes ?? [];

  // 24h spark of risk_score (memoized per factory)
  const sparkData = React.useMemo(() => {
    const h = window.buildHistory(f, "24h");
    return h.risk.map(r => r.risk_score);
  }, [f.factory_id]);

  return (
    <div className="card" onClick={() => onOpen(f.factory_id)}
         style={{
           cursor: "pointer", display: "flex", flexDirection: "column",
           position: "relative", overflow: "hidden",
           transition: "border-color .12s, box-shadow .15s, transform .15s",
         }}
         onMouseEnter={e => {
           e.currentTarget.style.borderColor = "var(--ink-5)";
           e.currentTarget.style.boxShadow = "var(--shadow-lift)";
         }}
         onMouseLeave={e => {
           e.currentTarget.style.borderColor = "var(--line)";
           e.currentTarget.style.boxShadow = "var(--shadow-card)";
         }}>
      {/* Left status stripe */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
        background: scoreColor,
      }} />

      {/* Header */}
      <div style={{ padding: "16px 18px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: ".06em" }}>
              {f.environment_type}
            </span>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginTop: 2 }}>
              {f.factory_id}
            </span>
          </div>
          <LevelBadge level={f.risk?.level} />
        </div>

        {/* B · Score block — serif numeral + companion sparkline */}
        <div style={{
          display: "grid", gridTemplateColumns: "auto 1fr",
          gap: 14, alignItems: "end",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="tnum" style={{
              fontFamily: SERIF_FONT,
              fontSize: 68, lineHeight: 0.78,
              color: scoreColor,
              letterSpacing: "-0.02em",
              fontWeight: 400,
              display: "inline-block",
              transform: "scaleY(0.84) scaleX(1.08)",
              transformOrigin: "left bottom",
            }}>{f.risk?.score ?? "—"}</span>
            <span className="micro" style={{ marginTop: 6 }}>
              / 100 안전 점수
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4, paddingBottom: 6 }}>
            <Sparkline data={sparkData} width={120} height={32}
                       color={scoreColor} strokeWidth={1.4} showDot={true} fill={true} />
            <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: ".06em", textAlign: "right" }}>
              지난 24h
            </span>
          </div>
        </div>

        {/* Meta strip */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          paddingTop: 6, borderTop: "1px solid var(--line-2)",
        }}>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {ns ? <>node <span style={{ color: "var(--ink)" }} className="tnum">{ns.ready}/{ns.total}</span> Ready</> : "노드 미수신"}
          </span>
          <PipelineBadge status={f.pipeline_status?.status} />
        </div>
      </div>

      {/* Top causes */}
      <div style={{ padding: "10px 18px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="eyebrow" style={{ marginBottom: 2 }}>top_causes</div>
        {causes.length === 0
          ? <div className="micro">미계산</div>
          : causes.slice(0, 3).map((c, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                fontSize: 12, color: "var(--ink-2)",
              }}>
                <span className="mono tnum" style={{
                  fontSize: 10.5, color: "var(--crit)", width: 30, textAlign: "right",
                }}>−{c.contribution}</span>
                <span style={{
                  flex: 1, minWidth: 0, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{c.name}</span>
              </div>
            ))
        }
      </div>

      {/* Footer */}
      <div style={{
        marginTop: "auto", padding: "10px 18px",
        borderTop: "1px solid var(--line-2)",
        background: "var(--surface-2)",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
        fontSize: 11.5,
      }}>
        <span className="mono" style={{ color: "var(--ink-3)" }}>
          updated <span style={{ color: "var(--ink-2)" }}>{window.relTime(f.updated_at)}</span>
        </span>
        <StalenessBadge factory={f} />
      </div>
    </div>
  );
}

// ─── Recent row (risk_level transition) ──────────────────────────
function RecentRow({ e, onOpen }) {
  const fromMeta = window.LEVEL_META[e.from];
  const toMeta   = window.LEVEL_META[e.to];
  const changed  = e.from !== e.to;
  const toneColor = (m) =>
    m.tone === "safe" ? "var(--safe)" :
    m.tone === "warn" ? "var(--warn)" :
    m.tone === "crit" ? "var(--crit)" : "var(--ink-3)";

  return (
    <div className="list-row" style={{ padding: "12px 16px", alignItems: "center" }}
         onClick={() => onOpen(e.factory_id)}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
        background: toneColor(toMeta),
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--ink)", fontWeight: 500 }}>
            {e.factory_id}
          </span>
          {changed ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ color: toneColor(fromMeta) }}>{fromMeta.label}</span>
              <Icon name="arrowRight" size={11} style={{ color: "var(--ink-4)" }} />
              <span style={{ color: toneColor(toMeta), fontWeight: 500 }}>{toMeta.label}</span>
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {toMeta.label} 유지
            </span>
          )}
        </div>
        <div className="micro" style={{ marginTop: 2 }}>
          risk_score <span className="mono tnum" style={{ color: "var(--ink-2)" }}>{e.score}</span>
        </div>
      </div>
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)", whiteSpace: "nowrap" }}>
        {window.relTime(e.ts)}
      </span>
    </div>
  );
}

window.FleetOverview = FleetOverview;
