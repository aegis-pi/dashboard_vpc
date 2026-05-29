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
    # fire_score = mean (line), fire_score_max = max (spike marker)
    means = [round(i["fire_score"], 4) for i in items if i.get("fire_score") is not None]
    assert means == [0.1, 0.05]
    maxes = [round(i["fire_score_max"], 4) for i in items if i.get("fire_score_max") is not None]
    assert maxes == [0.5, 0.2]
    for item in items:
        assert "fire_score_max" in item
        assert "fall_score_max" in item
        assert "bend_score_max" in item


def test_graph_5m_items_have_sensor_max_fields(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=6h").json()
    for item in items:
        assert "temperature_celsius_max" in item
        assert "humidity_percent_max" in item
        assert "pressure_hpa_max" in item
    maxes = [round(i["temperature_celsius_max"], 1) for i in items]
    assert maxes == [26.0, 28.0]


def test_graph_5m_items_have_sample_count(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=6h").json()
    for item in items:
        assert item.get("sample_count") is not None
    counts = {i["sample_count"] for i in items}
    assert counts == {97}


def test_graph_6h_has_bucket_minutes_5(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=6h").json()
    for item in items:
        assert item.get("bucket_minutes") == 5


def test_graph_12h_reaggregated_to_10min_buckets(client, ddb_mock):
    # 2 GRAPH#5M items (45-min and 30-min ago) are merged into 1 bucket
    items = client.get("/factories/factory-a/history?window=12h").json()
    assert len(items) == 1
    assert items[0]["is_bucket"] is True
    assert items[0]["bucket_minutes"] == 10


def test_graph_12h_weighted_avg_correct(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=12h").json()
    # Item 1: risk_avg=30.0, sample=97; Item 2: risk_avg=70.0, sample=97
    # weighted avg = (30*97 + 70*97) / 194 = 50.0
    assert round(items[0]["risk_score_avg"]) == 50


def test_graph_12h_max_and_sample_count_correct(client, ddb_mock):
    items = client.get("/factories/factory-a/history?window=12h").json()
    # temp max: max(26.0, 28.0) = 28.0
    assert items[0]["temperature_celsius_max"] == 28.0
    # sample_count = 97 + 97 = 194
    assert items[0]["sample_count"] == 194


def test_graph_24h_reaggregated_to_20min_buckets(client, ddb_mock):
    # 2 GRAPH#5M items → 1 merged bucket at 20-min resolution
    items = client.get("/factories/factory-a/history?window=24h").json()
    assert len(items) == 1
    assert items[0]["bucket_minutes"] == 20


def test_window_1h_not_contaminated_by_graph_5m(client, ddb_mock):
    """window=1h must return HISTORY#STATE items only — no GRAPH#5M buckets."""
    items = client.get("/factories/factory-a/history?window=1h").json()
    for item in items:
        assert not item.get("is_bucket")


# ── top_cause_names extraction ────────────────────────────────────────────────

def test_top_cause_names_extracted_with_name_key():
    """Fixtures / legacy data use {"name": ...} — must extract correctly."""
    from services.ddb import _extract
    item = {
        "sk": "HISTORY#STATE#2026-01-01T00:00:00Z",
        "risk": {
            "score": 40.0,
            "level": "danger",
            "top_causes": [
                {"name": "temperature", "value": 39.0, "contribution": 14.3},
                {"name": "humidity", "value": 80.0, "contribution": 9.1},
            ],
        },
    }
    result = _extract(item)
    assert result["top_cause_names"] == ["temperature", "humidity"]


def test_top_cause_names_extracted_with_field_key():
    """Real data-processor output uses {"field": ...} — must extract correctly."""
    from services.ddb import _extract
    item = {
        "sk": "HISTORY#STATE#2026-01-01T00:00:00Z",
        "risk": {
            "score": 45.0,
            "level": "warning",
            "top_causes": [
                {"field": "temperature", "value": 33.5, "contribution": 5.7},
                {"field": "ai_event_rate", "value": 0.6, "contribution": 4.0},
            ],
        },
    }
    result = _extract(item)
    assert result["top_cause_names"] == ["temperature", "ai_event_rate"]


def test_top_cause_names_empty_when_no_causes():
    """Items with empty top_causes list must yield empty top_cause_names."""
    from services.ddb import _extract
    item = {
        "sk": "HISTORY#STATE#2026-01-01T00:00:00Z",
        "risk": {"score": 90.0, "level": "safe", "top_causes": []},
    }
    result = _extract(item)
    assert result["top_cause_names"] == []
