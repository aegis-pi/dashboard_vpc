"""DynamoDB access layer for AEGIS-DynamoDB-FactoryStatus.

Key contract (ADR 0022):
  table  : AEGIS-DynamoDB-FactoryStatus
  LATEST : pk=FACTORY#{factory_id}  sk=LATEST
  HISTORY: pk=FACTORY#{factory_id}  sk=HISTORY#STATE#{iso_timestamp}

Only the HISTORY#STATE# prefix is queried.  No other HISTORY-sub-type prefix
exists in the data contract; querying them is explicitly forbidden.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr, Key

from config import get_settings

LATEST_SK = "LATEST"
HISTORY_STATE_PREFIX = "HISTORY#STATE#"


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _ddb():
    s = get_settings()
    return boto3.resource("dynamodb", region_name=s.aws_region)


def _from_ddb(obj):
    """Recursively convert DynamoDB Decimal to int/float for JSON serialization."""
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    if isinstance(obj, dict):
        return {k: _from_ddb(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_from_ddb(v) for v in obj]
    return obj


# ─── Synchronous DDB calls (run via asyncio.to_thread) ───────────────────────

def _get_latest_sync(table_name: str, factory_id: str) -> dict | None:
    table = _ddb().Table(table_name)
    resp = table.get_item(Key={"pk": f"FACTORY#{factory_id}", "sk": LATEST_SK})
    item = resp.get("Item")
    return _from_ddb(item) if item else None


def _list_factories_sync(table_name: str) -> list[dict]:
    table = _ddb().Table(table_name)
    resp = table.scan(FilterExpression=Attr("sk").eq(LATEST_SK))
    items: list = resp.get("Items", [])
    while "LastEvaluatedKey" in resp:
        resp = table.scan(
            FilterExpression=Attr("sk").eq(LATEST_SK),
            ExclusiveStartKey=resp["LastEvaluatedKey"],
        )
        items.extend(resp.get("Items", []))
    return [_from_ddb(i) for i in items]


def _get_history_sync(table_name: str, factory_id: str, since_sk: str) -> list[dict]:
    """Query HISTORY#STATE items; filter to those at or after since_sk in Python."""
    table = _ddb().Table(table_name)
    kwargs: dict = dict(
        KeyConditionExpression=(
            Key("pk").eq(f"FACTORY#{factory_id}")
            & Key("sk").begins_with(HISTORY_STATE_PREFIX)
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

    return [_from_ddb(i) for i in items if i.get("sk", "") >= since_sk]


# ─── Public async interface ───────────────────────────────────────────────────

async def get_factory_latest(factory_id: str) -> dict | None:
    table_name = get_settings().ddb_table_status
    return await asyncio.to_thread(_get_latest_sync, table_name, factory_id)


async def list_factories() -> list[dict]:
    table_name = get_settings().ddb_table_status
    return await asyncio.to_thread(_list_factories_sync, table_name)


async def get_factory_history(factory_id: str, window: str = "1h") -> list[dict]:
    """Query HISTORY#STATE items and extract risk/factory_state/infra_state."""
    since = _since_iso(window)
    since_sk = f"{HISTORY_STATE_PREFIX}{since}"
    table_name = get_settings().ddb_table_status
    raw = await asyncio.to_thread(_get_history_sync, table_name, factory_id, since_sk)
    return [_extract(i) for i in raw]


# ─── Private utilities ────────────────────────────────────────────────────────

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


def _extract(item: dict) -> dict:
    """Extract only risk / factory_state / infra_state from a HISTORY#STATE item.

    The sk format is HISTORY#STATE#{iso_timestamp}.  No other HISTORY# prefix
    is queried or produced by this function.
    """
    sk = item.get("sk", "")
    timestamp = sk.removeprefix(HISTORY_STATE_PREFIX) or item.get("updated_at", "")
    return {
        "timestamp": timestamp,
        "risk": item.get("risk"),
        "factory_state": item.get("factory_state"),
        "infra_state": item.get("infra_state"),
    }
