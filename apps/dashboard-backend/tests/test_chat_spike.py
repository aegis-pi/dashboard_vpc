"""Spike-detection tests (ADR 0034, Phase 2).

summarize_spikes is fully deterministic (no LLM), so detection is tested with
synthetic series.  map_resolution carries the spike params; the endpoint test
covers the SPIKE_CHECK data-tool wiring.
"""
from datetime import datetime, timedelta, timezone

import pytest

from config import get_settings
from services import bedrock, chat

NOW = datetime(2026, 6, 9, 5, 0, 0, tzinfo=timezone.utc)  # 14:00 KST
RANGE_SCOPE = chat.TimeScope(kind="range", window="6h")


def _series(values, key="risk_score"):
    return [
        {"timestamp": f"2026-06-09T{(h % 24):02d}:{(h // 24) * 5:02d}:00.000Z", key: v}
        for h, v in enumerate(values)
    ]


# ─── summarize_spikes: detection ─────────────────────────────────────────────

def test_spike_zscore_flags_outlier():
    items = _series([50, 50, 50, 50, 5, 50, 50, 50])  # one big drop
    ev = chat.summarize_spikes(items, RANGE_SCOPE)
    assert ev.confirmed["metric"] == "안전 점수"
    assert ev.confirmed["spike_count"] == 1
    assert ev.confirmed["spikes"][0]["value"] == 5.0
    assert "z" in ev.confirmed["detection"]


def test_spike_threshold_above():
    items = _series([50, 52, 90, 48, 51])
    ev = chat.summarize_spikes(items, RANGE_SCOPE, threshold=80, comparison="above")
    assert ev.confirmed["spike_count"] == 1
    assert ev.confirmed["spikes"][0]["value"] == 90.0
    assert ev.confirmed["detection"].startswith("임계값 이상")


def test_spike_threshold_below():
    items = _series([50, 52, 9, 48, 51])
    ev = chat.summarize_spikes(items, RANGE_SCOPE, threshold=20, comparison="below")
    assert ev.confirmed["spike_count"] == 1
    assert ev.confirmed["spikes"][0]["value"] == 9.0


def test_spike_none_when_flat():
    ev = chat.summarize_spikes(_series([50, 50, 50, 50, 50]), RANGE_SCOPE)
    assert ev.confirmed["spike_count"] == 0
    assert "spikes" not in ev.confirmed


def test_spike_insufficient_sample():
    ev = chat.summarize_spikes(_series([50, 60]), RANGE_SCOPE)
    assert not ev.confirmed
    assert any("표본" in m for m in ev.missing)


def test_spike_ai_detection_metric():
    items = _series([0.1] * 9 + [0.95], key="ai_max_score")
    ev = chat.summarize_spikes(items, RANGE_SCOPE, metric="ai_detection")
    assert ev.confirmed["metric"] == "AI 탐지 점수"
    assert ev.confirmed["spike_count"] == 1
    assert ev.confirmed["spikes"][0]["value"] == 0.95


# ─── rule parser: spike intent + interval (no LLM) ───────────────────────────

def test_rule_parse_intent_spike():
    assert chat.parse_intent("factory-a 오전 9시~10시 ai score 튄 값 있어?") == chat.Intent.SPIKE_CHECK
    assert chat.parse_intent("온도 스파이크 있었어?") == chat.Intent.SPIKE_CHECK
    # "왜 튀었어" → cause analysis wins over spike (explicit 왜).
    assert chat.parse_intent("왜 튀었어?") == chat.Intent.CAUSE_ANALYSIS


def test_rule_parse_spike_params():
    assert chat._parse_spike_params("ai score 0.8 이상 튄 값") == ("ai_detection", 0.8, "above")
    assert chat._parse_spike_params("온도 30도 이하로 떨어진 적") == ("temperature", 30.0, "below")
    assert chat._parse_spike_params("튄 값 있어?") == ("risk_score", None, None)


def test_rule_parse_query_interval_spike():
    # The reported bug: "오전 9시~10시 ai score 튄 값" must be a 9~10 interval, not trailing 1h.
    parsed = chat.parse_query("factory-a 오전 9시~10시 ai score 튄 값 있어?", None, NOW)
    assert parsed.intent == chat.Intent.SPIKE_CHECK
    assert parsed.metric == "ai_detection"
    assert parsed.time.kind == "interval"
    assert parsed.time.start_utc == datetime(2026, 6, 9, 0, 0, 0, tzinfo=timezone.utc)  # 09:00 KST
    assert parsed.time.end_utc == datetime(2026, 6, 9, 1, 0, 0, tzinfo=timezone.utc)    # 10:00 KST
    assert parsed.time.window == "6h"  # 5h old → GRAPH#5M, where AI *_max fields live


def test_rule_parse_query_interval_yesterday_pm_trend():
    parsed = chat.parse_query("factory-b 어제 오후 2시부터 4시까지 추이", None, NOW)
    assert parsed.intent == chat.Intent.HISTORY_TREND
    assert parsed.time.kind == "interval"
    # yesterday 14:00~16:00 KST == 2026-06-08 05:00Z~07:00Z
    assert parsed.time.start_utc == datetime(2026, 6, 8, 5, 0, 0, tzinfo=timezone.utc)
    assert parsed.time.end_utc == datetime(2026, 6, 8, 7, 0, 0, tzinfo=timezone.utc)
    assert parsed.time.assumed is False  # explicit "어제"


# ─── map_resolution: spike params ────────────────────────────────────────────

def test_map_resolution_spike_params():
    parsed = chat.map_resolution(
        {"intent": "spike_check", "factory_id": "factory-a", "metric": "ai_detection",
         "threshold": 0.8, "comparison": "above",
         "time": {"mode": "point", "anchor_kst": "2026-06-09T12:00"}},
        None, NOW, "factory-a 정오 ai score 튄 값",
    )
    assert parsed.intent == chat.Intent.SPIKE_CHECK
    assert parsed.metric == "ai_detection"
    assert parsed.threshold == 0.8
    assert parsed.comparison == "above"
    assert parsed.time.kind == "point"


def test_map_resolution_spike_invalid_metric_defaults():
    parsed = chat.map_resolution(
        {"intent": "spike_check", "metric": "weird", "threshold": "x",
         "time": {"mode": "range", "window": "6h"}},
        "factory-a", NOW, "factory-a 튄 값",
    )
    assert parsed.metric == "risk_score"   # invalid metric → default
    assert parsed.threshold is None        # non-numeric threshold dropped


def test_render_spike_no_points():
    ev = chat.Evidence(confirmed={"metric": "AI 탐지 점수", "spike_count": 0})
    parsed = chat.ParsedQuery(
        intent=chat.Intent.SPIKE_CHECK, factory_id="factory-a",
        time=chat.TimeScope(kind="range", window="1h"), raw="튄 값",
    )
    assert "튄 지점은 없습니다" in chat.render_answer(parsed, ev)


# ─── Endpoint wiring ─────────────────────────────────────────────────────────

@pytest.fixture
def routing_on(monkeypatch):
    monkeypatch.setattr(get_settings(), "bedrock_enabled", True)
    monkeypatch.setattr(get_settings(), "chat_routing_enabled", True)


def test_spike_endpoint_wiring(client, ddb_mock, routing_on, monkeypatch):
    async def _fake_resolve(question, factory_hint, now_utc):
        return {"intent": "spike_check", "factory_id": "factory-a", "metric": "risk_score",
                "threshold": None, "comparison": "spike", "time": {"mode": "range", "window": "1h"}}

    async def _fake_answer(parsed, evidence, tier):
        return "스파이크 검사 보고입니다."

    monkeypatch.setattr(bedrock, "resolve_query", _fake_resolve)
    monkeypatch.setattr(bedrock, "generate_answer", _fake_answer)

    r = client.post("/chat/query", json={"question": "factory-a 최근 1시간 ai score 튄 값 있어?"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == "spike_check"
    assert data["router"] == "llm"
    # ddb_mock holds only 2 history points in 1h → deterministic 'insufficient sample'
    assert any("표본" in m for m in data["evidence"]["missing"])


def test_spike_interval_endpoint_routes_to_anchored_window(client, ddb_mock, routing_on, monkeypatch):
    """An absolute interval must query [start, end], not a trailing window from now."""

    async def _fake_resolve(question, factory_hint, now_utc):
        # interval 3h~2h ago (older than the mock's 30/45-min GRAPH points).
        start = (now_utc - timedelta(hours=3)).astimezone(chat.KST).strftime("%Y-%m-%dT%H:%M")
        end = (now_utc - timedelta(hours=2)).astimezone(chat.KST).strftime("%Y-%m-%dT%H:%M")
        return {"intent": "spike_check", "factory_id": "factory-a", "metric": "ai_detection",
                "time": {"mode": "interval", "start_kst": start, "end_kst": end}}

    async def _fake_answer(parsed, evidence, tier):
        return "스파이크 검사 보고입니다."

    monkeypatch.setattr(bedrock, "resolve_query", _fake_resolve)
    monkeypatch.setattr(bedrock, "generate_answer", _fake_answer)

    r = client.post("/chat/query", json={"question": "factory-a 3시간 전부터 2시간 전까지 ai score 튄 값"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == "spike_check"
    assert data["router"] == "llm"
    assert data["time_scope"]["kind"] == "interval"
    # end is anchored ~2h ago, NOT pinned to now (the original bug).
    assert data["time_scope"]["end"] is not None
    # No GRAPH#5M data in that older window → deterministic 'insufficient sample'.
    assert any("표본" in m for m in data["evidence"]["missing"])
