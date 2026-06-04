from datetime import datetime, timedelta, timezone

from deps.rbac import Principal, get_current_principal
from main import app
from services import ddb
from services.cloud_infra import _status_with_staleness


def _iso_minus(seconds: int) -> str:
    dt = datetime.now(timezone.utc) - timedelta(seconds=seconds)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _put_cloud_latest(table, fast_age_seconds: int = 60, slow_age_seconds: int = 300):
    fast_at = _iso_minus(fast_age_seconds)
    slow_at = _iso_minus(slow_age_seconds)
    table.put_item(
        Item={
            "pk": "CLOUD#infra",
            "sk": "LATEST",
            "schema_version": "cloud-infra-status-v1",
            "updated_at": fast_at,
            "fast_updated_at": fast_at,
            "slow_updated_at": slow_at,
            "overall_status": "normal",
            "fast": {
                "backend_runtime": {
                    "status": "normal",
                    "ecs": {"desired_count": 1, "running_count": 1},
                    "alb": {"healthy_host_count": 1, "target_5xx_count_5m": 0},
                },
                "data_pipeline": {
                    "status": "normal",
                    "lambdas": [{"name": "AEGIS-Lambda-DataProcessor", "errors_5m": 0}],
                },
                "factory_freshness": {
                    "status": "normal",
                    "factories": [{"factory_id": "factory-a", "pipeline_status": "normal"}],
                },
                "errors": [],
            },
            "slow": {
                "eks_management": {
                    "status": "normal",
                    "nodes": {"ready": 2, "total": 2},
                    "pods": {"running": 22, "failed": 0},
                    "argocd": {"synced": 3, "out_of_sync": 0, "healthy": 3},
                },
                "storage_freshness": {
                    "status": "normal",
                    "factories": [{"factory_id": "factory-a", "status": "normal"}],
                },
                "errors": [],
            },
        }
    )


def test_cloud_infra_returns_available_false_without_item(client, ddb_mock):
    r = client.get("/cloud-infra")

    assert r.status_code == 200
    assert r.json() == {"available": False}


def test_cloud_infra_requires_system_permission_for_factory_admin(client, ddb_mock):
    app.dependency_overrides[get_current_principal] = lambda: Principal(
        user_id="factory-user",
        cognito_sub="factory-sub",
        email="factory@example.com",
        display_name="Factory Admin",
        global_role="factory_admin",
        can_view_system=False,
        status="active",
        allowed_factory_ids=frozenset({"factory-a"}),
    )
    try:
        r = client.get("/cloud-infra")
    finally:
        app.dependency_overrides.pop(get_current_principal, None)

    assert r.status_code == 403
    assert r.json()["detail"] == "System access denied"


def test_cloud_infra_allows_factory_admin_with_system_permission(client, ddb_mock):
    app.dependency_overrides[get_current_principal] = lambda: Principal(
        user_id="factory-user",
        cognito_sub="factory-sub",
        email="factory@example.com",
        display_name="Factory Admin",
        global_role="factory_admin",
        can_view_system=True,
        status="active",
        allowed_factory_ids=frozenset({"factory-a"}),
    )
    try:
        r = client.get("/cloud-infra")
    finally:
        app.dependency_overrides.pop(get_current_principal, None)

    assert r.status_code == 200
    assert r.json() == {"available": False}


def test_cloud_infra_returns_latest_with_staleness_fields(client, ddb_mock):
    _put_cloud_latest(ddb_mock)

    r = client.get("/cloud-infra")

    assert r.status_code == 200
    data = r.json()
    assert data["available"] is True
    assert data["schema_version"] == "cloud-infra-status-v1"
    assert data["overall_status"] == "normal"
    assert data["fast_stale"] is False
    assert data["slow_stale"] is False
    assert data["fast_age_seconds"] >= 0
    assert data["slow_age_seconds"] >= 0
    assert data["fast"]["backend_runtime"]["ecs"]["running_count"] == 1


def test_cloud_infra_marks_stale_latest_as_warning(client, ddb_mock):
    _put_cloud_latest(ddb_mock, fast_age_seconds=240, slow_age_seconds=1200)

    r = client.get("/cloud-infra")

    assert r.status_code == 200
    data = r.json()
    assert data["overall_status"] == "warning"
    assert data["fast_stale"] is True
    assert data["slow_stale"] is True
    assert data["fast"]["status"] == "unknown"
    assert data["slow"]["status"] == "unknown"
    # staleness must propagate into each section so frontend cards (which read
    # section-level status) gray out instead of showing the last green value.
    assert data["fast"]["backend_runtime"]["status"] == "unknown"
    assert data["fast"]["data_pipeline"]["status"] == "unknown"
    assert data["fast"]["factory_freshness"]["status"] == "unknown"
    assert data["slow"]["eks_management"]["status"] == "unknown"
    assert data["slow"]["storage_freshness"]["status"] == "unknown"


def test_cloud_infra_staleness_does_not_mutate_source_item():
    item = {
        "fast_updated_at": "2026-06-02T00:00:00.000Z",
        "slow_updated_at": "2026-06-02T00:00:00.000Z",
        "overall_status": "normal",
        "fast": {},
        "slow": {},
    }
    now = datetime(2026, 6, 2, 1, 0, tzinfo=timezone.utc)

    result = _status_with_staleness(item, now=now)

    assert result["overall_status"] == "warning"
    assert item["overall_status"] == "normal"
    assert "available" not in item


def test_cloud_infra_history_returns_track_items(client, ddb_mock):
    _put_cloud_latest(ddb_mock)
    fast_ts = _iso_minus(60)
    slow_ts = _iso_minus(300)
    ddb_mock.put_item(
        Item={
            "pk": "CLOUD#infra",
            "sk": f"HISTORY#FAST#{fast_ts}",
            "updated_at": fast_ts,
            "overall_status": "normal",
            "snapshot_type": "fast",
        }
    )
    ddb_mock.put_item(
        Item={
            "pk": "CLOUD#infra",
            "sk": f"HISTORY#SLOW#{slow_ts}",
            "updated_at": slow_ts,
            "overall_status": "normal",
            "snapshot_type": "slow",
        }
    )

    fast = client.get("/cloud-infra/history?window=1h&track=fast").json()
    slow = client.get("/cloud-infra/history?window=1h&track=slow").json()

    assert len(fast) == 1
    assert fast[0]["snapshot_type"] == "fast"
    assert len(slow) == 1
    assert slow[0]["snapshot_type"] == "slow"


def test_cloud_infra_invalid_track_returns_422(client, ddb_mock):
    r = client.get("/cloud-infra/history?track=medium")

    assert r.status_code == 422


def test_cloud_infra_ddb_timeout_returns_504(client, monkeypatch):
    async def _raise_timeout():
        raise ddb.DynamoDBUnavailableError("timeout")

    monkeypatch.setattr(ddb, "get_cloud_infra_latest", _raise_timeout)

    r = client.get("/cloud-infra")

    assert r.status_code == 504
    assert r.json()["detail"] == "DynamoDB request timed out"
