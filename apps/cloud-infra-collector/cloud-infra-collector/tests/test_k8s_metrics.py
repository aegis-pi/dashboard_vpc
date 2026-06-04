from cloud_infra.k8s_metrics import _parse_cpu, _parse_memory, kubernetes_summary


class FakeClient:
    def __init__(self, docs):
        self.docs = docs

    def get(self, path):
        if path not in self.docs:
            raise KeyError(path)
        return self.docs[path]


def test_resource_quantity_parsers():
    assert _parse_cpu("250m") == 250
    assert _parse_cpu("1000000n") == 1
    assert _parse_cpu("2") == 2000
    assert _parse_memory("128Mi") == 128 * 1024 * 1024
    assert _parse_memory("1Gi") == 1024 * 1024 * 1024


def test_kubernetes_summary_includes_nodes_pods_and_argocd():
    docs = {
        "/api/v1/nodes": {
            "items": [
                {
                    "metadata": {"name": "node-a"},
                    "status": {
                        "allocatable": {"cpu": "2", "memory": "4Gi"},
                        "conditions": [{"type": "Ready", "status": "True"}],
                    },
                }
            ]
        },
        "/apis/metrics.k8s.io/v1beta1/nodes": {
            "items": [
                {"metadata": {"name": "node-a"}, "usage": {"cpu": "250m", "memory": "1Gi"}}
            ]
        },
        "/api/v1/pods?limit=500": {
            "items": [
                {
                    "metadata": {"namespace": "argocd", "name": "app"},
                    "status": {
                        "phase": "Running",
                        "containerStatuses": [{"restartCount": 2}],
                    },
                }
            ]
        },
        "/apis/metrics.k8s.io/v1beta1/pods": {
            "items": [
                {
                    "metadata": {"namespace": "argocd", "name": "app"},
                    "containers": [{"usage": {"cpu": "50m", "memory": "200Mi"}}],
                }
            ]
        },
        "/apis/argoproj.io/v1alpha1/namespaces/argocd/applications": {
            "items": [
                {
                    "metadata": {"name": "aegis-spoke-factory-a"},
                    "status": {
                        "sync": {"status": "Synced"},
                        "health": {"status": "Healthy"},
                    },
                }
            ]
        },
    }

    summary = kubernetes_summary(FakeClient(docs), argocd_namespace="argocd", top_pods_limit=3)

    assert summary["status"] == "normal"
    assert summary["nodes"]["ready"] == 1
    assert summary["nodes"]["items"][0]["cpu_utilization_percent"] == 12.5
    assert summary["nodes"]["items"][0]["memory_utilization_percent"] == 25
    assert summary["pods"]["running"] == 1
    assert summary["pods"]["restart_count_total"] == 2
    assert summary["pods"]["top_by_cpu"][0]["cpu_millicores"] == 50
    assert summary["argocd"]["synced"] == 1

