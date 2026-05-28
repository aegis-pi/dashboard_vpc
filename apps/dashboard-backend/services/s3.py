"""S3 read-only access for processed data and Markdown reports.

S3 prefix contract (data_storage_pipeline.md):
  processed/{factory_id}/{dataset}/yyyy=YYYY/mm=MM/dd=DD/hh=HH/{message_id}.json
  reports/{YYYY-MM-DD}/{factory_id}.md   (written by future lambda-report-generator)
"""
import asyncio
from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from config import get_settings


class S3ObjectNotFoundError(RuntimeError):
    """Raised when the requested report object does not exist."""


class S3UnavailableError(RuntimeError):
    """Raised when S3 cannot answer within the API budget."""


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


async def get_report_markdown(report_date: str, factory_id: str) -> str:
    """Fetch a Markdown report from S3. Skeleton until LLM report work lands."""
    s = get_settings()
    key = f"reports/{report_date}/{factory_id}.md"
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_get_object_sync, s.s3_bucket_data, key),
            timeout=s.s3_operation_timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        raise S3UnavailableError("S3 operation timed out") from exc
