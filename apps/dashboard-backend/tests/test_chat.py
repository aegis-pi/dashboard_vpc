"""Chatbot QA tests (ADR 0033, Step 3: rule/template).

Two layers:
  - Pure parsing/evidence logic in services.chat (deterministic, fixed `now`).
  - /chat/query endpoint against the moto ddb_mock + RBAC enforcement.
"""
from datetime import datetime, timezone

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

    async def _fake_history(factory_id, window, max_items, since=None, until=None):
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
    assert conf["risk_score_min_time_kst"] == "2026-06-08 09:55:00 KST"
    assert conf["ai_detection_max_score"] == 0.96
    assert conf["ai_detection_max_time_kst"] == "2026-06-08 09:55:00 KST"
    assert "AI 탐지 최대 점수" in data["answer"]
    assert "화재 0.96" in data["answer"]
    assert "2026-06-08 09:55:00 KST" in data["answer"]


def test_chat_short_point_falls_back_to_graph_when_raw_history_empty(client, monkeypatch):
    calls = []
    s3_calls = []

    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = datetime(2026, 6, 9, 7, 40, 0, tzinfo=timezone.utc)
            return value if tz is None else value.astimezone(tz)

    async def _fake_history(factory_id, window, max_items, since=None, until=None):
        calls.append((factory_id, window, since, until))
        if window == "1h":
            return []
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
    monkeypatch.setattr(ddb, "get_factory_history", _fake_history)
    monkeypatch.setattr(s3, "list_processed_risk_scores", _fake_risk_details)
    r = client.post(
        "/chat/query",
        json={"question": "factory-a 오늘 오후 4시30분 즈음에 risk score가 하락했던데 이유 알려줘"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == chat.Intent.CAUSE_ANALYSIS
    assert [c[1] for c in calls] == ["1h", "6h"]
    assert calls[0][3] is not None
    conf = data["evidence"]["confirmed"]
    assert conf["risk_score_min"] == 43.0
    assert conf["risk_score_min_level"] == "danger"
    assert conf["risk_score_min_time_kst"] == "2026-06-09 16:25~16:30 KST"
    assert conf["ai_detection_max_score"] == 0.76
    assert conf["ai_detection_max_time_kst"] == "2026-06-09 16:25~16:30 KST"
    assert conf["processed_risk_score_source"] == "S3 processed/risk_score"
    assert conf["processed_risk_score_min_time_kst"] == "2026-06-09 16:27:12 KST"
    assert conf["top_causes"] == ["AI 이벤트"]
    assert s3_calls and s3_calls[0][0] == "factory-a"
    assert any("S3 processed" in s for s in data["evidence"]["inferred"])
    assert "2026-06-09 16:25~16:30 KST" in data["answer"]


def test_chat_graph_cause_degrades_when_s3_drilldown_unavailable(client, monkeypatch):
    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = datetime(2026, 6, 9, 7, 40, 0, tzinfo=timezone.utc)
            return value if tz is None else value.astimezone(tz)

    async def _fake_history(factory_id, window, max_items, since=None, until=None):
        if window == "1h":
            return []
        return [
            {
                "timestamp": "2026-06-09T07:25:00.000Z",
                "bucket_end": "2026-06-09T07:30:00.000Z",
                "is_bucket": True,
                "risk_score": 72.0,
                "risk_score_min": 43.0,
                "risk_score_max": 90.0,
            }
        ]

    async def _raise_s3(factory_id, start_utc, end_utc, max_objects):
        raise s3.S3UnavailableError("timeout")

    monkeypatch.setattr(chat_router, "datetime", FixedDatetime)
    monkeypatch.setattr(ddb, "get_factory_history", _fake_history)
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
