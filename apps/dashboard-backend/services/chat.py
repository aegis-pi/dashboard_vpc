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
REPORT_TARGET_CLOUD_INFRA = "cloud-infra"
AI_DETECTION_LABELS = {
    "fire": "화재",
    "fire_score": "화재",
    "fire_score_max": "화재",
    "fall": "넘어짐",
    "fall_score": "넘어짐",
    "fall_score_max": "넘어짐",
    "fallen": "넘어짐",
    "fallen_detected": "넘어짐",
    "bend": "굽힘",
    "bend_score": "굽힘",
    "bend_score_max": "굽힘",
    "bending": "굽힘",
    "bending_detected": "굽힘",
    "ai_event_rate": "AI 이벤트",
    "overall": "전체",
    "data_freshness": "데이터 신선도",
    "network_reachability": "네트워크 연결성",
    "pipeline_status": "파이프라인 상태",
}


class Intent:
    CURRENT_STATUS = "current_status"
    CAUSE_ANALYSIS = "cause_analysis"
    HISTORY_TREND = "history_trend"
    SPIKE_CHECK = "spike_check"
    REPORT = "report"
    UNKNOWN = "unknown"


# Intents whose answer requires a concrete factory target.
_FACTORY_REQUIRED = {
    Intent.CURRENT_STATUS,
    Intent.CAUSE_ANALYSIS,
    Intent.HISTORY_TREND,
    Intent.SPIKE_CHECK,
    Intent.REPORT,
}

# Metrics a spike_check may target (ADR 0034).  Anything else → risk_score.
METRIC_RISK_SCORE = "risk_score"
METRIC_AI_DETECTION = "ai_detection"
METRIC_TEMPERATURE = "temperature"
_VALID_METRICS = {METRIC_RISK_SCORE, METRIC_AI_DETECTION, METRIC_TEMPERATURE}
_VALID_COMPARISONS = {"above", "below", "spike", "none"}
_SPIKE_ZSCORE_K = 2.5  # |v - mean| >= k·std → flagged when no explicit threshold


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
    # spike_check parameters (ADR 0034); None for all other intents.
    metric: str | None = None
    threshold: float | None = None
    comparison: str | None = None

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


def _format_item_time_kst(item: dict) -> str | None:
    """Return the best KST label for a history/GRAPH item."""
    ts = item.get("timestamp") or item.get("bucket_start")
    dt = _parse_iso(ts)
    if dt is None:
        return ts if isinstance(ts, str) and ts else None
    if item.get("is_bucket"):
        end_dt = _parse_iso(item.get("bucket_end"))
        if end_dt is not None:
            return f"{dt.astimezone(KST).strftime('%Y-%m-%d %H:%M')}~{end_dt.astimezone(KST).strftime('%H:%M')} KST"
    return dt.astimezone(KST).strftime("%Y-%m-%d %H:%M:%S KST")


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


def ai_detection_label(value: str | None) -> str | None:
    """Human label for stored AI detection field/source names."""
    if not value:
        return value
    return AI_DETECTION_LABELS.get(str(value), str(value))


def display_cause_name(value: str | None) -> str | None:
    """Korean display label for risk/top cause names while preserving unknowns."""
    return ai_detection_label(value) or value


# ─── Intent / factory / time parsing ──────────────────────────────────────────

_CAUSE_KEYWORDS = (
    "왜", "이유", "원인", "때문", "올랐", "하락", "급락", "떨어", "낮아", "내려", "왜그래", "어쩌다"
)
_REPORT_KEYWORDS = ("보고서", "리포트", "report", "일간 보고")
_TREND_KEYWORDS = ("추이", "추세", "변화", "그래프", "트렌드", "동안", "흐름")
_STATUS_KEYWORDS = ("상태", "지금", "현재", "위험", "어때", "어떤가", "괜찮", "어떻")
# spike_check (ADR 0034 Phase 2) — rule-parser fallback keywords.
_SPIKE_KEYWORDS = ("튄", "튀었", "튀는", "튀어", "스파이크", "이상값", "이상치", "급등", "급증", "치솟", "spike")
_METRIC_AI_KEYWORDS = ("ai", "에이아이", "탐지", "감지", "화재", "낙상", "쓰러", "굽힘", "fire", "fall", "bend")
_METRIC_TEMP_KEYWORDS = ("온도", "temperature", "섭씨")
_THRESHOLD_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:점|도|%)?\s*(이상|초과|넘는|넘게|이하|미만|아래|밑)")

_FACTORY_RE = re.compile(r"factory[-\s]?([a-zA-Z])(?=$|[^a-zA-Z0-9])")
_FACTORY_KO_RE = re.compile(r"(?:공장\s*([a-zA-Z])|([a-zA-Z])\s*공장)")

_HOUR_RE = re.compile(r"(오전|오후|새벽|아침|저녁|밤|정오|자정)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?")
# Absolute bounded interval: "오전 9시~10시", "어제 2시부터 4시까지", "9시 30분 - 11시".
_INTERVAL_RE = re.compile(
    r"(오전|오후|새벽|아침|저녁|밤|정오|자정)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?"
    r"\s*(?:부터|에서|[~\-–—])\s*"
    r"(오전|오후|새벽|아침|저녁|밤|정오|자정)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?"
    r"\s*(?:사이|동안|까지)?"
)
_RECENT_RE = re.compile(r"(?:최근|지난|직전)\s*(\d+)\s*(시간|분|일)")
_NOW_KEYWORDS = ("지금", "현재", "실시간", "now")


def parse_intent(text: str) -> str:
    t = text.lower()
    if any(k in text for k in _CAUSE_KEYWORDS):
        return Intent.CAUSE_ANALYSIS
    # spike before trend/status: "튄 값 있어?" must not collapse to current_status.
    if any(k in t for k in _SPIKE_KEYWORDS):
        return Intent.SPIKE_CHECK
    if any(k in t for k in _REPORT_KEYWORDS):
        return Intent.REPORT
    if any(k in text for k in _TREND_KEYWORDS) or _RECENT_RE.search(text):
        return Intent.HISTORY_TREND
    if any(k in text for k in _STATUS_KEYWORDS):
        return Intent.CURRENT_STATUS
    return Intent.UNKNOWN


def _parse_spike_params(text: str) -> tuple[str, float | None, str | None]:
    """Rule-side spike parameters: metric + optional explicit threshold/direction."""
    t = text.lower()
    if any(k in t for k in _METRIC_AI_KEYWORDS):
        metric = METRIC_AI_DETECTION
    elif any(k in t for k in _METRIC_TEMP_KEYWORDS):
        metric = METRIC_TEMPERATURE
    else:
        metric = METRIC_RISK_SCORE
    threshold: float | None = None
    comparison: str | None = None
    m = _THRESHOLD_RE.search(text)
    if m:
        threshold = float(m.group(1))
        comparison = "below" if m.group(2) in ("이하", "미만", "아래", "밑") else "above"
    return metric, threshold, comparison


def parse_factory_id(text: str, explicit: str | None = None) -> str | None:
    if explicit and explicit.strip():
        value = explicit.strip().lower().replace("_", "-")
        return value
    lowered = text.lower()
    if any(k in text for k in _REPORT_KEYWORDS) and (
        "cloud-infra" in lowered
        or "cloud infra" in lowered
        or "cloud_infra" in lowered
        or "클라우드" in text
    ):
        return REPORT_TARGET_CLOUD_INFRA
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


def _base_day(text: str, now_kst: datetime):
    """Resolve the base calendar day from day words. Returns (date, explicit_day)."""
    if "그저께" in text or "엊그제" in text:
        return (now_kst - timedelta(days=2)).date(), True
    if "어제" in text:
        return (now_kst - timedelta(days=1)).date(), True
    if "오늘" in text:
        return now_kst.date(), True
    return now_kst.date(), False


def _interval_timescope(
    start_kst: datetime, end_kst: datetime, now_utc: datetime, assumed: bool = False, note: str = ""
) -> TimeScope:
    """Build an absolute-interval TimeScope, picking the right DDB source window.

    HISTORY#STATE keeps only ~2h (TTL), so an interval whose start is older than
    ~1h must read the GRAPH#5M 5-minute aggregates instead.  The end is clamped
    to now so a partly-future interval still resolves to real data.
    """
    start_utc = start_kst.astimezone(timezone.utc)
    end_utc = min(end_kst.astimezone(timezone.utc), now_utc)
    start_age = now_utc - start_utc
    window = "1h" if start_age <= timedelta(hours=1) else "6h"
    if assumed and not note:
        note = "날짜가 명시되지 않아 가장 가까운 과거 구간으로 해석했습니다."
    return TimeScope(
        kind="interval",
        window=window,
        start_utc=start_utc,
        end_utc=end_utc,
        assumed=assumed,
        note=note,
    )


def _resolve_interval(text: str, now_kst: datetime, m) -> tuple[datetime, datetime, bool]:
    """Resolve an _INTERVAL_RE match to (start_kst, end_kst, assumed).

    A marker on one side carries over to the other ("오전 9시~10시" → 둘 다 오전).
    Unmarked hours are read literally (0–23); the precise AM/PM disambiguation of
    the single-instant path is intentionally not duplicated here.
    """
    base_day, explicit_day = _base_day(text, now_kst)
    sm, sh, smn = m.group(1), int(m.group(2)), int(m.group(3) or 0)
    em, eh, emn = m.group(4), int(m.group(5)), int(m.group(6) or 0)
    sm = sm or em
    em = em or sm
    start_h = _resolve_hour(sm, sh) if sm else sh % 24
    end_h = _resolve_hour(em, eh) if em else eh % 24
    start_kst = datetime(base_day.year, base_day.month, base_day.day, start_h, smn, 0, tzinfo=KST)
    end_kst = datetime(base_day.year, base_day.month, base_day.day, end_h, emn, 0, tzinfo=KST)
    if end_kst <= start_kst:  # crosses midnight (e.g. 23시~1시)
        end_kst += timedelta(days=1)
    # No explicit day word and the interval is still in the future → most recent past day.
    if not explicit_day and start_kst > now_kst:
        start_kst -= timedelta(days=1)
        end_kst -= timedelta(days=1)
    return start_kst, end_kst, not explicit_day


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

    # 2) absolute bounded interval: "오전 9시~10시", "어제 2시부터 4시까지"
    im = _INTERVAL_RE.search(text)
    if im:
        start_kst, end_kst, assumed = _resolve_interval(text, now_kst, im)
        return _interval_timescope(start_kst, end_kst, now_utc, assumed=assumed)

    # 3) specific past instant: optional day word + "N시"
    hm = _HOUR_RE.search(text)
    if hm:
        marker, hour, minute = hm.group(1), int(hm.group(2)), int(hm.group(3) or 0)
        note = ""
        base_day, explicit_day = _base_day(text, now_kst)
        assumed = not explicit_day
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

    # 4) explicit "now"
    if any(k in text for k in _NOW_KEYWORDS):
        return TimeScope(kind="now", window="1h")

    # 5) fallback — treat as current snapshot, flagged as an assumption
    return TimeScope(
        kind="now",
        window="1h",
        assumed=True,
        note="시점이 명시되지 않아 현재 기준으로 답합니다.",
    )


_DATE_RE = re.compile(r"(20\d{2})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})")


def parse_report_date(text: str, now_utc: datetime) -> str | None:
    """Resolve a daily report date in KST. None means "latest accessible"."""
    now_kst = now_utc.astimezone(KST)
    m = _DATE_RE.search(text)
    if m:
        yyyy, mm, dd = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return datetime(yyyy, mm, dd, tzinfo=KST).strftime("%Y-%m-%d")
        except ValueError:
            return None
    if "그저께" in text or "엊그제" in text:
        return (now_kst.date() - timedelta(days=2)).isoformat()
    if "어제" in text:
        return (now_kst.date() - timedelta(days=1)).isoformat()
    if "오늘" in text:
        return now_kst.date().isoformat()
    return None


def parse_query(text: str, explicit_factory: str | None, now_utc: datetime) -> ParsedQuery:
    intent = parse_intent(text)
    factory_id = parse_factory_id(text, explicit_factory)
    time = parse_time(text, now_utc)

    metric = threshold = comparison = None
    if intent == Intent.SPIKE_CHECK:
        metric, threshold, comparison = _parse_spike_params(text)

    # Reconcile intent with time: a trend/spike question without a window defaults to 6h.
    if intent in (Intent.HISTORY_TREND, Intent.SPIKE_CHECK) and time.kind == "now":
        time = TimeScope(
            kind="range",
            window="6h",
            start_utc=now_utc - timedelta(hours=6),
            end_utc=now_utc,
            assumed=True,
            note="구간이 명시되지 않아 최근 6시간 기준으로 답합니다.",
        )
    return ParsedQuery(
        intent=intent,
        factory_id=factory_id,
        time=time,
        raw=text,
        metric=metric,
        threshold=threshold,
        comparison=comparison,
    )


# ─── LLM resolution → ParsedQuery (ADR 0034) ─────────────────────────────────
# The resolve step (services.bedrock.resolve_query) returns a structured dict
# extracted by the LLM.  This module validates it deterministically and maps it
# to the same ParsedQuery the rule parser produces — so RBAC, the data tools,
# and Evidence are entirely unaffected by *how* the query was understood.

# Intents the resolve step may emit (Phase 1).  Anything else → UNKNOWN.
_RESOLVE_INTENTS = {
    Intent.CURRENT_STATUS,
    Intent.CAUSE_ANALYSIS,
    Intent.HISTORY_TREND,
    Intent.SPIKE_CHECK,
    Intent.REPORT,
    Intent.UNKNOWN,
}
_FACTORY_ID_RE = re.compile(r"^factory-[a-z0-9-]+$")
_WINDOW_RE = re.compile(r"^\s*(\d+)\s*(m|h|d)\s*$", re.IGNORECASE)


def _normalize_factory_id(value) -> str | None:
    """Accept only well-formed factory ids; reject hallucinated/garbage values."""
    if not isinstance(value, str):
        return None
    fid = value.strip().lower().replace("_", "-")
    if fid == REPORT_TARGET_CLOUD_INFRA:
        return fid
    return fid if _FACTORY_ID_RE.match(fid) else None


def _parse_window_delta(window) -> tuple[str, timedelta] | None:
    """'90m'/'6h'/'2d' → (normalized window, timedelta). None when unparseable."""
    if not isinstance(window, str):
        return None
    m = _WINDOW_RE.match(window)
    if not m:
        return None
    n, unit = int(m.group(1)), m.group(2).lower()
    if n <= 0:
        return None
    delta = {"m": timedelta(minutes=n), "h": timedelta(hours=n), "d": timedelta(days=n)}[unit]
    return f"{n}{unit}", delta


def _parse_kst(value) -> datetime | None:
    """Parse an LLM-emitted KST timestamp; naive values are assumed KST."""
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt.replace(tzinfo=KST) if dt.tzinfo is None else dt


def _timescope_from_resolution(time_obj: dict, now_utc: datetime) -> TimeScope:
    """Build a validated TimeScope from the LLM's {mode, anchor_kst, window}.

    All hallucination guards live here: future instants are clamped to the most
    recent past, unparseable windows fall back to a flagged default.
    """
    now_kst = now_utc.astimezone(KST)
    mode = (time_obj or {}).get("mode")
    window_raw = (time_obj or {}).get("window")
    anchor_raw = (time_obj or {}).get("anchor_kst")

    if mode == "range":
        parsed = _parse_window_delta(window_raw)
        if parsed is None:
            return TimeScope(
                kind="range",
                window="6h",
                start_utc=now_utc - timedelta(hours=6),
                end_utc=now_utc,
                assumed=True,
                note="구간이 불명확하여 최근 6시간 기준으로 답합니다.",
            )
        window, delta = parsed
        return TimeScope(kind="range", window=window, start_utc=now_utc - delta, end_utc=now_utc)

    if mode == "point":
        target_kst = _parse_kst(anchor_raw)
        if target_kst is None:
            return TimeScope(
                kind="now",
                window="1h",
                assumed=True,
                note="시점을 해석하지 못해 현재 기준으로 답합니다.",
            )
        assumed = False
        note = ""
        if target_kst > now_kst:  # guard against a hallucinated future instant
            target_kst = now_kst
            assumed = True
            note = "미래 시각으로 해석되어 현재 기준으로 보정했습니다."
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

    if mode == "interval":
        start = _parse_kst((time_obj or {}).get("start_kst"))
        end = _parse_kst((time_obj or {}).get("end_kst"))
        if start is None or end is None:
            return TimeScope(
                kind="range",
                window="6h",
                start_utc=now_utc - timedelta(hours=6),
                end_utc=now_utc,
                assumed=True,
                note="구간을 해석하지 못해 최근 6시간 기준으로 답합니다.",
            )
        if end < start:  # swap a reversed interval
            start, end = end, start
        if start > now_kst:  # whole interval in the future → recent-range fallback
            return TimeScope(
                kind="range",
                window="6h",
                start_utc=now_utc - timedelta(hours=6),
                end_utc=now_utc,
                assumed=True,
                note="미래 구간으로 해석되어 최근 6시간 기준으로 보정했습니다.",
            )
        assumed = False
        note = ""
        if end > now_kst:  # clamp a partly-future interval to now
            end = now_kst
            assumed = True
            note = "구간 끝이 미래라 현재까지로 보정했습니다."
        return _interval_timescope(start, end, now_utc, assumed=assumed, note=note)

    # mode == "now" or anything unrecognised → current snapshot.
    return TimeScope(kind="now", window="1h")


def map_resolution(
    resolution: dict, explicit_factory: str | None, now_utc: datetime, raw: str
) -> ParsedQuery | None:
    """Map a validated LLM resolution dict to ParsedQuery.

    Returns None when the resolution is structurally unusable (no intent key),
    signalling the caller to fall back to the rule parser.
    """
    if not isinstance(resolution, dict) or "intent" not in resolution:
        return None

    intent = resolution.get("intent")
    if intent not in _RESOLVE_INTENTS:
        intent = Intent.UNKNOWN

    factory_id = parse_factory_id("", explicit_factory) or _normalize_factory_id(
        resolution.get("factory_id")
    )
    time = _timescope_from_resolution(resolution.get("time") or {}, now_utc)

    # Mirror the rule parser: a trend/spike question without a real window → 6h range.
    if intent in (Intent.HISTORY_TREND, Intent.SPIKE_CHECK) and time.kind == "now":
        time = TimeScope(
            kind="range",
            window="6h",
            start_utc=now_utc - timedelta(hours=6),
            end_utc=now_utc,
            assumed=True,
            note="구간이 명시되지 않아 최근 6시간 기준으로 답합니다.",
        )

    metric = threshold = comparison = None
    if intent == Intent.SPIKE_CHECK:
        m = resolution.get("metric")
        metric = m if m in _VALID_METRICS else METRIC_RISK_SCORE
        t = resolution.get("threshold")
        threshold = float(t) if isinstance(t, (int, float)) and not isinstance(t, bool) else None
        c = resolution.get("comparison")
        comparison = c if c in _VALID_COMPARISONS else None

    return ParsedQuery(
        intent=intent,
        factory_id=factory_id,
        time=time,
        raw=raw,
        metric=metric,
        threshold=threshold,
        comparison=comparison,
    )


# ─── Evidence builders ────────────────────────────────────────────────────────

def _first_number(d: dict, *keys: str) -> float | None:
    for k in keys:
        v = d.get(k)
        if isinstance(v, bool):
            continue
        if isinstance(v, (int, float)):
            return float(v)
    return None


def _risk_floor_value(item: dict) -> float | None:
    return _first_number(item, "risk_score_min", "risk_score")


def _risk_ceiling_value(item: dict) -> float | None:
    return _first_number(item, "risk_score_max", "risk_score")


def _ai_detection_value(item: dict) -> tuple[float | None, str | None]:
    fields = (
        ("ai_max_score", "overall"),
        ("fire_score_max", "fire"),
        ("fall_score_max", "fall"),
        ("bend_score_max", "bend"),
        ("fire_score", "fire"),
        ("fall_score", "fall"),
        ("bend_score", "bend"),
    )
    values = [(float(item[k]), label) for k, label in fields if isinstance(item.get(k), (int, float)) and not isinstance(item.get(k), bool)]
    if not values:
        return (None, None)
    value, label = max(values, key=lambda x: x[0])
    return value, ai_detection_label(label)


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
            {"name": display_cause_name(c.get("name") or c.get("field")), "value": _round(c.get("value"))}
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
    risk_mins = [
        i.get("risk_score_min") if i.get("risk_score_min") is not None else i.get("risk_score")
        for i in items
        if (i.get("risk_score_min") is not None or i.get("risk_score") is not None)
    ]
    risk_maxs = [
        i.get("risk_score_max") if i.get("risk_score_max") is not None else i.get("risk_score")
        for i in items
        if (i.get("risk_score_max") is not None or i.get("risk_score") is not None)
    ]
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
    risk_min = min(risk_mins) if risk_mins else min(risks)
    risk_max = max(risk_maxs) if risk_maxs else max(risks)
    risk_min_item = min(
        (i for i in items if _risk_floor_value(i) is not None),
        key=lambda i: _risk_floor_value(i),
        default=None,
    )
    risk_max_item = max(
        (i for i in items if _risk_ceiling_value(i) is not None),
        key=lambda i: _risk_ceiling_value(i),
        default=None,
    )
    ev.confirmed["risk_score_min"] = _round(risk_min)
    ev.confirmed["risk_score_max"] = _round(risk_max)
    ev.confirmed["risk_score_avg"] = _round(sum(risks) / len(risks))
    ev.confirmed["risk_score_min_level"] = risk_level_from_score(risk_min)
    ev.confirmed["risk_score_max_level"] = risk_level_from_score(risk_max)
    ev.confirmed["risk_score_avg_level"] = risk_level_from_score(sum(risks) / len(risks))
    ev.confirmed["risk_score_policy"] = RISK_SCORE_POLICY
    if risk_min_item:
        ev.confirmed["risk_score_min_time_kst"] = _format_item_time_kst(risk_min_item)
    if risk_max_item:
        ev.confirmed["risk_score_max_time_kst"] = _format_item_time_kst(risk_max_item)
    if temps:
        ev.confirmed["temperature_avg"] = _round(sum(temps) / len(temps))
    if ai_scores:
        ai_item, ai_value, ai_source = max(
            (
                (i, value, source)
                for i in items
                for value, source in [_ai_detection_value(i)]
                if value is not None
            ),
            key=lambda x: x[1],
        )
        ev.confirmed["ai_detection_max_score"] = _round(ai_value, 3)
        ev.confirmed["ai_detection_max_time_kst"] = _format_item_time_kst(ai_item)
        ev.confirmed["ai_detection_max_source"] = ai_source

    first, last = items[0], items[-1]
    risk_delta = (last.get("risk_score") or 0) - (first.get("risk_score") or 0)
    ev.confirmed["risk_score_start"] = _round(first.get("risk_score"))
    ev.confirmed["risk_score_end"] = _round(last.get("risk_score"))
    ev.confirmed["risk_score_delta"] = _round(risk_delta)
    ev.confirmed["risk_score_start_level"] = risk_level_from_score(first.get("risk_score"))
    ev.confirmed["risk_score_end_level"] = risk_level_from_score(last.get("risk_score"))

    causes = last.get("top_cause_names") or []
    if causes:
        ev.confirmed["top_causes"] = [display_cause_name(str(c)) for c in causes]
    elif any(i.get("is_bucket") for i in items):
        ev.missing.append("5분 집계 데이터에는 top_causes 원인 필드가 없음")

    # Inferred reasoning — explicitly marked as 추정, never asserted as fact.
    if abs(risk_delta) >= 1:
        direction = "개선" if risk_delta > 0 else "악화"
        reason = f"구간 내 안전 점수가 {abs(_round(risk_delta))}점 {direction}되었습니다."
        if causes:
            reason += f" 주요 기여 요인: {', '.join(display_cause_name(str(c)) or str(c) for c in causes)}."
        ev.inferred.append(reason)
    elif (
        risk_min_item
        and first.get("risk_score") is not None
        and last.get("risk_score") is not None
        and risk_min < first.get("risk_score")
        and last.get("risk_score") > risk_min
    ):
        reason = (
            f"{ev.confirmed.get('risk_score_min_time_kst') or '구간 중간'}에 안전 점수가 "
            f"{_round(risk_min)}점까지 하락했다가, 구간 종료 시 "
            f"{_round(last.get('risk_score'))}점으로 복구된 흐름입니다."
        )
        if causes:
            reason += f" 주요 기여 요인: {', '.join(display_cause_name(str(c)) or str(c) for c in causes)}."
        elif ev.confirmed.get("ai_detection_max_score") is not None:
            reason += (
                f" 같은 구간의 AI 탐지 최대값은 "
                f"{ev.confirmed['ai_detection_max_score']}("
                f"{ev.confirmed.get('ai_detection_max_time_kst') or '시각 미확인'})입니다."
            )
        ev.inferred.append(reason)
    if scope.note:
        ev.inferred.append(scope.note)
    return ev


def enrich_history_with_processed_risk_scores(ev: Evidence, details: list[dict]) -> Evidence:
    """Add S3 processed risk_score drill-down details to history evidence.

    GRAPH#5M is intentionally compact and does not carry top_causes.  When the
    router can read bounded S3 processed details for the same time range, expose
    them as a separate confirmed source instead of pretending they came from DDB.
    """
    usable = [d for d in details if d.get("risk_score") is not None]
    if not usable:
        ev.missing.append("S3 processed risk_score 상세 데이터 없음")
        return ev

    min_detail = min(usable, key=lambda d: d["risk_score"])
    raw_causes = [c for c in (min_detail.get("top_causes") or []) if isinstance(c, dict)]
    cause_details = [
        {
            "name": display_cause_name(str(c.get("name") or c.get("field"))),
            "field": c.get("field") or c.get("name"),
            "reason": c.get("reason"),
            "value": c.get("value"),
            "contribution": _round(c.get("contribution")),
            "severity": c.get("severity"),
            "source": c.get("source"),
        }
        for c in raw_causes
        if c.get("name") or c.get("field")
    ]
    causes = list(dict.fromkeys(c["name"] for c in cause_details if c.get("name")))
    ev.confirmed["processed_risk_score_source"] = "S3 processed/risk_score"
    ev.confirmed["processed_risk_score_sample_count"] = len(usable)
    ev.confirmed["processed_risk_score_min"] = _round(min_detail.get("risk_score"))
    ts = _parse_iso(min_detail.get("timestamp"))
    if ts:
        ev.confirmed["processed_risk_score_min_time_kst"] = ts.astimezone(KST).strftime("%Y-%m-%d %H:%M:%S KST")
    if causes:
        ev.confirmed["top_causes"] = causes
        ev.confirmed["processed_top_causes"] = causes
        ev.confirmed["processed_top_cause_details"] = cause_details
        ev.inferred.append(
            "S3 processed risk_score 상세에서 하락 시점 주요 원인은 "
            + ", ".join(causes)
            + "로 확인됩니다."
        )
        ev.missing = [m for m in ev.missing if "top_causes" not in m]
    else:
        ev.missing.append("S3 processed risk_score 상세에도 top_causes 원인 필드가 없음")
    return ev


# ─── Spike detection (ADR 0034, Phase 2) ─────────────────────────────────────

_METRIC_LABEL = {
    METRIC_RISK_SCORE: "안전 점수",
    METRIC_AI_DETECTION: "AI 탐지 점수",
    METRIC_TEMPERATURE: "온도",
}
_AI_FIELDS = (
    "ai_max_score", "fire_score_max", "fall_score_max", "bend_score_max",
    "fire_score", "fall_score", "bend_score",
)


def _metric_value(item: dict, metric: str) -> float | None:
    """Pull the numeric value for the requested metric from a history item."""
    if metric == METRIC_TEMPERATURE:
        return _first_number(item, "temperature_celsius_avg", "temperature_celsius")
    if metric == METRIC_AI_DETECTION:
        vals = [
            float(item[k]) for k in _AI_FIELDS
            if isinstance(item.get(k), (int, float)) and not isinstance(item.get(k), bool)
        ]
        return max(vals) if vals else None
    return _first_number(item, "risk_score")


def summarize_spikes(
    items: list[dict],
    scope: TimeScope,
    threshold: float | None = None,
    metric: str | None = None,
    comparison: str | None = None,
) -> Evidence:
    """Deterministically flag points that deviate from the window's behaviour.

    Two modes (no LLM, no hallucination):
      - explicit threshold → points above/below the threshold
      - otherwise          → |value - mean| >= k·std (statistical outliers)
    """
    ev = Evidence()
    metric = metric if metric in _VALID_METRICS else METRIC_RISK_SCORE
    label = _METRIC_LABEL[metric]

    series = [
        (i.get("timestamp"), _metric_value(i, metric))
        for i in items
    ]
    series = [(ts, v) for ts, v in series if ts and v is not None]

    if len(series) < 3:
        ev.missing.append(f"{label} 스파이크 판정에 필요한 데이터가 부족합니다 (표본 {len(series)}개).")
        return ev

    values = [v for _, v in series]
    n = len(values)
    mean = sum(values) / n
    std = (sum((v - mean) ** 2 for v in values) / n) ** 0.5
    digits = 3 if metric == METRIC_AI_DETECTION else 1  # AI scores are 0..1

    if scope.start_utc and scope.end_utc:
        ev.confirmed["time_range_kst"] = (
            f"{scope.start_utc.astimezone(KST).strftime('%Y-%m-%d %H:%M')}"
            f"~{scope.end_utc.astimezone(KST).strftime('%H:%M')} KST"
        )
    ev.confirmed["metric"] = label
    ev.confirmed["sample_count"] = n
    ev.confirmed["value_mean"] = _round(mean, digits)
    ev.confirmed["value_std"] = _round(std, max(2, digits))

    spikes: list[tuple[str, float]] = []
    if threshold is not None:
        cmp = comparison if comparison in ("above", "below") else "above"
        ev.confirmed["detection"] = f"임계값 {'이상' if cmp == 'above' else '이하'} {_round(threshold)}"
        for ts, v in series:
            if (v >= threshold) if cmp == "above" else (v <= threshold):
                spikes.append((ts, v))
    else:
        ev.confirmed["detection"] = f"통계 이상치(z≥{_SPIKE_ZSCORE_K})"
        if std > 0:
            for ts, v in series:
                if abs(v - mean) >= _SPIKE_ZSCORE_K * std:
                    spikes.append((ts, v))

    ev.confirmed["spike_count"] = len(spikes)
    if spikes:
        ranked = sorted(spikes, key=lambda x: abs(x[1] - mean), reverse=True)[:5]
        ev.confirmed["spikes"] = [
            {
                "time_kst": (
                    _parse_iso(ts).astimezone(KST).strftime("%Y-%m-%d %H:%M")
                    if _parse_iso(ts) else ts
                ),
                "value": _round(v, digits),
                "deviation": _round(v - mean, digits),
            }
            for ts, v in ranked
        ]
    if metric == METRIC_RISK_SCORE:
        ev.confirmed["risk_score_policy"] = RISK_SCORE_POLICY
    if scope.note:
        ev.inferred.append(scope.note)
    return ev


# ─── Markdown daily report grounding ─────────────────────────────────────────

_REPORT_SECTION_RE = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)


def _report_sections(markdown: str) -> dict[str, str]:
    matches = list(_REPORT_SECTION_RE.finditer(markdown or ""))
    sections: dict[str, str] = {}
    for idx, match in enumerate(matches):
        title = match.group(1).strip()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(markdown)
        sections[title] = markdown[start:end].strip()
    return sections


def _first_table_rows(section: str, max_rows: int = 16) -> list[dict[str, str]]:
    """Parse the first simple Markdown table in a report section."""
    rows = [line.strip() for line in section.splitlines() if line.strip().startswith("|")]
    if len(rows) < 3:
        return []
    headers = [h.strip() for h in rows[0].strip("|").split("|")]
    parsed: list[dict[str, str]] = []
    for row in rows[2:]:
        cells = [c.strip() for c in row.strip("|").split("|")]
        if len(cells) != len(headers):
            continue
        parsed.append(dict(zip(headers, cells)))
        if len(parsed) >= max_rows:
            break
    return parsed


def _clip_report_text(text: str, limit: int = 1800) -> str:
    text = re.sub(r"\n{3,}", "\n\n", (text or "").strip())
    return text if len(text) <= limit else text[:limit].rstrip() + "\n..."


def _report_question_sections(raw: str, target_id: str) -> list[str]:
    t = raw.lower()
    pairs = [
        (("수집", "결측", "공백", "데이터", "collection", "gap"), "데이터 수집 상태"),
        (("risk", "위험", "안전 점수", "저하", "하락", "주의"), "Risk Score"),
        (("ai", "스코어", "소리", "센서", "온도", "습도", "화재", "낙상", "굽힘"), "센서 및 AI 이벤트"),
        (("노드", "워크로드", "재시작", "인프라", "pod", "node"), "인프라 상태"),
        (("backend", "ecs", "alb", "5xx", "runtime"), "Backend Runtime"),
        (("lambda", "dynamodb", "pipeline", "파이프라인", "스로틀"), "Data Pipeline"),
        (("eks", "cluster", "클러스터", "파드"), "EKS Management"),
        (("argocd", "배포", "sync", "동기화"), "ArgoCD 및 배포 상태"),
        (("freshness", "stale", "storage"), "Factory Freshness 및 Storage Freshness"),
        (("이벤트", "언제", "시간", "구간"), "주요 이벤트"),
        (("확인", "조치", "해야", "우선", "todo"), "확인 필요 항목"),
        (("한계", "신뢰", "제한", "raw", "llm"), "데이터 한계"),
    ]
    selected: list[str] = []
    for keys, section in pairs:
        if any(k in t or k in raw for k in keys):
            selected.append(section)
    if not selected:
        selected = ["요약", "핵심 지표 표", "확인 필요 항목"]
    if target_id == REPORT_TARGET_CLOUD_INFRA and "EKS Management" not in selected and (
        "위험" in raw or "상태" in raw
    ):
        selected.append("EKS Management")
    return selected


def summarize_report_markdown(
    markdown: str,
    report_date: str,
    target_id: str,
    raw_question: str,
    *,
    latest_used: bool = False,
) -> Evidence:
    """Turn a daily Markdown report into compact, answerable Evidence.

    The report generator already writes operator-oriented sections.  This keeps
    the chatbot grounded by exposing only the relevant sections/table rows,
    instead of asking the model to infer from unrelated daily metrics.
    """
    ev = Evidence()
    sections = _report_sections(markdown)
    title = next((line.lstrip("# ").strip() for line in markdown.splitlines() if line.startswith("# ")), "")
    requested = _report_question_sections(raw_question, target_id)

    ev.confirmed["report_date"] = report_date
    ev.confirmed["report_target"] = target_id
    ev.confirmed["report_title"] = title
    ev.confirmed["report_kind"] = "cloud_infra" if target_id == REPORT_TARGET_CLOUD_INFRA else "factory"
    ev.confirmed["available_sections"] = list(sections.keys())
    ev.confirmed["selected_sections"] = [name for name in requested if name in sections]
    if latest_used:
        ev.inferred.append("날짜가 명시되지 않아 접근 가능한 최신 일일 보고서를 사용했습니다.")

    for section_name in ("요약", "핵심 지표 표"):
        if section_name in sections:
            key = "summary" if section_name == "요약" else "key_metrics"
            ev.confirmed[key] = _clip_report_text(sections[section_name], 1400)
            rows = _first_table_rows(sections[section_name])
            if rows:
                ev.confirmed[f"{key}_rows"] = rows

    selected_payload: dict[str, dict] = {}
    for name in ev.confirmed["selected_sections"]:
        body = sections.get(name, "")
        selected_payload[name] = {
            "text": _clip_report_text(body),
            "table_rows": _first_table_rows(body),
        }
    if selected_payload:
        ev.confirmed["report_sections"] = selected_payload
    else:
        ev.missing.append("질문과 직접 매칭되는 보고서 섹션을 찾지 못했습니다.")

    if "데이터 한계" in sections:
        ev.confirmed["data_limits"] = _clip_report_text(sections["데이터 한계"], 700)
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
        if not c:
            return f"[{fid}] 요청한 일일 보고서를 찾지 못했습니다.\n" + _fmt_evidence_block(ev)
        title = c.get("report_title") or f"{fid} 일일 보고서"
        date = c.get("report_date")
        head = f"[{fid}] {date} 보고서 기준입니다. {title}"
        summary = c.get("summary")
        sections = c.get("report_sections") or {}
        lines = [head]
        if summary:
            lines.append(summary)
        for name, payload in list(sections.items())[:3]:
            rows = payload.get("table_rows") or []
            if rows:
                rendered = []
                for row in rows[:5]:
                    label = row.get("구분") or row.get("항목") or row.get("시간") or row.get("우선순위")
                    value = row.get("값") or row.get("유형") or row.get("항목") or row.get("이유")
                    decision = row.get("판단") or row.get("지속") or row.get("근거") or row.get("구간")
                    rendered.append(" / ".join(str(x) for x in (label, value, decision) if x))
                lines.append(f"{name}: " + "; ".join(rendered))
            elif payload.get("text") and name != "요약":
                lines.append(f"{name}: {payload['text']}")
        tail = _fmt_evidence_block(ev)
        if tail:
            lines.append(tail)
        return "\n".join(line for line in lines if line)

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

    if parsed.intent == Intent.SPIKE_CHECK:
        metric = c.get("metric") or "값"
        count = c.get("spike_count")
        tail = ("\n" + _fmt_evidence_block(ev)) if (ev.inferred or ev.missing) else ""
        if not count:
            return f"[{fid}] 해당 구간에서 {metric}이(가) 크게 튄 지점은 없습니다." + tail
        pts = c.get("spikes") or []
        detail = ", ".join(f"{p['time_kst']}({p['value']})" for p in pts[:3])
        head = f"[{fid}] {metric} 기준 크게 벗어난 지점 {count}개가 감지되었습니다."
        body = f"주요 지점: {detail}." if detail else ""
        return "\n".join(filter(None, [head, body])) + tail

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
        ai_time = c.get("ai_detection_max_time_kst")
        ai_source = c.get("ai_detection_max_source")
        ai_prefix = f"{ai_source} " if ai_source else ""
        ai_line = f"AI 탐지 최대 점수는 {ai_prefix}{c.get('ai_detection_max_score')}"
        if ai_time:
            ai_line += f"({ai_time})"
        ai_line += "입니다."
    low_line = ""
    if c.get("risk_score_min_time_kst"):
        low_line = f"최저 안전 점수 발생 시각은 {c.get('risk_score_min_time_kst')}입니다."
    tail = ("\n" + _fmt_evidence_block(ev)) if (ev.inferred or ev.missing) else ""
    return "\n".join(filter(None, [head, delta_line, low_line, ai_line])) + tail


def needs_factory(intent: str) -> bool:
    return intent in _FACTORY_REQUIRED
