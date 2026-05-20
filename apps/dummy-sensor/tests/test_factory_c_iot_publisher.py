import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "factory_c_iot_publisher.py"
SPEC = importlib.util.spec_from_file_location("factory_c_iot_publisher", MODULE_PATH)
publisher_module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(publisher_module)


class FakeMqttClient:
    def __init__(self):
        self.calls = []

    def publish(self, topic, payload):
        self.calls.append((topic, json.loads(payload.decode("utf-8"))))


class FactoryCIotPublisherTest(unittest.TestCase):
    def setUp(self):
        self.old_env = os.environ.copy()
        os.environ["AEGIS_DATA_PLANE_INSTANCE_ID"] = "test-publisher"

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.old_env)

    def test_publish_file_uses_factory_topic_and_overwrites_publish_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            outbox = Path(tmp)
            path = outbox / "message.json"
            path.write_text(json.dumps(self._message()), encoding="utf-8")
            fake = FakeMqttClient()
            publisher = publisher_module.FactoryCIotPublisher(mqtt_client=fake)
            publisher.outbox_dir = outbox

            publisher.publish_file(path)

            self.assertFalse(path.exists())
            self.assertEqual(fake.calls[0][0], "aegis/factory-c/factory_state")
            self.assertEqual(fake.calls[0][1]["data_plane_instance_id"], "test-publisher")

    def test_invalid_file_is_quarantined(self):
        with tempfile.TemporaryDirectory() as tmp:
            outbox = Path(tmp)
            path = outbox / "bad.json"
            path.write_text("{}", encoding="utf-8")
            publisher = publisher_module.FactoryCIotPublisher(mqtt_client=FakeMqttClient())
            publisher.outbox_dir = outbox

            with self.assertRaises(ValueError):
                publisher.publish_file(path)

            self.assertFalse(path.exists())
            self.assertTrue((outbox / "quarantine" / "bad.json").exists())

    def _message(self):
        return {
            "schema_version": "0.1.0",
            "message_id": "factory-c:factory_state:factory-c-worker:2026-05-20T01:00:00Z",
            "factory_id": "factory-c",
            "node_id": "factory-c-worker",
            "environment_type": "vm-windows",
            "input_module_type": "dummy",
            "source_type": "factory_state",
            "source_timestamp": "2026-05-20T01:00:00Z",
            "published_at": "2026-05-20T01:00:00Z",
            "data_plane_instance_id": "generator",
            "payload": {},
        }


if __name__ == "__main__":
    unittest.main()
