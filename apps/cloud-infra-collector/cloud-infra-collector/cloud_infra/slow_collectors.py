from datetime import timedelta

from cloud_infra.k8s_client import cluster_client
from cloud_infra.k8s_metrics import kubernetes_summary
from cloud_infra.status import section_status, worst_status
from cloud_infra.time_utils import format_utc


def collect_slow(config: dict, now) -> dict:
    errors = []
    eks_management = _collect_eks_management(config, errors)
    storage_freshness = _collect_storage_freshness(config, now, errors)
    return {
        "eks_management": eks_management,
        "storage_freshness": storage_freshness,
        "errors": errors,
    }


def _collect_eks_management(config: dict, errors: list[dict]) -> dict:
    cluster = _safe("eks_cluster", lambda: _cluster_summary(config), errors, {
        "name": config["eks_cluster_name"],
        "status": "UNKNOWN",
    })
    nodegroups = _safe("eks_nodegroups", lambda: _nodegroup_summaries(config), errors, [])
    asg = _safe("autoscaling", lambda: _asg_summary(nodegroups), errors, {
        "groups": [],
        "desired_capacity": 0,
        "healthy_instances": 0,
        "total_instances": 0,
    })
    kubernetes = _safe("kubernetes_api", lambda: _kubernetes_summary(config, cluster), errors, _empty_kubernetes_summary())
    cluster_public = dict(cluster)
    cluster_public.pop("certificate_authority_data", None)
    cluster_public.pop("endpoint", None)
    return {
        "status": section_status(_cluster_status(cluster), _nodegroups_status(nodegroups), _asg_status(asg), kubernetes.get("status")),
        "cluster": cluster_public,
        "nodegroups": nodegroups,
        "autoscaling": asg,
        **kubernetes,
    }


def _cluster_summary(config: dict) -> dict:
    client = _boto3_client("eks")
    cluster = client.describe_cluster(name=config["eks_cluster_name"])["cluster"]
    return {
        "name": cluster.get("name"),
        "status": cluster.get("status"),
        "version": cluster.get("version"),
        "endpoint": cluster.get("endpoint"),
        "certificate_authority_data": (cluster.get("certificateAuthority") or {}).get("data"),
        "created_at": _format_optional_time(cluster.get("createdAt")),
    }


def _nodegroup_summaries(config: dict) -> list[dict]:
    client = _boto3_client("eks")
    names = client.list_nodegroups(clusterName=config["eks_cluster_name"]).get("nodegroups") or []
    result = []
    for name in names:
        nodegroup = client.describe_nodegroup(clusterName=config["eks_cluster_name"], nodegroupName=name)["nodegroup"]
        scaling = nodegroup.get("scalingConfig") or {}
        health = nodegroup.get("health") or {}
        result.append({
            "name": nodegroup.get("nodegroupName"),
            "status": nodegroup.get("status"),
            "desired_size": scaling.get("desiredSize"),
            "min_size": scaling.get("minSize"),
            "max_size": scaling.get("maxSize"),
            "instance_types": nodegroup.get("instanceTypes") or [],
            "capacity_type": nodegroup.get("capacityType"),
            "health_issues": health.get("issues") or [],
            "autoscaling_groups": [
                item.get("name")
                for item in ((nodegroup.get("resources") or {}).get("autoScalingGroups") or [])
                if item.get("name")
            ],
        })
    return result


def _asg_summary(nodegroups: list[dict]) -> dict:
    names = sorted({
        asg_name
        for nodegroup in nodegroups
        for asg_name in nodegroup.get("autoscaling_groups", [])
    })
    if not names:
        return {
            "groups": [],
            "desired_capacity": 0,
            "healthy_instances": 0,
            "total_instances": 0,
        }
    client = _boto3_client("autoscaling")
    groups = client.describe_auto_scaling_groups(AutoScalingGroupNames=names).get("AutoScalingGroups") or []
    summaries = []
    healthy = 0
    total = 0
    desired = 0
    for group in groups:
        instances = group.get("Instances") or []
        group_healthy = sum(1 for item in instances if item.get("HealthStatus") == "Healthy")
        healthy += group_healthy
        total += len(instances)
        desired += int(group.get("DesiredCapacity") or 0)
        summaries.append({
            "name": group.get("AutoScalingGroupName"),
            "desired_capacity": group.get("DesiredCapacity"),
            "min_size": group.get("MinSize"),
            "max_size": group.get("MaxSize"),
            "healthy_instances": group_healthy,
            "total_instances": len(instances),
        })
    return {
        "groups": summaries,
        "desired_capacity": desired,
        "healthy_instances": healthy,
        "total_instances": total,
    }


def _collect_storage_freshness(config: dict, now, errors: list[dict]) -> dict:
    factories = []
    for factory_id in config["factory_ids"]:
        try:
            factories.append(_factory_storage_summary(config, factory_id, now))
        except Exception as exc:
            errors.append({"collector": "storage_freshness", "factory_id": factory_id, "error": str(exc)})
            factories.append({"factory_id": factory_id, "status": "unknown"})
    return {
        "status": worst_status([item.get("status") for item in factories]),
        "factories": factories,
    }


def _kubernetes_summary(config: dict, cluster: dict) -> dict:
    client = cluster_client(config, cluster)
    summary = kubernetes_summary(
        client,
        argocd_namespace=config["argocd_namespace"],
        top_pods_limit=config["k8s_top_pods_limit"],
    )
    return {
        "nodes": summary["nodes"],
        "pods": summary["pods"],
        "argocd": summary["argocd"],
        "status": summary["status"],
    }


def _empty_kubernetes_summary() -> dict:
    return {
        "status": "unknown",
        "nodes": {"status": "unknown", "ready": 0, "total": 0, "items": []},
        "pods": {
            "status": "unknown",
            "running": 0,
            "pending": 0,
            "failed": 0,
            "unknown": 0,
            "succeeded": 0,
            "restart_count_total": 0,
            "top_by_cpu": [],
            "top_by_memory": [],
        },
        "argocd": {
            "status": "unknown",
            "applications_total": 0,
            "synced": 0,
            "out_of_sync": 0,
            "healthy": 0,
            "degraded": 0,
            "apps": [],
        },
    }


def _factory_storage_summary(config: dict, factory_id: str, now) -> dict:
    latest_raw_at = _latest_raw_at(config, factory_id, now)
    latest_processed_at = _latest_processed_at(config, factory_id, now)
    latest_processed_agg_at = _latest_processed_agg_at(config, factory_id, now)
    return {
        "factory_id": factory_id,
        "status": _storage_status(latest_raw_at, latest_processed_at, latest_processed_agg_at),
        "latest_raw_at": latest_raw_at,
        "latest_processed_at": latest_processed_at,
        "latest_processed_agg_at": latest_processed_agg_at,
    }


def _latest_raw_at(config: dict, factory_id: str, now) -> str | None:
    latest_values = []
    for source_type in ("factory_state", "infra_state"):
        prefixes = [
            f"raw/{factory_id}/{source_type}/"
            f"yyyy={day.year:04d}/mm={day.month:02d}/dd={day.day:02d}/"
            for day in _recent_days(now, config["s3_latest_lookback_hours"])
        ]
        latest = _latest_object_time(config["bucket_name"], prefixes)
        if latest:
            latest_values.append(latest)
    return max(latest_values) if latest_values else None


def _latest_processed_at(config: dict, factory_id: str, now) -> str | None:
    prefixes = []
    for hour in _recent_hours(now, config["s3_latest_lookback_hours"]):
        prefixes.append(
            f"processed/{factory_id}/state_snapshot/"
            f"yyyy={hour.year:04d}/mm={hour.month:02d}/dd={hour.day:02d}/hh={hour.hour:02d}/"
        )
    return _latest_object_time(config["bucket_name"], prefixes)


def _latest_processed_agg_at(config: dict, factory_id: str, now) -> str | None:
    prefixes = []
    for hour in _recent_hours(now, config["s3_latest_lookback_hours"]):
        prefixes.append(
            f"processed_agg/{factory_id}/metrics_5m/"
            f"yyyy={hour.year:04d}/mm={hour.month:02d}/dd={hour.day:02d}/hh={hour.hour:02d}/"
        )
    return _latest_object_time(config["bucket_name"], prefixes)


def _latest_object_time(bucket_name: str, prefixes: list[str]) -> str | None:
    client = _boto3_client("s3")
    for prefix in prefixes:
        response = client.list_objects_v2(Bucket=bucket_name, Prefix=prefix, MaxKeys=1000)
        latest = None
        for item in response.get("Contents") or []:
            modified = item.get("LastModified")
            if modified and (latest is None or modified > latest):
                latest = modified
        if latest:
            return format_utc(latest)
    return None


def _cluster_status(cluster: dict) -> str:
    status = cluster.get("status")
    if status == "ACTIVE":
        return "normal"
    if status in {"CREATING", "UPDATING"}:
        return "warning"
    if status:
        return "critical"
    return "unknown"


def _nodegroups_status(nodegroups: list[dict]) -> str:
    if not nodegroups:
        return "unknown"
    statuses = []
    for nodegroup in nodegroups:
        if nodegroup.get("health_issues"):
            statuses.append("warning")
        elif nodegroup.get("status") == "ACTIVE":
            statuses.append("normal")
        elif nodegroup.get("status") in {"CREATING", "UPDATING"}:
            statuses.append("warning")
        else:
            statuses.append("critical")
    return worst_status(statuses)


def _asg_status(asg: dict) -> str:
    desired = int(asg.get("desired_capacity") or 0)
    healthy = int(asg.get("healthy_instances") or 0)
    if desired > 0 and healthy == 0:
        return "critical"
    if healthy < desired:
        return "warning"
    return "normal"


def _storage_status(latest_raw_at: str | None, latest_processed_at: str | None, latest_processed_agg_at: str | None) -> str:
    if not latest_raw_at and not latest_processed_at and not latest_processed_agg_at:
        return "unknown"
    if not latest_processed_at or not latest_processed_agg_at:
        return "warning"
    return "normal"


def _recent_hours(now, lookback_hours: int):
    current = now.replace(minute=0, second=0, microsecond=0)
    for offset in range(max(lookback_hours, 1)):
        yield current - timedelta(hours=offset)


def _recent_days(now, lookback_hours: int):
    seen = set()
    for hour in _recent_hours(now, lookback_hours):
        day = hour.replace(hour=0)
        key = day.date().isoformat()
        if key not in seen:
            seen.add(key)
            yield day


def _format_optional_time(value) -> str | None:
    return format_utc(value) if value else None


def _safe(collector: str, func, errors: list[dict], fallback):
    try:
        return func()
    except Exception as exc:
        errors.append({"collector": collector, "error": str(exc)})
        if isinstance(fallback, dict):
            return {**fallback, "status": "unknown"}
        return fallback


def _boto3_client(service: str):
    import boto3

    return boto3.client(service)
