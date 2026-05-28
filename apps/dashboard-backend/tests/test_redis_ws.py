import pytest
from redis.exceptions import ConnectionError as RedisConnectionError
from starlette.websockets import WebSocketDisconnect


def test_redis_client_uses_explicit_timeouts(monkeypatch):
    import services.redis_client as redis_client

    monkeypatch.setattr(redis_client, "_client", None)

    async def _run():
        client = await redis_client.get_redis()
        kwargs = client.connection_pool.connection_kwargs
        assert kwargs["socket_connect_timeout"] == 2.0
        assert kwargs["socket_timeout"] == 5.0
        assert kwargs["health_check_interval"] == 30
        assert kwargs["retry_on_timeout"] is True
        await client.aclose()

    import anyio

    anyio.run(_run)
    monkeypatch.setattr(redis_client, "_client", None)


def test_websocket_closes_1011_when_redis_subscribe_fails(
    client_real_auth,
    valid_token,
):
    from main import app
    import routers.ws as ws_module

    class FakePubSub:
        async def subscribe(self, channel):
            raise RedisConnectionError("redis unavailable")

        async def listen(self):
            yield {}

        async def unsubscribe(self, channel):
            return None

        async def aclose(self):
            return None

    class FakeRedis:
        def pubsub(self):
            return FakePubSub()

    app.dependency_overrides[ws_module.get_redis] = lambda: FakeRedis()
    try:
        with pytest.raises(WebSocketDisconnect) as exc:
            with client_real_auth.websocket_connect(
                f"/ws/factories/factory-a?token={valid_token}"
            ) as ws:
                ws.receive_text()
        assert exc.value.code == 1011
    finally:
        app.dependency_overrides.pop(ws_module.get_redis, None)
