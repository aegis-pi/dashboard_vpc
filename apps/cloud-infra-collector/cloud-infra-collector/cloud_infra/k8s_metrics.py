from cloud_infra.status import worst_status


def kubernetes_summary(client, *, argocd_namespace: str, top_pods_limit: int) -> dict:
    nodes_doc = client.get("/api/v1/nodes")
    pods_doc = client.get("/api/v1/pods?limit=500")
    node_metrics_doc = _optional_get(client, "/apis/metrics.k8s.io/v1beta1/nodes")
    pod_metrics_doc = _optional_get(client, "/apis/metrics.k8s.io/v1beta1/pods")
    argocd_doc = _optional_get(client, f"/apis/argoproj.io/v1alpha1/namespaces/{argocd_namespace}/applications")

    nodes = _nodes_summary(nodes_doc, node_metrics_doc)
    pods = _pods_summary(pods_doc, pod_metrics_doc, top_pods_limit)
    argocd = _argocd_summary(argocd_doc)
    return {
        "status": worst_status([nodes["status"], pods["status"], argocd["status"]]),
        "nodes": nodes,
        "pods": pods,
        "argocd": argocd,
    }


def _nodes_summary(nodes_doc: dict, node_metrics_doc: dict | None) -> dict:
    metrics_by_node = {
        item.get("metadata", {}).get("name"): item
        for item in (node_metrics_doc or {}).get("items", [])
    }
    items = []
    ready = 0
    for node in nodes_doc.get("items", []):
        metadata = node.get("metadata") or {}
        status = node.get("status") or {}
        allocatable = status.get("allocatable") or {}
        node_ready = _node_ready(status)
        if node_ready:
            ready += 1
        metric = metrics_by_node.get(metadata.get("name")) or {}
        usage = metric.get("usage") or {}
        cpu_percent = _usage_percent(usage.get("cpu"), allocatable.get("cpu"), "cpu")
        memory_percent = _usage_percent(usage.get("memory"), allocatable.get("memory"), "memory")
        items.append({
            "name": metadata.get("name"),
            "ready": node_ready,
            "cpu_utilization_percent": cpu_percent,
            "memory_utilization_percent": memory_percent,
        })
    total = len(items)
    return {
        "status": "normal" if total and ready == total else "critical" if total and ready == 0 else "warning",
        "ready": ready,
        "total": total,
        "items": items,
    }


def _pods_summary(pods_doc: dict, pod_metrics_doc: dict | None, top_pods_limit: int) -> dict:
    counts = {"running": 0, "pending": 0, "failed": 0, "unknown": 0, "succeeded": 0}
    restart_count_total = 0
    for pod in pods_doc.get("items", []):
        phase = (pod.get("status") or {}).get("phase", "Unknown").lower()
        counts[phase if phase in counts else "unknown"] += 1
        for container in (pod.get("status") or {}).get("containerStatuses") or []:
            restart_count_total += int(container.get("restartCount") or 0)

    top = _top_pods(pod_metrics_doc or {}, top_pods_limit)
    status = "critical" if counts["failed"] > 0 else "warning" if counts["pending"] > 0 or counts["unknown"] > 0 else "normal"
    return {
        "status": status,
        **counts,
        "restart_count_total": restart_count_total,
        "top_by_cpu": top["cpu"],
        "top_by_memory": top["memory"],
    }


def _argocd_summary(argocd_doc: dict | None) -> dict:
    if not argocd_doc:
        return {
            "status": "unknown",
            "applications_total": 0,
            "synced": 0,
            "out_of_sync": 0,
            "healthy": 0,
            "degraded": 0,
            "apps": [],
        }
    apps = []
    synced = out_of_sync = healthy = degraded = 0
    for item in argocd_doc.get("items", []):
        status = item.get("status") or {}
        sync_status = (status.get("sync") or {}).get("status", "Unknown")
        health_status = (status.get("health") or {}).get("status", "Unknown")
        if sync_status == "Synced":
            synced += 1
        elif sync_status == "OutOfSync":
            out_of_sync += 1
        if health_status == "Healthy":
            healthy += 1
        elif health_status == "Degraded":
            degraded += 1
        apps.append({
            "name": (item.get("metadata") or {}).get("name"),
            "sync_status": sync_status,
            "health_status": health_status,
        })
    status = "critical" if degraded > 0 else "warning" if out_of_sync > 0 else "normal"
    return {
        "status": status,
        "applications_total": len(apps),
        "synced": synced,
        "out_of_sync": out_of_sync,
        "healthy": healthy,
        "degraded": degraded,
        "apps": apps,
    }


def _top_pods(pod_metrics_doc: dict, limit: int) -> dict:
    rows = []
    for item in pod_metrics_doc.get("items", []):
        namespace = (item.get("metadata") or {}).get("namespace")
        pod = (item.get("metadata") or {}).get("name")
        cpu = 0
        memory = 0
        for container in item.get("containers") or []:
            usage = container.get("usage") or {}
            cpu += _parse_cpu(usage.get("cpu"))
            memory += _parse_memory(usage.get("memory"))
        rows.append({
            "namespace": namespace,
            "pod": pod,
            "cpu_millicores": round(cpu, 3),
            "memory_mib": round(memory / (1024 * 1024), 3),
        })
    return {
        "cpu": sorted(rows, key=lambda item: item["cpu_millicores"], reverse=True)[:limit],
        "memory": sorted(rows, key=lambda item: item["memory_mib"], reverse=True)[:limit],
    }


def _node_ready(status: dict) -> bool:
    for condition in status.get("conditions") or []:
        if condition.get("type") == "Ready":
            return condition.get("status") == "True"
    return False


def _usage_percent(usage: str | None, allocatable: str | None, kind: str) -> float | None:
    if not usage or not allocatable:
        return None
    used = _parse_cpu(usage) if kind == "cpu" else _parse_memory(usage)
    capacity = _parse_cpu(allocatable) if kind == "cpu" else _parse_memory(allocatable)
    if capacity <= 0:
        return None
    return round(min((used / capacity) * 100, 999.999), 3)


def _parse_cpu(value: str | None) -> float:
    if not value:
        return 0
    value = str(value)
    if value.endswith("n"):
        return float(value[:-1]) / 1_000_000
    if value.endswith("u"):
        return float(value[:-1]) / 1_000
    if value.endswith("m"):
        return float(value[:-1])
    return float(value) * 1000


def _parse_memory(value: str | None) -> float:
    if not value:
        return 0
    value = str(value)
    units = {
        "Ki": 1024,
        "Mi": 1024 ** 2,
        "Gi": 1024 ** 3,
        "Ti": 1024 ** 4,
        "K": 1000,
        "M": 1000 ** 2,
        "G": 1000 ** 3,
    }
    for suffix, multiplier in units.items():
        if value.endswith(suffix):
            return float(value[:-len(suffix)]) * multiplier
    return float(value)


def _optional_get(client, path: str) -> dict | None:
    try:
        return client.get(path)
    except Exception:
        return None

