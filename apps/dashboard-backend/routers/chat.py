"""Chatbot QA endpoint (ADR 0033: rule fallback + optional Bedrock explain).

Flow (ADR 0033 §결정 기준 5):
  POST /chat/query
    -> Cognito JWT (deps.auth via get_current_principal)
    -> RBAC factory scope enforced BEFORE any data tool runs (deps.rbac)
    -> intent + time parser (services.chat)
    -> data tools (services.ddb) — Backend finds the data
    -> Evidence (confirmed / inferred / missing)
    -> render_answer (Step 4 will swap this for Bedrock over the same Evidence)

RBAC note: the factory-scope check is the single guard that prevents the
chatbot from becoming an RBAC bypass.  No ddb call is made for a factory the
principal cannot access.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import get_settings
from deps.rbac import Principal, get_current_principal, require_factory_access
from services import bedrock, chat, ddb

router = APIRouter(prefix="/chat", tags=["chat"])

_HISTORY_MAX_ITEMS = 500
_POINT_MAX_ITEMS = 120
_CAUSE_NOW_WINDOW = "1h"


class ChatQueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    factory_id: str | None = Field(default=None, max_length=40)


def _ddb_gateway_timeout() -> HTTPException:
    return HTTPException(status_code=504, detail="DynamoDB request timed out")


def _envelope(
    parsed: chat.ParsedQuery,
    answer: str,
    evidence: chat.Evidence,
    generator: str = "rule",
    model_tier: str | None = None,
) -> dict:
    return {
        "answer": answer,
        "intent": parsed.intent,
        "factory_id": parsed.factory_id,
        "time_scope": parsed.time.to_dict(),
        "evidence": evidence.to_dict(),
        "image_ref": None,  # reserved (ADR 0033 §6); populated in a later step
        "generator": generator,   # "bedrock" | "rule"
        "model_tier": model_tier,  # "fast" | "precise" | None (raw model id is admin-only)
    }


async def _explain(parsed: chat.ParsedQuery, evidence: chat.Evidence) -> tuple[str, str, str | None]:
    """Final 'explain' step: Bedrock when enabled, deterministic rule on fallback.

    Returns (answer, generator, model_tier).  The pipeline before this point is
    identical regardless of generator, so disabling Bedrock degrades gracefully.
    """
    if not get_settings().bedrock_enabled:
        return chat.render_answer(parsed, evidence), "rule", None
    tier = bedrock.tier_for_intent(parsed.intent)
    try:
        answer = await bedrock.generate_answer(parsed, evidence, tier)
        return answer, "bedrock", tier
    except bedrock.BedrockUnavailableError:
        # Never fail the request on LLM trouble — fall back to the grounded template.
        return chat.render_answer(parsed, evidence), "rule", tier


async def _fetch_evidence(parsed: chat.ParsedQuery, now_utc: datetime) -> chat.Evidence:
    """Run the data tool matching the parsed intent/time and build Evidence."""
    fid = parsed.factory_id
    scope = parsed.time

    # Historical instant (always) or trailing range (unless it's a "now" status) → history tool.
    if scope.kind == "point" or (
        scope.kind == "range" and parsed.intent != chat.Intent.CURRENT_STATUS
    ):
        since = chat._iso(scope.start_utc) if scope.start_utc else None
        max_items = _POINT_MAX_ITEMS if scope.kind == "point" else _HISTORY_MAX_ITEMS
        items = await ddb.get_factory_history(fid, scope.window, max_items, since=since)
        if scope.kind == "point" and scope.end_utc is not None:
            end_iso = chat._iso(scope.end_utc)
            items = [i for i in items if str(i.get("timestamp") or "") <= end_iso]
        return chat.summarize_history(items, scope)

    # Cause analysis at "now" → latest + recent trend for first→last delta.
    if parsed.intent == chat.Intent.CAUSE_ANALYSIS:
        items = await ddb.get_factory_history(fid, _CAUSE_NOW_WINDOW, _POINT_MAX_ITEMS)
        return chat.summarize_history(items, scope)

    # Default: current status snapshot.
    item = await ddb.get_factory_latest(fid)
    return chat.summarize_latest(item, now_utc)


@router.post("/query")
async def chat_query(
    body: ChatQueryRequest,
    principal: Principal = Depends(get_current_principal),
):
    now_utc = datetime.now(timezone.utc)
    parsed = chat.parse_query(body.question, body.factory_id, now_utc)

    # No data tool needed for unanswerable / missing-target cases.
    if parsed.intent == chat.Intent.UNKNOWN:
        ev = chat.Evidence(missing=["의도를 파악하지 못함"])
        return _envelope(parsed, chat.render_answer(parsed, ev), ev)

    if parsed.needs_factory and not parsed.factory_id:
        ev = chat.Evidence(missing=["질문에서 공장을 식별하지 못함"])
        answer = (
            "어느 공장에 대한 질문인지 알려주세요. "
            "예: 'factory-a 지금 상태', 'factory-b 최근 6시간 추이'."
        )
        return _envelope(parsed, answer, ev)

    # RBAC: enforce factory scope before any ddb access.
    if parsed.factory_id:
        require_factory_access(principal, parsed.factory_id)

    # Report tool is not wired to S3 yet (follow-up step) — no ddb call.
    if parsed.intent == chat.Intent.REPORT:
        ev = chat.Evidence()
        return _envelope(parsed, chat.render_answer(parsed, ev), ev)

    try:
        evidence = await _fetch_evidence(parsed, now_utc)
    except ddb.DynamoDBUnavailableError as exc:
        raise _ddb_gateway_timeout() from exc

    answer, generator, model_tier = await _explain(parsed, evidence)
    return _envelope(parsed, answer, evidence, generator, model_tier)
