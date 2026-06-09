"""LLM-routing resolve tests (ADR 0034, Phase 1).

No real Bedrock calls: bedrock.resolve_query is stubbed.  These cover the
deterministic validation/mapping (services.chat.map_resolution) and the router
wiring (LLM resolve with graceful rule-parser fallback + RBAC-before-tool).
"""
from datetime import datetime, timezone

import pytest

import deps.rbac as rbac_module
from config import get_settings
from main import app
from services import bedrock, chat

# 2026-06-09T05:00:00Z == 14:00 KST
NOW = datetime(2026, 6, 9, 5, 0, 0, tzinfo=timezone.utc)


# ─── map_resolution: pure validation/mapping ─────────────────────────────────

def test_map_resolution_range_window():
    parsed = chat.map_resolution(
        {"intent": "history_trend", "factory_id": "factory-a",
         "time": {"mode": "range", "window": "90m"}},
        None, NOW, "factory-a 최근 90분 추이",
    )
    assert parsed is not None
    assert parsed.intent == chat.Intent.HISTORY_TREND
    assert parsed.factory_id == "factory-a"
    assert parsed.time.kind == "range"
    assert parsed.time.window == "90m"
    assert parsed.time.start_utc == NOW.replace(minute=30, hour=3, second=0)  # now - 90m


def test_map_resolution_point_anchor():
    parsed = chat.map_resolution(
        {"intent": "cause_analysis", "factory_id": "factory-a",
         "time": {"mode": "point", "anchor_kst": "2026-06-09T12:00"}},
        None, NOW, "factory-a 정오 무렵 왜 위험했어",
    )
    assert parsed.intent == chat.Intent.CAUSE_ANALYSIS
    assert parsed.time.kind == "point"
    # 12:00 KST resolved, 2h before now → 24h source window
    assert parsed.time.target_kst.hour == 12
    assert parsed.time.window == "24h"
    assert parsed.time.assumed is False


def test_map_resolution_future_anchor_is_clamped():
    parsed = chat.map_resolution(
        {"intent": "current_status", "factory_id": "factory-a",
         "time": {"mode": "point", "anchor_kst": "2026-06-09T20:00"}},  # 20:00 KST > 14:00 now
        None, NOW, "factory-a 저녁 8시 상태",
    )
    assert parsed.time.assumed is True
    assert "현재 기준" in parsed.time.note
    # clamped to now (14:00 KST), never future
    assert parsed.time.target_kst.astimezone(timezone.utc) <= NOW


def test_map_resolution_rejects_hallucinated_factory():
    parsed = chat.map_resolution(
        {"intent": "current_status", "factory_id": "공장하나요",
         "time": {"mode": "now"}},
        None, NOW, "공장 상태",
    )
    assert parsed.factory_id is None  # garbage factory id dropped


def test_map_resolution_explicit_factory_wins():
    parsed = chat.map_resolution(
        {"intent": "current_status", "factory_id": "factory-b", "time": {"mode": "now"}},
        "factory-a", NOW, "지금 상태",
    )
    assert parsed.factory_id == "factory-a"


def test_map_resolution_unknown_intent_string():
    parsed = chat.map_resolution(
        {"intent": "weather_forecast", "time": {"mode": "now"}}, None, NOW, "내일 날씨",
    )
    assert parsed.intent == chat.Intent.UNKNOWN


def test_map_resolution_missing_intent_returns_none():
    # No intent key → unusable → caller must fall back to the rule parser.
    assert chat.map_resolution({"time": {"mode": "now"}}, None, NOW, "?") is None
    assert chat.map_resolution("not a dict", None, NOW, "?") is None


def test_map_resolution_trend_now_defaults_to_6h():
    parsed = chat.map_resolution(
        {"intent": "history_trend", "factory_id": "factory-a", "time": {"mode": "now"}},
        None, NOW, "factory-a 추이",
    )
    assert parsed.time.kind == "range"
    assert parsed.time.window == "6h"
    assert parsed.time.assumed is True


def test_map_resolution_bad_window_falls_back_to_6h():
    parsed = chat.map_resolution(
        {"intent": "history_trend", "factory_id": "factory-a",
         "time": {"mode": "range", "window": "잠깐"}},
        None, NOW, "factory-a 잠깐 추이",
    )
    assert parsed.time.window == "6h"
    assert parsed.time.assumed is True


# ─── map_resolution: absolute interval (the 9~10시 bug) ──────────────────────

def test_map_resolution_interval_absolute():
    # "오전 9시~10시" must become an interval anchored at 09:00, NOT a trailing 1h.
    parsed = chat.map_resolution(
        {"intent": "spike_check", "factory_id": "factory-a", "metric": "ai_detection",
         "time": {"mode": "interval", "start_kst": "2026-06-09T09:00", "end_kst": "2026-06-09T10:00"}},
        None, NOW, "factory-a 오전 9시~10시 ai score 튄 값 있어?",
    )
    assert parsed.intent == chat.Intent.SPIKE_CHECK
    assert parsed.metric == "ai_detection"
    assert parsed.time.kind == "interval"
    # 09:00 KST == 00:00Z, 10:00 KST == 01:00Z (anchored, not now-relative)
    assert parsed.time.start_utc == datetime(2026, 6, 9, 0, 0, 0, tzinfo=timezone.utc)
    assert parsed.time.end_utc == datetime(2026, 6, 9, 1, 0, 0, tzinfo=timezone.utc)
    # start is 5h before now (14:00 KST) → GRAPH#5M source window
    assert parsed.time.window == "6h"
    assert parsed.time.assumed is False


def test_map_resolution_interval_reversed_is_swapped():
    parsed = chat.map_resolution(
        {"intent": "history_trend", "factory_id": "factory-a",
         "time": {"mode": "interval", "start_kst": "2026-06-09T10:00", "end_kst": "2026-06-09T09:00"}},
        None, NOW, "factory-a 10시에서 9시 사이 추이",
    )
    assert parsed.time.kind == "interval"
    assert parsed.time.start_utc < parsed.time.end_utc
    assert parsed.time.start_utc == datetime(2026, 6, 9, 0, 0, 0, tzinfo=timezone.utc)


def test_map_resolution_interval_partly_future_clamped_to_now():
    # 11:00~20:00 KST; now is 14:00 KST → end clamped to now.
    parsed = chat.map_resolution(
        {"intent": "history_trend", "factory_id": "factory-a",
         "time": {"mode": "interval", "start_kst": "2026-06-09T11:00", "end_kst": "2026-06-09T20:00"}},
        None, NOW, "factory-a 11시부터 저녁 8시까지 추이",
    )
    assert parsed.time.kind == "interval"
    assert parsed.time.assumed is True
    assert parsed.time.end_utc == NOW  # clamped to now, never the future


def test_map_resolution_interval_whole_future_falls_back():
    parsed = chat.map_resolution(
        {"intent": "history_trend", "factory_id": "factory-a",
         "time": {"mode": "interval", "start_kst": "2026-06-09T18:00", "end_kst": "2026-06-09T20:00"}},
        None, NOW, "factory-a 저녁 6시부터 8시까지 추이",
    )
    assert parsed.time.kind == "range"  # future interval → trailing-range fallback
    assert parsed.time.window == "6h"
    assert parsed.time.assumed is True


def test_map_resolution_interval_missing_bound_falls_back():
    parsed = chat.map_resolution(
        {"intent": "history_trend", "factory_id": "factory-a",
         "time": {"mode": "interval", "start_kst": "2026-06-09T09:00", "end_kst": None}},
        None, NOW, "factory-a 9시부터 추이",
    )
    assert parsed.time.kind == "range"
    assert parsed.time.window == "6h"
    assert parsed.time.assumed is True


# ─── Router wiring: LLM resolve + fallback ───────────────────────────────────

@pytest.fixture
def routing_on(monkeypatch):
    """Enable LLM routing + Bedrock on the cached settings singleton."""
    monkeypatch.setattr(get_settings(), "bedrock_enabled", True)
    monkeypatch.setattr(get_settings(), "chat_routing_enabled", True)


def test_router_uses_llm_resolution(client, ddb_mock, routing_on, monkeypatch):
    async def _fake_resolve(question, factory_hint, now_utc):
        return {"intent": "current_status", "factory_id": "factory-a", "time": {"mode": "now"}}

    async def _fake_answer(parsed, evidence, tier):
        return "현재 안전 점수 보고입니다."

    monkeypatch.setattr(bedrock, "resolve_query", _fake_resolve)
    monkeypatch.setattr(bedrock, "generate_answer", _fake_answer)

    r = client.post("/chat/query", json={"question": "여기 지금 어때?"})  # no literal 'factory-a'
    assert r.status_code == 200
    data = r.json()
    assert data["router"] == "llm"
    assert data["factory_id"] == "factory-a"
    assert data["intent"] == "current_status"
    assert data["evidence"]["confirmed"]["risk_score"] == 27.6


def test_router_falls_back_to_rule_on_resolve_error(client, ddb_mock, routing_on, monkeypatch):
    async def _boom(question, factory_hint, now_utc):
        raise bedrock.BedrockUnavailableError("resolve down")

    async def _fake_answer(parsed, evidence, tier):
        return "현재 안전 점수 보고입니다."

    monkeypatch.setattr(bedrock, "resolve_query", _boom)
    monkeypatch.setattr(bedrock, "generate_answer", _fake_answer)

    r = client.post("/chat/query", json={"question": "factory-a 지금 상태"})
    assert r.status_code == 200
    data = r.json()
    assert data["router"] == "rule"            # graceful degradation
    assert data["intent"] == "current_status"  # rule parser understood it
    assert data["evidence"]["confirmed"]["risk_score"] == 27.6


def test_router_rbac_denied_after_resolve_before_tool(client, ddb_mock, routing_on, monkeypatch):
    """Even when the LLM picks the factory, RBAC must block before any data tool."""
    called = {"answer": 0}

    async def _fake_resolve(question, factory_hint, now_utc):
        return {"intent": "current_status", "factory_id": "factory-b", "time": {"mode": "now"}}

    async def _spy_answer(parsed, evidence, tier):
        called["answer"] += 1
        return "nope"

    monkeypatch.setattr(bedrock, "resolve_query", _fake_resolve)
    monkeypatch.setattr(bedrock, "generate_answer", _spy_answer)
    app.dependency_overrides[rbac_module.get_current_principal] = lambda: rbac_module.Principal(
        user_id="scoped",
        cognito_sub="scoped",
        email="scoped@example.com",
        display_name="Scoped",
        global_role="viewer",
        can_view_system=False,
        status="active",
        allowed_factory_ids=frozenset({"factory-a"}),
    )
    r = client.post("/chat/query", json={"question": "옆 공장 상태"})
    assert r.status_code == 403
    assert called["answer"] == 0
