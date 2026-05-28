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
        settings = get_settings()
        _client = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=settings.redis_socket_connect_timeout_seconds,
            socket_timeout=settings.redis_socket_timeout_seconds,
            health_check_interval=settings.redis_health_check_interval_seconds,
            retry_on_timeout=True,
        )
    return _client
