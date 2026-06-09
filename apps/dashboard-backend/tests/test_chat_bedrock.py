"""Bedrock answer-generation tests (ADR 0033, Step 4).

No real Bedrock calls: connectivity was verified manually (2026-06-08).  Here the
generate_answer() boundary is stubbed so we test tier selection, the response
envelope, and graceful fallback to the rule template — without touching the
network or the data pipeline (which is identical regardless of generator).
"""
import pytest

import deps.rbac as rbac_module
from config import get_settings
from main import app
from services import bedrock, chat


@pytest.fixture
def bedrock_on(monkeypatch):
    """Enable Bedrock on the cached settings singleton for one test."""
    monkeypatch.setattr(get_settings(), "bedrock_enabled", True)


# ─── Pure helpers ─────────────────────────────────────────────────────────────

def test_tier_precise_for_cause():
    assert bedrock.tier_for_intent(chat.Intent.CAUSE_ANALYSIS) == bedrock.TIER_PRECISE


def test_tier_fast_for_others():
    assert bedrock.tier_for_intent(chat.Intent.CURRENT_STATUS) == bedrock.TIER_FAST
    assert bedrock.tier_for_intent(chat.Intent.HISTORY_TREND) == bedrock.TIER_FAST


def test_model_for_tier_uses_settings():
    s = get_settings()
    assert bedrock._model_for_tier(bedrock.TIER_FAST, s) == s.bedrock_model_fast
    assert bedrock._model_for_tier(bedrock.TIER_PRECISE, s) == s.bedrock_model_precise


def test_build_user_message_is_evidence_grounded():
    import json
    from datetime import datetime, timezone

    parsed = chat.parse_query("factory-a 지금 상태", None, datetime(2026, 6, 8, 1, tzinfo=timezone.utc))
    ev = chat.Evidence(confirmed={"risk_score": 27.6}, inferred=["추정 사유"], missing=[])
    payload = json.loads(bedrock.build_user_message(parsed, ev))
    assert payload["factory_id"] == "factory-a"
    assert payload["risk_score_policy"]["safe"] == "100~85"
    assert payload["evidence"]["confirmed"]["risk_score"] == 27.6


# ─── Endpoint: Bedrock path ───────────────────────────────────────────────────

def test_chat_uses_bedrock_when_enabled(client, ddb_mock, bedrock_on, monkeypatch):
    async def _fake(parsed, evidence, tier):
        return f"[LLM:{tier}] 현재 위험도 보고입니다."

    monkeypatch.setattr(bedrock, "generate_answer", _fake)
    r = client.post("/chat/query", json={"question": "factory-a 지금 상태"})
    assert r.status_code == 200
    data = r.json()
    assert data["generator"] == "bedrock"
    assert data["model_tier"] == "fast"
    assert "LLM:fast" in data["answer"]
    # evidence (data path) is unchanged
    assert data["evidence"]["confirmed"]["risk_score"] == 27.6


def test_chat_cause_uses_precise_tier(client, ddb_mock, bedrock_on, monkeypatch):
    async def _fake(parsed, evidence, tier):
        return f"[LLM:{tier}] 원인 분석"

    monkeypatch.setattr(bedrock, "generate_answer", _fake)
    r = client.post("/chat/query", json={"question": "factory-a 왜 위험해?"})
    assert r.status_code == 200
    assert r.json()["model_tier"] == "precise"


def test_chat_model_tier_override(client, ddb_mock, bedrock_on, monkeypatch):
    async def _fake(parsed, evidence, tier):
        return f"[LLM:{tier}] 빠른 원인 분석"

    monkeypatch.setattr(bedrock, "generate_answer", _fake)
    r = client.post(
        "/chat/query",
        json={"question": "factory-a 왜 위험해?", "model_tier": "fast"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["model_tier"] == "fast"
    assert "LLM:fast" in data["answer"]


def test_chat_falls_back_to_rule_on_bedrock_error(client, ddb_mock, bedrock_on, monkeypatch):
    async def _boom(parsed, evidence, tier):
        raise bedrock.BedrockUnavailableError("down")

    monkeypatch.setattr(bedrock, "generate_answer", _boom)
    r = client.post("/chat/query", json={"question": "factory-a 지금 상태"})
    assert r.status_code == 200
    data = r.json()
    assert data["generator"] == "rule"      # graceful degradation
    assert "안전 점수" in data["answer"]       # deterministic template
    assert data["evidence"]["confirmed"]["risk_score"] == 27.6


def test_chat_does_not_call_bedrock_for_missing_factory(client, ddb_mock, bedrock_on, monkeypatch):
    called = {"n": 0}

    async def _spy(parsed, evidence, tier):
        called["n"] += 1
        return "should-not-be-used"

    monkeypatch.setattr(bedrock, "generate_answer", _spy)
    r = client.post("/chat/query", json={"question": "지금 상태 어때"})  # no factory
    assert r.status_code == 200
    assert r.json()["generator"] == "rule"
    assert called["n"] == 0  # clarification needs no LLM


def test_chat_rbac_denied_before_bedrock(client, ddb_mock, bedrock_on, monkeypatch):
    """RBAC must block before the LLM step runs (no spend on denied factories)."""
    called = {"n": 0}

    async def _spy(parsed, evidence, tier):
        called["n"] += 1
        return "nope"

    monkeypatch.setattr(bedrock, "generate_answer", _spy)
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
    assert called["n"] == 0
