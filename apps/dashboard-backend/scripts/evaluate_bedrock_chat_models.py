#!/usr/bin/env python3
"""Live Bedrock model comparison for the Dashboard AI chat pipeline.

The script exercises the two LLM boundaries used by /chat/query:

1. resolve: question -> tool-use payload
2. explain: frozen evidence JSON -> Korean operator answer

It avoids Cognito/RBAC/DDB/S3 so model quality can be compared without touching
production data tools.  It still calls Bedrock live, so --yes-live-bedrock is
required.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = REPO_ROOT / "apps" / "dashboard-backend"
sys.path.insert(0, str(BACKEND_ROOT))

from services import bedrock  # noqa: E402

KST = ZoneInfo("Asia/Seoul")

PRESETS = {
    "baseline": {
        "resolve": "global.anthropic.claude-haiku-4-5-20251001-v1:0",
        "fast": "global.anthropic.claude-haiku-4-5-20251001-v1:0",
        "precise": "global.anthropic.claude-sonnet-4-6",
    },
    "nova-low-cost": {
        "resolve": "apac.amazon.nova-micro-v1:0",
        "fast": "apac.amazon.nova-lite-v1:0",
        "precise": "apac.amazon.nova-pro-v1:0",
    },
    "nova-balanced": {
        "resolve": "apac.amazon.nova-micro-v1:0",
        "fast": "apac.amazon.nova-micro-v1:0",
        "precise": "apac.amazon.nova-pro-v1:0",
    },
    "nova-quality": {
        "resolve": "apac.amazon.nova-micro-v1:0",
        "fast": "apac.amazon.nova-pro-v1:0",
        "precise": "apac.amazon.nova-pro-v1:0",
    },
    "nova-aggressive": {
        "resolve": "apac.amazon.nova-micro-v1:0",
        "fast": "apac.amazon.nova-micro-v1:0",
        "precise": "apac.amazon.nova-lite-v1:0",
    },
    "nova-2-lite": {
        "resolve": "global.amazon.nova-2-lite-v1:0",
        "fast": "global.amazon.nova-2-lite-v1:0",
        "precise": "global.amazon.nova-2-lite-v1:0",
    },
}

RESOLVE_CASES = [
    {
        "id": "resolve-current",
        "question": "factory-a 지금 상태 어때?",
        "factory_hint": None,
        "expected_intent": "current_status",
        "expected_factory": "factory-a",
    },
    {
        "id": "resolve-trend",
        "question": "factory-a 최근 1시간 안전 점수 추이 보여줘",
        "factory_hint": None,
        "expected_intent": "history_trend",
        "expected_factory": "factory-a",
    },
    {
        "id": "resolve-cause-point",
        "question": "어제 오후 3시쯤 factory-a 왜 위험했어?",
        "factory_hint": None,
        "expected_intent": "cause_analysis",
        "expected_factory": "factory-a",
    },
    {
        "id": "resolve-spike",
        "question": "factory-a 오전 9시부터 10시까지 ai score 튄 값 있어?",
        "factory_hint": None,
        "expected_intent": "spike_check",
        "expected_factory": "factory-a",
    },
    {
        "id": "resolve-report",
        "question": "cloud infra 보고서에서 EKS 상태 어땠어?",
        "factory_hint": None,
        "expected_intent": "report",
        "expected_factory": None,
    },
]

QUICKSTART_RESOLVE_CASES = [
    {
        "id": "quickstart-image-spike-summary",
        "question": (
            "factory-a 2026-06-09 오전 9시 35분쯤 화재 위험 점수가 튄 걸 봤는데, "
            "증빙 사진이랑 그때 factory 결과 요약해줘"
        ),
        "factory_hint": "factory-a",
        "expected_intent": "spike_check",
        "expected_factory": "factory-a",
        "expected_time_mode": "point",
    },
    {
        "id": "quickstart-report-summary",
        "question": "factory-a 2026-06-09 보고서에서 주요 이벤트와 확인 필요 항목 요약해줘",
        "factory_hint": "factory-a",
        "expected_intent": "report",
        "expected_factory": "factory-a",
        "expected_time_mode": "point",
    },
    {
        "id": "quickstart-cause-drop",
        "question": "factory-a 2026-06-09 오후 3시 안전 점수 급락 원인 알려줘",
        "factory_hint": "factory-a",
        "expected_intent": "cause_analysis",
        "expected_factory": "factory-a",
        "expected_time_mode": "point",
    },
    {
        "id": "quickstart-trend-compare",
        "question": "factory-a 2026-06-09 오후 2시~4시 안전 점수와 AI 탐지 추이 비교해줘",
        "factory_hint": "factory-a",
        "expected_intent": "history_trend",
        "expected_factory": "factory-a",
        "expected_time_mode": "interval",
    },
]

EXPLAIN_CASES = [
    {
        "id": "explain-current",
        "tier": "fast",
        "payload": {
            "question": "factory-a 지금 상태 어때?",
            "intent": "current_status",
            "factory_id": "factory-a",
            "metric": None,
            "threshold": None,
            "comparison": None,
            "time_scope": {"kind": "now", "target_kst": "2026-06-11T14:00:00+09:00"},
            "risk_score_policy": {
                "meaning": "Risk Score is a safety score; higher is safer.",
                "safe": "100~85",
                "warning": "84~50",
                "danger": "49~0",
            },
            "evidence": {
                "confirmed": {
                    "risk_score": 72.4,
                    "risk_grade": "주의",
                    "temperature_c": 31.2,
                    "ai_detection_max_score": 0.42,
                    "time_range_kst": "2026-06-11 13:55~14:00 KST",
                },
                "inferred": ["최근 5분 기준 AI 탐지가 평소보다 높음"],
                "missing": [],
            },
        },
    },
    {
        "id": "explain-cause",
        "tier": "precise",
        "payload": {
            "question": "factory-a 왜 위험했어?",
            "intent": "cause_analysis",
            "factory_id": "factory-a",
            "metric": None,
            "threshold": None,
            "comparison": None,
            "time_scope": {
                "kind": "interval",
                "start_kst": "2026-06-11T13:00:00+09:00",
                "end_kst": "2026-06-11T14:00:00+09:00",
            },
            "risk_score_policy": {
                "meaning": "Risk Score is a safety score; higher is safer.",
                "safe": "100~85",
                "warning": "84~50",
                "danger": "49~0",
            },
            "evidence": {
                "confirmed": {
                    "risk_score_start": 88.0,
                    "risk_score_end": 46.0,
                    "risk_score_min": 39.0,
                    "risk_score_min_time_kst": "2026-06-11 13:37:00 KST",
                    "ai_detection_max_score": 0.91,
                    "ai_detection_max_time_kst": "2026-06-11 13:36:45 KST",
                    "temperature_max_c": 36.8,
                },
                "inferred": ["AI 탐지와 온도 상승이 같은 시간대에 확인됨"],
                "missing": ["작업자 확인 로그 없음"],
            },
        },
    },
]


def _resolve_user_text(question: str, factory_hint: str | None, now_kst: datetime) -> str:
    return (
        f"현재 시각(KST): {now_kst.strftime('%Y-%m-%dT%H:%M:%S')}\n"
        f"공장 힌트: {factory_hint or '없음'}\n"
        f"질문: {question}"
    )


def _timed_call(fn, *args) -> tuple[Any, float, str | None]:
    started = time.perf_counter()
    try:
        return fn(*args), (time.perf_counter() - started) * 1000, None
    except Exception as exc:  # noqa: BLE001 - live eval should record all model failures.
        return None, (time.perf_counter() - started) * 1000, f"{type(exc).__name__}: {exc}"


def _run_resolve(args, preset: dict[str, str], now_kst: datetime) -> list[dict[str, Any]]:
    rows = []
    cases = []
    if args.case_set in ("core", "all"):
        cases.extend(RESOLVE_CASES)
    if args.case_set in ("quickstart", "all"):
        cases.extend(QUICKSTART_RESOLVE_CASES)

    for case in cases:
        user_text = _resolve_user_text(case["question"], case["factory_hint"], now_kst)
        payload, latency_ms, error = _timed_call(
            bedrock._resolve_sync,
            args.region,
            args.connect_timeout,
            args.read_timeout,
            args.max_attempts,
            preset["resolve"],
            user_text,
            args.resolve_max_tokens,
        )
        rows.append(
            {
                "kind": "resolve",
                "preset": args.preset,
                "case_id": case["id"],
                "model": preset["resolve"],
                "latency_ms": round(latency_ms, 1),
                "error": error,
                "expected_intent": case["expected_intent"],
                "actual_intent": payload.get("intent") if isinstance(payload, dict) else None,
                "expected_factory": case["expected_factory"],
                "actual_factory": payload.get("factory_id") if isinstance(payload, dict) else None,
                "expected_time_mode": case.get("expected_time_mode"),
                "actual_time_mode": (
                    payload.get("time", {}).get("mode")
                    if isinstance(payload, dict) and isinstance(payload.get("time"), dict)
                    else None
                ),
                "payload": payload,
            }
        )
    return rows


def _run_explain(args, preset: dict[str, str]) -> list[dict[str, Any]]:
    rows = []
    for case in EXPLAIN_CASES:
        model = preset[case["tier"]]
        answer, latency_ms, error = _timed_call(
            bedrock._converse_sync,
            args.region,
            args.connect_timeout,
            args.read_timeout,
            args.max_attempts,
            model,
            json.dumps(case["payload"], ensure_ascii=False),
            args.answer_max_tokens,
            args.temperature,
        )
        rows.append(
            {
                "kind": "explain",
                "preset": args.preset,
                "case_id": case["id"],
                "tier": case["tier"],
                "model": model,
                "latency_ms": round(latency_ms, 1),
                "error": error,
                "answer": answer,
            }
        )
    return rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preset", choices=sorted(PRESETS), required=True)
    parser.add_argument("--mode", choices=["resolve", "explain", "all"], default="all")
    parser.add_argument("--case-set", choices=["core", "quickstart", "all"], default="core")
    parser.add_argument("--region", default="ap-south-1")
    parser.add_argument("--connect-timeout", type=float, default=3.0)
    parser.add_argument("--read-timeout", type=float, default=20.0)
    parser.add_argument("--max-attempts", type=int, default=2)
    parser.add_argument("--resolve-max-tokens", type=int, default=512)
    parser.add_argument("--answer-max-tokens", type=int, default=512)
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--output", type=Path, help="Optional JSONL output path.")
    parser.add_argument(
        "--yes-live-bedrock",
        action="store_true",
        help="Required because this sends live Bedrock requests and incurs token cost.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.yes_live_bedrock:
        print("Refusing to run without --yes-live-bedrock.", file=sys.stderr)
        return 2

    preset = PRESETS[args.preset]
    now_kst = datetime.now(KST)
    rows: list[dict[str, Any]] = []
    if args.mode in ("resolve", "all"):
        rows.extend(_run_resolve(args, preset, now_kst))
    if args.mode in ("explain", "all"):
        rows.extend(_run_explain(args, preset))

    encoded = "\n".join(json.dumps(row, ensure_ascii=False) for row in rows)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
