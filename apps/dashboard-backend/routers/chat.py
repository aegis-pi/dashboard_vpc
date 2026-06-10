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
_S3_AGG_MAX_OBJECTS = 288
_S3_POINT_DETAIL_MAX_OBJECTS = 500
_S3_DETAIL_MAX_OBJECTS = 1200
_S3_DETAIL_MAX_WINDOW = timedelta(minutes=15)
_IMAGE_REF_MAX_OBJECTS = 6
_IMAGE_REF_HALF_WINDOW = timedelta(minutes=10)
_IMAGE_KEYWORDS = ("사진", "이미지", "스냅샷", "snapshot", "image", "증빙")


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
    image_ref: dict | None = None,
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
        "image_ref": image_ref,
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


def _wants_image_ref(parsed: chat.ParsedQuery) -> bool:
    return any(keyword in parsed.raw.lower() for keyword in _IMAGE_KEYWORDS)


def _image_scope_from_evidence(parsed: chat.ParsedQuery, evidence: chat.Evidence) -> tuple[datetime, datetime] | None:
    if parsed.time.target_kst:
        return parsed.time.target_kst - _IMAGE_REF_HALF_WINDOW, parsed.time.target_kst + _IMAGE_REF_HALF_WINDOW
    spikes = evidence.confirmed.get("spikes") or []
    if spikes and isinstance(spikes, list):
        first = spikes[0] if isinstance(spikes[0], dict) else {}
        time_kst = first.get("time_kst")
        if isinstance(time_kst, str):
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
                try:
                    center = datetime.strptime(time_kst, fmt).replace(tzinfo=chat.KST)
                    return center - _IMAGE_REF_HALF_WINDOW, center + _IMAGE_REF_HALF_WINDOW
                except ValueError:
                    pass
    if parsed.time.start_utc and parsed.time.end_utc:
        return parsed.time.start_utc.astimezone(chat.KST), parsed.time.end_utc.astimezone(chat.KST)
    return None


async def _maybe_fetch_image_ref(
    parsed: chat.ParsedQuery,
    evidence: chat.Evidence,
    principal: Principal,
) -> dict | None:
    if not _wants_image_ref(parsed) or not parsed.factory_id or parsed.factory_id == chat.REPORT_TARGET_CLOUD_INFRA:
        return None
    require_system_access(principal)
    scope = _image_scope_from_evidence(parsed, evidence)
    if scope is None:
        evidence.missing.append("이미지 조회에 사용할 시각 범위를 특정하지 못함")
        return None
    start_kst, end_kst = scope
    items = await s3.list_image_snapshots(
        parsed.factory_id,
        start_kst,
        end_kst,
        max_objects=_IMAGE_REF_MAX_OBJECTS,
    )
    evidence.confirmed["image_snapshot_count"] = len(items)
    evidence.confirmed["image_snapshot_time_range_kst"] = (
        f"{start_kst.strftime('%Y-%m-%d %H:%M')}~{end_kst.strftime('%H:%M')} KST"
    )
    ai_max = evidence.confirmed.get("ai_detection_max_score")
    temp_avg = evidence.confirmed.get("temperature_avg")
    if not items:
        if isinstance(ai_max, (int, float)) and ai_max >= 0.7:
            evidence.missing.append(
                "AI 탐지는 상승했지만 요청 시각 범위의 S3 image_snapshot 객체가 없어 "
                "사진 촬영 센서 또는 이미지 스냅샷 저장 파이프라인 확인 필요"
            )
        else:
            evidence.missing.append("요청 시각 범위에서 S3 image_snapshot 객체를 찾지 못함")
        return None
    evidence.confirmed["image_snapshot_status"] = "available"
    if isinstance(ai_max, (int, float)) and ai_max >= 0.7:
        evidence.inferred.append("AI 탐지 상승과 이미지 스냅샷이 같은 시간대에 확인되었습니다.")
    elif isinstance(temp_avg, (int, float)) and temp_avg < 30:
        evidence.inferred.append(
            "이미지 스냅샷은 있으나 AI 탐지와 온도 상승이 함께 확인되지 않아 "
            "사진 촬영 오탐 또는 miss 가능성을 우선 확인해야 합니다."
        )
    return {
        "kind": "image_snapshots",
        "factory_id": parsed.factory_id,
        "time_range_kst": evidence.confirmed["image_snapshot_time_range_kst"],
        "count": len(items),
        "items": items,
    }


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


async def _get_s3_bounded_history(
    factory_id: str,
    scope: chat.TimeScope,
    *,
    prefer_detail: bool = False,
) -> tuple[list[dict], dict, list[str]]:
    """Read bounded historical chat data from S3, not DDB TTL-backed stores."""
    if scope.start_utc is None or scope.end_utc is None:
        return [], {}, ["S3 조회에 필요한 시작/종료 시각 없음"]

    duration = scope.end_utc - scope.start_utc
    agg_items = await s3.list_processed_agg_metrics_5m(
        factory_id,
        scope.start_utc,
        scope.end_utc,
        max_objects=_S3_AGG_MAX_OBJECTS,
    )

    should_read_detail = prefer_detail or duration <= _S3_DETAIL_MAX_WINDOW
    detail_items: list[dict] = []
    if should_read_detail:
        detail_items = await s3.list_processed_state_snapshots(
            factory_id,
            scope.start_utc,
            scope.end_utc,
            max_objects=_S3_POINT_DETAIL_MAX_OBJECTS if prefer_detail else _S3_DETAIL_MAX_OBJECTS,
        )

    items = detail_items or agg_items
    confirmed = {
        "query_time_window_kst": (
            f"{scope.start_utc.astimezone(chat.KST).strftime('%Y-%m-%d %H:%M')}"
            f"~{scope.end_utc.astimezone(chat.KST).strftime('%H:%M')} KST"
        ),
        "processed_agg_metrics_5m_count": len(agg_items),
        "processed_state_snapshot_count": len(detail_items),
        "primary_detail_source": (
            "S3 processed/state_snapshot" if detail_items else "S3 processed_agg/metrics_5m"
        ),
    }
    missing = []
    if not agg_items:
        missing.append("S3 processed_agg metrics_5m 데이터 없음")
    if should_read_detail and not detail_items:
        missing.append("S3 processed state_snapshot 상세 데이터 없음")
    return items, confirmed, missing


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
                window="10m",
                start_utc=center - timedelta(minutes=5),
                end_utc=center + timedelta(minutes=5),
            )
            items, confirmed, missing = await _get_s3_bounded_history(fid, spike_scope, prefer_detail=True)
            evidence = chat.summarize_spikes(items, spike_scope, parsed.threshold, parsed.metric, parsed.comparison)
            evidence.confirmed.update(confirmed)
            evidence.missing.extend(missing)
            return evidence
        else:
            if scope.start_utc and scope.end_utc:
                items, confirmed, missing = await _get_s3_bounded_history(fid, scope)
                evidence = chat.summarize_spikes(items, scope, parsed.threshold, parsed.metric, parsed.comparison)
                evidence.confirmed.update(confirmed)
                evidence.missing.extend(missing)
                return evidence
            items = await _get_bounded_history(fid, scope, _HISTORY_MAX_ITEMS)
        return chat.summarize_spikes(items, scope, parsed.threshold, parsed.metric, parsed.comparison)

    # Historical instant/interval (always) or trailing range (unless a "now" status) → history tool.
    if scope.kind in ("point", "interval") or (
        scope.kind == "range" and parsed.intent != chat.Intent.CURRENT_STATUS
    ):
        if scope.start_utc and scope.end_utc:
            items, confirmed, missing = await _get_s3_bounded_history(
                fid,
                scope,
                prefer_detail=scope.kind == "point" or parsed.intent == chat.Intent.CAUSE_ANALYSIS,
            )
        else:
            max_items = _POINT_MAX_ITEMS if scope.kind == "point" else _HISTORY_MAX_ITEMS
            items = await _get_bounded_history(fid, scope, max_items)
            confirmed = {}
            missing = []
        evidence = chat.summarize_history(items, scope)
        evidence.confirmed.update(confirmed)
        evidence.missing.extend(missing)
        if parsed.intent == chat.Intent.CAUSE_ANALYSIS and scope.start_utc and scope.end_utc:
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

    try:
        image_ref = await _maybe_fetch_image_ref(parsed, evidence, principal)
    except s3.S3UnavailableError as exc:
        raise _s3_gateway_timeout() from exc

    answer, generator, model_tier = await _explain(parsed, evidence, body.model_tier)
    if image_ref:
        answer = f"{answer}\n\n요청한 시각 범위의 증빙 이미지 {image_ref['count']}개를 함께 표시합니다."
    return _envelope(parsed, answer, evidence, image_ref, generator, model_tier, router=router_source)
