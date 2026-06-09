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
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import get_settings
from deps.rbac import Principal, get_current_principal, require_factory_access, require_system_access
from services import bedrock, chat, ddb, s3

router = APIRouter(prefix="/chat", tags=["chat"])

_HISTORY_MAX_ITEMS = 500
_POINT_MAX_ITEMS = 500
_CAUSE_NOW_WINDOW = "1h"
_GRAPH_FALLBACK_WINDOW = "6h"
_S3_DRILLDOWN_MAX_OBJECTS = 300


class ChatQueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    factory_id: str | None = Field(default=None, max_length=40)
    model_tier: Literal["auto", "fast", "precise"] | None = None


def _ddb_gateway_timeout() -> HTTPException:
    return HTTPException(status_code=504, detail="DynamoDB request timed out")


def _s3_gateway_timeout() -> HTTPException:
    return HTTPException(status_code=504, detail="S3 request timed out")


def _envelope(
    parsed: chat.ParsedQuery,
    answer: str,
    evidence: chat.Evidence,
    generator: str = "rule",
    model_tier: str | None = None,
    router: str = "rule",
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
        "router": router,          # "llm" | "rule" (how intent/time was resolved; ADR 0034)
    }


def _has_risk_data(items: list[dict]) -> bool:
    return any(i.get("risk_score") is not None or i.get("risk_score_min") is not None for i in items)


def _bound_items(items: list[dict], end_utc: datetime | None) -> list[dict]:
    if end_utc is None:
        return items
    end_iso = chat._iso(end_utc)
    return [i for i in items if str(i.get("timestamp") or "") <= end_iso]


def _uses_graph_buckets(items: list[dict]) -> bool:
    return any(bool(i.get("is_bucket")) for i in items)


async def _get_bounded_history(
    factory_id: str,
    scope: chat.TimeScope,
    max_items: int,
    *,
    fallback_to_graph: bool = True,
) -> list[dict]:
    since = chat._iso(scope.start_utc) if scope.start_utc else None
    until = chat._iso(scope.end_utc) if scope.end_utc else None
    items = await ddb.get_factory_history(
        factory_id, scope.window, max_items, since=since, until=until
    )
    items = _bound_items(items, scope.end_utc)
    if fallback_to_graph and not _has_risk_data(items) and scope.window not in ("6h", "12h", "24h"):
        graph_items = await ddb.get_factory_history(
            factory_id,
            _GRAPH_FALLBACK_WINDOW,
            _HISTORY_MAX_ITEMS,
            since=since,
            until=until,
        )
        graph_items = _bound_items(graph_items, scope.end_utc)
        if _has_risk_data(graph_items):
            return graph_items
    return items


async def _resolve_parsed(body: "ChatQueryRequest", now_utc: datetime) -> tuple[chat.ParsedQuery, str]:
    """Understand the query: LLM resolve (ADR 0034) with rule-parser fallback.

    The resolve call inputs only the question text (no factory data), so running
    it before RBAC does not leak scoped data.  Any failure/invalid result falls
    back to the deterministic rule parser — the pipeline downstream is identical.
    """
    s = get_settings()
    if s.chat_routing_enabled and s.bedrock_enabled:
        try:
            resolution = await bedrock.resolve_query(body.question, body.factory_id, now_utc)
            parsed = chat.map_resolution(resolution, body.factory_id, now_utc, body.question)
            if parsed is not None:
                return parsed, "llm"
        except bedrock.BedrockUnavailableError:
            pass
    return chat.parse_query(body.question, body.factory_id, now_utc), "rule"


async def _explain(
    parsed: chat.ParsedQuery,
    evidence: chat.Evidence,
    requested_tier: str | None = None,
) -> tuple[str, str, str | None]:
    """Final 'explain' step: Bedrock when enabled, deterministic rule on fallback.

    Returns (answer, generator, model_tier).  The pipeline before this point is
    identical regardless of generator, so disabling Bedrock degrades gracefully.
    """
    if not get_settings().bedrock_enabled:
        return chat.render_answer(parsed, evidence), "rule", None
    tier = (
        requested_tier
        if requested_tier in (bedrock.TIER_FAST, bedrock.TIER_PRECISE)
        else bedrock.tier_for_intent(parsed.intent)
    )
    try:
        answer = await bedrock.generate_answer(parsed, evidence, tier)
        return answer, "bedrock", tier
    except bedrock.BedrockUnavailableError:
        # Never fail the request on LLM trouble — fall back to the grounded template.
        return chat.render_answer(parsed, evidence), "rule", tier


async def _resolve_report_date_and_markdown(
    parsed: chat.ParsedQuery,
    now_utc: datetime,
) -> tuple[str, str, bool]:
    """Fetch the requested daily report Markdown from S3.

    If the user did not specify a date, use the latest report available for the
    target.  S3 list order is already newest-first in services.s3.
    """
    requested_date = chat.parse_report_date(parsed.raw, now_utc)
    if requested_date:
        markdown = await s3.get_report_markdown(requested_date, parsed.factory_id)
        return requested_date, markdown, False

    reports = await s3.list_daily_reports()
    latest = next((r for r in reports if r.get("factory_id") == parsed.factory_id), None)
    if latest is None:
        raise s3.S3ObjectNotFoundError(parsed.factory_id)
    report_date = latest["report_date"]
    markdown = await s3.get_report_markdown(report_date, parsed.factory_id)
    return report_date, markdown, True


async def _fetch_evidence(parsed: chat.ParsedQuery, now_utc: datetime) -> chat.Evidence:
    """Run the data tool matching the parsed intent/time and build Evidence."""
    fid = parsed.factory_id
    scope = parsed.time

    if parsed.intent == chat.Intent.REPORT:
        report_date, markdown, latest_used = await _resolve_report_date_and_markdown(parsed, now_utc)
        return chat.summarize_report_markdown(
            markdown,
            report_date,
            fid,
            parsed.raw,
            latest_used=latest_used,
        )

    # Spike check → fetch a wide-enough fine-grained window, then detect deterministically.
    if parsed.intent == chat.Intent.SPIKE_CHECK:
        if scope.kind == "point" and scope.target_kst is not None:
            center = scope.target_kst.astimezone(timezone.utc)
            spike_scope = chat.TimeScope(
                kind="range",
                window=_GRAPH_FALLBACK_WINDOW,
                start_utc=center - timedelta(hours=1),
                end_utc=center + timedelta(hours=1),
            )
            items = await _get_bounded_history(
                fid,
                spike_scope,
                _HISTORY_MAX_ITEMS,
                fallback_to_graph=False,
            )
        else:
            # interval / trailing range — bound the fetch by [start, end].
            items = await _get_bounded_history(fid, scope, _HISTORY_MAX_ITEMS)
        return chat.summarize_spikes(items, scope, parsed.threshold, parsed.metric, parsed.comparison)

    # Historical instant/interval (always) or trailing range (unless a "now" status) → history tool.
    if scope.kind in ("point", "interval") or (
        scope.kind == "range" and parsed.intent != chat.Intent.CURRENT_STATUS
    ):
        max_items = _POINT_MAX_ITEMS if scope.kind == "point" else _HISTORY_MAX_ITEMS
        items = await _get_bounded_history(fid, scope, max_items)
        evidence = chat.summarize_history(items, scope)
        if (
            parsed.intent == chat.Intent.CAUSE_ANALYSIS
            and scope.start_utc
            and scope.end_utc
            and _uses_graph_buckets(items)
            and not evidence.confirmed.get("top_causes")
        ):
            try:
                details = await s3.list_processed_risk_scores(
                    fid,
                    scope.start_utc,
                    scope.end_utc,
                    _S3_DRILLDOWN_MAX_OBJECTS,
                )
            except s3.S3UnavailableError:
                evidence.missing.append("S3 processed risk_score 상세 조회 실패")
            else:
                chat.enrich_history_with_processed_risk_scores(evidence, details)
        return evidence

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
    parsed, router_source = await _resolve_parsed(body, now_utc)

    # No data tool needed for unanswerable / missing-target cases.
    if parsed.intent == chat.Intent.UNKNOWN:
        ev = chat.Evidence(missing=["의도를 파악하지 못함"])
        return _envelope(parsed, chat.render_answer(parsed, ev), ev, router=router_source)

    if parsed.needs_factory and not parsed.factory_id:
        ev = chat.Evidence(missing=["질문에서 공장을 식별하지 못함"])
        answer = (
            "어느 공장에 대한 질문인지 알려주세요. "
            "예: 'factory-a 지금 상태', 'factory-b 최근 6시간 추이'."
        )
        return _envelope(parsed, answer, ev, router=router_source)

    # RBAC: enforce scope before any data access (also re-validates an
    # LLM-chosen target — the chatbot must never become an RBAC bypass).
    if parsed.factory_id:
        if parsed.factory_id == chat.REPORT_TARGET_CLOUD_INFRA:
            require_system_access(principal)
        else:
            require_factory_access(principal, parsed.factory_id)

    try:
        evidence = await _fetch_evidence(parsed, now_utc)
    except ddb.DynamoDBUnavailableError as exc:
        raise _ddb_gateway_timeout() from exc
    except s3.S3ObjectNotFoundError as exc:
        ev = chat.Evidence(missing=["요청한 일일 보고서를 S3에서 찾지 못함"])
        return _envelope(parsed, chat.render_answer(parsed, ev), ev, router=router_source)
    except s3.S3UnavailableError as exc:
        raise _s3_gateway_timeout() from exc

    answer, generator, model_tier = await _explain(parsed, evidence, body.model_tier)
    return _envelope(parsed, answer, evidence, generator, model_tier, router=router_source)
