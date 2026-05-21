from decimal import Decimal
import sys
from types import SimpleNamespace

sys.modules["boto3"] = SimpleNamespace(
    client=lambda service: None,
    resource=lambda service: None,
)
from processor import dynamo


class FakeTable:
    def __init__(self):
        self.item = {
            "pk": "FACTORY#factory-a",
            "sk": "LATEST",
            "factory_id": "factory-a",
            "infra_state": {
                "message_id": "infra-message",
                "source_timestamp": "2026-05-21T10:00:00Z",
            },
        }
        self.history_item = None

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames=None):
        self.item["pk"] = Key["pk"]
        self.item["sk"] = Key["sk"]
        self.item["factory_id"] = ExpressionAttributeValues[":fid"]
        self.item["schema_version"] = ExpressionAttributeValues[":sv"]
        self.item["updated_at"] = ExpressionAttributeValues[":u"]

        if ":fs" in ExpressionAttributeValues:
            self.item["factory_state"] = ExpressionAttributeValues[":fs"]
            self.item["risk"] = ExpressionAttributeValues[":r"]
            self.item["pipeline_status"] = ExpressionAttributeValues[":ps"]
            self.item["last_factory_state_at"] = ExpressionAttributeValues[":t"]

        if ":is" in ExpressionAttributeValues:
            self.item["infra_state"] = ExpressionAttributeValues[":is"]
            self.item["pipeline_status"] = ExpressionAttributeValues[":ps"]
            self.item["last_infra_state_at"] = ExpressionAttributeValues[":t"]

    def get_item(self, Key):
        return {"Item": dict(self.item)}

    def put_item(self, Item):
        self.history_item = Item


def test_write_factory_state_snapshot_copies_latest_to_history(monkeypatch):
    table = FakeTable()
    monkeypatch.setattr(dynamo, "_table", lambda: table)
    monkeypatch.setattr(dynamo.time, "time", lambda: 1_800_000_000)

    envelope = {
        "factory_id": "factory-a",
        "schema_version": "0.1.0",
        "message_id": "factory-message",
        "source_timestamp": "2026-05-21T10:00:03Z",
    }
    normalized = {
        "temperature_celsius": 31.2,
        "humidity_percent": 62.5,
        "fire_score": 0.0,
    }
    risk = {"score": 91.43, "level": "safe", "top_causes": []}
    pipeline_status = {"status": "normal", "latest_infra_state_age_seconds": 3}

    s3_snapshot = dynamo.write_factory_state_snapshot(
        "factory-a",
        envelope,
        normalized,
        risk,
        pipeline_status,
        "2026-05-21T10:00:03.123Z",
    )

    history = table.history_item
    assert table.item["sk"] == "LATEST"
    assert history["sk"] == "HISTORY#STATE#2026-05-21T10:00:03.123Z"
    assert history["ttl"] == 1_800_172_800
    assert history["infra_state"]["message_id"] == "infra-message"
    assert history["factory_state"]["temperature_celsius"] == Decimal("31.2")
    assert history["risk"]["score"] == Decimal("91.43")
    assert history["risk"]["calculation_version"] == "risk-v0.2.0"
    assert "ttl" not in s3_snapshot
    assert s3_snapshot["sk"] == "HISTORY#STATE#2026-05-21T10:00:03.123Z"
    assert s3_snapshot["factory_state"]["temperature_celsius"] == 31.2
    assert s3_snapshot["risk"]["score"] == 91.43
