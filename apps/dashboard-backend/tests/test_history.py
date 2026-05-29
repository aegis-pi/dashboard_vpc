"""History endpoint tests.

Verifies:
- window=1h: only HISTORY#STATE# prefix is queried (code-level and runtime)
- HISTORY#RISK / HISTORY#FACTORY / HISTORY#INFRA are not queried
- window=6h/12h/24h: GRAPH#5M# prefix is queried, returns aggregated bucket items
- Each 1h history item exposes risk / factory_state / infra_state
- Each GRAPH#5M item exposes is_bucket, risk_score_avg, risk_score_min
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


def test_history_query_filters_window_in_key_condition():
    """Guard against reading all HISTORY#STATE items and filtering in Python."""
    import inspect
    import services.ddb as ddb_module

    source = inspect.getsource(ddb_module._get_history_sync)
    assert ".between(" in source
    assert ".begins_with(" not in source
    assert "if i.get" not in source


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


# ── Flattened fields ──────────────────────────────────────────────────────────

def test_history_items_have_flattened_risk_fields(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=1h").json()
    for item in items:
        assert "risk_score" in item
        assert "risk_level" in item
    scores = {i["risk_score"] for i in items}
    assert scores == {10.0, 20.0}


def test_history_items_have_flattened_sensor_fields(client, ddb_mock):
    """temperature_celsius_avg must be promoted from factory_state._avg format."""
    items = client.get("/factories/factory-a/history?window=1h").json()
    temps = [i["temperature_celsius_avg"] for i in items if i.get("temperature_celsius_avg") is not None]
    assert len(temps) == 2
    assert set(temps) == {22.0, 30.0}


def test_history_items_have_node_summary(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=1h").json()
    for item in items:
        assert item.get("node_summary") is not None
        assert "total" in item["node_summary"]


# ── GRAPH#5M window tests ─────────────────────────────────────────────────────

def test_graph_5m_prefix_present_in_code():
    """Code-level guard: GRAPH#5M# prefix must exist in ddb.py for bucket queries."""
    import services.ddb as ddb_module

    source = inspect.getsource(ddb_module)
    assert "GRAPH#5M#" in source


def test_graph_5m_returns_200(client, ddb_mock):
    r = client.get("/factories/factory-a/history?window=6h")
    assert r.status_code == 200


def test_graph_5m_returns_bucket_items(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=6h").json()
    assert len(items) == 2
    for item in items:
        assert item.get("is_bucket") is True


def test_graph_5m_items_have_risk_avg_and_min(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=6h").json()
    for item in items:
        assert "risk_score_avg" in item
        assert "risk_score_min" in item
    avgs = {round(i["risk_score_avg"]) for i in items}
    assert avgs == {30, 70}
    mins = {round(i["risk_score_min"]) for i in items}
    assert mins == {25, 60}


def test_graph_5m_items_have_sensor_fields(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=6h").json()
    temps = [i["temperature_celsius_avg"] for i in items if i.get("temperature_celsius_avg") is not None]
    assert len(temps) == 2


def test_graph_5m_items_have_infra_aggregate(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=6h").json()
    for item in items:
        assert item.get("cpu_usage_percent_mean") is not None
        assert item.get("memory_usage_percent_mean") is not None
        assert item.get("disk_usage_percent_last") is not None


def test_graph_5m_items_have_ai_scores(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=6h").json()
    for item in items:
        assert item.get("fire_score") is not None


def test_window_1h_not_contaminated_by_graph_5m(client, ddb_mock):
    """window=1h must return HISTORY#STATE items only — no GRAPH#5M buckets."""
    items = client.get("/factories/factory-a/history?window=1h").json()
    for item in items:
        assert not item.get("is_bucket")
