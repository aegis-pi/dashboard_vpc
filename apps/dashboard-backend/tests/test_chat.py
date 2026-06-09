"""Chatbot QA tests (ADR 0033, Step 3: rule/template).

Two layers:
  - Pure parsing/evidence logic in services.chat (deterministic, fixed `now`).
  - /chat/query endpoint against the moto ddb_mock + RBAC enforcement.
"""
from datetime import datetime, timezone

import deps.rbac as rbac_module
from main import app
from services import chat, ddb

# Fixed reference instant: 2026-06-08T01:00:00Z == 2026-06-08 10:00 KST.
NOW = datetime(2026, 6, 8, 1, 0, 0, tzinfo=timezone.utc)


# ─── Intent parsing ───────────────────────────────────────────────────────────

def test_intent_cause():
    assert chat.parse_intent("factory-a 왜 위험해?") == chat.Intent.CAUSE_ANALYSIS


def test_intent_report():
    assert chat.parse_intent("factory-a 일간 보고서 보여줘") == chat.Intent.REPORT


def test_intent_trend():
    assert chat.parse_intent("factory-a 위험도 추이 알려줘") == chat.Intent.HISTORY_TREND


def test_intent_status():
    assert chat.parse_intent("factory-a 지금 상태 어때") == chat.Intent.CURRENT_STATUS


def test_intent_unknown():
    assert chat.parse_intent("안녕하세요") == chat.Intent.UNKNOWN


def test_intent_cause_beats_status_keyword():
    # "왜 위험했어" contains 위험(status) but must classify as cause.
    assert chat.parse_intent("어제 왜 위험했어") == chat.Intent.CAUSE_ANALYSIS


# ─── Factory parsing ──────────────────────────────────────────────────────────

def test_factory_explicit_wins():
    assert chat.parse_factory_id("아무거나", explicit="factory-c") == "factory-c"


def test_factory_hyphen():
    assert chat.parse_factory_id("factory-b 상태") == "factory-b"


def test_factory_korean_suffix():
    assert chat.parse_factory_id("B공장 지금 어때") == "factory-b"


def test_factory_korean_prefix():
    assert chat.parse_factory_id("공장 a 위험도") == "factory-a"


def test_factory_none():
    assert chat.parse_factory_id("지금 상태 어때") is None


# ─── Time parsing (KST aware) ─────────────────────────────────────────────────

def test_time_now_explicit():
    ts = chat.parse_time("지금 상태", NOW)
    assert ts.kind == "now"
    assert ts.assumed is False


def test_time_recent_range_hours():
    ts = chat.parse_time("최근 3시간 추이", NOW)
    assert ts.kind == "range"
    assert ts.window == "3h"


def test_time_recent_range_minutes():
    ts = chat.parse_time("지난 30분 동안", NOW)
    assert ts.window == "30m"


def test_time_point_yesterday_afternoon():
    ts = chat.parse_time("어제 오후 3시 왜 위험했어", NOW)
    assert ts.kind == "point"
    # 2026-06-07 15:00 KST
    assert ts.target_kst.year == 2026 and ts.target_kst.month == 6
    assert ts.target_kst.day == 7 and ts.target_kst.hour == 15
    assert ts.window == "24h"


def test_time_point_no_day_assumes_recent_past():
    # At 10:00 KST, "오후 3시" today is in the future → roll back to yesterday.
    ts = chat.parse_time("오후 3시 상태", NOW)
    assert ts.kind == "point"
    assert ts.assumed is True
    assert ts.target_kst.day == 7 and ts.target_kst.hour == 15


def test_time_fallback_assumed_now():
    ts = chat.parse_time("온도 알려줘", NOW)
    assert ts.kind == "now"
    assert ts.assumed is True


# ─── Evidence builders ────────────────────────────────────────────────────────

def test_summarize_latest_confirmed_and_stale():
    item = {
        "factory_id": "factory-a",
        "updated_at": "2026-06-08T00:00:00.000Z",  # 1h before NOW → stale
        "risk": {"score": 27.6, "level": "danger",
                 "top_causes": [{"name": "temperature", "value": 38.2}]},
        "factory_state": {"temperature_celsius_avg": 38.2},
        "pipeline_status": {"status": "normal"},
    }
    ev = chat.summarize_latest(item, NOW)
    assert ev.confirmed["risk_score"] == 27.6
    assert ev.confirmed["risk_level"] == "danger"
    assert ev.confirmed["temperature_celsius"] == 38.2
    assert any("지연" in m for m in ev.missing)


def test_risk_score_policy_high_score_is_safe_even_if_question_says_danger():
    ev = chat.summarize_history(
        [
            {"timestamp": "t1", "risk_score": 100.0},
            {"timestamp": "t2", "risk_score": 100.0},
        ],
        chat.TimeScope(kind="range", window="1h"),
    )
    parsed = chat.parse_query("factory-a 왜 위험해?", None, NOW)
    answer = chat.render_answer(parsed, ev)
    assert ev.confirmed["risk_score_avg_level"] == "safe"
    assert "100.0점(안전)" in answer
    assert "최고위험" not in answer


def test_summarize_history_min_max_avg_delta():
    items = [
        {"timestamp": "t1", "risk_score": 10.0, "temperature_celsius_avg": 22.0,
         "top_cause_names": []},
        {"timestamp": "t2", "risk_score": 20.0, "temperature_celsius_avg": 30.0,
         "top_cause_names": ["temperature"]},
    ]
    ev = chat.summarize_history(items, chat.TimeScope(kind="range", window="1h"))
    assert ev.confirmed["risk_score_min"] == 10.0
    assert ev.confirmed["risk_score_max"] == 20.0
    assert ev.confirmed["risk_score_avg"] == 15.0
    assert ev.confirmed["risk_score_min_level"] == "danger"
    assert ev.confirmed["risk_score_delta"] == 10.0
    assert ev.inferred  # delta reasoning, marked 추정


def test_summarize_history_includes_ai_detection_spike():
    ev = chat.summarize_history(
        [
            {"timestamp": "t1", "risk_score": 88.0, "ai_max_score": 0.1},
            {"timestamp": "t2", "risk_score": 42.0, "fire_score_max": 0.93},
        ],
        chat.TimeScope(kind="range", window="10m"),
    )
    assert ev.confirmed["risk_score_min"] == 42.0
    assert ev.confirmed["risk_score_min_level"] == "danger"
    assert ev.confirmed["ai_detection_max_score"] == 0.93


def test_summarize_history_empty_marks_missing():
    ev = chat.summarize_history([], chat.TimeScope(kind="range", window="1h"))
    assert ev.missing
    assert not ev.confirmed


# ─── Endpoint: happy paths ────────────────────────────────────────────────────

def test_chat_current_status(client, ddb_mock):
    r = client.post("/chat/query", json={"question": "factory-a 지금 상태 어때"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == chat.Intent.CURRENT_STATUS
    assert data["factory_id"] == "factory-a"
    assert data["generator"] == "rule"
    assert data["evidence"]["confirmed"]["risk_score"] == 27.6
    assert "안전 점수" in data["answer"]


def test_chat_cause_analysis_uses_history(client, ddb_mock):
    r = client.post("/chat/query", json={"question": "factory-a 왜 위험해?"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == chat.Intent.CAUSE_ANALYSIS
    # 1h history fixture has risk 10 → 20.
    assert data["evidence"]["confirmed"]["risk_score_delta"] == 10.0


def test_chat_trend_recent_hour(client, ddb_mock):
    r = client.post("/chat/query", json={"question": "factory-a 최근 1시간 추이"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == chat.Intent.HISTORY_TREND
    conf = data["evidence"]["confirmed"]
    assert conf["risk_score_avg"] == 15.0
    assert conf["risk_score_min"] == 10.0
    assert conf["risk_score_max"] == 20.0


def test_chat_range_fetches_low_risk_and_high_ai_scores(client, monkeypatch):
    called = {"history": False}

    async def _fake_history(factory_id, window, max_items, since=None):
        called["history"] = True
        assert factory_id == "factory-a"
        return [
            {"timestamp": "2026-06-08T00:50:00.000Z", "risk_score": 91.0, "ai_max_score": 0.2},
            {"timestamp": "2026-06-08T00:55:00.000Z", "risk_score": 37.0, "fire_score_max": 0.96},
        ]

    monkeypatch.setattr(ddb, "get_factory_history", _fake_history)
    r = client.post("/chat/query", json={"question": "factory-a 최근 10분 왜 위험해?"})
    assert r.status_code == 200
    data = r.json()
    assert called["history"] is True
    conf = data["evidence"]["confirmed"]
    assert conf["risk_score_min"] == 37.0
    assert conf["risk_score_min_level"] == "danger"
    assert conf["ai_detection_max_score"] == 0.96
    assert "AI 탐지 최대 점수" in data["answer"]


def test_chat_explicit_factory_id_field(client, ddb_mock):
    r = client.post(
        "/chat/query",
        json={"question": "지금 상태 어때", "factory_id": "factory-a"},
    )
    assert r.status_code == 200
    assert r.json()["factory_id"] == "factory-a"


# ─── Endpoint: guard rails ────────────────────────────────────────────────────

def test_chat_unknown_intent(client, ddb_mock):
    r = client.post("/chat/query", json={"question": "안녕하세요 반가워요"})
    assert r.status_code == 200
    assert r.json()["intent"] == chat.Intent.UNKNOWN
    assert "이해하지 못" in r.json()["answer"]


def test_chat_missing_factory_asks(client, ddb_mock):
    r = client.post("/chat/query", json={"question": "지금 상태 어때"})
    assert r.status_code == 200
    data = r.json()
    assert data["factory_id"] is None
    assert "공장" in data["answer"]


def test_chat_report_intent_not_wired(client, ddb_mock):
    r = client.post("/chat/query", json={"question": "factory-a 일간 보고서"})
    assert r.status_code == 200
    assert r.json()["intent"] == chat.Intent.REPORT
    assert "보고서 탭" in r.json()["answer"]


def test_chat_validation_empty_question(client, ddb_mock):
    r = client.post("/chat/query", json={"question": ""})
    assert r.status_code == 422


# ─── RBAC enforcement at the tool layer ───────────────────────────────────────

def test_chat_rbac_denies_unscoped_factory(client, ddb_mock):
    """A principal scoped to factory-a must not query factory-b via the chatbot."""
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
    r = client.post("/chat/query", json={"question": "factory-b 지금 상태"})
    assert r.status_code == 403


def test_chat_rbac_allows_scoped_factory(client, ddb_mock):
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
    r = client.post("/chat/query", json={"question": "factory-a 지금 상태"})
    assert r.status_code == 200


# ─── DDB failure surfaces as 504 ──────────────────────────────────────────────

def test_chat_ddb_timeout_returns_504(client, monkeypatch):
    async def _raise_timeout(*args, **kwargs):
        raise ddb.DynamoDBUnavailableError("timeout")

    monkeypatch.setattr(ddb, "get_factory_latest", _raise_timeout)
    r = client.post("/chat/query", json={"question": "factory-a 지금 상태"})
    assert r.status_code == 504
