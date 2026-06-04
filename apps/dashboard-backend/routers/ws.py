"""WebSocket endpoint — Redis Pub/Sub bridge.

Channel: factory:update:{factory_id}
Token: passed as ?token=<JWT> query parameter (browsers cannot set WS headers).
"""
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings, get_settings
from deps.auth import verify_ws_token
from deps.rbac import can_access_factory, principal_from_claims
from db.session import get_db
from services.redis_client import get_redis

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/factories/{factory_id}")
async def ws_factory(
    factory_id: str,
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
    settings: Settings = Depends(get_settings),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    try:
        claims = await verify_ws_token(token, settings)
    except ValueError:
        await websocket.close(code=4001)
        return
    try:
        principal = await principal_from_claims(claims, db, settings)
        if not can_access_factory(principal, factory_id):
            await websocket.close(code=4003)
            return
    except HTTPException:
        await websocket.close(code=4003)
        return
    except Exception:
        await websocket.close(code=1011)
        return

    await websocket.accept()
    channel = f"factory:update:{factory_id}"
    pubsub = redis.pubsub()
    try:
        await asyncio.wait_for(
            pubsub.subscribe(channel),
            timeout=settings.redis_pubsub_operation_timeout_seconds,
        )
        async for message in pubsub.listen():
            if message.get("type") == "message":
                data = message.get("data", "")
                payload = data if isinstance(data, str) else data.decode()
                await websocket.send_text(payload)
    except WebSocketDisconnect:
        pass
    except (asyncio.TimeoutError, RedisError):
        await websocket.close(code=1011)
    finally:
        try:
            await pubsub.unsubscribe(channel)
        except RedisError:
            pass
        await pubsub.aclose()
