"""Factory endpoint tests — DDB LATEST mapping."""
from services import ddb


def test_list_factories_returns_200(client, ddb_mock):
    r = client.get("/factories")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)


def test_list_factories_contains_factory_a(client, ddb_mock):
    r = client.get("/factories")
    ids = [i["factory_id"] for i in r.json()]
    assert "factory-a" in ids


def test_get_factory_returns_latest_item(client, ddb_mock):
    r = client.get("/factories/factory-a")
    assert r.status_code == 200
    data = r.json()
    assert data["factory_id"] == "factory-a"
    assert data["sk"] == "LATEST"


def test_ddb_latest_mapping_has_risk_fields(client, ddb_mock):
    r = client.get("/factories/factory-a")
    risk = r.json().get("risk", {})
    assert "level" in risk
    assert "score" in risk
    assert risk["level"] == "danger"
    assert risk["score"] == 27.6


def test_ddb_latest_mapping_has_factory_state(client, ddb_mock):
    data = client.get("/factories/factory-a").json()
    assert "factory_state" in data
    assert data["factory_state"]["temperature_celsius_avg"] == 38.2


def test_ddb_latest_mapping_has_infra_state(client, ddb_mock):
    data = client.get("/factories/factory-a").json()
    assert "infra_state" in data
    assert data["infra_state"]["node_summary"]["total"] == 3


def test_get_factory_not_found_returns_404(client, ddb_mock):
    r = client.get("/factories/nonexistent")
    assert r.status_code == 404


# ── Expanded list_factories fields ────────────────────────────────────────────

def test_list_factories_expanded_node_ready_total(client, ddb_mock):
    items = client.get("/factories").json()
    fa = next(i for i in items if i["factory_id"] == "factory-a")
    assert fa["node_ready"] == 3
    assert fa["node_total"] == 3


def test_list_factories_expanded_top_causes(client, ddb_mock):
    items = client.get("/factories").json()
    fa = next(i for i in items if i["factory_id"] == "factory-a")
    assert isinstance(fa["top_causes"], list)
    assert len(fa["top_causes"]) == 2
    assert fa["top_causes"][0]["name"] == "temperature"


def test_list_factories_expanded_last_state_at(client, ddb_mock):
    items = client.get("/factories").json()
    fa = next(i for i in items if i["factory_id"] == "factory-a")
    assert fa["last_factory_state_at"] is not None
    assert fa["last_infra_state_at"] is not None


def test_list_factories_environment_type(client, ddb_mock):
    """environment_type is passed through from DDB item."""
    items = client.get("/factories").json()
    fa = next(i for i in items if i["factory_id"] == "factory-a")
    assert fa.get("environment_type") == "physical-rpi"


def test_list_factories_flat_format_factory_b(client, ddb_mock):
    """factory-b uses flat DDB format; node fields must still be extracted."""
    items = client.get("/factories").json()
    fb = next((i for i in items if i["factory_id"] == "factory-b"), None)
    assert fb is not None
    assert fb["node_ready"] == 2
    assert fb["node_total"] == 2
    assert fb["risk_level"] == "warning"


def test_list_factories_scan_latest_discovers_unconfigured_factory(client, ddb_mock):
    items = client.get("/factories").json()
    ids = [i["factory_id"] for i in items]
    assert "factory-d" in ids


def test_configured_list_factories_does_not_use_table_scan(monkeypatch):
    calls = []

    class FakeClient:
        def batch_get_item(self, RequestItems):
            calls.append(RequestItems)
            return {"Responses": {"status-table": []}}

    class FakeResource:
        meta = type("Meta", (), {"client": FakeClient()})()

        def Table(self, table_name):
            raise AssertionError("configured mode must not scan the table")

    monkeypatch.setattr(ddb, "_ddb", lambda: FakeResource())

    result = ddb._list_factories_sync("status-table", ["factory-a"])

    assert result == []
    assert calls


def test_list_factories_chunks_batch_get_requests(monkeypatch):
    calls = []

    class FakeClient:
        def batch_get_item(self, RequestItems):
            keys = RequestItems["status-table"]["Keys"]
            calls.append(len(keys))
            return {"Responses": {"status-table": []}}

    class FakeResource:
        meta = type("Meta", (), {"client": FakeClient()})()

    monkeypatch.setattr(ddb, "_ddb", lambda: FakeResource())
    factory_ids = [f"factory-{i}" for i in range(205)]

    result = ddb._list_factories_sync("status-table", factory_ids)

    assert result == []
    assert calls == [100, 100, 5]


def test_ddb_client_uses_explicit_timeouts(ddb_mock):
    config = ddb._ddb().meta.client.meta.config
    assert config.connect_timeout == 2.0
    assert config.read_timeout == 5.0
    assert config.retries["mode"] == "standard"
    assert config.retries["total_max_attempts"] == 2
    assert config.max_pool_connections == 20


def test_ddb_operations_use_concurrency_limit():
    semaphore = ddb._operation_semaphore()
    assert semaphore._value == 10


def test_list_factories_ddb_timeout_returns_504(client, monkeypatch):
    async def _raise_timeout():
        raise ddb.DynamoDBUnavailableError("timeout")

    monkeypatch.setattr(ddb, "list_factories", _raise_timeout)

    r = client.get("/factories")

    assert r.status_code == 504
    assert r.json()["detail"] == "DynamoDB request timed out"
