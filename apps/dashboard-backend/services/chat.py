"""Chatbot QA core logic (ADR 0033, Step 3: rule/template, no LLM yet).

This module is intentionally LLM-free and side-effect-free so it can be unit
tested without DynamoDB/Bedrock.  It provides:

  - parse_query(): intent + factory + time-scope parsing (Korean, KST aware)
  - summarize_latest()/summarize_history(): turn raw tool output into an
    ``Evidence`` object (confirmed values vs inferred reasoning vs missing data)
  - render_answer(): deterministic Korean answer template

The ``Evidence`` dict produced here is exactly the structured input that the
Step 4 Bedrock generator will receive in place of render_answer().  Keeping the
data path (router → ddb tools → Evidence) identical means swapping in the LLM
later changes only the final "explain" step, not how data is found.

Design contract (ADR 0033):
  - Backend finds the data; the answer layer only explains pre-fetched evidence.
  - Confirmed values and inferred reasoning are kept separate.
  - Missing/assumed data is surfaced explicitly, never silently interpolated.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

# ─── Constants ────────────────────────────────────────────────────────────────

KST = timezone(timedelta(hours=9))
_POINT_HALF_WINDOW = timedelta(minutes=5)
# Staleness threshold aligned with ADR 0028 (pipeline_status 120s).
_STALE_AFTER_SECONDS = 120

RISK_SCORE_POLICY = (
    "Risk Score는 안전 점수다. 100~85=안전, 84~50=주의, 49~0=위험. "
    "점수가 높을수록 안전하고 낮을수록 위험하다."
)


class Intent:
    CURRENT_STATUS = "current_status"
    CAUSE_ANALYSIS = "cause_analysis"
    HISTORY_TREND = "history_trend"
    REPORT = "report"
    UNKNOWN = "unknown"


# Intents whose answer requires a concrete factory target.
_FACTORY_REQUIRED = {
    Intent.CURRENT_STATUS,
    Intent.CAUSE_ANALYSIS,
    Intent.HISTORY_TREND,
    Intent.REPORT,
}


# ─── Parsed query model ───────────────────────────────────────────────────────

@dataclass(frozen=True)
class TimeScope:
    """Resolved time intent.

    kind:
      "now"   → current snapshot (no historical query)
      "point" → a specific past instant ± _POINT_HALF_WINDOW
      "range" → a trailing window ending at now
    window: ddb window string ("30m"/"1h"/"6h"/"24h"/"2d") used to pick the
            HISTORY#STATE (<=1h) vs GRAPH#5M (>1h) source branch.
    """
    kind: str
    window: str
    target_kst: datetime | None = None
    start_utc: datetime | None = None
    end_utc: datetime | None = None
    assumed: bool = False
    note: str = ""

    def to_dict(self) -> dict:
        start_kst = self.start_utc.astimezone(KST) if self.start_utc else None
        end_kst = self.end_utc.astimezone(KST) if self.end_utc else None
        return {
            "kind": self.kind,
            "window": self.window,
            "target_kst": self.target_kst.isoformat() if self.target_kst else None,
            "start": _iso(self.start_utc) if self.start_utc else None,
            "end": _iso(self.end_utc) if self.end_utc else None,
            "start_kst": start_kst.isoformat() if start_kst else None,
            "end_kst": end_kst.isoformat() if end_kst else None,
            "assumed": self.assumed,
            "note": self.note,
        }


@dataclass(frozen=True)
class ParsedQuery:
    intent: str
    factory_id: str | None
    time: TimeScope
    raw: str

    @property
    def needs_factory(self) -> bool:
        return self.intent in _FACTORY_REQUIRED


@dataclass
class Evidence:
    """Structured grounding for the answer.  Also the Step 4 LLM input."""
    confirmed: dict = field(default_factory=dict)
    inferred: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "confirmed": self.confirmed,
            "inferred": self.inferred,
            "missing": self.missing,
        }


# ─── Time helpers ─────────────────────────────────────────────────────────────

def _iso(dt: datetime) -> str:
    """UTC ISO string matching the sk timestamp format used in DDB."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _round(value, digits: int = 1):
    return round(value, digits) if isinstance(value, (int, float)) else value


def risk_level_from_score(score) -> str | None:
    """Map the canonical Risk Score policy to a level label."""
    if not isinstance(score, (int, float)) or isinstance(score, bool):
        return None
    if score >= 85:
        return "safe"
    if score >= 50:
        return "warning"
    return "danger"


def risk_level_kr(level: str | None) -> str:
    return {"safe": "안전", "warning": "주의", "danger": "위험"}.get(level or "", level or "미확인")


# ─── Intent / factory / time parsing ──────────────────────────────────────────

_CAUSE_KEYWORDS = ("왜", "이유", "원인", "때문", "올랐", "왜그래", "어쩌다")
_REPORT_KEYWORDS = ("보고서", "리포트", "report", "일간 보고")
_TREND_KEYWORDS = ("추이", "추세", "변화", "그래프", "트렌드", "동안", "흐름")
_STATUS_KEYWORDS = ("상태", "지금", "현재", "위험", "어때", "어떤가", "괜찮", "어떻")

_FACTORY_RE = re.compile(r"factory[-\s]?([a-zA-Z])\b")
_FACTORY_KO_RE = re.compile(r"(?:공장\s*([a-zA-Z])|([a-zA-Z])\s*공장)")

_HOUR_RE = re.compile(r"(오전|오후|새벽|아침|저녁|밤|정오|자정)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?")
_RECENT_RE = re.compile(r"(?:최근|지난|직전)\s*(\d+)\s*(시간|분|일)")
_NOW_KEYWORDS = ("지금", "현재", "실시간", "now")


def parse_intent(text: str) -> str:
    t = text.lower()
    if any(k in text for k in _CAUSE_KEYWORDS):
        return Intent.CAUSE_ANALYSIS
    if any(k in t for k in _REPORT_KEYWORDS):
        return Intent.REPORT
    if any(k in text for k in _TREND_KEYWORDS) or _RECENT_RE.search(text):
        return Intent.HISTORY_TREND
    if any(k in text for k in _STATUS_KEYWORDS):
        return Intent.CURRENT_STATUS
    return Intent.UNKNOWN


def parse_factory_id(text: str, explicit: str | None = None) -> str | None:
    if explicit and explicit.strip():
        return explicit.strip().lower()
    m = _FACTORY_RE.search(text)
    if m:
        return f"factory-{m.group(1).lower()}"
    m = _FACTORY_KO_RE.search(text)
    if m:
        letter = m.group(1) or m.group(2)
        return f"factory-{letter.lower()}"
    return None


def _resolve_hour(marker: str | None, hour: int) -> int:
    """Map a Korean AM/PM marker + hour to a 0–23 hour."""
    if marker in ("오후", "저녁", "밤") and hour < 12:
        return hour + 12
    if marker in ("오전", "새벽", "아침") and hour == 12:
        return 0
    if marker == "정오":
        return 12
    if marker == "자정":
        return 0
    return hour % 24


def _resolve_unmarked_past_time(now_kst: datetime, hour: int, minute: int) -> datetime:
    """Resolve "3시" to the nearest past occurrence, considering PM for 1~11."""
    base = now_kst.date()
    hours = [hour % 24]
    if 1 <= hour <= 11:
        hours.append(hour + 12)
    candidates = []
    for day_offset in (0, -1):
        day = base + timedelta(days=day_offset)
        for h in hours:
            candidates.append(datetime(day.year, day.month, day.day, h, minute, 0, tzinfo=KST))
    past = [dt for dt in candidates if dt <= now_kst]
    return max(past) if past else min(candidates)


def parse_time(text: str, now_utc: datetime) -> TimeScope:
    now_kst = now_utc.astimezone(KST)

    # 1) trailing window: "최근 3시간", "지난 30분", "지난 2일"
    m = _RECENT_RE.search(text)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        window = {"시간": f"{n}h", "분": f"{n}m", "일": f"{n}d"}[unit]
        delta = {"시간": timedelta(hours=n), "분": timedelta(minutes=n), "일": timedelta(days=n)}[unit]
        return TimeScope(
            kind="range",
            window=window,
            start_utc=now_utc - delta,
            end_utc=now_utc,
        )

    # 2) specific past instant: optional day word + "N시"
    hm = _HOUR_RE.search(text)
    if hm:
        marker, hour, minute = hm.group(1), int(hm.group(2)), int(hm.group(3) or 0)
        assumed = False
        note = ""
        explicit_day = False
        if "그저께" in text or "엊그제" in text:
            base_day = (now_kst - timedelta(days=2)).date()
            explicit_day = True
        elif "어제" in text:
            base_day = (now_kst - timedelta(days=1)).date()
            explicit_day = True
        elif "오늘" in text:
            base_day = now_kst.date()
            explicit_day = True
        else:
            base_day = now_kst.date()
            assumed = True
        if assumed and marker is None:
            target_kst = _resolve_unmarked_past_time(now_kst, hour, minute)
        else:
            resolved = _resolve_hour(marker, hour)
            target_kst = datetime(
                base_day.year, base_day.month, base_day.day, resolved, minute, 0, tzinfo=KST
            )
            # No explicit day word and the time is still in the future today →
            # assume the most recent past occurrence (yesterday).
            if assumed and not explicit_day and target_kst > now_kst:
                target_kst -= timedelta(days=1)
        if assumed:
            note = "날짜가 명시되지 않아 가장 가까운 과거 시점으로 해석했습니다."
        start_utc = target_kst.astimezone(timezone.utc) - _POINT_HALF_WINDOW
        end_utc = target_kst.astimezone(timezone.utc) + _POINT_HALF_WINDOW
        age = now_utc - target_kst.astimezone(timezone.utc)
        window = "1h" if age <= timedelta(hours=1) else "24h"
        return TimeScope(
            kind="point",
            window=window,
            target_kst=target_kst,
            start_utc=start_utc,
            end_utc=end_utc,
            assumed=assumed,
            note=note,
        )

    # 3) explicit "now"
    if any(k in text for k in _NOW_KEYWORDS):
        return TimeScope(kind="now", window="1h")

    # 4) fallback — treat as current snapshot, flagged as an assumption
    return TimeScope(
        kind="now",
        window="1h",
        assumed=True,
        note="시점이 명시되지 않아 현재 기준으로 답합니다.",
    )


def parse_query(text: str, explicit_factory: str | None, now_utc: datetime) -> ParsedQuery:
    intent = parse_intent(text)
    factory_id = parse_factory_id(text, explicit_factory)
    time = parse_time(text, now_utc)

    # Reconcile intent with time: a trend question without a window defaults to 6h.
    if intent == Intent.HISTORY_TREND and time.kind == "now":
        time = TimeScope(
            kind="range",
            window="6h",
            start_utc=now_utc - timedelta(hours=6),
            end_utc=now_utc,
            assumed=True,
            note="구간이 명시되지 않아 최근 6시간 기준으로 답합니다.",
        )
    return ParsedQuery(intent=intent, factory_id=factory_id, time=time, raw=text)


# ─── Evidence builders ────────────────────────────────────────────────────────

def _first_number(d: dict, *keys: str) -> float | None:
    for k in keys:
        v = d.get(k)
        if isinstance(v, bool):
            continue
        if isinstance(v, (int, float)):
            return float(v)
    return None


def summarize_latest(item: dict, now_utc: datetime) -> Evidence:
    """Confirmed values from a LATEST item; flags staleness as missing/uncertain."""
    ev = Evidence()
    if not item:
        ev.missing.append("LATEST 데이터 없음")
        return ev

    risk = item.get("risk") or {}
    fs = item.get("factory_state") or {}
    ps = item.get("pipeline_status") or {}
    updated_at = item.get("updated_at")

    ev.confirmed["factory_id"] = item.get("factory_id")
    ev.confirmed["risk_score"] = _round(risk.get("score"))
    ev.confirmed["risk_level"] = risk_level_from_score(risk.get("score")) or risk.get("level")
    ev.confirmed["risk_score_policy"] = RISK_SCORE_POLICY
    ev.confirmed["pipeline_status"] = ps.get("status")
    ev.confirmed["updated_at"] = updated_at
    temp = _first_number(fs, "temperature_celsius", "temperature_celsius_avg")
    if temp is not None:
        ev.confirmed["temperature_celsius"] = _round(temp)
    top = risk.get("top_causes") or []
    if top:
        ev.confirmed["top_causes"] = [
            {"name": c.get("name") or c.get("field"), "value": _round(c.get("value"))}
            for c in top
            if isinstance(c, dict)
        ]

    if risk.get("score") is None:
        ev.missing.append("risk_score 값 없음")
    updated_dt = _parse_iso(updated_at)
    if updated_dt is not None:
        age = (now_utc - updated_dt).total_seconds()
        if age > _STALE_AFTER_SECONDS:
            ev.missing.append(f"최신 데이터 지연: 마지막 갱신 {int(age)}초 전")
    return ev


def summarize_history(items: list[dict], scope: TimeScope) -> Evidence:
    """Min/max/avg of risk + temperature over the fetched window, plus a
    first→last delta used as (inferred) cause reasoning."""
    ev = Evidence()
    risks = [i["risk_score"] for i in items if i.get("risk_score") is not None]
    temps = [i["temperature_celsius_avg"] for i in items if i.get("temperature_celsius_avg") is not None]
    ai_scores = [
        v
        for i in items
        for v in (
            i.get("ai_max_score"),
            i.get("fire_score_max"),
            i.get("fall_score_max"),
            i.get("bend_score_max"),
            i.get("fire_score"),
            i.get("fall_score"),
            i.get("bend_score"),
        )
        if isinstance(v, (int, float)) and not isinstance(v, bool)
    ]

    if not items or not risks:
        ev.missing.append("해당 구간 위험도 데이터 없음")
        return ev

    if scope.start_utc and scope.end_utc:
        ev.confirmed["time_range_kst"] = (
            f"{scope.start_utc.astimezone(KST).strftime('%Y-%m-%d %H:%M')}"
            f"~{scope.end_utc.astimezone(KST).strftime('%H:%M')} KST"
        )
    ev.confirmed["sample_count"] = len(items)
    ev.confirmed["risk_score_min"] = _round(min(risks))
    ev.confirmed["risk_score_max"] = _round(max(risks))
    ev.confirmed["risk_score_avg"] = _round(sum(risks) / len(risks))
    ev.confirmed["risk_score_min_level"] = risk_level_from_score(min(risks))
    ev.confirmed["risk_score_max_level"] = risk_level_from_score(max(risks))
    ev.confirmed["risk_score_avg_level"] = risk_level_from_score(sum(risks) / len(risks))
    ev.confirmed["risk_score_policy"] = RISK_SCORE_POLICY
    if temps:
        ev.confirmed["temperature_avg"] = _round(sum(temps) / len(temps))
    if ai_scores:
        ev.confirmed["ai_detection_max_score"] = _round(max(ai_scores), 3)

    first, last = items[0], items[-1]
    risk_delta = (last.get("risk_score") or 0) - (first.get("risk_score") or 0)
    ev.confirmed["risk_score_start"] = _round(first.get("risk_score"))
    ev.confirmed["risk_score_end"] = _round(last.get("risk_score"))
    ev.confirmed["risk_score_delta"] = _round(risk_delta)
    ev.confirmed["risk_score_start_level"] = risk_level_from_score(first.get("risk_score"))
    ev.confirmed["risk_score_end_level"] = risk_level_from_score(last.get("risk_score"))

    causes = last.get("top_cause_names") or []
    if causes:
        ev.confirmed["top_causes"] = causes

    # Inferred reasoning — explicitly marked as 추정, never asserted as fact.
    if abs(risk_delta) >= 1:
        direction = "개선" if risk_delta > 0 else "악화"
        reason = f"구간 내 안전 점수가 {abs(_round(risk_delta))}점 {direction}되었습니다."
        if causes:
            reason += f" 주요 기여 요인: {', '.join(map(str, causes))}."
        ev.inferred.append(reason)
    if scope.note:
        ev.inferred.append(scope.note)
    return ev


# ─── Answer rendering (rule/template — replaced by Bedrock in Step 4) ─────────

def _fmt_evidence_block(ev: Evidence) -> str:
    lines = []
    if ev.inferred:
        lines.append("[추정]")
        lines.extend(f"- {s}" for s in ev.inferred)
    if ev.missing:
        lines.append("[데이터 주의]")
        lines.extend(f"- {s}" for s in ev.missing)
    return "\n".join(lines)


def render_answer(parsed: ParsedQuery, ev: Evidence) -> str:
    fid = parsed.factory_id
    c = ev.confirmed

    if parsed.intent == Intent.UNKNOWN:
        return (
            "질문을 이해하지 못했습니다. 예: "
            "'factory-a 지금 상태', 'factory-b 어제 오후 3시 왜 위험했어', "
            "'factory-a 최근 6시간 추이'."
        )

    if parsed.intent == Intent.REPORT:
        return (
            f"[{fid}] 일간 보고서는 보고서 탭에서 날짜를 선택해 조회할 수 있습니다. "
            "(챗봇 보고서 조회 도구는 후속 단계에서 연결됩니다.)"
        )

    if not c and ev.missing:
        return f"[{fid}] 요청 구간에서 확인된 데이터가 없습니다.\n" + _fmt_evidence_block(ev)

    if parsed.intent == Intent.CURRENT_STATUS:
        level = risk_level_kr(c.get("risk_level"))
        head = (
            f"[{fid}] 현재 안전 점수는 {c.get('risk_score')}점"
            f"({level})입니다. 100점에 가까울수록 안전합니다."
        )
        parts = []
        if c.get("pipeline_status"):
            parts.append(f"파이프라인 상태 {c['pipeline_status']}")
        if c.get("temperature_celsius") is not None:
            parts.append(f"온도 {c['temperature_celsius']}도")
        body = (" / ".join(parts) + ".") if parts else ""
        causes = c.get("top_causes") or []
        cause_str = ""
        if causes:
            cause_str = "\n주요 기여 요인: " + ", ".join(
                f"{x['name']}({x['value']})" for x in causes if x.get("name")
            )
        tail = ("\n" + _fmt_evidence_block(ev)) if (ev.inferred or ev.missing) else ""
        return "\n".join(filter(None, [head, body, cause_str.strip()])) + tail

    # CAUSE_ANALYSIS / HISTORY_TREND share the history evidence shape.
    when = ""
    if parsed.time.target_kst:
        when = parsed.time.target_kst.strftime("%Y-%m-%d %H:%M KST 무렵 ")
    head = (
        f"[{fid}] {when}안전 점수는 평균 {c.get('risk_score_avg')}점"
        f"({risk_level_kr(c.get('risk_score_avg_level'))}), "
        f"최저 {c.get('risk_score_min')}점({risk_level_kr(c.get('risk_score_min_level'))})"
        f" ~ 최고 {c.get('risk_score_max')}점({risk_level_kr(c.get('risk_score_max_level'))})입니다."
    )
    delta_line = ""
    if c.get("risk_score_delta") is not None:
        delta_line = (
            f"구간 시작 {c.get('risk_score_start')}점({risk_level_kr(c.get('risk_score_start_level'))})"
            f" → 종료 {c.get('risk_score_end')}점({risk_level_kr(c.get('risk_score_end_level'))})"
            f" (변화 {c.get('risk_score_delta')})."
        )
    ai_line = ""
    if c.get("ai_detection_max_score") is not None:
        ai_line = f"AI 탐지 최대 점수는 {c.get('ai_detection_max_score')}입니다."
    tail = ("\n" + _fmt_evidence_block(ev)) if (ev.inferred or ev.missing) else ""
    return "\n".join(filter(None, [head, delta_line, ai_line])) + tail


def needs_factory(intent: str) -> bool:
    return intent in _FACTORY_REQUIRED
