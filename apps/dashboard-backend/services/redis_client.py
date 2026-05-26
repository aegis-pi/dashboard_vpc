"""Redis async client (ElastiCache + Pub/Sub).

AUTH token is stored in AWS Secrets Manager; the ARN is set via
REDIS_AUTH_TOKEN_SECRET_ARN.  For local development, leave the ARN
empty and set REDIS_URL to redis://localhost:6379.
"""
from typing import Optional

import redis.asyncio as aioredis

from config import get_settings

_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.from_url(get_settings().redis_url, decode_responses=True)
    return _client
