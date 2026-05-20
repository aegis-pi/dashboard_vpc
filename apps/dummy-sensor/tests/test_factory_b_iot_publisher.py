import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "factory_b_iot_publisher.py"
SPEC = importlib.util.spec_from_file_location("factory_b_iot_publisher", MODULE_PATH)
publisher_module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(publisher_module)


class FakeMqttClient:
    def __init__(self):
        self.calls = []

    def publish(self, topic, payload):
        self.calls.append((topic, json.loads(payload.decode("utf-8"))))


class FactoryBIotPublisherTest(unittest.TestCase):
    def setUp(self):
        self.old_env = os.environ.copy()
        os.environ["AEGIS_DATA_PLANE_INSTANCE_ID"] = "test-publisher-b"

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.old_env)

    def test_publish_file_uses_factory_b_topic(self):
        with tempfile.TemporaryDirectory() as tmp:
            outbox = Path(tmp)
            path = outbox / "message.json"
            path.write_text(json.dumps(self._message()), encoding="utf-8")
            fake = FakeMqttClient()
            publisher = publisher_module.FactoryBIotPublisher(mqtt_client=fake)
            publisher.outbox_dir = outbox

            publisher.publish_file(path)

            self.assertFalse(path.exists())
            self.assertEqual(fake.calls[0][0], "aegis/factory-b/factory_state")
            self.assertEqual(fake.calls[0][1]["data_plane_instance_id"], "test-publisher-b")

    def _message(self):
        return {
            "schema_version": "0.1.0",
            "message_id": "factory-b:factory_state:factory-b:2026-05-20T01:00:00Z",
            "factory_id": "factory-b",
            "node_id": "factory-b",
            "environment_type": "vm-mac",
            "input_module_type": "dummy",
            "source_type": "factory_state",
            "source_timestamp": "2026-05-20T01:00:00Z",
            "published_at": "2026-05-20T01:00:00Z",
            "data_plane_instance_id": "generator",
            "payload": {},
        }


if __name__ == "__main__":
    unittest.main()
