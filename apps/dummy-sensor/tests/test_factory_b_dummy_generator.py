import importlib.util
import os
import random
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "factory_b_dummy_generator.py"
sys.path.insert(0, str(MODULE_PATH.parent))
SPEC = importlib.util.spec_from_file_location("factory_b_dummy_generator", MODULE_PATH)
generator_module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(generator_module)


class FactoryBDummyGeneratorTest(unittest.TestCase):
    def setUp(self):
        self.old_env = os.environ.copy()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.old_env)

    def test_factory_state_uses_factory_b_stable_lab_defaults(self):
        generator = generator_module.FactoryBDummyGenerator(rng=random.Random(1))

        message = generator.factory_state()

        self.assertEqual(message["factory_id"], "factory-b")
        self.assertEqual(message["node_id"], "factory-b")
        self.assertEqual(message["environment_type"], "vm-mac")
        self.assertEqual(message["input_module_type"], "dummy")
        self.assertEqual(message["source_type"], "factory_state")
        self.assertIn("data_plane_instance_id", message)
        self.assertEqual(message["payload"]["aggregation_window_seconds"], 3)
        self.assertIn("temperature_celsius_avg", message["payload"]["sensor"])

    def test_infra_state_matches_factory_a_shape(self):
        generator = generator_module.FactoryBDummyGenerator(rng=random.Random(2))

        message = generator.infra_state()

        self.assertEqual([node["node_id"] for node in message["payload"]["nodes"]], ["factory-b"])
        self.assertEqual(message["payload"]["node_summary"], {"total": 1, "ready": 1, "not_ready": 0})
        self.assertEqual(
            sorted(message["payload"]["heartbeat"].keys()),
            ["agent_status", "last_spool_write_at", "last_spool_write_status"],
        )
        for node in message["payload"]["nodes"]:
            self.assertEqual(node["network_reachability"], "unknown")


if __name__ == "__main__":
    unittest.main()
