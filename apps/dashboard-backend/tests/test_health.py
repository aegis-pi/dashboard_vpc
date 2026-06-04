def test_healthz_returns_ok(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_readyz_returns_ok_when_dependencies_pass(client, monkeypatch):
    import main

    async def _get_factory_latest(factory_id):
        return {"factory_id": factory_id}

    class FakeRedis:
        async def ping(self):
            return True

    async def _get_redis():
        return FakeRedis()

    monkeypatch.setattr(main.ddb, "get_factory_latest", _get_factory_latest)
    monkeypatch.setattr(main, "get_redis", _get_redis)

    r = client.get("/readyz")

    assert r.status_code == 200
    assert r.json()["dependencies"] == {
        "dynamodb": "ok",
        "redis": "ok",
        "rds_metadata": "ok",
    }


def test_readyz_returns_503_when_dependency_fails(client, monkeypatch):
    import main

    async def _get_factory_latest(factory_id):
        raise RuntimeError("ddb unavailable")

    class FakeRedis:
        async def ping(self):
            return True

    async def _get_redis():
        return FakeRedis()

    monkeypatch.setattr(main.ddb, "get_factory_latest", _get_factory_latest)
    monkeypatch.setattr(main, "get_redis", _get_redis)

    r = client.get("/readyz")

    assert r.status_code == 503
    detail = r.json()["detail"]
    assert detail["status"] == "degraded"
    assert detail["dependencies"]["dynamodb"] == "failed"
    assert detail["dependencies"]["redis"] == "ok"
    assert detail["dependencies"]["rds_metadata"] == "ok"
