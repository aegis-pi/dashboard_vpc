"""WebSocket endpoint — Redis Pub/Sub bridge.

Channel: factory:update:{factory_id}
Token: passed as ?token=<JWT> query parameter (browsers cannot set WS headers).
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from config import Settings, get_settings
from deps.auth import verify_ws_token
from services.redis_client import get_redis

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/factories/{factory_id}")
async def ws_factory(
    factory_id: str,
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
    settings: Settings = Depends(get_settings),
    redis=Depends(get_redis),
):
    try:
        await verify_ws_token(token, settings)
    except ValueError:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    channel = f"factory:update:{factory_id}"
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel)
    try:
        async for message in pubsub.listen():
            if message.get("type") == "message":
                data = message.get("data", "")
                payload = data if isinstance(data, str) else data.decode()
                await websocket.send_text(payload)
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
