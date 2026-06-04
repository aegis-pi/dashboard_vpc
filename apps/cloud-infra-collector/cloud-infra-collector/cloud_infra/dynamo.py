import os
import time
from decimal import Decimal, InvalidOperation

import boto3

from cloud_infra.status import worst_status


_dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME", "AEGIS-DynamoDB-FactoryStatus")
LATEST_KEY = {"pk": "CLOUD#infra", "sk": "LATEST"}
SCHEMA_VERSION = "cloud-infra-status-v1"


def _table():
    return _dynamodb.Table(TABLE_NAME)


def get_cloud_latest() -> dict:
    response = _table().get_item(Key=LATEST_KEY)
    return _from_dynamo(response.get("Item", {}))


def get_factory_latest(factory_id: str) -> dict:
    response = _table().get_item(Key={"pk": f"FACTORY#{factory_id}", "sk": "LATEST"})
    return _from_dynamo(response.get("Item", {}))


def write_fast_snapshot(fast: dict, now_iso: str, ttl_hours: int) -> dict:
    current = get_cloud_latest()
    slow = current.get("slow")
    slow_updated_at = current.get("slow_updated_at")
    overall_status = _overall_status(fast, slow)

    latest = {
        **current,
        **LATEST_KEY,
        "schema_version": SCHEMA_VERSION,
        "updated_at": now_iso,
        "fast_updated_at": now_iso,
        "overall_status": overall_status,
        "fast": fast,
    }
    if slow is not None:
        latest["slow"] = slow
    if slow_updated_at:
        latest["slow_updated_at"] = slow_updated_at

    _table().put_item(Item=_to_dynamo(latest))

    history = dict(latest)
    history["sk"] = f"HISTORY#FAST#{now_iso}"
    history["snapshot_type"] = "fast"
    history["ttl"] = int(time.time()) + ttl_hours * 3600
    _table().put_item(Item=_to_dynamo(history))
    return _from_dynamo(history)


def write_slow_snapshot(slow: dict, now_iso: str, ttl_hours: int) -> dict:
    current = get_cloud_latest()
    fast = current.get("fast")
    fast_updated_at = current.get("fast_updated_at")
    overall_status = _overall_status(fast, slow)

    latest = {
        **current,
        **LATEST_KEY,
        "schema_version": SCHEMA_VERSION,
        "updated_at": now_iso,
        "slow_updated_at": now_iso,
        "overall_status": overall_status,
        "slow": slow,
    }
    if fast is not None:
        latest["fast"] = fast
    if fast_updated_at:
        latest["fast_updated_at"] = fast_updated_at

    _table().put_item(Item=_to_dynamo(latest))

    history = dict(latest)
    history["sk"] = f"HISTORY#SLOW#{now_iso}"
    history["snapshot_type"] = "slow"
    history["ttl"] = int(time.time()) + ttl_hours * 3600
    _table().put_item(Item=_to_dynamo(history))
    return _from_dynamo(history)


def _overall_status(fast: dict, slow: dict | None) -> str:
    values = []
    if fast:
        values.extend([
            (fast.get("backend_runtime") or {}).get("status"),
            (fast.get("datastores") or {}).get("status"),
            (fast.get("data_pipeline") or {}).get("status"),
            (fast.get("factory_freshness") or {}).get("status"),
        ])
    if slow:
        values.extend([
            (slow.get("eks_management") or {}).get("status"),
            (slow.get("storage_freshness") or {}).get("status"),
        ])
    return worst_status(values)


def _to_dynamo(obj):
    if isinstance(obj, float):
        try:
            return Decimal(str(obj))
        except InvalidOperation:
            return Decimal("0")
    if isinstance(obj, dict):
        return {k: _to_dynamo(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_dynamo(v) for v in obj]
    return obj


def _from_dynamo(obj):
    if isinstance(obj, Decimal):
        if obj == obj.to_integral_value():
            return int(obj)
        return float(obj)
    if isinstance(obj, dict):
        return {k: _from_dynamo(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_from_dynamo(v) for v in obj]
    return obj
