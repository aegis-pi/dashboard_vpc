"""DynamoDB access layer for AEGIS-DynamoDB-FactoryStatus.

Key contract (ADR 0022 / ADR 0025):
  table       : AEGIS-DynamoDB-FactoryStatus
  LATEST      : pk=FACTORY#{factory_id}  sk=LATEST
  HISTORY_RAW : pk=FACTORY#{factory_id}  sk=HISTORY#STATE#{iso_timestamp}  TTL 2h
  GRAPH_5M    : pk=FACTORY#{factory_id}  sk=GRAPH#5M#{bucket_start_iso}    TTL 48h

window=1h   → HISTORY#STATE# query (raw snapshots, ~2,760 items/factory at 3s interval)
window=6h/12h/24h → GRAPH#5M# query (5-minute aggregates, max 72/144/288 items/factory)
Only these two prefixes are queried.  No other HISTORY# or GRAPH# prefix is allowed.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from functools import lru_cache

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from config import get_settings

LATEST_SK = "LATEST"
HISTORY_STATE_PREFIX = "HISTORY#STATE#"
GRAPH_5M_PREFIX = "GRAPH#5M#"
MAX_BATCH_GET_KEYS = 100
_ddb_semaphore: asyncio.Semaphore | None = None
_ddb_semaphore_limit: int | None = None


# ─── Internal helpers ─────────────────────────────────────────────────────────


class DynamoDBUnavailableError(RuntimeError):
    """Raised when DynamoDB cannot answer within the API budget."""


@lru_cache(maxsize=8)
def _ddb_resource(
    region_name: str,
    connect_timeout: float,
    read_timeout: float,
    max_attempts: int,
    max_pool_connections: int,
):
    return boto3.resource(
        "dynamodb",
        region_name=region_name,
        config=Config(
            connect_timeout=connect_timeout,
            read_timeout=read_timeout,
            retries={"total_max_attempts": max_attempts, "mode": "standard"},
            max_pool_connections=max_pool_connections,
        ),
    )


def _ddb():
    s = get_settings()
    return _ddb_resource(
        s.aws_region,
        s.ddb_connect_timeout_seconds,
        s.ddb_read_timeout_seconds,
        s.ddb_max_attempts,
        s.ddb_max_pool_connections,
    )


def _operation_semaphore() -> asyncio.Semaphore:
    global _ddb_semaphore, _ddb_semaphore_limit
    limit = get_settings().ddb_max_concurrent_operations
    if _ddb_semaphore is None or _ddb_semaphore_limit != limit:
        _ddb_semaphore = asyncio.Semaphore(limit)
        _ddb_semaphore_limit = limit
    return _ddb_semaphore


async def _run_ddb_in_thread(func, *args):
    async with _operation_semaphore():
        return await asyncio.to_thread(func, *args)


async def _run_ddb(func, *args):
    timeout = get_settings().ddb_operation_timeout_seconds
    try:
        return await asyncio.wait_for(_run_ddb_in_thread(func, *args), timeout=timeout)
    except asyncio.TimeoutError as exc:
        raise DynamoDBUnavailableError("DynamoDB operation timed out") from exc
    except (BotoCoreError, ClientError) as exc:
        raise DynamoDBUnavailableError("DynamoDB operation failed") from exc


def _from_ddb(obj):
    """Recursively convert DynamoDB Decimal to int/float for JSON serialization."""
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    if isinstance(obj, dict):
        return {k: _from_ddb(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_from_ddb(v) for v in obj]
    return obj


def _factory_ids() -> list[str]:
    configured = get_settings().dashboard_factory_ids
    return [factory_id.strip() for factory_id in configured.split(",") if factory_id.strip()]


# ─── Synchronous DDB calls (run via asyncio.to_thread) ───────────────────────

def _get_latest_sync(table_name: str, factory_id: str) -> dict | None:
    table = _ddb().Table(table_name)
    resp = table.get_item(Key={"pk": f"FACTORY#{factory_id}", "sk": LATEST_SK})
    item = resp.get("Item")
    return _from_ddb(item) if item else None


def _list_factories_sync(table_name: str, factory_ids: list[str]) -> list[dict]:
    if not factory_ids:
        return []
    keys = [{"pk": f"FACTORY#{factory_id}", "sk": LATEST_SK} for factory_id in factory_ids]
    client = _ddb().meta.client
    items: list = []
    for offset in range(0, len(keys), MAX_BATCH_GET_KEYS):
        request_items = {table_name: {"Keys": keys[offset : offset + MAX_BATCH_GET_KEYS]}}
        while request_items:
            resp = client.batch_get_item(RequestItems=request_items)
            items.extend(resp.get("Responses", {}).get(table_name, []))
            request_items = resp.get("UnprocessedKeys", {})

    return [_from_ddb(i) for i in items]


def _list_factories_by_scan_sync(table_name: str, limit: int) -> list[dict]:
    table = _ddb().Table(table_name)
    kwargs: dict = {
        "FilterExpression": Attr("sk").eq(LATEST_SK),
        "Limit": 100,
    }
    items: list = []
    while True:
        resp = table.scan(**kwargs)
        items.extend(resp.get("Items", []))
        if len(items) >= limit or "LastEvaluatedKey" not in resp:
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    converted = [_from_ddb(i) for i in items[:limit]]
    return sorted(
        converted,
        key=lambda item: str(item.get("factory_id") or item.get("pk", "")),
    )


def _get_graph_5m_sync(table_name: str, factory_id: str, since_sk: str) -> list[dict]:
    """Query GRAPH#5M items ascending for a factory (max 288 items for 24h window)."""
    table = _ddb().Table(table_name)
    kwargs: dict = dict(
        KeyConditionExpression=(
            Key("pk").eq(f"FACTORY#{factory_id}")
            & Key("sk").between(since_sk, f"{GRAPH_5M_PREFIX}~")
        ),
        ScanIndexForward=True,
    )
    items: list = []
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    return [_from_ddb(i) for i in items]


def _get_history_sync(
    table_name: str, factory_id: str, since_sk: str, max_items: int = 500
) -> list[dict]:
    """Query HISTORY#STATE items newest-first up to max_items, then re-sort ascending.

    Paginates with ScanIndexForward=False so the hard cap always returns the
    most recent data points rather than the oldest ones.  Without this cap,
    a 24-hour window on a large table (100k+ items) can require 50+ DynamoDB
    page calls, exceeding the operation timeout and saturating the semaphore.
    """
    page_size = min(300, max_items)
    table = _ddb().Table(table_name)
    kwargs: dict = dict(
        KeyConditionExpression=(
            Key("pk").eq(f"FACTORY#{factory_id}")
            & Key("sk").between(since_sk, f"{HISTORY_STATE_PREFIX}~")
        ),
        ScanIndexForward=False,
        Limit=page_size,
    )
    items: list = []
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        if len(items) >= max_items or "LastEvaluatedKey" not in resp:
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    return [_from_ddb(i) for i in reversed(items[:max_items])]


# ─── Public async interface ───────────────────────────────────────────────────

async def get_factory_latest(factory_id: str) -> dict | None:
    table_name = get_settings().ddb_table_status
    return await _run_ddb(_get_latest_sync, table_name, factory_id)


async def list_factories() -> list[dict]:
    table_name = get_settings().ddb_table_status
    settings = get_settings()
    if settings.dashboard_factory_discovery_mode == "scan_latest":
        return await _run_ddb(
            _list_factories_by_scan_sync,
            table_name,
            settings.dashboard_factory_scan_limit,
        )
    return await _run_ddb(_list_factories_sync, table_name, _factory_ids())


async def get_factory_history(
    factory_id: str, window: str = "1h", max_items: int = 500
) -> list[dict]:
    """Return history items for chart consumption.

    window=1h             → HISTORY#STATE# raw snapshots + _extract()
    window=6h / 12h / 24h → GRAPH#5M# 5-minute aggregates + _extract_graph_5m()
    """
    table_name = get_settings().ddb_table_status
    since = _since_iso(window)

    if window == "1h":
        since_sk = f"{HISTORY_STATE_PREFIX}{since}"
        raw = await _run_ddb(_get_history_sync, table_name, factory_id, since_sk, max_items)
        return [_extract(i) for i in raw]

    since_sk = f"{GRAPH_5M_PREFIX}{since}"
    raw = await _run_ddb(_get_graph_5m_sync, table_name, factory_id, since_sk)
    return [_extract_graph_5m(i) for i in raw]


# ─── Private utilities ────────────────────────────────────────────────────────

def _extract_graph_5m(item: dict) -> dict:
    """Extract aggregated metrics from a GRAPH#5M bucket item for frontend charts.

    Follows the field mapping defined in example_data.md / ADR 0025:
      sensor.*   → temperature_celsius_avg / humidity_percent_avg / pressure_hpa_avg
      risk.score → risk_score (mean) / risk_score_avg / risk_score_min
      ai_detection.by_type.*.max → fire_score / fall_score / bend_score
      infra.*    → cpu_usage_percent_mean / memory_usage_percent_mean / disk_usage_percent_last
    """
    bucket_start = item.get("bucket_start", "")
    sk = item.get("sk", "")

    sensor = item.get("sensor") or {}
    risk = item.get("risk") or {}
    ai = item.get("ai_detection") or {}
    infra = item.get("infra") or {}
    quality = item.get("quality") or {}

    temp = sensor.get("temperature_celsius") or {}
    humidity = sensor.get("humidity_percent") or {}
    pressure = sensor.get("pressure_hpa") or {}
    risk_score = risk.get("score") or {}
    ai_by_type = ai.get("by_type") or {}
    cpu = infra.get("cpu_usage_percent") or {}
    memory = infra.get("memory_usage_percent") or {}
    disk = infra.get("disk_usage_percent") or {}

    risk_mean = risk_score.get("mean")
    risk_min = risk_score.get("min")

    ai_fire = ai_by_type.get("fire_score") or {}
    ai_fall = ai_by_type.get("fall_score") or {}
    ai_bend = ai_by_type.get("bend_score") or {}

    return {
        "timestamp": bucket_start or sk.removeprefix(GRAPH_5M_PREFIX),
        "bucket_start": bucket_start,
        "bucket_end": item.get("bucket_end"),
        "is_bucket": True,
        # risk
        "risk_score": risk_mean,
        "risk_score_avg": risk_mean,
        "risk_score_min": risk_min,
        # sensor
        "temperature_celsius_avg": temp.get("mean"),
        "humidity_percent_avg": humidity.get("mean"),
        "pressure_hpa_avg": pressure.get("mean"),
        # AI — mean for line chart, max for spike markers (≥0.8)
        "fire_score": ai_fire.get("mean"),
        "fall_score": ai_fall.get("mean"),
        "bend_score": ai_bend.get("mean"),
        "fire_score_max": ai_fire.get("max"),
        "fall_score_max": ai_fall.get("max"),
        "bend_score_max": ai_bend.get("max"),
        "ai_max_score": ai.get("max_score"),
        # infra aggregates (no per-node breakdown in GRAPH#5M)
        "cpu_usage_percent_mean": cpu.get("mean"),
        "memory_usage_percent_mean": memory.get("mean"),
        "disk_usage_percent_last": disk.get("last"),
        "quality": quality if quality else None,
    }


def _parse_window(window: str) -> timedelta:
    if window.endswith("h"):
        return timedelta(hours=int(window[:-1]))
    if window.endswith("m"):
        return timedelta(minutes=int(window[:-1]))
    if window.endswith("d"):
        return timedelta(days=int(window[:-1]))
    return timedelta(hours=1)


def _since_iso(window: str) -> str:
    dt = datetime.now(timezone.utc) - _parse_window(window)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _coalesce_fs(fs: dict, *dot_paths: str):
    """Return first non-None value from fs using dot-notation paths."""
    for path in dot_paths:
        v: object = fs
        for key in path.split("."):
            if not isinstance(v, dict):
                v = None
                break
            v = v.get(key)
        if v is not None:
            return v
    return None


def _extract(item: dict) -> dict:
    """Extract risk / factory_state / infra_state from a HISTORY#STATE item
    and also promote flat fields for chart consumption.

    Handles both flat DDB format (factory_state.temperature_celsius) and
    nested format (factory_state.sensor.temperature_celsius_avg / factory_state.temperature_celsius_avg).
    The sk format is HISTORY#STATE#{iso_timestamp}.  No other HISTORY# prefix
    is queried or produced by this function.
    """
    sk = item.get("sk", "")
    timestamp = sk.removeprefix(HISTORY_STATE_PREFIX) or item.get("updated_at", "")

    risk = item.get("risk") or {}
    fs = item.get("factory_state") or {}
    infra = item.get("infra_state") or {}

    # data-processor writes {"field": ...}; test fixtures use {"name": ...} — handle both.
    top_cause_names = [
        (c.get("name") or c.get("field") if isinstance(c, dict) else str(c))
        for c in (risk.get("top_causes") or [])
    ]

    return {
        "timestamp": timestamp,
        "risk": risk if risk else None,
        "factory_state": fs if fs else None,
        "infra_state": infra if infra else None,
        # ── flattened risk ───────────────────────────────────────────────
        "risk_score": risk.get("score"),
        "risk_level": risk.get("level"),
        "top_cause_names": top_cause_names,
        # ── flattened sensor (flat / avg / sensor.* nested) ──────────────
        "temperature_celsius_avg": _coalesce_fs(
            fs, "temperature_celsius", "temperature_celsius_avg", "sensor.temperature_celsius_avg"
        ),
        "humidity_percent_avg": _coalesce_fs(
            fs, "humidity_percent", "humidity_percent_avg", "sensor.humidity_percent_avg"
        ),
        "pressure_hpa_avg": _coalesce_fs(
            fs, "pressure_hpa", "pressure_hpa_avg", "sensor.pressure_hpa_avg"
        ),
        # ── flattened AI scores (flat / ai_result.* nested) ──────────────
        "fire_score": _coalesce_fs(fs, "fire_score", "ai_result.fire_score"),
        "fall_score": _coalesce_fs(fs, "fall_score", "ai_result.fall_score"),
        "bend_score": _coalesce_fs(fs, "bend_score", "ai_result.bend_score"),
        # ── infra (for NodeResourceChart) ────────────────────────────────
        "node_summary": infra.get("node_summary"),
        "nodes": infra.get("nodes"),
    }
