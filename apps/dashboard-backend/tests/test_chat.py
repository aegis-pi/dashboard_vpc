"""Chatbot QA tests (ADR 0033, Step 3: rule/template).

Two layers:
  - Pure parsing/evidence logic in services.chat (deterministic, fixed `now`).
  - /chat/query endpoint against the moto ddb_mock + RBAC enforcement.
"""
from datetime import datetime, timedelta, timezone

import deps.rbac as rbac_module
from main import app
from routers import chat as chat_router
from services import chat, ddb, s3

# Fixed reference instant: 2026-06-08T01:00:00Z == 2026-06-08 10:00 KST.
NOW = datetime(2026, 6, 8, 1, 0, 0, tzinfo=timezone.utc)


# ─── Intent parsing ───────────────────────────────────────────────────────────

def test_intent_cause():
    assert chat.parse_intent("factory-a 왜 위험해?") == chat.Intent.CAUSE_ANALYSIS


def test_intent_report():
    assert chat.parse_intent("factory-a 일간 보고서 보여줘") == chat.Intent.REPORT


def test_intent_report_beats_cause_keywords():
    assert chat.parse_intent("factory-a 2026-06-09 보고서에서 주요 이벤트와 확인 필요 항목 요약해줘") == chat.Intent.REPORT


def test_intent_trend():
    assert chat.parse_intent("factory-a 위험도 추이 알려줘") == chat.Intent.HISTORY_TREND


def test_intent_status():
    assert chat.parse_intent("factory-a 지금 상태 어때") == chat.Intent.CURRENT_STATUS


def test_intent_unknown():
    assert chat.parse_intent("안녕하세요") == chat.Intent.UNKNOWN


def test_intent_cause_beats_status_keyword():
    # "왜 위험했어" contains 위험(status) but must classify as cause.
    assert chat.parse_intent("어제 왜 위험했어") == chat.Intent.CAUSE_ANALYSIS


def test_intent_risk_drop_is_cause_analysis():
    assert chat.parse_intent("factory-c risk score가 하락했던데") == chat.Intent.CAUSE_ANALYSIS
    assert chat.parse_intent("factory-c 안전 점수 급락했어") == chat.Intent.CAUSE_ANALYSIS


# ─── Factory parsing ──────────────────────────────────────────────────────────

def test_factory_explicit_wins():
    assert chat.parse_factory_id("아무거나", explicit="factory-c") == "factory-c"


def test_factory_hyphen():
    assert chat.parse_factory_id("factory-b 상태") == "factory-b"


def test_factory_with_korean_particle():
    assert chat.parse_factory_id("factory-c에서 오후 1시 15분") == "factory-c"


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
    assert ts.end_utc - ts.start_utc == chat.timedelta(minutes=10)


def test_time_point_no_day_assumes_recent_past():
    # At 10:00 KST, "오후 3시" today is in the future → roll back to yesterday.
    ts = chat.parse_time("오후 3시 상태", NOW)
    assert ts.kind == "point"
    assert ts.assumed is True
    assert ts.target_kst.day == 7 and ts.target_kst.hour == 15


def test_time_point_no_ampm_chooses_recent_past_pm_when_closer():
    # 2026-06-08T07:00:00Z == 2026-06-08 16:00 KST.
    now = datetime(2026, 6, 8, 7, 0, 0, tzinfo=timezone.utc)
    ts = chat.parse_time("3시 상태 어땠어?", now)
    assert ts.kind == "point"
    assert ts.assumed is True
    assert ts.target_kst.day == 8 and ts.target_kst.hour == 15


def test_time_point_no_ampm_keeps_am_when_pm_is_future():
    ts = chat.parse_time("3시 상태 어땠어?", NOW)
    assert ts.kind == "point"
    assert ts.assumed is True
    assert ts.target_kst.day == 8 and ts.target_kst.hour == 3


def test_time_point_parses_minute_and_uses_tight_window():
    ts = chat.parse_time("오늘 오후 3시 20분 상태", NOW)
    assert ts.target_kst.hour == 15
    assert ts.target_kst.minute == 20
    assert ts.end_utc - ts.start_utc == chat.timedelta(minutes=10)


def test_time_scope_dict_includes_kst_range_for_llm_display():
    ts = chat.parse_time("최근 1시간 추이", NOW)
    data = ts.to_dict()
    assert data["start"] == "2026-06-08T00:00:00.000Z"
    assert data["end"] == "2026-06-08T01:00:00.000Z"
    assert data["start_kst"].startswith("2026-06-08T09:00:00")
    assert data["end_kst"].startswith("2026-06-08T10:00:00")


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


def test_summarize_history_uses_graph_bucket_min_max():
    ev = chat.summarize_history(
        [
            {
                "timestamp": "2026-06-08T07:25:00.000Z",
                "is_bucket": True,
                "risk_score": 72.0,
                "risk_score_min": 41.0,
                "risk_score_max": 88.0,
                "ai_max_score": 0.82,
            },
        ],
        chat.TimeScope(kind="point", window="1h"),
    )
    assert ev.confirmed["risk_score_avg"] == 72.0
    assert ev.confirmed["risk_score_min"] == 41.0
    assert ev.confirmed["risk_score_min_level"] == "danger"
    assert ev.confirmed["risk_score_max"] == 88.0
    assert ev.confirmed["ai_detection_max_score"] == 0.82
    assert any("top_causes" in m for m in ev.missing)


def test_summarize_history_includes_kst_range_label():
    ev = chat.summarize_history(
        [
            {"timestamp": "t1", "risk_score": 10.0},
            {"timestamp": "t2", "risk_score": 20.0},
        ],
        chat.TimeScope(
            kind="range",
            window="1h",
            start_utc=datetime(2026, 6, 8, 1, 10, 0, tzinfo=timezone.utc),
            end_utc=datetime(2026, 6, 8, 2, 10, 0, tzinfo=timezone.utc),
        ),
    )
    assert ev.confirmed["time_range_kst"] == "2026-06-08 10:10~11:10 KST"


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


def test_ai_detection_sources_are_korean_labels():
    ev = chat.summarize_history(
        [
            {"timestamp": "t1", "risk_score": 88.0, "fire_score_max": 0.1},
            {"timestamp": "t2", "risk_score": 42.0, "bend_score_max": 0.93, "top_cause_names": ["bend_score"]},
        ],
        chat.TimeScope(kind="range", window="10m"),
    )
    assert ev.confirmed["ai_detection_max_source"] == "굽힘"
    assert ev.confirmed["top_causes"] == ["굽힘"]
    assert any("굽힘" in s for s in ev.inferred)
    assert all("bend" not in s for s in ev.inferred)
    parsed = chat.ParsedQuery(chat.Intent.HISTORY_TREND, "factory-a", chat.TimeScope(kind="range", window="10m"), "ai score")
    answer = chat.render_answer(parsed, ev)
    assert "AI 탐지 최대 점수는 굽힘 0.93" in answer
    assert "bend" not in answer


def test_latest_top_causes_use_korean_ai_labels():
    ev = chat.summarize_latest(
        {
            "factory_id": "factory-a",
            "updated_at": "2026-06-08T01:00:00.000Z",
            "risk": {
                "score": 72.0,
                "top_causes": [
                    {"name": "fire_score", "value": 0.8},
                    {"field": "fall_score", "value": 0.6},
                    {"name": "bend_score", "value": 0.4},
                ],
            },
        },
        NOW,
    )
    assert [c["name"] for c in ev.confirmed["top_causes"]] == ["화재", "넘어짐", "굽힘"]


def test_processed_risk_drilldown_uses_korean_cause_labels():
    ev = chat.Evidence(missing=["5분 집계 데이터에는 top_causes 원인 필드가 없음"])
    chat.enrich_history_with_processed_risk_scores(
        ev,
        [
            {
                "timestamp": "2026-06-09T04:18:40Z",
                "risk_score": 0.0,
                "top_causes": [
                    {
                        "field": "data_freshness",
                        "reason": "pipeline_status_outage",
                        "value": "stale_over_300s",
                        "contribution": 90.0,
                        "severity": "danger",
                    }
                ],
            }
        ],
    )
    assert ev.confirmed["top_causes"] == ["데이터 신선도"]
    assert ev.confirmed["processed_top_cause_details"][0]["reason"] == "pipeline_status_outage"
    assert not any("top_causes" in m for m in ev.missing)


def test_state_snapshot_drilldown_uses_korean_cause_labels():
    ev = chat.Evidence(missing=["5분 집계 데이터에는 top_causes 원인 필드가 없음"])
    chat.enrich_history_with_state_snapshots(
        ev,
        [
            {
                "timestamp": "2026-06-09T05:54:45.202Z",
                "risk_score": 49.0,
                "top_causes": [
                    {
                        "field": "data_freshness",
                        "reason": "pipeline_status_critical",
                        "value": "critical",
                        "contribution": 41.0,
                        "severity": "danger",
                    }
                ],
            }
        ],
    )
    assert ev.confirmed["top_causes"] == ["데이터 신선도"]
    assert ev.confirmed["state_snapshot_source"] == "S3 processed/state_snapshot"
    assert ev.confirmed["state_snapshot_top_cause_details"][0]["reason"] == "pipeline_status_critical"
    assert not any("top_causes" in m for m in ev.missing)


def test_summarize_history_describes_dip_and_recovery_when_delta_is_flat():
    ev = chat.summarize_history(
        [
            {"timestamp": "2026-06-08T07:25:00.000Z", "risk_score": 100.0, "ai_max_score": 0.1},
            {"timestamp": "2026-06-08T07:30:00.000Z", "risk_score": 0.0, "fire_score_max": 0.8},
            {"timestamp": "2026-06-08T07:35:00.000Z", "risk_score": 100.0, "ai_max_score": 0.2},
        ],
        chat.TimeScope(kind="point", window="1h"),
    )
    assert ev.confirmed["risk_score_delta"] == 0.0
    assert ev.confirmed["risk_score_min_time_kst"] == "2026-06-08 16:30:00 KST"
    assert ev.confirmed["ai_detection_max_time_kst"] == "2026-06-08 16:30:00 KST"
    assert any("복구" in s for s in ev.inferred)


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


def test_chat_trend_recent_hour(client, monkeypatch):
    async def _metrics_5m(factory_id, start_utc, end_utc, max_objects=288):
        assert factory_id == "factory-a"
        return [
            {"timestamp": "2026-06-08T00:30:00.000Z", "risk_score": 10.0, "risk_score_min": 10.0, "risk_score_max": 10.0},
            {"timestamp": "2026-06-08T00:45:00.000Z", "risk_score": 20.0, "risk_score_min": 20.0, "risk_score_max": 20.0},
        ]

    monkeypatch.setattr(s3, "list_processed_agg_metrics_5m", _metrics_5m)
    r = client.post("/chat/query", json={"question": "factory-a 최근 1시간 추이"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == chat.Intent.HISTORY_TREND
    conf = data["evidence"]["confirmed"]
    assert conf["risk_score_avg"] == 15.0
    assert conf["risk_score_min"] == 10.0
    assert conf["risk_score_max"] == 20.0


def test_chat_range_fetches_low_risk_and_high_ai_scores(client, monkeypatch):
    called = {"s3_detail": False}

    async def _fake_metrics(factory_id, start_utc, end_utc, max_objects=288):
        assert factory_id == "factory-a"
        return []

    async def _fake_snapshots(factory_id, start_utc, end_utc, max_objects=1200):
        called["s3_detail"] = True
        assert factory_id == "factory-a"
        return [
            {"timestamp": "2026-06-08T00:50:00.000Z", "risk_score": 91.0, "ai_max_score": 0.2},
            {"timestamp": "2026-06-08T00:55:00.000Z", "risk_score": 37.0, "fire_score_max": 0.96},
        ]

    monkeypatch.setattr(s3, "list_processed_agg_metrics_5m", _fake_metrics)
    monkeypatch.setattr(s3, "list_processed_state_snapshots", _fake_snapshots)
    r = client.post("/chat/query", json={"question": "factory-a 최근 10분 왜 위험해?"})
    assert r.status_code == 200
    data = r.json()
    assert called["s3_detail"] is True
    conf = data["evidence"]["confirmed"]
    assert conf["risk_score_min"] == 37.0
    assert conf["risk_score_min_level"] == "danger"
    assert conf["risk_score_min_time_kst"] == "2026-06-08 09:55:00 KST"
    assert conf["ai_detection_max_score"] == 0.96
    assert conf["ai_detection_max_time_kst"] == "2026-06-08 09:55:00 KST"
    assert "AI 탐지 최대 점수" in data["answer"]
    assert "화재 0.96" in data["answer"]
    assert "2026-06-08 09:55:00 KST" in data["answer"]


def test_chat_s3_history_timeout_degrades_without_504(client, monkeypatch):
    async def _raise_s3(*args, **kwargs):
        raise s3.S3UnavailableError("timeout")

    monkeypatch.setattr(s3, "list_processed_agg_metrics_5m", _raise_s3)
    monkeypatch.setattr(s3, "list_processed_state_snapshots", _raise_s3)

    r = client.post("/chat/query", json={"question": "factory-a 최근 10분 왜 위험해?"})

    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == chat.Intent.CAUSE_ANALYSIS
    assert any("S3 processed_agg metrics_5m 조회 실패" in m for m in data["evidence"]["missing"])
    assert any("S3 processed state_snapshot 상세 조회 실패" in m for m in data["evidence"]["missing"])


def test_chat_short_point_falls_back_to_graph_when_raw_history_empty(client, monkeypatch):
    s3_calls = []

    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = datetime(2026, 6, 9, 7, 40, 0, tzinfo=timezone.utc)
            return value if tz is None else value.astimezone(tz)

    async def _fake_metrics(factory_id, start_utc, end_utc, max_objects=288):
        return [
            {
                "timestamp": "2026-06-09T07:25:00.000Z",
                "bucket_end": "2026-06-09T07:30:00.000Z",
                "is_bucket": True,
                "risk_score": 72.0,
                "risk_score_min": 43.0,
                "risk_score_max": 90.0,
                "ai_max_score": 0.76,
            }
        ]

    async def _fake_snapshots(factory_id, start_utc, end_utc, max_objects=500):
        return [
            {
                "timestamp": "2026-06-09T07:25:00.000Z",
                "risk_score": 43.0,
                "ai_max_score": 0.76,
                "top_cause_names": ["ai_event_rate"],
            }
        ]

    async def _fake_risk_details(factory_id, start_utc, end_utc, max_objects):
        s3_calls.append((factory_id, start_utc, end_utc, max_objects))
        return [
            {
                "timestamp": "2026-06-09T07:27:12.000Z",
                "risk_score": 43.0,
                "top_causes": [{"field": "ai_event_rate", "value": 0.76}],
                "s3_key": "processed/factory-a/risk_score/yyyy=2026/mm=06/dd=09/hh=07/msg.json",
            }
        ]

    monkeypatch.setattr(chat_router, "datetime", FixedDatetime)
    monkeypatch.setattr(s3, "list_processed_agg_metrics_5m", _fake_metrics)
    monkeypatch.setattr(s3, "list_processed_state_snapshots", _fake_snapshots)
    monkeypatch.setattr(s3, "list_processed_risk_scores", _fake_risk_details)
    r = client.post(
        "/chat/query",
        json={"question": "factory-a 오늘 오후 4시30분 즈음에 risk score가 하락했던데 이유 알려줘"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == chat.Intent.CAUSE_ANALYSIS
    conf = data["evidence"]["confirmed"]
    assert conf["risk_score_min"] == 43.0
    assert conf["risk_score_min_level"] == "danger"
    assert conf["risk_score_min_time_kst"] == "2026-06-09 16:25:00 KST"
    assert conf["ai_detection_max_score"] == 0.76
    assert conf["ai_detection_max_time_kst"] == "2026-06-09 16:25:00 KST"
    assert conf["processed_risk_score_source"] == "S3 processed/risk_score"
    assert conf["processed_risk_score_min_time_kst"] == "2026-06-09 16:27:12 KST"
    assert conf["top_causes"] == ["AI 이벤트"]
    assert s3_calls and s3_calls[0][0] == "factory-a"
    assert any("S3 processed" in s for s in data["evidence"]["inferred"])
    assert conf["primary_detail_source"] == "S3 processed/state_snapshot"
    assert "2026-06-09 16:25:00 KST" in data["answer"]


def test_chat_graph_cause_degrades_when_s3_drilldown_unavailable(client, monkeypatch):
    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = datetime(2026, 6, 9, 7, 40, 0, tzinfo=timezone.utc)
            return value if tz is None else value.astimezone(tz)

    async def _fake_metrics(factory_id, start_utc, end_utc, max_objects=288):
        return []

    async def _fake_snapshots(factory_id, start_utc, end_utc, max_objects=500):
        return [
            {
                "timestamp": "2026-06-09T07:25:00.000Z",
                "risk_score": 72.0,
                "risk_score_min": 43.0,
                "risk_score_max": 90.0,
            }
        ]

    async def _raise_s3(factory_id, start_utc, end_utc, max_objects):
        raise s3.S3UnavailableError("timeout")

    monkeypatch.setattr(chat_router, "datetime", FixedDatetime)
    monkeypatch.setattr(s3, "list_processed_agg_metrics_5m", _fake_metrics)
    monkeypatch.setattr(s3, "list_processed_state_snapshots", _fake_snapshots)
    monkeypatch.setattr(s3, "list_processed_risk_scores", _raise_s3)

    r = client.post(
        "/chat/query",
        json={"question": "factory-a 오늘 오후 4시30분 즈음에 risk score가 하락했던데 이유 알려줘"},
    )

    assert r.status_code == 200
    data = r.json()
    assert data["evidence"]["confirmed"]["risk_score_min"] == 43.0
    assert any("S3 processed risk_score 상세 조회 실패" in m for m in data["evidence"]["missing"])


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


def test_chat_report_intent_reads_latest_s3_markdown(client, monkeypatch):
    async def _list_reports():
        return [
            {"report_date": "2026-06-08", "factory_id": "factory-a"},
            {"report_date": "2026-06-07", "factory_id": "factory-a"},
        ]

    async def _get_report(report_date, factory_id):
        assert report_date == "2026-06-08"
        assert factory_id == "factory-a"
        return """# factory-a 일일 운영 리포트 - 2026-06-08

## 요약
평균 Risk Score는 98.74점이지만 11:41~12:24 Risk 저하가 있었습니다.

## 핵심 지표 표

| 구분 | 값 | 판단 |
| --- | ---: | --- |
| 전체 상태 | 위험 | 위험 구간 즉시 확인 필요 |
| 평균 Risk Score | 98.74 | 높을수록 안전에 가까움 |

## 확인 필요 항목

| 우선순위 | 항목 | 이유 | 근거 |
| --- | --- | --- | --- |
| 높음 | Risk 저하 구간 원인 분석 | Risk Score crossed warning threshold. | msg-1 |

## 데이터 한계
- S3 processed 기반입니다.
"""

    monkeypatch.setattr(s3, "list_daily_reports", _list_reports)
    monkeypatch.setattr(s3, "get_report_markdown", _get_report)
    r = client.post("/chat/query", json={"question": "factory-a 일간 보고서"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == chat.Intent.REPORT
    assert data["evidence"]["confirmed"]["report_date"] == "2026-06-08"
    assert data["evidence"]["confirmed"]["report_target"] == "factory-a"
    assert "날짜가 명시되지 않아" in data["evidence"]["inferred"][0]
    assert data["answer"].startswith("# factory-a 2026-06-08 일일 리포트 요약")
    assert "## 요약" in data["answer"]
    assert "98.74" in data["answer"]


def test_chat_report_intent_uses_requested_date(client, monkeypatch):
    async def _get_report(report_date, factory_id):
        assert report_date == "2026-06-07"
        assert factory_id == "factory-b"
        return "# factory-b 일일 운영 리포트 - 2026-06-07\n\n## 요약\n특이사항 없음."

    monkeypatch.setattr(s3, "get_report_markdown", _get_report)
    r = client.post("/chat/query", json={"question": "factory-b 2026-06-07 보고서 요약"})
    assert r.status_code == 200
    assert r.json()["evidence"]["confirmed"]["report_date"] == "2026-06-07"


def test_chat_suggested_absolute_report_prompt(client, monkeypatch):
    async def _get_report(report_date, factory_id):
        assert report_date == "2026-06-09"
        assert factory_id == "factory-a"
        return """# factory-a 일일 운영 리포트 - 2026-06-09

## 요약
15:00 전후 안전 점수 급락과 AI 화재 탐지 상승이 함께 관측되었습니다.

## 주요 이벤트

| 시간 | 유형 | 심각도 | 지속 | 근거 |
| --- | --- | ---: | ---: | --- |
| 09:35~09:36 | Risk 저하 | 77.5 | 2분 | msg-09 |
| 09:36~09:36 | ai_score_spike | 61 | 1분 | msg-fire |

## 확인 필요 항목

| 우선순위 | 항목 | 이유 | 근거 |
| --- | --- | --- | --- |
| 높음 | AI 화재 탐지 확인 | fire_score가 threshold를 넘었습니다. | msg-15 |
"""

    monkeypatch.setattr(s3, "get_report_markdown", _get_report)
    r = client.post(
        "/chat/query",
        json={"question": "factory-a 2026-06-09 보고서에서 주요 이벤트와 확인 필요 항목 요약해줘"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == chat.Intent.REPORT
    assert data["evidence"]["confirmed"]["report_date"] == "2026-06-09"
    assert data["answer"].startswith("# factory-a 2026-06-09 일일 리포트 요약")
    assert "## 주요 이벤트" in data["answer"]
    assert "2026-06-09" in data["answer"]
    assert "주요 이벤트" in data["answer"]
    assert "AI 화재 탐지" in data["answer"]


def test_chat_suggested_absolute_point_cause_prompt(client, monkeypatch):
    async def _metrics_5m(fid, start_utc, end_utc, max_objects=288):
        assert fid == "factory-a"
        assert start_utc == datetime(2026, 6, 9, 5, 55, 0, tzinfo=timezone.utc)
        assert end_utc == datetime(2026, 6, 9, 6, 5, 0, tzinfo=timezone.utc)
        return []

    async def _state_snapshots(fid, start_utc, end_utc, max_objects=500):
        assert fid == "factory-a"
        assert start_utc == datetime(2026, 6, 9, 5, 55, 0, tzinfo=timezone.utc)
        assert end_utc == datetime(2026, 6, 9, 6, 5, 0, tzinfo=timezone.utc)
        return [
            {
                "timestamp": "2026-06-09T05:56:00.000Z",
                "risk_score": 82.0,
                "temperature_celsius_avg": 29.0,
                "ai_max_score": 0.31,
            },
            {
                "timestamp": "2026-06-09T06:00:00.000Z",
                "risk_score": 38.0,
                "temperature_celsius_avg": 36.2,
                "ai_max_score": 0.92,
                "top_cause_names": ["fire_score", "temperature"],
                "top_causes": [{"field": "fire_score", "value": 0.92}],
            },
            {
                "timestamp": "2026-06-09T06:04:00.000Z",
                "risk_score": 54.0,
                "temperature_celsius_avg": 34.0,
                "ai_max_score": 0.74,
            },
        ]

    async def _risk_details(fid, start_utc, end_utc, max_objects):
        assert fid == "factory-a"
        return [{"timestamp": "2026-06-09T06:00:00.000Z", "risk_score": 38.0, "top_causes": [{"field": "fire_score", "value": 0.92}]}]

    monkeypatch.setattr(s3, "list_processed_agg_metrics_5m", _metrics_5m)
    monkeypatch.setattr(s3, "list_processed_state_snapshots", _state_snapshots)
    monkeypatch.setattr(s3, "list_processed_risk_scores", _risk_details)
    r = client.post(
        "/chat/query",
        json={"question": "factory-a 2026-06-09 오후 3시 안전 점수 급락 원인 알려줘"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == chat.Intent.CAUSE_ANALYSIS
    assert data["time_scope"]["target_kst"].startswith("2026-06-09T15:00:00")
    assert "2026-06-09 15:00 KST 무렵" in data["answer"]
    assert "최저 38.0점" in data["answer"]
    assert data["evidence"]["confirmed"]["primary_detail_source"] == "S3 processed/state_snapshot"
    assert data["evidence"]["confirmed"]["ai_detection_max_score"] == 0.92


def test_chat_suggested_absolute_spike_prompt(client, monkeypatch):
    async def _metrics_5m(fid, start_utc, end_utc, max_objects=12):
        assert fid == "factory-a"
        assert start_utc == datetime(2026, 6, 9, 0, 30, 0, tzinfo=timezone.utc)
        assert end_utc == datetime(2026, 6, 9, 0, 40, 0, tzinfo=timezone.utc)
        return [
            {
                "timestamp": "2026-06-09T00:35:00.000Z",
                "bucket_start": "2026-06-09T00:35:00Z",
                "bucket_end": "2026-06-09T00:39:59.999Z",
                "is_bucket": True,
                "risk_score": 95.4,
                "risk_score_min": 49.0,
                "risk_score_max": 100.0,
                "temperature_celsius_avg": 28.3,
                "ai_max_score": 1.0,
                "fire_score_max": 1.0,
            }
        ]

    async def _state_snapshots(fid, start_utc, end_utc, max_objects=500):
        assert fid == "factory-a"
        assert start_utc == datetime(2026, 6, 9, 0, 30, 0, tzinfo=timezone.utc)
        assert end_utc == datetime(2026, 6, 9, 0, 40, 0, tzinfo=timezone.utc)
        base = datetime(2026, 6, 9, 0, 30, 0, tzinfo=timezone.utc)
        values = [0.1, 0.09, 0.11, 0.1, 0.12, 0.95, 0.11, 0.1, 0.09, 0.1, 0.11]
        return [
            {
                "timestamp": (base + timedelta(minutes=index)).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "risk_score": 49.0 if index == 6 else (95.0 if index == 0 else 100.0),
                "temperature_celsius_avg": 36.5 if index == 5 else 28.0,
                "ai_max_score": value,
            }
            for index, value in enumerate(values)
        ]

    async def _images(factory_id, start_time, end_time, max_objects=120):
        assert factory_id == "factory-a"
        assert start_time == datetime(2026, 6, 9, 9, 25, 0, tzinfo=chat.KST)
        assert end_time == datetime(2026, 6, 9, 9, 45, 0, tzinfo=chat.KST)
        assert max_objects == 6
        filenames = [
            "260609093551_event_FIRE.jpg",
            "260609093609_event_FIRE.jpg",
            "260609093615_event_FIRE.jpg",
            "260609093621_event_FIRE.jpg",
            "260609093627_event_FIRE.jpg",
        ]
        return [
            {
                "factory_id": "factory-a",
                "s3_key": (
                    "image_snapshot/factory_id=factory-a/yyyy=2026/mm=06/dd=09/hh=09/"
                    f"{filename}"
                ),
                "filename": filename,
                "url": f"https://example.com/{filename}",
                "last_modified": "2026-06-09T00:36:31+00:00",
                "size_bytes": 12345,
                "detection_type": "화재",
            }
            for filename in filenames
        ]

    monkeypatch.setattr(s3, "list_processed_agg_metrics_5m", _metrics_5m)
    monkeypatch.setattr(s3, "list_processed_state_snapshots", _state_snapshots)
    monkeypatch.setattr(s3, "list_image_snapshots", _images)
    r = client.post(
        "/chat/query",
        json={
            "question": (
                "factory-a 2026-06-09 오전 9시 35분쯤 화재 위험 점수가 튄 걸 봤는데, "
                "증빙 사진이랑 그때 factory 결과 요약해줘"
            )
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == chat.Intent.SPIKE_CHECK
    assert data["time_scope"]["target_kst"].startswith("2026-06-09T09:35:00")
    assert data["evidence"]["confirmed"]["query_time_window_kst"] == "2026-06-09 09:30~09:40 KST"
    assert data["evidence"]["confirmed"]["spike_count"] == 1
    assert "크게 벗어난 지점 1개" in data["answer"]
    assert "2026-06-09 09:35" in data["answer"]
    assert "08:55" not in data["answer"]
    assert "같은 조회 구간의 안전 점수" in data["answer"]
    assert "최저점" in data["answer"]
    assert "회복" in data["answer"]
    assert "2026-06-09 09:37:00 KST에 100.0점" in data["answer"]
    assert "증빙 이미지 5개" in data["answer"]
    assert data["image_ref"]["kind"] == "image_snapshots"
    assert data["image_ref"]["count"] == 5
    assert data["image_ref"]["items"][0]["detection_type"] == "화재"
    assert data["evidence"]["confirmed"]["image_snapshot_count"] == 5
    assert data["evidence"]["confirmed"]["image_snapshot_status"] == "available"
    assert "AI 탐지 상승과 이미지 스냅샷" in data["evidence"]["inferred"][-1]
    assert len(data["image_ref"]["items"]) == 5
    assert data["evidence"]["confirmed"]["processed_agg_metrics_5m_count"] == 1
    assert data["evidence"]["confirmed"]["processed_state_snapshot_count"] == 11
    assert data["evidence"]["confirmed"]["primary_detail_source"] == "S3 processed/state_snapshot"
    assert data["evidence"]["confirmed"]["risk_score_min"] == 49.0
    assert data["evidence"]["confirmed"]["risk_score_end"] == 100.0
    assert data["evidence"]["confirmed"]["risk_score_recovered_at_kst"] == "2026-06-09 09:37:00 KST"
    assert data["evidence"]["confirmed"]["risk_score_recovered_score"] == 100.0


def test_chat_image_ref_timeout_degrades_without_504(client, monkeypatch):
    async def _metrics_5m(fid, start_utc, end_utc, max_objects=12):
        return [
            {
                "timestamp": "2026-06-09T00:35:00.000Z",
                "risk_score": 49.0,
                "risk_score_min": 49.0,
                "risk_score_max": 100.0,
                "ai_max_score": 1.0,
            }
        ]

    async def _state_snapshots(fid, start_utc, end_utc, max_objects=500):
        return []

    async def _raise_images(*args, **kwargs):
        raise s3.S3UnavailableError("timeout")

    monkeypatch.setattr(s3, "list_processed_agg_metrics_5m", _metrics_5m)
    monkeypatch.setattr(s3, "list_processed_state_snapshots", _state_snapshots)
    monkeypatch.setattr(s3, "list_image_snapshots", _raise_images)

    r = client.post(
        "/chat/query",
        json={
            "question": (
                "factory-a 2026-06-09 오전 9시 35분쯤 화재 위험 점수가 튄 걸 봤는데, "
                "증빙 사진이랑 그때 factory 결과 요약해줘"
            )
        },
    )

    assert r.status_code == 200
    data = r.json()
    assert data["image_ref"] is None
    assert any("이미지 스냅샷 S3 조회 실패" in m for m in data["evidence"]["missing"])


def test_chat_suggested_absolute_interval_trend_prompt(client, monkeypatch):
    async def _metrics_5m(fid, start_utc, end_utc, max_objects=288):
        assert fid == "factory-a"
        assert start_utc == datetime(2026, 6, 9, 5, 0, 0, tzinfo=timezone.utc)
        assert end_utc == datetime(2026, 6, 9, 7, 0, 0, tzinfo=timezone.utc)
        return [
            {"timestamp": "2026-06-09T05:00:00.000Z", "risk_score": 91.0, "ai_max_score": 0.12},
            {"timestamp": "2026-06-09T06:00:00.000Z", "risk_score": 42.0, "ai_max_score": 0.88},
            {"timestamp": "2026-06-09T07:00:00.000Z", "risk_score": 63.0, "ai_max_score": 0.51},
        ]

    monkeypatch.setattr(s3, "list_processed_agg_metrics_5m", _metrics_5m)
    r = client.post(
        "/chat/query",
        json={"question": "factory-a 2026-06-09 오후 2시~4시 안전 점수와 AI 탐지 추이 비교해줘"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == chat.Intent.HISTORY_TREND
    assert data["evidence"]["confirmed"]["time_range_kst"] == "2026-06-09 14:00~16:00 KST"
    assert data["evidence"]["confirmed"]["primary_detail_source"] == "S3 processed_agg/metrics_5m"
    assert data["evidence"]["confirmed"]["ai_detection_max_score"] == 0.88
    assert "AI 탐지 최대 점수" in data["answer"]


def test_chat_interval_trend_drills_down_state_snapshot_cause(client, monkeypatch):
    async def _metrics_5m(fid, start_utc, end_utc, max_objects=288):
        assert fid == "factory-a"
        return [
            {
                "timestamp": "2026-06-09T05:00:00.000Z",
                "bucket_start": "2026-06-09T05:00:00Z",
                "bucket_end": "2026-06-09T05:04:59.999Z",
                "is_bucket": True,
                "risk_score": 99.7,
                "risk_score_min": 99.0,
                "risk_score_max": 100.0,
                "ai_max_score": 0.0,
            },
            {
                "timestamp": "2026-06-09T05:50:00.000Z",
                "bucket_start": "2026-06-09T05:50:00Z",
                "bucket_end": "2026-06-09T05:54:59.999Z",
                "is_bucket": True,
                "risk_score": 99.0,
                "risk_score_min": 49.0,
                "risk_score_min_at": "2026-06-09T05:54:45.202Z",
                "risk_score_max": 100.0,
                "ai_max_score": 0.0,
            },
            {
                "timestamp": "2026-06-09T07:00:00.000Z",
                "bucket_start": "2026-06-09T07:00:00Z",
                "bucket_end": "2026-06-09T07:04:59.999Z",
                "is_bucket": True,
                "risk_score": 100.0,
                "risk_score_min": 100.0,
                "risk_score_max": 100.0,
                "ai_max_score": 0.0,
            },
        ]

    async def _state_snapshots(fid, start_utc, end_utc, max_objects=80):
        assert fid == "factory-a"
        assert start_utc == datetime(2026, 6, 9, 5, 52, 45, 202000, tzinfo=timezone.utc)
        assert end_utc == datetime(2026, 6, 9, 5, 56, 45, 202000, tzinfo=timezone.utc)
        assert max_objects == 80
        return [
            {
                "timestamp": "2026-06-09T05:54:45.202Z",
                "risk_score": 49.0,
                "top_causes": [
                    {
                        "field": "data_freshness",
                        "reason": "pipeline_status_critical",
                        "value": "critical",
                        "contribution": 41.0,
                        "severity": "danger",
                    }
                ],
            }
        ]

    monkeypatch.setattr(s3, "list_processed_agg_metrics_5m", _metrics_5m)
    monkeypatch.setattr(s3, "list_processed_state_snapshots", _state_snapshots)

    r = client.post(
        "/chat/query",
        json={"question": "factory-a 2026-06-09 오후 2시~4시 안전 점수와 AI 탐지 추이 비교해줘"},
    )

    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == chat.Intent.HISTORY_TREND
    conf = data["evidence"]["confirmed"]
    assert conf["risk_score_min_time_kst"] == "2026-06-09 14:54:45 KST"
    assert conf["top_causes"] == ["데이터 신선도"]
    assert conf["state_snapshot_source"] == "S3 processed/state_snapshot"
    assert any("state_snapshot 상세" in item for item in data["evidence"]["inferred"])
    assert not any("top_causes" in item for item in data["evidence"]["missing"])


def test_chat_cloud_infra_report_requires_system_access(client, monkeypatch):
    app.dependency_overrides[rbac_module.get_current_principal] = lambda: rbac_module.Principal(
        user_id="viewer",
        cognito_sub="viewer",
        email="viewer@example.com",
        display_name="Viewer",
        global_role="viewer",
        can_view_system=False,
        status="active",
        allowed_factory_ids=frozenset({"factory-a"}),
    )
    r = client.post("/chat/query", json={"question": "cloud infra 보고서 요약"})
    assert r.status_code == 403


def test_chat_cloud_infra_report_allowed_for_system_user(client, monkeypatch):
    async def _list_reports():
        return [{"report_date": "2026-06-08", "factory_id": "cloud-infra"}]

    async def _get_report(report_date, factory_id):
        assert factory_id == "cloud-infra"
        return """# Cloud Infra 일일 운영 리포트 - 2026-06-08

## 요약
전반적인 운영 상태는 위험 수준입니다. EKS 클러스터 상태 확인이 필요합니다.

## EKS Management

| 항목 | 값 | 판단 |
| --- | ---: | --- |
| Cluster status | unknown | ACTIVE 여부 |
| Nodes ready/total | 0/2 | 노드 상태 |

## 확인 필요 항목

| 우선순위 | 항목 | 이유 | 구간 |
| --- | --- | --- | --- |
| 높음 | EKS cluster 상태 확인 | EKS cluster status was not ACTIVE | 23:00~23:59 |
"""

    monkeypatch.setattr(s3, "list_daily_reports", _list_reports)
    monkeypatch.setattr(s3, "get_report_markdown", _get_report)
    r = client.post("/chat/query", json={"question": "cloud infra 보고서에서 EKS 상태 어땠어?"})
    assert r.status_code == 200
    data = r.json()
    assert data["factory_id"] == "cloud-infra"
    assert data["evidence"]["confirmed"]["report_kind"] == "cloud_infra"
    assert "EKS Management" in data["evidence"]["confirmed"]["report_sections"]


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
