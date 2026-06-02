from services import s3


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
