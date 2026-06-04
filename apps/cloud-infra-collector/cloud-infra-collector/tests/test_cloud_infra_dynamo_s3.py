import importlib
import sys
from types import SimpleNamespace


class FakeTable:
    def __init__(self):
        self.current = {}
        self.puts = []

    def get_item(self, Key):
        return {"Item": dict(self.current)} if Key["pk"] == "CLOUD#infra" and self.current else {}

    def put_item(self, Item):
        self.puts.append(Item)
        if Item["sk"] == "LATEST":
            self.current = dict(Item)


class FakeS3:
    def __init__(self):
        self.puts = []

    def put_object(self, **kwargs):
        self.puts.append(kwargs)


def test_write_fast_snapshot_preserves_slow_and_writes_history(monkeypatch):
    table = FakeTable()
    table.current = {
        "pk": "CLOUD#infra",
        "sk": "LATEST",
        "slow_updated_at": "2026-06-01T15:25:00.000Z",
        "slow": {"eks_management": {"status": "warning"}},
    }
    _install_boto3(monkeypatch, table=table)
    dynamo = importlib.import_module("cloud_infra.dynamo")
    monkeypatch.setattr(dynamo.time, "time", lambda: 1_800_000_000)

    history = dynamo.write_fast_snapshot(
        {
            "backend_runtime": {"status": "normal"},
            "data_pipeline": {"status": "normal"},
            "factory_freshness": {"status": "normal"},
        },
        "2026-06-01T15:30:00.000Z",
        6,
    )

    assert table.puts[0]["sk"] == "LATEST"
    assert table.puts[0]["slow_updated_at"] == "2026-06-01T15:25:00.000Z"
    assert table.puts[0]["overall_status"] == "warning"
    assert table.puts[1]["sk"] == "HISTORY#FAST#2026-06-01T15:30:00.000Z"
    assert table.puts[1]["ttl"] == 1_800_021_600
    assert history["snapshot_type"] == "fast"


def test_write_slow_snapshot_preserves_fast_and_writes_history(monkeypatch):
    table = FakeTable()
    table.current = {
        "pk": "CLOUD#infra",
        "sk": "LATEST",
        "fast_updated_at": "2026-06-01T15:30:00.000Z",
        "fast": {"backend_runtime": {"status": "normal"}},
    }
    _install_boto3(monkeypatch, table=table)
    dynamo = importlib.import_module("cloud_infra.dynamo")
    monkeypatch.setattr(dynamo.time, "time", lambda: 1_800_000_000)

    history = dynamo.write_slow_snapshot(
        {
            "eks_management": {"status": "warning"},
            "storage_freshness": {"status": "normal"},
        },
        "2026-06-01T15:35:00.000Z",
        24,
    )

    assert table.puts[0]["sk"] == "LATEST"
    assert table.puts[0]["fast_updated_at"] == "2026-06-01T15:30:00.000Z"
    assert table.puts[0]["overall_status"] == "warning"
    assert table.puts[1]["sk"] == "HISTORY#SLOW#2026-06-01T15:35:00.000Z"
    assert table.puts[1]["ttl"] == 1_800_086_400
    assert history["snapshot_type"] == "slow"


def test_write_slow_snapshot_keeps_fast_datastores_in_overall_status(monkeypatch):
    table = FakeTable()
    table.current = {
        "pk": "CLOUD#infra",
        "sk": "LATEST",
        "fast_updated_at": "2026-06-01T15:30:00.000Z",
        "fast": {
            "backend_runtime": {"status": "normal"},
            "datastores": {"status": "critical"},
            "data_pipeline": {"status": "normal"},
            "factory_freshness": {"status": "normal"},
        },
    }
    _install_boto3(monkeypatch, table=table)
    dynamo = importlib.import_module("cloud_infra.dynamo")
    monkeypatch.setattr(dynamo.time, "time", lambda: 1_800_000_000)

    history = dynamo.write_slow_snapshot(
        {
            "eks_management": {"status": "normal"},
            "storage_freshness": {"status": "normal"},
        },
        "2026-06-01T15:35:00.000Z",
        24,
    )

    assert table.puts[0]["overall_status"] == "critical"
    assert history["overall_status"] == "critical"


def test_write_fast_snapshot_includes_datastores_in_overall_status(monkeypatch):
    table = FakeTable()
    _install_boto3(monkeypatch, table=table)
    dynamo = importlib.import_module("cloud_infra.dynamo")
    monkeypatch.setattr(dynamo.time, "time", lambda: 1_800_000_000)

    history = dynamo.write_fast_snapshot(
        {
            "backend_runtime": {"status": "normal"},
            "datastores": {"status": "critical"},
            "data_pipeline": {"status": "normal"},
            "factory_freshness": {"status": "normal"},
        },
        "2026-06-01T15:30:00.000Z",
        6,
    )

    assert table.puts[0]["overall_status"] == "critical"
    assert history["overall_status"] == "critical"


def test_fast_s3_snapshot_key_and_body_excludes_ttl(monkeypatch):
    s3 = FakeS3()
    _install_boto3(monkeypatch, s3=s3)
    s3_writer = importlib.import_module("cloud_infra.s3_writer")

    key = s3_writer.put_fast_snapshot({
        "pk": "CLOUD#infra",
        "sk": "HISTORY#FAST#2026-06-01T15:30:00.000Z",
        "updated_at": "2026-06-01T15:30:00.000Z",
        "ttl": 123,
    })

    assert key == "processed/cloud_infra/fast/yyyy=2026/mm=06/dd=01/hh=15/2026-06-01T15-30-00-000Z.json"
    assert '"ttl"' not in s3.puts[0]["Body"]


def test_slow_s3_snapshot_key_and_body_excludes_ttl(monkeypatch):
    s3 = FakeS3()
    _install_boto3(monkeypatch, s3=s3)
    s3_writer = importlib.import_module("cloud_infra.s3_writer")

    key = s3_writer.put_slow_snapshot({
        "pk": "CLOUD#infra",
        "sk": "HISTORY#SLOW#2026-06-01T15:35:00.000Z",
        "updated_at": "2026-06-01T15:35:00.000Z",
        "ttl": 123,
    })

    assert key == "processed/cloud_infra/slow/yyyy=2026/mm=06/dd=01/hh=15/2026-06-01T15-35-00-000Z.json"
    assert '"ttl"' not in s3.puts[0]["Body"]


def _install_boto3(monkeypatch, table=None, s3=None):
    for name in ["cloud_infra.dynamo", "cloud_infra.s3_writer", "boto3"]:
        sys.modules.pop(name, None)
    table = table or FakeTable()
    s3 = s3 or FakeS3()
    monkeypatch.setitem(
        sys.modules,
        "boto3",
        SimpleNamespace(resource=lambda service: SimpleNamespace(Table=lambda name: table), client=lambda service: s3),
    )
