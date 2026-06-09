import asyncio
import json
from datetime import datetime, timezone

import boto3
from moto import mock_aws

import deps.rbac as rbac_module
from main import app
from services import s3


def _override_principal(**overrides):
    base = dict(
        user_id="u-1",
        cognito_sub="u-1",
        email="op@example.com",
        display_name="Operator",
        global_role="factory_operator",
        can_view_system=False,
        status="active",
        allowed_factory_ids=frozenset({"factory-a"}),
    )
    base.update(overrides)
    app.dependency_overrides[rbac_module.get_current_principal] = (
        lambda: rbac_module.Principal(**base)
    )


def test_s3_client_uses_explicit_timeouts():
    config = s3._client().meta.config
    assert config.connect_timeout == 2.0
    assert config.read_timeout == 5.0
    assert config.retries["mode"] == "standard"
    assert config.retries["total_max_attempts"] == 2
    assert config.max_pool_connections == 10


def test_list_reports_returns_s3_daily_report_metadata(client, monkeypatch):
    async def _list_reports():
        return [
            {
                "report_date": "2026-05-27",
                "factory_id": "factory-b",
                "s3_key": "reports/daily/yyyy=2026/mm=05/dd=27/factory-b/report.md",
                "last_modified": "2026-05-28T06:48:19+00:00",
                "size_bytes": 10202,
            }
        ]

    monkeypatch.setattr(s3, "list_daily_reports", _list_reports)

    r = client.get("/reports")

    assert r.status_code == 200
    assert r.json() == [
        {
            "report_date": "2026-05-27",
            "factory_id": "factory-b",
            "s3_key": "reports/daily/yyyy=2026/mm=05/dd=27/factory-b/report.md",
            "last_modified": "2026-05-28T06:48:19+00:00",
            "size_bytes": 10202,
        }
    ]


def test_list_reports_s3_timeout_returns_504(client, monkeypatch):
    async def _raise_timeout():
        raise s3.S3UnavailableError("timeout")

    monkeypatch.setattr(s3, "list_daily_reports", _raise_timeout)

    r = client.get("/reports")

    assert r.status_code == 504
    assert r.json()["detail"] == "S3 request timed out"


def test_get_report_uses_partitioned_s3_key(monkeypatch):
    calls = []

    def _get_object(bucket, key):
        calls.append((bucket, key))
        return "# report"

    monkeypatch.setattr(s3, "_get_object_sync", _get_object)

    import asyncio

    result = asyncio.run(s3.get_report_markdown("2026-05-27", "factory-b"))

    assert result == "# report"
    assert calls == [
        (
            "aegis-bucket-data",
            "reports/daily/yyyy=2026/mm=05/dd=27/factory-b/report.md",
        )
    ]


def test_list_processed_risk_scores_reads_bounded_s3_details():
    s3._s3_client.cache_clear()
    with mock_aws():
        client = boto3.client("s3", region_name="ap-south-1")
        client.create_bucket(
            Bucket="aegis-bucket-data",
            CreateBucketConfiguration={"LocationConstraint": "ap-south-1"},
        )
        client.put_object(
            Bucket="aegis-bucket-data",
            Key=(
                "processed/factory-c/risk_score/yyyy=2026/mm=06/dd=09/hh=04/"
                "factory-c:factory_state:worker:2026-06-09T04:15:12Z.json"
            ),
            Body=json.dumps(
                {
                    "risk": {
                        "score": 0.0,
                        "level": "danger",
                        "top_causes": [{"field": "data_freshness", "value": "stale_over_300s"}],
                    },
                }
            ),
            ContentType="application/json",
        )
        client.put_object(
            Bucket="aegis-bucket-data",
            Key=(
                "processed/factory-c/risk_score/yyyy=2026/mm=06/dd=09/hh=04/"
                "factory-c:factory_state:worker:2026-06-09T04:40:00Z.json"
            ),
            Body=json.dumps({"score": 76.1, "top_causes": []}),
            ContentType="application/json",
        )

        result = asyncio.run(
            s3.list_processed_risk_scores(
                "factory-c",
                datetime(2026, 6, 9, 4, 10, 0, tzinfo=timezone.utc),
                datetime(2026, 6, 9, 4, 20, 0, tzinfo=timezone.utc),
            )
        )

    assert len(result) == 1
    assert result[0]["timestamp"] == "2026-06-09T04:15:12Z"
    assert result[0]["risk_score"] == 0.0
    assert result[0]["level"] == "danger"
    assert result[0]["top_causes"] == [{"field": "data_freshness", "value": "stale_over_300s"}]


def test_get_report_not_found_returns_404(client, monkeypatch):
    async def _raise_not_found(report_date, factory_id):
        raise s3.S3ObjectNotFoundError("missing")

    monkeypatch.setattr(s3, "get_report_markdown", _raise_not_found)

    r = client.get("/reports/2026-05-28/factory-a")

    assert r.status_code == 404
    assert r.json()["detail"] == "Report not found"


def test_get_report_s3_timeout_returns_504(client, monkeypatch):
    async def _raise_timeout(report_date, factory_id):
        raise s3.S3UnavailableError("timeout")

    monkeypatch.setattr(s3, "get_report_markdown", _raise_timeout)

    r = client.get("/reports/2026-05-28/factory-a")

    assert r.status_code == 504
    assert r.json()["detail"] == "S3 request timed out"


# ─── Cloud-infra reports (system-view gated) ────────────────────────────────


def _cloud_infra_and_factory_reports():
    return [
        {
            "report_date": "2026-06-07",
            "factory_id": "cloud-infra",
            "s3_key": "reports/daily/yyyy=2026/mm=06/dd=07/cloud-infra/report.md",
            "last_modified": "2026-06-08T00:31:22+00:00",
            "size_bytes": 7119,
        },
        {
            "report_date": "2026-06-07",
            "factory_id": "factory-a",
            "s3_key": "reports/daily/yyyy=2026/mm=06/dd=07/factory-a/report.md",
            "last_modified": "2026-06-08T00:31:17+00:00",
            "size_bytes": 6093,
        },
        {
            "report_date": "2026-06-07",
            "factory_id": "factory-b",
            "s3_key": "reports/daily/yyyy=2026/mm=06/dd=07/factory-b/report.md",
            "last_modified": "2026-06-08T00:42:08+00:00",
            "size_bytes": 9193,
        },
    ]


def test_list_reports_includes_cloud_infra_for_system_user(client, monkeypatch):
    async def _list_reports():
        return _cloud_infra_and_factory_reports()

    monkeypatch.setattr(s3, "list_daily_reports", _list_reports)

    # Default client fixture principal is super_admin + can_view_system.
    r = client.get("/reports")

    assert r.status_code == 200
    factory_ids = {item["factory_id"] for item in r.json()}
    assert "cloud-infra" in factory_ids


def test_list_reports_hides_cloud_infra_from_non_system_user(client, monkeypatch):
    async def _list_reports():
        return _cloud_infra_and_factory_reports()

    monkeypatch.setattr(s3, "list_daily_reports", _list_reports)
    _override_principal(can_view_system=False, allowed_factory_ids=frozenset({"factory-a"}))

    r = client.get("/reports")

    assert r.status_code == 200
    factory_ids = {item["factory_id"] for item in r.json()}
    assert factory_ids == {"factory-a"}


def test_get_cloud_infra_report_allowed_for_system_user(client, monkeypatch):
    async def _get_markdown(report_date, factory_id):
        assert factory_id == "cloud-infra"
        return "# Cloud Infra"

    monkeypatch.setattr(s3, "get_report_markdown", _get_markdown)
    _override_principal(can_view_system=True, allowed_factory_ids=frozenset())

    r = client.get("/reports/2026-06-07/cloud-infra")

    assert r.status_code == 200
    assert r.text == "# Cloud Infra"


def test_get_cloud_infra_report_denied_for_non_system_user(client, monkeypatch):
    async def _get_markdown(report_date, factory_id):  # pragma: no cover
        raise AssertionError("S3 should not be hit when access is denied")

    monkeypatch.setattr(s3, "get_report_markdown", _get_markdown)
    _override_principal(can_view_system=False, allowed_factory_ids=frozenset({"cloud-infra"}))

    r = client.get("/reports/2026-06-07/cloud-infra")

    assert r.status_code == 403
