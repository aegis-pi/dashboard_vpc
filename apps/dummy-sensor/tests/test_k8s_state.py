import unittest

import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "k8s_state.py"
SPEC = importlib.util.spec_from_file_location("k8s_state", MODULE_PATH)
k8s_state = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(k8s_state)


class K8sStateTest(unittest.TestCase):
    def test_build_node_payloads_maps_ready_and_roles(self):
        payloads = k8s_state.build_node_payloads(
            [
                {
                    "metadata": {
                        "name": "factory-c-master",
                        "labels": {"node-role.kubernetes.io/control-plane": "true"},
                    },
                    "status": {"conditions": [{"type": "Ready", "status": "True"}]},
                },
                {
                    "metadata": {
                        "name": "factory-c-worker",
                        "labels": {"aegis.input-module-type": "dummy"},
                    },
                    "status": {"conditions": [{"type": "Ready", "status": "False"}]},
                },
            ]
        )

        by_id = {item["node_id"]: item for item in payloads}
        self.assertEqual(by_id["factory-c-master"]["role"], "control-plane")
        self.assertTrue(by_id["factory-c-master"]["ready"])
        self.assertEqual(by_id["factory-c-worker"]["role"], "worker")
        self.assertFalse(by_id["factory-c-worker"]["ready"])
        self.assertEqual(by_id["factory-c-worker"]["network_reachability"], "not_ready")

    def test_build_workload_payload_prefers_newest_matching_pod(self):
        payload = k8s_state.build_workload_payload(
            "ai-apps",
            "dummy-data-generator",
            [
                {
                    "metadata": {
                        "name": "dummy-data-generator-old",
                        "creationTimestamp": "2026-05-20T00:00:00Z",
                    },
                    "spec": {"nodeName": "factory-b"},
                    "status": {
                        "phase": "Running",
                        "containerStatuses": [{"ready": True, "restartCount": 1}],
                    },
                },
                {
                    "metadata": {
                        "name": "dummy-data-generator-new",
                        "creationTimestamp": "2026-05-20T00:01:00Z",
                    },
                    "spec": {"nodeName": "factory-b"},
                    "status": {
                        "phase": "Pending",
                        "containerStatuses": [{"ready": False, "restartCount": 2}],
                    },
                },
            ],
        )

        self.assertEqual(payload["status"], "Pending")
        self.assertFalse(payload["ready"])
        self.assertEqual(payload["restart_count"], 2)


if __name__ == "__main__":
    unittest.main()
