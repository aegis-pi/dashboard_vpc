def normalize_factory_state(payload: dict) -> dict:
    sensor = payload.get("sensor", {})
    ai = payload.get("ai_result", {})

    return {
        "aggregation_window_seconds": int(payload.get("aggregation_window_seconds", 0)),
        "temperature_celsius": _float(sensor.get("temperature_celsius_avg")),
        "humidity_percent": _float(sensor.get("humidity_percent_avg")),
        "pressure_hpa": _float(sensor.get("pressure_hpa_avg")),
        "sample_count": int(sensor.get("sample_count", 0)),
        "fire_score": _float(ai.get("fire_score")),
        "fall_score": _float(ai.get("fall_score")),
        "bend_score": _float(ai.get("bend_score")),
        "abnormal_sound": str(ai.get("abnormal_sound", "none")),
        "ai_sample_count": int(ai.get("sample_count", 0)),
    }


def normalize_infra_state(payload: dict) -> dict:
    heartbeat = payload.get("heartbeat", {})
    cluster = payload.get("cluster", {})
    nodes = payload.get("nodes", [])
    workloads = payload.get("workloads", [])
    devices = payload.get("devices", {})

    nodes_ready = sum(1 for n in nodes if n.get("status") == "Ready")
    pods_ready = sum(w.get("containers_ready", 0) for w in workloads)
    pods_total = sum(w.get("containers_total", 0) for w in workloads)

    return {
        "agent_status": str(heartbeat.get("agent_status", "unknown")),
        "last_successful_publish_at": heartbeat.get("last_successful_publish_at"),
        "publish_sequence": int(heartbeat.get("publish_sequence", 0)),
        "cluster_name": str(cluster.get("cluster_name", "")),
        "kubernetes_version": str(cluster.get("kubernetes_version", "")),
        "nodes_total": len(nodes),
        "nodes_ready": nodes_ready,
        "nodes": [_normalize_node(n) for n in nodes],
        "pods_ready": pods_ready,
        "pods_total": pods_total,
        "workloads": [_normalize_workload(w) for w in workloads],
        "devices": _normalize_devices(devices),
    }


def _normalize_node(node: dict) -> dict:
    return {
        "name": str(node.get("name", "")),
        "role": str(node.get("role", "")),
        "status": str(node.get("status", "Unknown")),
        "cpu_usage_percent": _float(node.get("cpu_usage_percent")),
        "memory_usage_percent": _float(node.get("memory_usage_percent")),
        "disk_usage_percent": _float(node.get("disk_usage_percent")),
    }


def _normalize_workload(w: dict) -> dict:
    return {
        "namespace": str(w.get("namespace", "")),
        "name": str(w.get("name", "")),
        "containers_ready": int(w.get("containers_ready", 0)),
        "containers_total": int(w.get("containers_total", 0)),
        "restart_count": int(w.get("restart_count", 0)),
    }


def _normalize_devices(devices: dict) -> dict:
    result = {}
    for name, info in devices.items():
        result[name] = {"status": str(info.get("status", "unknown"))}
    return result


def _float(value) -> float:
    try:
        return round(float(value), 4) if value is not None else 0.0
    except (TypeError, ValueError):
        return 0.0
