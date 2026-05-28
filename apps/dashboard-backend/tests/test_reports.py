from services import s3


def test_s3_client_uses_explicit_timeouts():
    config = s3._client().meta.config
    assert config.connect_timeout == 2.0
    assert config.read_timeout == 5.0
    assert config.retries["mode"] == "standard"
    assert config.retries["total_max_attempts"] == 2
    assert config.max_pool_connections == 10


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
