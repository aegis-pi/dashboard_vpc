import json
import os
from datetime import datetime, timezone

import boto3

from cloud_infra.time_utils import parse_utc, s3_timestamp


_s3 = boto3.client("s3")
BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "aegis-bucket-data")


def put_fast_snapshot(snapshot: dict) -> str:
    key = _key("fast", snapshot["updated_at"])
    _put_snapshot(key, snapshot)
    return key


def put_slow_snapshot(snapshot: dict) -> str:
    key = _key("slow", snapshot["updated_at"])
    _put_snapshot(key, snapshot)
    return key


def _put_snapshot(key: str, snapshot: dict):
    body = dict(snapshot)
    body.pop("ttl", None)
    _s3.put_object(
        Bucket=BUCKET_NAME,
        Key=key,
        Body=json.dumps(body, ensure_ascii=False, default=str),
        ContentType="application/json",
    )


def _key(snapshot_type: str, updated_at: str) -> str:
    dt = parse_utc(updated_at)
    return (
        f"processed/cloud_infra/{snapshot_type}/"
        f"yyyy={dt.year:04d}/mm={dt.month:02d}/dd={dt.day:02d}/"
        f"hh={dt.hour:02d}/{s3_timestamp(updated_at)}.json"
    )
