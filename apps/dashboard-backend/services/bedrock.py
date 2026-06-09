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
    "7) 3~5문장 이내로, 관제 담당자에게 보고하듯 답한다."
)


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
