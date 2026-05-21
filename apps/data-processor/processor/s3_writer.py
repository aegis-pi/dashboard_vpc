import json
import os
from datetime import datetime, timezone

import boto3

_s3 = boto3.client("s3")
BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "aegis-bucket-data")


def write_factory_state(factory_id: str, message_id: str, source_timestamp: str, body: dict):
    _put(factory_id, "factory_state", message_id, source_timestamp, body)


def write_risk_score(factory_id: str, message_id: str, source_timestamp: str, body: dict):
    _put(factory_id, "risk_score", message_id, source_timestamp, body)


def write_infra_state(factory_id: str, message_id: str, source_timestamp: str, body: dict):
    _put(factory_id, "infra_state", message_id, source_timestamp, body)


def write_state_snapshot(factory_id: str, updated_at: str, body: dict):
    _put(factory_id, "state_snapshot", updated_at, updated_at, body)


def _put(factory_id: str, dataset: str, message_id: str, source_timestamp: str, body: dict):
    _s3.put_object(
        Bucket=BUCKET_NAME,
        Key=_key(factory_id, dataset, message_id, source_timestamp),
        Body=json.dumps(body, ensure_ascii=False, default=str),
        ContentType="application/json",
    )


def _key(factory_id: str, dataset: str, message_id: str, ts: str) -> str:
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return (
        f"processed/{factory_id}/{dataset}/"
        f"yyyy={dt.year:04d}/mm={dt.month:02d}/dd={dt.day:02d}/"
        f"hh={dt.hour:02d}/{message_id}.json"
    )
