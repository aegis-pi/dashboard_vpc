import sys
from types import SimpleNamespace

sys.modules["boto3"] = SimpleNamespace(
    client=lambda service: None,
    resource=lambda service: None,
)
from processor import s3_writer


class FakeS3:
    def __init__(self):
        self.put = None

    def put_object(self, **kwargs):
        self.put = kwargs


def _make_fake(monkeypatch):
    fake_s3 = FakeS3()
    monkeypatch.setattr(s3_writer, "_s3", fake_s3)
    monkeypatch.setattr(s3_writer, "BUCKET_NAME", "aegis-bucket-data")
    return fake_s3


def test_write_factory_state_path(monkeypatch):
    fake_s3 = _make_fake(monkeypatch)
    s3_writer.write_factory_state(
        "factory-a",
        "factory-a:factory_state:worker2:2026-05-21T10:00:03Z",
        "2026-05-21T10:00:03Z",
        {"temperature_celsius_avg": 38.2},
    )
    assert fake_s3.put["Bucket"] == "aegis-bucket-data"
    assert fake_s3.put["Key"] == (
        "processed/factory-a/factory_state/"
        "yyyy=2026/mm=05/dd=21/hh=10/"
        "factory-a:factory_state:worker2:2026-05-21T10:00:03Z.json"
    )


def test_write_risk_score_path(monkeypatch):
    fake_s3 = _make_fake(monkeypatch)
    s3_writer.write_risk_score(
        "factory-a",
        "factory-a:factory_state:worker2:2026-05-21T10:00:03Z",
        "2026-05-21T10:00:03Z",
        {"risk_score": 42.1},
    )
    assert fake_s3.put["Key"] == (
        "processed/factory-a/risk_score/"
        "yyyy=2026/mm=05/dd=21/hh=10/"
        "factory-a:factory_state:worker2:2026-05-21T10:00:03Z.json"
    )


def test_write_infra_state_path(monkeypatch):
    fake_s3 = _make_fake(monkeypatch)
    s3_writer.write_infra_state(
        "factory-a",
        "factory-a:infra_state:cluster:2026-05-21T10:00:20Z",
        "2026-05-21T10:00:20Z",
        {"node_summary": {"total": 3, "ready": 3}},
    )
    assert fake_s3.put["Key"] == (
        "processed/factory-a/infra_state/"
        "yyyy=2026/mm=05/dd=21/hh=10/"
        "factory-a:infra_state:cluster:2026-05-21T10:00:20Z.json"
    )


def test_write_state_snapshot_path(monkeypatch):
    fake_s3 = _make_fake(monkeypatch)
    s3_writer.write_state_snapshot(
        "factory-b",
        "2026-05-21T10:00:03.123Z",
        {
            "pk": "FACTORY#factory-b",
            "sk": "HISTORY#STATE#2026-05-21T10:00:03.123Z",
            "factory_state": {"temperature_celsius": 31.2},
        },
    )
    assert fake_s3.put["Bucket"] == "aegis-bucket-data"
    assert fake_s3.put["Key"] == (
        "processed/factory-b/state_snapshot/"
        "yyyy=2026/mm=05/dd=21/hh=10/2026-05-21T10:00:03.123Z.json"
    )
    assert '"ttl"' not in fake_s3.put["Body"]
    assert '"sk": "HISTORY#STATE#2026-05-21T10:00:03.123Z"' in fake_s3.put["Body"]


def test_key_uses_factory_id_before_dataset(monkeypatch):
    """processed/{factory_id}/{dataset}/... 순서 검증"""
    fake_s3 = _make_fake(monkeypatch)
    s3_writer.write_risk_score(
        "factory-b",
        "msg-001",
        "2026-05-21T10:30:00Z",
        {},
    )
    key = fake_s3.put["Key"]
    parts = key.split("/")
    assert parts[0] == "processed"
    assert parts[1] == "factory-b"
    assert parts[2] == "risk_score"
