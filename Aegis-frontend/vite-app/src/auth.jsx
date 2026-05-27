import React from "react";
import { Icon } from "./icons.jsx";

// Auth gates — login screen, no-access screen, role badge.
// Mock-only (no real Cognito). Role is selected via Tweaks.

// ─── LoginGate: shown when role === "guest" ────────────────────────
function LoginGate({ onLogin }) {
  const [email, setEmail] = React.useState("ops@aegis-pi.local");
  const [pwd, setPwd]     = React.useState("•••••••••");
  const [as, setAs]       = React.useState("viewer");

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)", padding: 24,
    }}>
      <div className="card" style={{ width: 420, padding: "32px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "var(--chrome-accent)",
            border: "1px solid var(--chrome-accent-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff",
          }}>
            <span className="serif" style={{ fontSize: 22 }}>π</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              Aegis<span style={{ color: "var(--ink-4)" }}>·</span><span className="serif">π</span>
            </div>
            <div className="mono micro" style={{ letterSpacing: ".08em" }}>RISK TWIN · LOGIN</div>
          </div>
        </div>

        <p className="sub" style={{ margin: "0 0 18px" }}>
          Cognito 인증 후 사용 가능. 데모용 mock 화면입니다.
        </p>

        <label style={{ display: "block", fontSize: 11.5, color: "var(--ink-3)", marginBottom: 4 }}>Email</label>
        <input className="input" value={email} onChange={e => setEmail(e.target.value)}
               style={{ width: "100%", marginBottom: 10 }} />

        <label style={{ display: "block", fontSize: 11.5, color: "var(--ink-3)", marginBottom: 4 }}>Password</label>
        <input className="input" type="password" value={pwd} onChange={e => setPwd(e.target.value)}
               style={{ width: "100%", marginBottom: 14 }} />

        <label style={{ display: "block", fontSize: 11.5, color: "var(--ink-3)", marginBottom: 6 }}>역할(mock)</label>
        <div className="seg" style={{ marginBottom: 18 }}>
          <button aria-pressed={as === "viewer"} onClick={() => setAs("viewer")}>VIEWER</button>
          <button aria-pressed={as === "admin"}  onClick={() => setAs("admin")}>ADMIN</button>
        </div>

        <button className="btn primary" style={{ width: "100%", justifyContent: "center" }}
                onClick={() => onLogin(as)}>
          로그인
        </button>

        <div className="micro" style={{ marginTop: 14, textAlign: "center" }}>
          viewer: factory-a / factory-b 조회 · admin: 전체 공장 + 보고서 재생성/refresh
        </div>
      </div>
    </div>
  );
}

// ─── NoAccessGate: shown when entering a restricted factory ────────
function NoAccessGate({ factoryId, role, onBack }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: 480, padding: 32,
    }}>
      <div className="card" style={{ width: 480, padding: "36px 32px", textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, margin: "0 auto 14px",
          borderRadius: 14, background: "var(--warn-tint-2)",
          color: "var(--warn)", border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon name="shield" size={26} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>
          접근 권한이 없습니다
        </div>
        <p className="sub" style={{ margin: "8px 0 18px" }}>
          <span className="mono">{factoryId}</span>은(는) 관리자(admin) 전용 공장입니다.
          viewer는 factory-a / factory-b까지 조회할 수 있습니다.<br />
          현재 역할: <span className="mono" style={{ color: "var(--ink)" }}>{role}</span>
        </p>
        <button className="btn" onClick={onBack}>
          <Icon name="chevLeft" size={13} />Fleet으로 돌아가기
        </button>
        <div className="micro" style={{ marginTop: 16 }}>
          Tweaks 패널의 “역할” 토글로 admin으로 전환할 수 있습니다 (mock).
        </div>
      </div>
    </div>
  );
}

// ─── Role badge (compact) ──────────────────────────────────────────
function RoleBadge({ role, onLogout }) {
  const tone = role === "admin" ? "info" : "unk";
  const label = role === "admin" ? "ADMIN" : role === "viewer" ? "VIEWER" : "GUEST";
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 6px 3px 8px",
      border: "1px solid var(--line)", borderRadius: 7,
      background: "var(--surface)",
      fontSize: 11, color: "var(--ink-3)",
    }}>
      <span className="mono" style={{
        fontSize: 9.5, letterSpacing: ".08em", fontWeight: 600,
        color: role === "admin" ? "var(--accent)" : "var(--ink-3)",
      }}>{label}</span>
      <span style={{ color: "var(--ink-5)" }}>·</span>
      <button className="btn ghost" style={{
        height: 18, padding: "0 4px", fontSize: 11, color: "var(--ink-3)",
      }} onClick={onLogout}>로그아웃</button>
    </div>
  );
}

export { LoginGate, NoAccessGate, RoleBadge };
