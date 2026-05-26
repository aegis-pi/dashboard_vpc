"""History endpoint tests.

Verifies:
- Only HISTORY#STATE# prefix is queried (code-level and runtime)
- HISTORY#RISK / HISTORY#FACTORY / HISTORY#INFRA are not queried
- Each history item exposes risk / factory_state / infra_state
"""
import inspect


def test_history_prefix_code_uses_only_history_state():
    """Code-level guard: services/ddb.py must not reference wrong HISTORY# prefixes."""
    import services.ddb as ddb_module

    source = inspect.getsource(ddb_module)
    assert "HISTORY#STATE#" in source
    assert "HISTORY#RISK" not in source
    assert "HISTORY#FACTORY" not in source
    assert "HISTORY#INFRA" not in source


def test_history_returns_200(client, ddb_mock):
    r = client.get("/factories/factory-a/history?window=1h")
    assert r.status_code == 200


def test_history_returns_only_history_state_count(client, ddb_mock):
    """Only the 2 HISTORY#STATE items should be returned; HISTORY#RISK must be excluded."""
    r = client.get("/factories/factory-a/history?window=1h")
    items = r.json()
    assert len(items) == 2


def test_history_items_have_required_fields(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=1h").json()
    for item in items:
        assert "timestamp" in item
        assert "risk" in item
        assert "factory_state" in item
        assert "infra_state" in item


def test_history_risk_extracted_from_history_state(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=1h").json()
    levels = {i["risk"]["level"] for i in items}
    assert levels == {"safe", "warning"}


def test_history_wrong_prefix_score_not_in_response(client, ddb_mock):
    """The HISTORY#RISK item (score=99.0) inserted in ddb_mock must not appear."""
    items = client.get("/factories/factory-a/history?window=1h").json()
    scores = [i["risk"]["score"] for i in items if i.get("risk")]
    assert 99.0 not in scores


def test_history_empty_window_returns_empty(client, ddb_mock):
    """window=1m: items at 45- and 30-min ago are outside the window — empty list."""
    r = client.get("/factories/factory-a/history?window=1m")
    assert r.status_code == 200
    assert r.json() == []
