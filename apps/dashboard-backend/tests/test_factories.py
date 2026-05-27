"""Factory endpoint tests — DDB LATEST mapping."""


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


def test_list_factories_flat_format_factory_b(client, ddb_mock):
    """factory-b uses flat DDB format; node fields must still be extracted."""
    items = client.get("/factories").json()
    fb = next((i for i in items if i["factory_id"] == "factory-b"), None)
    assert fb is not None
    assert fb["node_ready"] == 2
    assert fb["node_total"] == 2
    assert fb["risk_level"] == "warning"
