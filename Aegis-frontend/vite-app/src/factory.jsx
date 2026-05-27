import React from "react";
import { Sparkline } from "./charts.jsx";
import { FACTORIES, LEVEL_META, TIMELINE, buildHistory, relTime } from "./data.jsx";
import { FactoryHistory } from "./factory-history.jsx";
import { FactoryInfra } from "./factory-infra.jsx";
import { FactoryTimeline } from "./factory-timeline.jsx";
import { DeviceChip, EmptyNote, LevelBadge, PipelineBadge, SectionHeader, StalenessBadge } from "./shared.jsx";

// Factory Detail — shell + 4 tabs (overview · history · infra · timeline).
// All four tabs sit on the same factory_id; their content lives below.

const SERIF_FONT_FACTORY = '"Instrument Serif", ui-serif, Georgia, serif';

const FACTORY_TABS = [
{ key: "overview", label: "Overview" },
{ key: "history", label: "Environment History" },
{ key: "infra", label: "Infrastructure" },
{ key: "timeline", label: "Timeline" }];


function FactoryDetail({ factoryId, onBack }) {
  const f = FACTORIES.find((x) => x.factory_id === factoryId) || FACTORIES[0];
  const [tab, setTab] = React.useState("overview");

  return (
    <>
      <FactoryHeader f={f} />
      <FactoryTabBar tab={tab} onChange={setTab} f={f} />

      {tab === "overview" && <FactoryOverview f={f} />}
      {tab === "history" && <FactoryHistory f={f} />}
      {tab === "infra" && <FactoryInfra f={f} />}
      {tab === "timeline" && <FactoryTimeline f={f} />}
    </>);

}

// ─── Header ─────────────────────────────────────────────────────
// Editorial hero: status-tinted backdrop, serif title + serif score,
// 24h sparkline trend, supporting meta.
function FactoryHeader({ f }) {
  const ns = f.infra_state?.node_summary;
  const tone = LEVEL_META[f.risk?.level]?.tone ?? "unk";
  const scoreColor =
  tone === "safe" ? "var(--safe)" :
  tone === "warn" ? "var(--warn)" :
  tone === "crit" ? "var(--crit)" : "var(--ink-3)";
  const tintMix =
  tone === "crit" ? 6 : tone === "warn" ? 5 : tone === "safe" ? 4 : 0;
  const tintBg = tintMix > 0 ?
  `color-mix(in srgb, ${scoreColor} ${tintMix}%, var(--surface))` :
  "var(--surface)";

  // 24h spark of risk_score
  const sparkData = React.useMemo(() => {
    const h = buildHistory(f, "24h");
    return h.risk.map((r) => r.risk_score);
  }, [f.factory_id]);

  return (
    <div style={{
      position: "relative",
      display: "grid", gridTemplateColumns: "1fr auto",
      gap: 28, alignItems: "stretch",

      borderRadius: 12,
      border: "1px solid var(--line)",
      background: tintBg,
      marginBottom: 18,
      overflow: "hidden", padding: "19px 26px 19px 28px"
    }}>
      {/* Status edge stripe */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
        background: scoreColor
      }} />

      {/* Decorative serif initial in corner */}
      <span aria-hidden style={{
        position: "absolute", right: 320, bottom: -34,
        fontFamily: SERIF_FONT_FACTORY,
        fontSize: 220, lineHeight: 0.85, fontWeight: 400,
        color: scoreColor, opacity: 0.045,
        letterSpacing: "-0.04em", pointerEvents: "none"
      }}>π</span>

      <div style={{
        minWidth: 0, display: "flex", flexDirection: "column", gap: 8,
        position: "relative", zIndex: 1
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="mono" style={{
            fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".08em",
            textTransform: "uppercase", fontWeight: 600
          }}>
            {f.environment_type}
          </span>
          <span style={{ color: "var(--ink-5)" }}>·</span>
          <LevelBadge level={f.risk?.level} />
          <PipelineBadge status={f.pipeline_status?.status} />
          <StalenessBadge factory={f} />
        </div>
        <div>
          <h1 style={{
            font: `400 42px/0.82 ${SERIF_FONT_FACTORY}`,
            letterSpacing: "-0.015em",
            color: "var(--ink)",
            margin: 0,
            display: "inline-block",
            whiteSpace: "nowrap",
            transform: "scaleY(0.76) scaleX(1.08)",
            transformOrigin: "left center"
          }}>{f.factory_id}</h1>
          <p className="sub" style={{ margin: "4px 0 0", maxWidth: 560 }}>
            {f.dashboard?.summary ?? "미수신"}
          </p>
        </div>
      </div>

      {/* Right stat block */}
      <div style={{
        display: "flex", alignItems: "center", gap: 22,
        paddingLeft: 24, borderLeft: "1px solid var(--line-2)",
        position: "relative", zIndex: 1
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 110 }}>
          <span className="eyebrow">safety score</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span className="tnum" style={{
              fontFamily: SERIF_FONT_FACTORY,
              fontSize: 72, lineHeight: 0.8,
              color: scoreColor,
              letterSpacing: "-0.02em",
              fontWeight: 400,
              transform: "scaleY(0.84) scaleX(1.06)",
              transformOrigin: "left bottom",
              display: "inline-block"
            }}>{f.risk?.score ?? "—"}</span>
            <span className="mono tnum" style={{
              fontSize: 12.5, color: "var(--ink-3)", letterSpacing: ".04em",
              fontWeight: 500,
            }}>/100</span>
          </div>
        </div>

        <div style={{ width: 1, alignSelf: "stretch", background: "var(--line-2)" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 140 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="eyebrow">last 24h</span>
            <span className="mono tnum" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
              {sparkData.length}pt
            </span>
          </div>
          <Sparkline data={sparkData} width={160} height={36}
          color={scoreColor} strokeWidth={1.4} showDot={true} fill={true} />
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 11, color: "var(--ink-3)"
          }}>
            <span className="mono">
              node <span className="tnum" style={{ color: "var(--ink)" }}>
                {ns ? `${ns.ready}/${ns.total}` : "—"}
              </span>
            </span>
            <span className="mono" style={{ color: "var(--ink-4)" }}>
              {relTime(f.updated_at)}
            </span>
          </div>
        </div>
      </div>
    </div>);

}

// ─── Tab bar — refined underline with hover ──────────────────────
function FactoryTabBar({ tab, onChange, f }) {
  const events = f ? TIMELINE?.[f.factory_id] || [] : [];
  return (
    <div style={{
      display: "flex", gap: 0,
      marginBottom: 18,
      borderBottom: "1px solid var(--line)",
      paddingLeft: 2
    }}>
      {FACTORY_TABS.map((t) => {
        const active = tab === t.key;
        const count = t.key === "timeline" ? events.length : null;
        return (
          <button key={t.key} onClick={() => onChange(t.key)}
          style={{
            border: 0, background: "transparent",
            padding: "11px 16px 13px",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: active ? 600 : 500,
            color: active ? "var(--ink)" : "var(--ink-3)",
            cursor: "pointer",
            position: "relative",
            transition: "color .15s",
            display: "inline-flex", alignItems: "center", gap: 7
          }}
          onMouseEnter={(e) => {if (!active) e.currentTarget.style.color = "var(--ink-2)";}}
          onMouseLeave={(e) => {if (!active) e.currentTarget.style.color = "var(--ink-3)";}}>
            {t.label}
            {count != null && count > 0 &&
            <span className="mono tnum" style={{
              fontSize: 10, padding: "2px 6px",
              borderRadius: 999,
              background: active ? "var(--ink)" : "var(--line-2)",
              color: active ? "var(--surface)" : "var(--ink-3)",
              fontWeight: 600, letterSpacing: ".02em",
              lineHeight: 1
            }}>{count}</span>
            }
            {active && <div style={{
              position: "absolute", left: 10, right: 10, bottom: -1,
              height: 2, borderRadius: 2,
              background: "var(--ink)"
            }} />}
          </button>);

      })}
    </div>);

}

// ─── Tab 1 · Overview ────────────────────────────────────────────
function FactoryOverview({ f }) {
  const causes = f.risk?.top_causes ?? [];
  const s = f.factory_state?.sensor;
  const ai = f.factory_state?.ai_result;
  const dv = f.infra_state?.devices;
  const ns = f.infra_state?.node_summary;
  const ws = f.infra_state?.workload_summary;
  const isVM = f.environment_type !== "physical-rpi";

  return (
    <>
      {/* top_causes */}
      <div className="card" style={{ marginBottom: 14 }}>
        <SectionHeader
          title="주요 원인"
          hint={`risk.top_causes · ${causes.length}건`} />
        
        <div className="card-bd">
          {causes.length === 0 ?
          <EmptyNote text="top_causes가 미계산 상태입니다." /> :

          <div className="grid row3">
              {causes.slice(0, 3).map((c, i) =>
            <CauseCard key={i} c={c} rank={i + 1} />
            )}
            </div>
          }
        </div>
      </div>

      {/* current environment + current infrastructure */}
      <div className="grid row2" style={{ marginBottom: 14 }}>
        {/* Environment */}
        <div className="card">
          <SectionHeader
            title="현재 환경"
            hint={s ? "factory_state.sensor · 평균값" : "미수신"} />
          
          <div className="card-bd" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="grid row3" style={{ gap: 10 }}>
              <MetricLine label="온도" value={s?.temperature_celsius_avg} unit="°C" digits={1} />
              <MetricLine label="습도" value={s?.humidity_percent_avg} unit="%" digits={1} />
              <MetricLine label="기압" value={s?.pressure_hpa_avg} unit="hPa" digits={1} />
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, paddingTop: 12, marginTop: 2, borderTop: "1px solid var(--line-2)"
            }}>
              <span style={{
                fontSize: 12, fontWeight: 600, color: "var(--ink-2)",
                letterSpacing: "-0.005em", lineHeight: 1.35,
                whiteSpace: "nowrap"
              }}>
                AI 탐지 점수
                <span className="mono" style={{
                  color: "var(--ink-4)", fontWeight: 500, marginLeft: 6,
                  fontSize: 11, letterSpacing: 0, whiteSpace: "nowrap"
                }}>· 0 ~ 1</span>
              </span>
              <span style={{ display: "inline-flex", gap: 10, lineHeight: 1.35, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <ThresholdSwatch color="var(--safe)" label="안전 < 0.3" />
                <ThresholdSwatch color="var(--warn)" label="주의 0.3 ~ 0.8" />
                <ThresholdSwatch color="var(--crit)" label="위험 ≥ 0.8" />
              </span>
            </div>
            <div className="grid row3" style={{ gap: 10 }}>
              <ScoreLine label="fire_score" value={ai?.fire_score} />
              <ScoreLine label="fall_score" value={ai?.fall_score} />
              <ScoreLine label="bend_score" value={ai?.bend_score} />
            </div>

            <div style={{
              display: "flex", gap: 12, alignItems: "center",
              padding: "10px 12px", borderRadius: 8,
              background: "var(--surface-2)",
              border: "1px solid var(--line-2)"
            }}>
              <span className="mono" style={{
                fontSize: 10, color: "var(--ink-3)", letterSpacing: ".08em",
                textTransform: "uppercase", minWidth: 110, fontWeight: 600
              }}>abnormal_sound</span>
              <span style={{
                fontSize: 13, color: "var(--ink)", fontWeight: 500,
                fontFamily: "Geist Mono, monospace"
              }}>
                {ai?.abnormal_sound ?? <span style={{ color: "var(--ink-4)" }}>미수신</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Infrastructure summary */}
        <div className="card">
          <SectionHeader
            title="현재 인프라"
            hint="infra_state · 요약" />
          
          <div className="card-bd" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="grid row2" style={{ gap: 10 }}>
              <SummaryLine label="Node Ready"
              value={ns ? `${ns.ready} / ${ns.total}` : "미수신"}
              tone={ns ? ns.not_ready > 0 ? "warn" : "safe" : "unk"}
              sub={ns?.not_ready > 0 ? `${ns.not_ready} NotReady` : "all ready"} />
              <SummaryLine label="Workload Running"
              value={ws ? `${ws.running} / ${ws.total}` : "미수신"}
              tone={ws ? ws.not_running > 0 ? "warn" : "safe" : "unk"}
              sub={ws?.not_running > 0 ? `${ws.not_running} not_running` : "all running"} />
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              paddingTop: 4, borderTop: "1px solid var(--line-2)"
            }}>
              <span className="eyebrow">devices · last_seen_at</span>
              <span className="micro mono">{isVM ? "VM 환경 · N/A" : "physical-rpi"}</span>
            </div>
            <div className="grid row3" style={{ gap: 10 }}>
              <DeviceChip label="BME280" device={dv?.bme280} naWhenEnv={isVM} />
              <DeviceChip label="Camera" device={dv?.camera} naWhenEnv={isVM} />
              <DeviceChip label="Microphone" device={dv?.microphone} naWhenEnv={isVM} />
            </div>
          </div>
        </div>
      </div>
    </>);

}

// ─── Small sub-components for the overview ────────────────────────
function CauseCard({ c, rank }) {
  return (
    <div style={{
      padding: "12px 14px",
      border: "1px solid var(--line)", borderRadius: 10,
      background: "var(--surface)",
      display: "flex", flexDirection: "column", gap: 10,
      transition: "border-color .12s, box-shadow .15s"
    }}
    onMouseEnter={(e) => {e.currentTarget.style.borderColor = "var(--ink-5)";}}
    onMouseLeave={(e) => {e.currentTarget.style.borderColor = "var(--line)";}}>
      {/* Row: numbered badge + cause name */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{
          flexShrink: 0,
          width: 22, height: 22, borderRadius: 6,
          background: "var(--ink)", color: "var(--surface)",
          fontFamily: "Geist Mono, monospace",
          fontSize: 11, fontWeight: 600,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          letterSpacing: "0.02em", lineHeight: 1,
          fontVariantNumeric: "tabular-nums"
        }}>{rank}</span>
        <span style={{
          fontSize: 13, color: "var(--ink)", fontWeight: 500, lineHeight: 1.35,
          flex: 1, minWidth: 0,
          display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflow: "hidden"
        }}>
          {c.name}
        </span>
      </div>

      {/* Footer: value + contribution */}
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: 8, paddingTop: 8, borderTop: "1px solid var(--line-2)"
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span className="eyebrow">value</span>
          <span className="mono tnum" style={{ fontSize: 14, color: "var(--ink-2)", fontWeight: 500 }}>
            {c.value}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
          <span className="eyebrow">contribution</span>
          <span className="mono tnum" style={{ fontSize: 20, color: "var(--crit)", fontWeight: 600, letterSpacing: "-0.01em" }}>
            −{c.contribution}
          </span>
        </div>
      </div>
    </div>);

}

function MetricLine({ label, value, unit, digits = 1 }) {
  const formatted = value == null ? null : value.toFixed(digits);
  return (
    <div style={{
      padding: "12px 14px", border: "1px solid var(--line-2)", borderRadius: 8,
      background: "var(--surface-2)",
      display: "flex", flexDirection: "column", gap: 6
    }}>
      <span className="eyebrow">{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        {formatted == null ?
        <span style={{ fontSize: 14, color: "var(--ink-4)" }}>미수신</span> :

        <>
            <span className="tnum" style={{
            fontSize: 26, fontWeight: 500, color: "var(--ink)",
            letterSpacing: "-0.015em", lineHeight: 1,
            fontVariantNumeric: "tabular-nums"
          }}>
              {formatted}
            </span>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{unit}</span>
          </>
        }
      </div>
    </div>);

}

function ScoreLine({ label, value }) {
  // AI detection score (0~1): 0.0~0.2 안전 / 0.3~0.7 주의 / 0.8~1.0 위험
  const v = value == null ? null : Math.max(0, Math.min(1, value));
  const tone =
  v == null ? "unk" :
  v >= 0.8 ? "crit" :
  v >= 0.3 ? "warn" : "safe";
  const color =
  tone === "crit" ? "var(--crit)" :
  tone === "warn" ? "var(--warn)" :
  tone === "safe" ? "var(--safe)" : "var(--ink-4)";
  return (
    <div style={{
      padding: "11px 14px", border: "1px solid var(--line-2)", borderRadius: 8,
      background: "var(--surface-2)",
      display: "flex", flexDirection: "column", gap: 8
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="mono" style={{
          fontSize: 11, color: "var(--ink-3)", letterSpacing: ".04em", fontWeight: 500
        }}>{label}</span>
        <span className="mono tnum" style={{ fontSize: 17, color, fontWeight: 600, letterSpacing: "-0.01em" }}>
          {v == null ? "—" : v.toFixed(2)}
        </span>
      </div>
      <div style={{
        position: "relative", height: 6, borderRadius: 3,
        background: "var(--line-2)", overflow: "visible"
      }}>
        <div style={{
          height: "100%", width: `${(v ?? 0) * 100}%`,
          background: color, borderRadius: 3, transition: "width .4s ease"
        }} />
        {/* threshold ticks at 0.3 and 0.8 */}
        <div style={{ position: "absolute", left: "30%", top: -2, height: 10, width: 1, background: "var(--line-3)", opacity: 0.7 }} />
        <div style={{ position: "absolute", left: "80%", top: -2, height: 10, width: 1, background: "var(--line-3)", opacity: 0.7 }} />
      </div>
    </div>);

}

function SummaryLine({ label, value, tone = "ink", sub }) {
  const color =
  tone === "safe" ? "var(--safe)" :
  tone === "warn" ? "var(--warn)" :
  tone === "crit" ? "var(--crit)" :
  tone === "unk" ? "var(--ink-4)" : "var(--ink)";
  const subColor =
  tone === "warn" ? "var(--warn)" :
  tone === "crit" ? "var(--crit)" :
  tone === "safe" ? "var(--ink-3)" : "var(--ink-3)";
  return (
    <div style={{
      padding: "12px 14px", border: "1px solid var(--line-2)", borderRadius: 8,
      background: "var(--surface-2)",
      display: "flex", flexDirection: "column", gap: 4,
      position: "relative", overflow: "hidden"
    }}>
      {/* Left edge color stripe */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 2,
        background: color, opacity: tone === "ink" ? 0 : 1
      }} />
      <span className="eyebrow">{label}</span>
      <span className="tnum" style={{
        fontSize: 22, fontWeight: 500, color,
        letterSpacing: "-0.015em", lineHeight: 1,
        fontVariantNumeric: "tabular-nums"
      }}>
        {value}
      </span>
      {sub && <span className="micro" style={{ color: subColor }}>{sub}</span>}
    </div>);

}

// Tiny inline swatch for threshold legend
function ThresholdSwatch({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
      <span style={{
        width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0
      }} />
      <span style={{ color: "var(--ink-3)", fontSize: 11, whiteSpace: "nowrap" }}>{label}</span>
    </span>);

}

export { CauseCard, FactoryDetail, FactoryHeader, FactoryOverview, FactoryTabBar, MetricLine, SERIF_FONT_FACTORY, ScoreLine, SummaryLine, ThresholdSwatch };
