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
