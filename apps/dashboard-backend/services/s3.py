"""S3 read-only access for processed data, Markdown reports, and image snapshots.

S3 prefix contract (data_storage_pipeline.md):
  processed/{factory_id}/{dataset}/yyyy=YYYY/mm=MM/dd=DD/hh=HH/{message_id}.json
  reports/daily/yyyy=YYYY/mm=MM/dd=DD/{factory_id}/report.md
  image_snapshot/factory_id={factory_id}/yyyy=YYYY/mm=MM/dd=DD/hh=HH/{image_file}
"""
import asyncio
import concurrent.futures
import json
import re
from functools import lru_cache
from datetime import datetime, timedelta, timezone
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from config import get_settings


class S3ObjectNotFoundError(RuntimeError):
    """Raised when the requested report object does not exist."""


class S3UnavailableError(RuntimeError):
    """Raised when S3 cannot answer within the API budget."""


_DAILY_REPORT_KEY_RE = re.compile(
    r"^reports/daily/yyyy=(?P<yyyy>\d{4})/mm=(?P<mm>\d{2})/dd=(?P<dd>\d{2})/"
    r"(?P<factory_id>[^/]+)/report\.md$"
)
_IMAGE_SNAPSHOT_KEY_RE = re.compile(
    r"^image_snapshot/factory_id=(?P<factory_id>[^/]+)/"
    r"yyyy=(?P<yyyy>\d{4})/mm=(?P<mm>\d{2})/dd=(?P<dd>\d{2})/hh=(?P<hh>\d{2})/"
)
_METRICS_5M_KEY_RE = re.compile(
    r"^processed_agg/(?P<factory_id>[^/]+)/metrics_5m/"
    r"yyyy=(?P<yyyy>\d{4})/mm=(?P<mm>\d{2})/dd=(?P<dd>\d{2})/"
    r"hh=(?P<hh>\d{2})/mm=(?P<minute>\d{2})\.json$"
)
_ISO_IN_KEY_RE = re.compile(r"(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)")
_IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")
_DETECTION_LABELS = {
    "fire": "화재",
    "fire_score": "화재",
    "fall": "넘어짐",
    "fallen": "넘어짐",
    "fall_score": "넘어짐",
    "bend": "굽힘",
    "bending": "굽힘",
    "bend_score": "굽힘",
}


@lru_cache(maxsize=8)
def _s3_client(
    region_name: str,
    connect_timeout: float,
    read_timeout: float,
    max_attempts: int,
    max_pool_connections: int,
):
    return boto3.client(
        "s3",
        region_name=region_name,
        config=Config(
            connect_timeout=connect_timeout,
            read_timeout=read_timeout,
            retries={"total_max_attempts": max_attempts, "mode": "standard"},
            max_pool_connections=max_pool_connections,
        ),
    )


def _client():
    s = get_settings()
    return _s3_client(
        s.aws_region,
        s.s3_connect_timeout_seconds,
        s.s3_read_timeout_seconds,
        s.s3_max_attempts,
        s.s3_max_pool_connections,
    )


def _get_object_sync(bucket: str, key: str) -> str:
    try:
        resp = _client().get_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in {"NoSuchKey", "NoSuchBucket", "404"}:
            raise S3ObjectNotFoundError(key) from exc
        raise S3UnavailableError("S3 request failed") from exc
    except BotoCoreError as exc:
        raise S3UnavailableError("S3 request failed") from exc
    return resp["Body"].read().decode("utf-8")


def _hour_prefixes(factory_id: str, dataset: str, start_utc: datetime, end_utc: datetime) -> list[str]:
    current = start_utc.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    end = end_utc.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    prefixes = []
    while current <= end:
        prefixes.append(
            f"processed/{factory_id}/{dataset}/"
            f"yyyy={current.year:04d}/mm={current.month:02d}/dd={current.day:02d}/"
            f"hh={current.hour:02d}/"
        )
        current += timedelta(hours=1)
    return prefixes


def _metrics_5m_hour_prefixes(factory_id: str, start_utc: datetime, end_utc: datetime) -> list[str]:
    current = start_utc.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    end = end_utc.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    prefixes = []
    while current <= end:
        prefixes.append(
            f"processed_agg/{factory_id}/metrics_5m/"
            f"yyyy={current.year:04d}/mm={current.month:02d}/dd={current.day:02d}/"
            f"hh={current.hour:02d}/"
        )
        current += timedelta(hours=1)
    return prefixes


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _timestamp_from_processed_key(key: str) -> datetime | None:
    match = _ISO_IN_KEY_RE.search(key)
    return _parse_iso(match.group(1)) if match else None


def _timestamp_from_metrics_5m_key(key: str) -> datetime | None:
    match = _METRICS_5M_KEY_RE.match(key)
    if not match:
        return None
    try:
        return datetime(
            int(match["yyyy"]),
            int(match["mm"]),
            int(match["dd"]),
            int(match["hh"]),
            int(match["minute"]),
            tzinfo=timezone.utc,
        )
    except ValueError:
        return None


def _image_snapshot_prefix(factory_id: str, snapshot_date: str, hour: int) -> str:
    yyyy, mm, dd = snapshot_date.split("-", 2)
    return (
        f"image_snapshot/factory_id={factory_id}/"
        f"yyyy={yyyy}/mm={mm}/dd={dd}/hh={hour:02d}/"
    )


def _image_snapshot_factory_prefix(factory_id: str) -> str:
    return f"image_snapshot/factory_id={factory_id}/"


def _image_snapshot_prefixes(factory_id: str, start_time: datetime, end_time: datetime) -> list[str]:
    current = start_time.replace(minute=0, second=0, microsecond=0)
    end = end_time.replace(minute=0, second=0, microsecond=0)
    prefixes = []
    while current <= end:
        prefixes.append(
            f"image_snapshot/factory_id={factory_id}/"
            f"yyyy={current.year:04d}/mm={current.month:02d}/dd={current.day:02d}/"
            f"hh={current.hour:02d}/"
        )
        current += timedelta(hours=1)
    return prefixes


def _image_partition_time_from_key(key: str) -> datetime | None:
    match = _IMAGE_SNAPSHOT_KEY_RE.match(key)
    if not match:
        return None
    try:
        return datetime(
            int(match["yyyy"]),
            int(match["mm"]),
            int(match["dd"]),
            int(match["hh"]),
        )
    except ValueError:
        return None


def _detection_type_from_key(key: str) -> str | None:
    lowered = key.lower()
    for token, label in _DETECTION_LABELS.items():
        if token in lowered:
            return label
    return None


def _timestamp_from_processed_object(key: str, body: dict) -> datetime | None:
    for candidate in (
        body.get("timestamp"),
        body.get("updated_at"),
        body.get("calculated_at"),
        body.get("source_timestamp"),
    ):
        parsed = _parse_iso(candidate) if isinstance(candidate, str) else None
        if parsed:
            return parsed
    return _timestamp_from_processed_key(key)


def _risk_score_from_body(body: dict) -> float | None:
    risk = body.get("risk") if isinstance(body.get("risk"), dict) else {}
    value = body.get("score", body.get("risk_score", risk.get("score")))
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _risk_level_from_body(body: dict) -> str | None:
    risk = body.get("risk") if isinstance(body.get("risk"), dict) else {}
    value = body.get("level", risk.get("level"))
    return value if isinstance(value, str) else None


def _number_or_none(value) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _top_causes_from_body(body: dict) -> list:
    risk = body.get("risk") if isinstance(body.get("risk"), dict) else {}
    value = body.get("top_causes", risk.get("top_causes"))
    return value if isinstance(value, list) else []


def _read_processed_json_candidate(bucket: str, key: str, timestamp: datetime) -> dict[str, Any] | None:
    text = _get_object_sync(bucket, key)
    try:
        body = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(body, dict):
        return None
    body_timestamp = _timestamp_from_processed_object(key, body) or timestamp
    return {"s3_key": key, "timestamp": body_timestamp.isoformat().replace("+00:00", "Z"), "body": body}


def _list_processed_json_sync(
    bucket: str,
    factory_id: str,
    dataset: str,
    start_utc: datetime,
    end_utc: datetime,
    max_objects: int,
) -> list[dict[str, Any]]:
    client = _client()
    candidates: list[tuple[str, datetime]] = []
    try:
        paginator = client.get_paginator("list_objects_v2")
        for prefix in _hour_prefixes(factory_id, dataset, start_utc, end_utc):
            for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
                for obj in page.get("Contents", []):
                    key = obj.get("Key")
                    if not key or not key.endswith(".json"):
                        continue
                    key_timestamp = _timestamp_from_processed_key(key)
                    if key_timestamp is None:
                        continue
                    if key_timestamp < start_utc or key_timestamp > end_utc:
                        continue
                    candidates.append((key, key_timestamp))
    except ClientError as exc:
        raise S3UnavailableError("S3 request failed") from exc
    except BotoCoreError as exc:
        raise S3UnavailableError("S3 request failed") from exc

    candidates = sorted(candidates, key=lambda item: item[1])[:max_objects]
    if not candidates:
        return []

    workers = min(10, len(candidates))
    found: list[dict[str, Any]] = []
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [
                executor.submit(_read_processed_json_candidate, bucket, key, timestamp)
                for key, timestamp in candidates
            ]
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                if not result:
                    continue
                timestamp = _parse_iso(result.get("timestamp"))
                if timestamp is None or timestamp < start_utc or timestamp > end_utc:
                    continue
                found.append(result)
    except ClientError as exc:
        raise S3UnavailableError("S3 request failed") from exc
    except BotoCoreError as exc:
        raise S3UnavailableError("S3 request failed") from exc
    return sorted(found, key=lambda item: item["timestamp"])


def _list_metrics_5m_json_sync(
    bucket: str,
    factory_id: str,
    start_utc: datetime,
    end_utc: datetime,
    max_objects: int,
) -> list[dict[str, Any]]:
    client = _client()
    candidates: list[tuple[str, datetime]] = []
    try:
        paginator = client.get_paginator("list_objects_v2")
        for prefix in _metrics_5m_hour_prefixes(factory_id, start_utc, end_utc):
            for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
                for obj in page.get("Contents", []):
                    key = obj.get("Key")
                    if not key or not key.endswith(".json"):
                        continue
                    key_timestamp = _timestamp_from_metrics_5m_key(key)
                    if key_timestamp is None:
                        continue
                    if key_timestamp < start_utc or key_timestamp >= end_utc:
                        continue
                    candidates.append((key, key_timestamp))
    except ClientError as exc:
        raise S3UnavailableError("S3 request failed") from exc
    except BotoCoreError as exc:
        raise S3UnavailableError("S3 request failed") from exc

    candidates = sorted(candidates, key=lambda item: item[1])[:max_objects]
    if not candidates:
        return []

    workers = min(10, len(candidates))
    found: list[dict[str, Any]] = []
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [
                executor.submit(_read_processed_json_candidate, bucket, key, timestamp)
                for key, timestamp in candidates
            ]
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                if result:
                    found.append(result)
    except ClientError as exc:
        raise S3UnavailableError("S3 request failed") from exc
    except BotoCoreError as exc:
        raise S3UnavailableError("S3 request failed") from exc
    return sorted(found, key=lambda item: item["timestamp"])


def _list_report_objects_sync(bucket: str) -> list[dict[str, Any]]:
    try:
        paginator = _client().get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=bucket, Prefix="reports/daily/")
    except BotoCoreError as exc:
        raise S3UnavailableError("S3 request failed") from exc

    reports: list[dict[str, Any]] = []
    try:
        for page in pages:
            for obj in page.get("Contents", []):
                key = obj.get("Key", "")
                match = _DAILY_REPORT_KEY_RE.match(key)
                if not match:
                    continue
                report_date = f"{match['yyyy']}-{match['mm']}-{match['dd']}"
                reports.append(
                    {
                        "report_date": report_date,
                        "factory_id": match["factory_id"],
                        "s3_key": key,
                        "last_modified": obj.get("LastModified").isoformat()
                        if obj.get("LastModified")
                        else None,
                        "size_bytes": obj.get("Size"),
                    }
                )
    except ClientError as exc:
        raise S3UnavailableError("S3 request failed") from exc
    except BotoCoreError as exc:
        raise S3UnavailableError("S3 request failed") from exc

    return sorted(
        reports,
        key=lambda item: (
            item.get("report_date") or "",
            item.get("last_modified") or "",
            item.get("factory_id") or "",
        ),
        reverse=True,
    )


def _list_image_snapshot_objects_sync(
    bucket: str,
    factory_id: str,
    start_time: datetime,
    end_time: datetime,
    max_objects: int,
    presign_expires_seconds: int,
) -> list[dict[str, Any]]:
    client = _client()
    items: list[dict[str, Any]] = []
    try:
        paginator = client.get_paginator("list_objects_v2")
        for prefix in _image_snapshot_prefixes(factory_id, start_time, end_time):
            pages = paginator.paginate(Bucket=bucket, Prefix=prefix)
            for page in pages:
                for obj in page.get("Contents", []):
                    key = obj.get("Key", "")
                    if not key.lower().endswith(_IMAGE_EXTENSIONS):
                        continue
                    filename = key.rsplit("/", 1)[-1]
                    url = client.generate_presigned_url(
                        "get_object",
                        Params={"Bucket": bucket, "Key": key},
                        ExpiresIn=presign_expires_seconds,
                    )
                    last_modified = obj.get("LastModified")
                    items.append(
                        {
                            "factory_id": factory_id,
                            "s3_key": key,
                            "filename": filename,
                            "url": url,
                            "last_modified": last_modified.isoformat() if last_modified else None,
                            "size_bytes": obj.get("Size"),
                            "detection_type": _detection_type_from_key(filename),
                        }
                    )
                    if len(items) >= max_objects:
                        return sorted(
                            items,
                            key=lambda item: (item.get("last_modified") or "", item.get("filename") or ""),
                            reverse=True,
                        )
    except ClientError as exc:
        raise S3UnavailableError("S3 request failed") from exc
    except BotoCoreError as exc:
        raise S3UnavailableError("S3 request failed") from exc

    return sorted(
        items,
        key=lambda item: (item.get("last_modified") or "", item.get("filename") or ""),
        reverse=True,
    )


def _get_image_snapshot_range_sync(bucket: str, factory_id: str) -> dict[str, Any]:
    client = _client()
    earliest: datetime | None = None
    latest: datetime | None = None
    count = 0
    try:
        paginator = client.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=bucket, Prefix=_image_snapshot_factory_prefix(factory_id))
        for page in pages:
            for obj in page.get("Contents", []):
                key = obj.get("Key", "")
                if not key.lower().endswith(_IMAGE_EXTENSIONS):
                    continue
                partition_time = _image_partition_time_from_key(key)
                if partition_time is None:
                    continue
                earliest = partition_time if earliest is None else min(earliest, partition_time)
                latest = partition_time if latest is None else max(latest, partition_time)
                count += 1
    except ClientError as exc:
        raise S3UnavailableError("S3 request failed") from exc
    except BotoCoreError as exc:
        raise S3UnavailableError("S3 request failed") from exc

    return {
        "factory_id": factory_id,
        "available_start": earliest.isoformat(timespec="minutes") if earliest else None,
        "available_latest_hour": latest.isoformat(timespec="minutes") if latest else None,
        "object_count": count,
    }


async def list_daily_reports() -> list[dict[str, Any]]:
    """List Markdown daily reports from the S3 reports prefix."""
    s = get_settings()
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_list_report_objects_sync, s.s3_bucket_data),
            timeout=s.s3_operation_timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        raise S3UnavailableError("S3 operation timed out") from exc


async def list_image_snapshots(
    factory_id: str,
    start_time: datetime,
    end_time: datetime,
    max_objects: int = 120,
    presign_expires_seconds: int = 900,
) -> list[dict[str, Any]]:
    """List S3 image snapshots for a bounded local-time range."""
    s = get_settings()
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(
                _list_image_snapshot_objects_sync,
                s.s3_bucket_data,
                factory_id,
                start_time,
                end_time,
                max_objects,
                presign_expires_seconds,
            ),
            timeout=s.s3_operation_timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        raise S3UnavailableError("S3 operation timed out") from exc


async def get_image_snapshot_range(factory_id: str) -> dict[str, Any]:
    """Return the earliest/latest S3 image snapshot partition for one factory."""
    s = get_settings()
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_get_image_snapshot_range_sync, s.s3_bucket_data, factory_id),
            timeout=s.s3_operation_timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        raise S3UnavailableError("S3 operation timed out") from exc


async def get_report_markdown(report_date: str, factory_id: str) -> str:
    """Fetch a Markdown report from S3."""
    s = get_settings()
    yyyy, mm, dd = report_date.split("-", 2)
    key = f"reports/daily/yyyy={yyyy}/mm={mm}/dd={dd}/{factory_id}/report.md"
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_get_object_sync, s.s3_bucket_data, key),
            timeout=s.s3_operation_timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        raise S3UnavailableError("S3 operation timed out") from exc


async def list_processed_risk_scores(
    factory_id: str,
    start_utc: datetime,
    end_utc: datetime,
    max_objects: int = 300,
) -> list[dict[str, Any]]:
    """Read processed risk_score JSON objects for a bounded drill-down window."""
    s = get_settings()
    try:
        objects = await asyncio.wait_for(
            asyncio.to_thread(
                _list_processed_json_sync,
                s.s3_bucket_data,
                factory_id,
                "risk_score",
                start_utc.astimezone(timezone.utc),
                end_utc.astimezone(timezone.utc),
                max_objects,
            ),
            timeout=s.s3_operation_timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        raise S3UnavailableError("S3 operation timed out") from exc

    normalized: list[dict[str, Any]] = []
    for obj in objects:
        body = obj.get("body") or {}
        normalized.append(
            {
                "timestamp": obj.get("timestamp"),
                "risk_score": _risk_score_from_body(body),
                "level": _risk_level_from_body(body),
                "top_causes": _top_causes_from_body(body),
                "s3_key": obj.get("s3_key"),
            }
        )
    return normalized


def _normalize_metrics_5m_object(obj: dict[str, Any]) -> dict[str, Any]:
    body = obj.get("body") or {}
    risk_score = ((body.get("risk") or {}).get("score") or {})
    sensor = body.get("sensor") or {}
    temp = sensor.get("temperature_celsius") or {}
    ai = body.get("ai_detection") or {}
    by_type = ai.get("by_type") or {}
    fire = by_type.get("fire_score") or {}
    fall = by_type.get("fall_score") or {}
    bend = by_type.get("bend_score") or {}
    return {
        "timestamp": body.get("bucket_start") or obj.get("timestamp"),
        "bucket_start": body.get("bucket_start") or obj.get("timestamp"),
        "bucket_end": body.get("bucket_end"),
        "is_bucket": True,
        "source": "S3 processed_agg/metrics_5m",
        "s3_key": obj.get("s3_key"),
        "risk_score": _number_or_none(risk_score.get("mean")),
        "risk_score_min": _number_or_none(risk_score.get("min")),
        "risk_score_max": _number_or_none(risk_score.get("max")),
        "temperature_celsius_avg": _number_or_none(temp.get("mean")),
        "temperature_celsius_max": _number_or_none(temp.get("max")),
        "ai_max_score": _number_or_none(ai.get("max_score")),
        "fire_score": _number_or_none(fire.get("mean")),
        "fall_score": _number_or_none(fall.get("mean")),
        "bend_score": _number_or_none(bend.get("mean")),
        "fire_score_max": _number_or_none(fire.get("max")),
        "fall_score_max": _number_or_none(fall.get("max")),
        "bend_score_max": _number_or_none(bend.get("max")),
    }


def _normalize_state_snapshot_object(obj: dict[str, Any]) -> dict[str, Any]:
    body = obj.get("body") or {}
    factory_state = body.get("factory_state") or {}
    risk = body.get("risk") or {}
    return {
        "timestamp": body.get("updated_at") or obj.get("timestamp"),
        "source": "S3 processed/state_snapshot",
        "s3_key": obj.get("s3_key"),
        "risk_score": _number_or_none(risk.get("score")),
        "risk_score_min": _number_or_none(risk.get("score")),
        "risk_score_max": _number_or_none(risk.get("score")),
        "level": risk.get("level") if isinstance(risk.get("level"), str) else None,
        "top_cause_names": [
            c.get("field") or c.get("name")
            for c in risk.get("top_causes", [])
            if isinstance(c, dict) and (c.get("field") or c.get("name"))
        ],
        "top_causes": risk.get("top_causes") if isinstance(risk.get("top_causes"), list) else [],
        "temperature_celsius_avg": _number_or_none(factory_state.get("temperature_celsius")),
        "temperature_celsius": _number_or_none(factory_state.get("temperature_celsius")),
        "fire_score": _number_or_none(factory_state.get("fire_score")),
        "fire_score_max": _number_or_none(factory_state.get("fire_score")),
        "fall_score": _number_or_none(factory_state.get("fall_score")),
        "fall_score_max": _number_or_none(factory_state.get("fall_score")),
        "bend_score": _number_or_none(factory_state.get("bend_score")),
        "bend_score_max": _number_or_none(factory_state.get("bend_score")),
    }


async def list_processed_agg_metrics_5m(
    factory_id: str,
    start_utc: datetime,
    end_utc: datetime,
    max_objects: int = 12,
) -> list[dict[str, Any]]:
    """Read S3 processed_agg metrics_5m buckets for a bounded window."""
    s = get_settings()
    try:
        objects = await asyncio.wait_for(
            asyncio.to_thread(
                _list_metrics_5m_json_sync,
                s.s3_bucket_data,
                factory_id,
                start_utc.astimezone(timezone.utc),
                end_utc.astimezone(timezone.utc),
                max_objects,
            ),
            timeout=s.s3_operation_timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        raise S3UnavailableError("S3 operation timed out") from exc
    return [_normalize_metrics_5m_object(obj) for obj in objects]


async def list_processed_state_snapshots(
    factory_id: str,
    start_utc: datetime,
    end_utc: datetime,
    max_objects: int = 500,
) -> list[dict[str, Any]]:
    """Read S3 processed state_snapshot objects for a bounded drill-down window."""
    s = get_settings()
    try:
        objects = await asyncio.wait_for(
            asyncio.to_thread(
                _list_processed_json_sync,
                s.s3_bucket_data,
                factory_id,
                "state_snapshot",
                start_utc.astimezone(timezone.utc),
                end_utc.astimezone(timezone.utc),
                max_objects,
            ),
            timeout=s.s3_operation_timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        raise S3UnavailableError("S3 operation timed out") from exc
    return [_normalize_state_snapshot_object(obj) for obj in objects]
