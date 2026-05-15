// SVG chart primitives — hand-drawn, no recharts. We tune for precision/density.

// ─── Sparkline — area + line ───────────────────────────────────────
function Sparkline({ data, width = 120, height = 32, color = "var(--ink-3)",
  fill = true, strokeWidth = 1.4, showDot = false }) {
  if (!data || data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data),max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const yOf = (v) => height - 4 - (v - min) / range * (height - 8);
  const pts = data.map((v, i) => [i * stepX, yOf(v)]);
  const line = pts.map(([x, y], i) => i === 0 ? `M${x.toFixed(1)} ${y.toFixed(1)}` : `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const id = React.useId();
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="spark" preserveAspectRatio="none">
      {fill &&
      <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
        </>
      }
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      {showDot &&
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.4} fill={color} />
      }
    </svg>);

}

// ─── Line chart with grid + axes ───────────────────────────────────
function LineChart({ series, height = 180, color = "var(--accent)",
  minY, maxY, yTicks = 4, xTicks = 6, unit = "", showArea = true,
  band = null /* {low, high} */ }) {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const data = series;
  if (!data) return <div ref={ref} style={{ height }} />;
  const pad = { l: 36, r: 12, t: 8, b: 22 };
  const W = Math.max(200, w);
  const H = height;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const yMin = minY ?? Math.min(...data);
  const yMax = maxY ?? Math.max(...data);
  const yRange = yMax - yMin || 1;
  const stepX = innerW / (data.length - 1);
  const yOf = (v) => pad.t + innerH - (v - yMin) / yRange * innerH;
  const xOf = (i) => pad.l + i * stepX;
  const pts = data.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`);
  const line = "M" + pts.join("L");
  const area = `${line} L${xOf(data.length - 1)},${pad.t + innerH} L${pad.l},${pad.t + innerH} Z`;
  const id = React.useId();

  // y ticks
  const yTickVals = [];
  for (let i = 0; i <= yTicks; i++) yTickVals.push(yMin + yRange * i / yTicks);

  return (
    <div ref={ref} style={{ width: "100%", height }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {/* gridlines */}
        {yTickVals.map((v, i) =>
        <line key={i} x1={pad.l} x2={W - pad.r}
        y1={yOf(v)} y2={yOf(v)}
        stroke="var(--line-2)" strokeWidth="1"
        strokeDasharray={i === 0 ? "0" : "2 3"} />
        )}
        {/* y labels */}
        {yTickVals.map((v, i) =>
        <text key={`y${i}`} x={pad.l - 8} y={yOf(v) + 3}
        fontSize="10" textAnchor="end" fill="var(--ink-4)"
        fontFamily="Geist Mono, monospace">
            {Number.isInteger(v) ? v : v.toFixed(yRange < 5 ? 1 : 0)}{unit}
          </text>
        )}
        {/* x labels */}
        {Array.from({ length: xTicks + 1 }).map((_, i) => {
          const t = i * 4;
          const x = xOf((data.length - 1) * (i / xTicks));
          return (
            <text key={`x${i}`} x={x} y={H - 6}
            fontSize="10" textAnchor="middle" fill="var(--ink-4)"
            fontFamily="Geist Mono, monospace">
              −{(xTicks - i) * 4}h
            </text>);

        })}
        {/* band (safe range) */}
        {band &&
        <rect x={pad.l} y={yOf(band.high)} width={innerW}
        height={yOf(band.low) - yOf(band.high)}
        fill="var(--safe-tint-2)" style={{ fill: "rgba(236, 250, 241, 0)" }} />
        }
        {/* area */}
        {showArea &&
        <>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${id})`} />
          </>
        }
        {/* line */}
        <path d={line} fill="none" stroke={color} strokeWidth="1.8"
        strokeLinejoin="round" strokeLinecap="round" />
        {/* endpoint dot */}
        <circle cx={xOf(data.length - 1)} cy={yOf(data[data.length - 1])} r="3" fill={color} />
        <circle cx={xOf(data.length - 1)} cy={yOf(data[data.length - 1])} r="6" fill={color} fillOpacity="0.18" />
      </svg>
    </div>);

}

// ─── Stacked area (telemetry domains) ──────────────────────────────
function StackedRisk({ data, height = 180 }) {
  // data: [{t, environmental, infrastructure, operational}]
  const ref = React.useRef(null);
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const pad = { l: 32, r: 12, t: 8, b: 22 };
  const W = Math.max(220, w),H = height;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const env = data.map((d) => d.environmental);
  const inf = data.map((d) => d.infrastructure);
  const op = data.map((d) => d.operational);
  const all = [...env, ...inf, ...op];
  // Tight y-range so variation reads.
  const yMin = Math.floor((Math.min(...all) - 4) / 5) * 5;
  const yMax = Math.ceil((Math.max(...all) + 4) / 5) * 5;
  const yRange = yMax - yMin || 1;
  const stepX = innerW / (data.length - 1);
  const yOf = (v) => pad.t + innerH - (v - yMin) / yRange * innerH;
  const xOf = (i) => pad.l + i * stepX;

  const pathOf = (vals) => "M" + vals.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join("L");
  const areaOf = (vals, base) => `${pathOf(vals)} L${xOf(vals.length - 1)},${yOf(base)} L${pad.l},${yOf(base)} Z`;

  // 4 y-ticks across the range
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + yRange * i / 4);

  return (
    <div ref={ref} style={{ width: "100%", height }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {yTicks.map((v, i) =>
        <line key={v} x1={pad.l} x2={W - pad.r} y1={yOf(v)} y2={yOf(v)}
        stroke="var(--line-2)" strokeDasharray={i === 0 ? "0" : "2 3"} />
        )}
        {yTicks.map((v, i) =>
        <text key={`l${v}`} x={pad.l - 8} y={yOf(v) + 3} fontSize="10"
        textAnchor="end" fill="var(--ink-4)" fontFamily="Geist Mono, monospace">{Math.round(v)}</text>
        )}
        {/* x labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) =>
        <text key={`xt${i}`} x={pad.l + p * innerW} y={H - 6}
        fontSize="10" textAnchor="middle" fill="var(--ink-4)"
        fontFamily="Geist Mono, monospace">
            −{Math.round((1 - p) * 24)}h
          </text>
        )}
        <path d={areaOf(env, yMin)} fill="var(--safe)" fillOpacity="0.10" style={{ fill: "rgba(153, 226, 202, 0)" }} />
        <path d={pathOf(env)} fill="none" stroke="var(--safe)" strokeWidth="1.8" strokeLinejoin="round" />
        <path d={pathOf(inf)} fill="none" stroke="var(--warn)" strokeWidth="1.8" strokeLinejoin="round" />
        <path d={pathOf(op)} fill="none" stroke="var(--ops)" strokeWidth="1.8" strokeLinejoin="round" />
        {/* endpoint dots */}
        {[
        { c: "var(--safe)", v: env[env.length - 1] },
        { c: "var(--warn)", v: inf[inf.length - 1] },
        { c: "var(--ops)", v: op[op.length - 1] }].
        map((p, i) =>
        <g key={i}>
            <circle cx={xOf(data.length - 1)} cy={yOf(p.v)} r="6" fill={p.c} fillOpacity="0.18" />
            <circle cx={xOf(data.length - 1)} cy={yOf(p.v)} r="2.8" fill={p.c} />
          </g>
        )}
      </svg>
    </div>);

}

// ─── Risk gauge (radial arc) ───────────────────────────────────────
function RiskGauge({ value, size = 96, stroke = 8, label = true }) {
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  const cx = size / 2,cy = size / 2;
  const r = (size - stroke) / 2;
  // 240° arc from -210° to 30°
  const start = -210,end = 30;
  const toXY = (ang) => {
    const a = ang * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const arcPath = (a0, a1) => {
    const [x0, y0] = toXY(a0);
    const [x1, y1] = toXY(a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };
  const total = end - start;
  const valEnd = v == null ? start : start + v / 100 * total;
  const color = v == null ? "var(--unk)" :
  v >= 80 ? "var(--safe)" :
  v >= 60 ? "var(--warn)" :
  "var(--crit)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="gauge-svg" style={{ width: "65.9943px" }}>
      <path d={arcPath(start, end)} className="gauge-track" strokeWidth={stroke} fill="none" strokeLinecap="round" />
      {v != null &&
      <path d={arcPath(start, valEnd)} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" />
      }
      {label &&
      <>
          <text x={cx} y={cy + 2}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.32} fontWeight="500" letterSpacing="-0.02em"
        fill="var(--ink)" fontFamily="Geist"
        style={{ fontVariantNumeric: "tabular-nums" }}>
            {v == null ? "—" : v}
          </text>
          <text x={cx} y={cy + size * 0.27}
        textAnchor="middle" fontSize="9.5" letterSpacing="0.1em"
        fill="var(--ink-4)" fontFamily="Geist Mono, monospace"
        style={{ textTransform: "uppercase", strokeWidth: "1px" }}>RISK · TWIN</text>
        </>
      }
    </svg>);

}

// ─── Bar (horizontal mini) for sub-scores ──────────────────────────
function ScoreBar({ value, height = 6 }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const color = value == null ? "var(--unk)" :
  v >= 80 ? "var(--safe)" :
  v >= 60 ? "var(--warn)" :
  "var(--crit)";
  return (
    <div style={{
      position: "relative", width: "100%", height, borderRadius: 999,
      background: "var(--line-2)", overflow: "hidden"
    }}>
      <div style={{
        width: `${v}%`, height: "100%",
        background: color, borderRadius: 999,
        transition: "width .5s cubic-bezier(.4,.2,.2,1)"
      }} />
    </div>);

}

// ─── Donut for "fleet status distribution" ─────────────────────────
function StatusDonut({ counts, size = 130, stroke = 14 }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const segs = [
  { k: "safe", v: counts.safe || 0, color: "var(--safe)" },
  { k: "warn", v: counts.warn || 0, color: "var(--warn)" },
  { k: "crit", v: counts.crit || 0, color: "var(--crit)" },
  { k: "unk", v: counts.unk || 0, color: "var(--unk)" }];

  const cx = size / 2,cy = size / 2;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
      {segs.map((s, i) => {
        const len = s.v / total * circ;
        const dashArr = `${len} ${circ - len}`;
        const dashOff = -offset;
        offset += len;
        return s.v > 0 ?
        <circle key={i} cx={cx} cy={cy} r={r}
        stroke={s.color} strokeWidth={stroke} fill="none"
        strokeDasharray={dashArr} strokeDashoffset={dashOff}
        transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" /> :
        null;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="22" fontWeight="500"
      letterSpacing="-0.02em" fill="var(--ink)" fontFamily="Geist"
      style={{ fontVariantNumeric: "tabular-nums" }}>{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9.5"
      letterSpacing="0.1em" fill="var(--ink-4)"
      fontFamily="Geist Mono, monospace">SITES</text>
    </svg>);

}

// ─── Heatmap (24h × N rows) ────────────────────────────────────────
function Heatmap({ rows, cols = 24, size = 14, gap = 2 }) {
  // rows: [{label, values[0..1]}]
  const colorFor = (v) => {
    if (v == null) return "var(--line-2)";
    if (v < 0.2) return "var(--safe-tint)";
    if (v < 0.45) return "var(--safe)";
    if (v < 0.65) return "var(--warn)";
    if (v < 0.85) return "#D86A2B";
    return "var(--crit)";
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map((r, ri) =>
      <div key={ri} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 60, fontSize: 11, color: "var(--ink-3)",
          fontFamily: "Geist Mono, monospace", letterSpacing: ".04em" }}>{r.label}</div>
          <div style={{ display: "flex", gap }}>
            {r.values.map((v, vi) =>
          <div key={vi} className="hm-cell"
          style={{ width: size, height: size, background: colorFor(v) }}
          title={`${r.label} · h-${cols - vi}: ${v == null ? "—" : Math.round(v * 100) + "%"}`} />
          )}
          </div>
        </div>
      )}
      {/* time axis */}
      <div style={{ display: "flex", alignItems: "center", marginTop: 4, paddingLeft: 70 }}>
        <div style={{ display: "flex", gap }}>
          {Array.from({ length: cols }).map((_, i) =>
          <div key={i} style={{
            width: size, fontSize: 9.5, color: "var(--ink-4)",
            fontFamily: "Geist Mono, monospace", textAlign: "center",
            visibility: i % 4 === 0 ? "visible" : "hidden"
          }}>{String(i).padStart(2, "0")}</div>
          )}
        </div>
      </div>
    </div>);

}

Object.assign(window, { Sparkline, LineChart, StackedRisk, RiskGauge, ScoreBar, StatusDonut, Heatmap });