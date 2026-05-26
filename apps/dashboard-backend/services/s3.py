"""S3 read-only access for processed data and Markdown reports.

S3 prefix contract (data_storage_pipeline.md):
  processed/{factory_id}/{dataset}/yyyy=YYYY/mm=MM/dd=DD/hh=HH/{message_id}.json
  reports/{YYYY-MM-DD}/{factory_id}.md   (written by future lambda-report-generator)
"""
import asyncio

import boto3

from config import get_settings


def _get_object_sync(bucket: str, key: str, region: str) -> str:
    client = boto3.client("s3", region_name=region)
    resp = client.get_object(Bucket=bucket, Key=key)
    return resp["Body"].read().decode("utf-8")


async def get_report_markdown(report_date: str, factory_id: str) -> str:
    """Fetch a Markdown report from S3. Skeleton until LLM report work lands."""
    s = get_settings()
    key = f"reports/{report_date}/{factory_id}.md"
    return await asyncio.to_thread(_get_object_sync, s.s3_bucket_data, key, s.aws_region)
