"""Bedrock answer generation for the chatbot (ADR 0033, Step 4).

Only the final "explain" step of the pipeline lives here.  Everything before it
(intent/time parse → RBAC → ddb/s3 tools → Evidence) is unchanged from Step 3,
so tests, permissions and data integrity are not affected by swapping in the LLM.

Tier → model:
  fast    : default, quick status/trend explanations
  precise : cause analysis ("왜 위험했나"), reasoning quality preferred

Model IDs are admin configuration (config.Settings); the API surfaces only the
tier label ("fast"/"precise"), never the raw model id.

Verified in ap-south-1 (2026-06-08): both tiers require an inference profile
(no on-demand). fast=global.anthropic.claude-haiku-4-5, precise=global.anthropic.claude-sonnet-4-6.
"""
from __future__ import annotations

import asyncio
import json
from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from config import get_settings

TIER_FAST = "fast"
TIER_PRECISE = "precise"

_SYSTEM_PROMPT = (
    "너는 스마트팩토리 안전 관제 어시스턴트다. "
    "주어진 evidence(JSON)만 근거로 한국어로 간결하게 답한다.\n"
    "규칙:\n"
    "1) confirmed 값만 사실로 단정한다.\n"
    "2) inferred 항목은 반드시 '추정:' 접두로 구분해 표현한다.\n"
    "3) missing 항목이 있으면 데이터 한계를 한 줄로 명시한다.\n"
    "4) evidence에 없는 수치나 원인을 지어내지 않는다.\n"
    "5) Risk Score는 안전 점수다. 100~85=안전, 84~50=주의, 49~0=위험이며 "
    "점수가 높을수록 안전하고 낮을수록 위험하다.\n"
    "6) 사용자가 '왜 위험해?'라고 물어도 evidence의 점수/등급이 안전이면 위험하다고 말하지 않는다.\n"
    "7) 시간은 KST 필드(target_kst, start_kst, end_kst, time_range_kst)를 우선 사용한다. "
    "UTC start/end를 한국 현지 시각처럼 말하지 않는다.\n"
    "8) 점수 변화량(risk_score_delta)은 'Δ' 같은 기호 대신 "
    "'시작 N점 → 종료 M점 (변화 K점)' 형식의 한글로 표기한다. "
    "변화가 0이면 '변화 없음'으로 표현한다.\n"
    "9) 스파이크 질의(evidence에 spike_count/spikes/detection이 있을 때)는 spike_count와 "
    "spikes의 time_kst·value만 사실로 보고한다. spike_count가 0이면 '튄 지점 없음'으로 답하고 "
    "지점을 지어내지 않는다.\n"
    "10) 구간 평균이 시작/종료보다 낮거나 최저점이 있으면 risk_score_min_time_kst를 사용해 "
    "'언제 점수가 하락했는지'를 말한다. risk_score_recovered_at_kst가 있으면 "
    "'언제 몇 점으로 회복했는지'를 함께 말하고, 없을 때만 종료 시점 점수로 복구 흐름을 말한다. "
    "원인 필드가 없으면 원인을 단정하지 말고 AI 탐지/센서 값과 같은 확인된 동시 신호만 언급한다.\n"
    "11) AI 탐지 원천 라벨은 fire/fire_score=화재, fall/fallen/fall_score=넘어짐, "
    "bend/bending/bend_score=굽힘으로만 표현한다. 영문 원천 필드명을 답변에 그대로 쓰지 않는다.\n"
    "12) ai_detection_max_score를 말할 때 ai_detection_max_time_kst가 있으면 반드시 함께 표기한다.\n"
    "13) report intent는 evidence.confirmed의 report_date/report_target/summary/report_sections/table_rows/"
    "data_limits만 근거로 답한다. 보고서 본문에 없는 조치·원인을 새로 만들지 않는다.\n"
    "14) report_sections가 있으면 질문과 가장 관련 있는 섹션을 우선 답하고, 날짜가 최신으로 추정된 경우 "
    "inferred의 날짜 가정을 함께 말한다.\n"
    "15) 이미지 증빙을 말할 때 '별도 시스템'이라고 쓰지 말고, 반드시 '이미지 스냅샷 시스템'이라고 표현한다.\n"
    "16) image_snapshot_count가 0이고 AI 탐지가 상승했다면 사진 촬영 센서 또는 이미지 스냅샷 저장 파이프라인 "
    "확인이 필요하다고 말한다. 이미지가 있으나 AI 탐지/온도 상승이 함께 확인되지 않으면 "
    "사진 촬영 오탐 또는 miss 가능성을 추정으로만 말한다.\n"
    "17) 답변 첫 줄은 반드시 '# {공장/대상} {날짜 또는 시점} 요약' 형식의 Markdown 제목으로 쓴다. "
    "예: '# factory-a 2026-06-09 일일 리포트 요약'. 내부 소제목이 필요하면 '## 핵심 내용'처럼 "
    "한 단계 낮은 제목을 사용하고, 최상단 제목에 '###'를 쓰지 않는다.\n"
    "18) 줄바꿈은 Markdown 구조에만 사용한다. 제목 다음에는 바로 한 문단을 두고, 문장 중간에서 "
    "강제 줄바꿈하지 않는다. 서로 다른 생각은 빈 줄로 문단을 나누고, 나열은 '- ' bullet만 사용한다.\n"
    "19) 3~5문장 이내로, 관제 담당자에게 보고하듯 답한다."
)


# ─── Resolve step (ADR 0034): LLM query understanding via Converse tool-use ───
# The model is forced to call resolve_query; we read its structured input and
# hand it to services.chat.map_resolution for deterministic validation.  No
# answer is generated here — only intent/factory/time extraction.

_RESOLVE_SYSTEM_PROMPT = (
    "너는 스마트팩토리 관제 챗봇의 '질의 해석기'다. 사용자의 한국어 질문을 "
    "도구 resolve_query의 인자로만 변환한다. 답을 생성하지 말고 반드시 resolve_query를 호출한다.\n"
    "- intent: 현재 상태=current_status, 추이/그래프/구간=history_trend, 왜/원인=cause_analysis, "
    "특정값으로 튄/스파이크/이상값 확인=spike_check, 보고서/리포트=report, 불명확=unknown\n"
    "- spike_check일 때만 metric(risk_score/ai_detection/temperature), threshold(숫자, 명시 없으면 null), "
    "comparison(above/below/spike) 추출. 그 외 intent는 이 필드를 null로 둔다.\n"
    "- factory_id: 'factory-a'처럼 질문/힌트에 드러난 공장만. 없으면 null. 추측해 지어내지 않는다.\n"
    "- time.mode: 특정 과거 시각이면 point(anchor_kst=KST ISO8601), 시작·끝이 모두 있는 절대 구간"
    "('오전 9시~10시', '어제 2시부터 4시까지')이면 interval(start_kst·end_kst=KST ISO8601), "
    "최근 N시간/분/일처럼 끝이 '지금'인 구간이면 range(window='1h'/'30m'/'2d'), 현재/지금이면 now.\n"
    "- '9시~10시'처럼 시작과 끝이 분명한 구간은 절대 range로 만들지 말고 interval로 만든다. "
    "range는 끝이 현재(now)인 trailing 구간 전용이다.\n"
    "- '오후 12시 즈음' 같은 모호한 표현은 제공된 현재 KST를 기준으로 가장 가까운 과거 시점의 "
    "anchor_kst를 만든다. 미래 시각은 만들지 않는다."
)

_RESOLVE_TOOL = {
    "toolSpec": {
        "name": "resolve_query",
        "description": "사용자 질문에서 관제 데이터 조회에 필요한 intent·공장·시간을 추출한다.",
        "inputSchema": {
            "json": {
                "type": "object",
                "properties": {
                    "intent": {
                        "type": "string",
                        "enum": [
                            "current_status",
                            "history_trend",
                            "cause_analysis",
                            "spike_check",
                            "report",
                            "unknown",
                        ],
                    },
                    "factory_id": {
                        "type": ["string", "null"],
                        "description": "예: factory-a. 질문에 없으면 null.",
                    },
                    "metric": {
                        "type": ["string", "null"],
                        "description": "spike_check일 때만 risk_score/ai_detection/temperature 중 하나. 그 외 null.",
                    },
                    "threshold": {
                        "type": ["number", "null"],
                        "description": "spike_check에서 명시적 임계값이 있을 때만. 없으면 null.",
                    },
                    "comparison": {
                        "type": ["string", "null"],
                        "description": "spike_check일 때만 above/below/spike 중 하나. 그 외 null.",
                    },
                    "time": {
                        "type": "object",
                        "properties": {
                            "mode": {"type": "string", "enum": ["now", "point", "range", "interval"]},
                            "anchor_kst": {
                                "type": ["string", "null"],
                                "description": "point일 때 KST ISO8601(예: 2026-06-09T12:00). 아니면 null.",
                            },
                            "window": {
                                "type": ["string", "null"],
                                "description": "range일 때 '1h'/'30m'/'24h' 등. 아니면 null.",
                            },
                            "start_kst": {
                                "type": ["string", "null"],
                                "description": "interval일 때 시작 KST ISO8601(예: 2026-06-09T09:00). 아니면 null.",
                            },
                            "end_kst": {
                                "type": ["string", "null"],
                                "description": "interval일 때 종료 KST ISO8601(예: 2026-06-09T10:00). 아니면 null.",
                            },
                        },
                        "required": ["mode"],
                    },
                },
                "required": ["intent", "time"],
            }
        },
    }
}


class BedrockUnavailableError(RuntimeError):
    """Raised when Bedrock cannot answer within the request budget."""


def tier_for_intent(intent: str) -> str:
    # Imported lazily to avoid a circular import with services.chat.
    from services.chat import Intent

    return TIER_PRECISE if intent == Intent.CAUSE_ANALYSIS else TIER_FAST


@lru_cache(maxsize=4)
def _client(region: str, connect_timeout: float, read_timeout: float, max_attempts: int):
    return boto3.client(
        "bedrock-runtime",
        region_name=region,
        config=Config(
            connect_timeout=connect_timeout,
            read_timeout=read_timeout,
            retries={"total_max_attempts": max_attempts, "mode": "standard"},
        ),
    )


def _model_for_tier(tier: str, settings) -> str:
    return settings.bedrock_model_precise if tier == TIER_PRECISE else settings.bedrock_model_fast


def build_user_message(parsed, evidence) -> str:
    """Serialize the parsed query + Evidence as the LLM's grounding input."""
    payload = {
        "question": parsed.raw,
        "intent": parsed.intent,
        "factory_id": parsed.factory_id,
        "metric": getattr(parsed, "metric", None),
        "threshold": getattr(parsed, "threshold", None),
        "comparison": getattr(parsed, "comparison", None),
        "time_scope": parsed.time.to_dict(),
        "risk_score_policy": {
            "meaning": "Risk Score is a safety score; higher is safer.",
            "safe": "100~85",
            "warning": "84~50",
            "danger": "49~0",
        },
        "evidence": evidence.to_dict(),
    }
    return json.dumps(payload, ensure_ascii=False)


def _converse_sync(
    region: str,
    connect_timeout: float,
    read_timeout: float,
    max_attempts: int,
    model_id: str,
    user_text: str,
    max_tokens: int,
    temperature: float,
) -> str:
    client = _client(region, connect_timeout, read_timeout, max_attempts)
    resp = client.converse(
        modelId=model_id,
        system=[{"text": _SYSTEM_PROMPT}],
        messages=[{"role": "user", "content": [{"text": user_text}]}],
        inferenceConfig={"maxTokens": max_tokens, "temperature": temperature},
    )
    parts = resp.get("output", {}).get("message", {}).get("content", [])
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        raise BedrockUnavailableError("Bedrock returned an empty response")
    if resp.get("stopReason") == "max_tokens":
        raise BedrockUnavailableError("Bedrock answer hit max_tokens")
    return text


async def generate_answer(parsed, evidence, tier: str) -> str:
    """Call Bedrock to explain pre-fetched Evidence. Raises BedrockUnavailableError."""
    s = get_settings()
    model_id = _model_for_tier(tier, s)
    user_text = build_user_message(parsed, evidence)
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(
                _converse_sync,
                s.bedrock_region,
                s.bedrock_connect_timeout_seconds,
                s.bedrock_read_timeout_seconds,
                s.bedrock_max_attempts,
                model_id,
                user_text,
                s.bedrock_max_tokens,
                s.bedrock_temperature,
            ),
            timeout=s.bedrock_operation_timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        raise BedrockUnavailableError("Bedrock operation timed out") from exc
    except (BotoCoreError, ClientError) as exc:
        raise BedrockUnavailableError("Bedrock operation failed") from exc


def _resolve_sync(
    region: str,
    connect_timeout: float,
    read_timeout: float,
    max_attempts: int,
    model_id: str,
    user_text: str,
    max_tokens: int,
) -> dict:
    client = _client(region, connect_timeout, read_timeout, max_attempts)
    resp = client.converse(
        modelId=model_id,
        system=[{"text": _RESOLVE_SYSTEM_PROMPT}],
        messages=[{"role": "user", "content": [{"text": user_text}]}],
        toolConfig={
            "tools": [_RESOLVE_TOOL],
            "toolChoice": {"tool": {"name": "resolve_query"}},
        },
        inferenceConfig={"maxTokens": max_tokens, "temperature": 0.0},
    )
    content = resp.get("output", {}).get("message", {}).get("content", [])
    for block in content:
        tool_use = block.get("toolUse")
        if tool_use and tool_use.get("name") == "resolve_query":
            payload = tool_use.get("input")
            if isinstance(payload, dict):
                return payload
    raise BedrockUnavailableError("Bedrock resolve returned no tool call")


async def resolve_query(question: str, factory_hint: str | None, now_utc) -> dict:
    """Extract intent/factory/time from the question. Raises BedrockUnavailableError.

    Inputs only the question text (no factory data), so it is safe to call before
    the RBAC check.  The returned dict is validated by services.chat.map_resolution.
    """
    from services.chat import KST  # lazy import; chat must stay LLM-free

    s = get_settings()
    now_kst = now_utc.astimezone(KST).strftime("%Y-%m-%dT%H:%M:%S")
    user_text = (
        f"현재 시각(KST): {now_kst}\n"
        f"공장 힌트: {factory_hint or '없음'}\n"
        f"질문: {question}"
    )
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(
                _resolve_sync,
                s.bedrock_region,
                s.bedrock_connect_timeout_seconds,
                s.bedrock_read_timeout_seconds,
                s.bedrock_max_attempts,
                s.bedrock_resolve_model,
                user_text,
                s.bedrock_resolve_max_tokens,
            ),
            timeout=s.bedrock_resolve_operation_timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        raise BedrockUnavailableError("Bedrock resolve timed out") from exc
    except (BotoCoreError, ClientError) as exc:
        raise BedrockUnavailableError("Bedrock resolve failed") from exc
