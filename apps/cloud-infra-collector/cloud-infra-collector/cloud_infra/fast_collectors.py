from datetime import timedelta

from cloud_infra.status import section_status, worst_status
from cloud_infra.time_utils import format_utc, parse_utc


def collect_fast(config: dict, now) -> dict:
    backend_runtime = _collect_backend_runtime(config, now)
    datastores = _collect_datastores(config, now)
    data_pipeline = _collect_data_pipeline(config, now)
    factory_freshness = _collect_factory_freshness(config, now)
    errors = _section_errors(backend_runtime, datastores, data_pipeline, factory_freshness)

    return {
        "backend_runtime": backend_runtime,
        "datastores": datastores,
        "data_pipeline": data_pipeline,
        "factory_freshness": factory_freshness,
        "errors": errors,
    }


def _collect_backend_runtime(config: dict, now) -> dict:
    errors: list[dict] = []
    ecs = _safe(
        "ecs",
        lambda: _ecs_summary(config),
        errors,
        {
            "cluster_name": config["ecs_cluster_name"],
            "service_name": config["ecs_service_name"],
        },
        now,
    )
    ecs_metrics = _safe("ecs_cloudwatch", lambda: _ecs_metrics(config, now), errors, {}, now)
    ecs.update(ecs_metrics)

    alb = _safe(
        "alb",
        lambda: _alb_summary(config, now),
        errors,
        {"target_group_name": config["target_group_name"]},
        now,
    )
    cloudfront = _safe(
        "cloudfront",
        lambda: _cloudfront_summary(config, now),
        errors,
        {"distribution_id": config["cloudfront_distribution_id"]},
        now,
    )

    ecs_status = _ecs_status(ecs, config)
    alb_status = _alb_status(alb, config)
    cloudfront_status = _cloudfront_status(cloudfront, config)
    reasons = _backend_reasons(ecs, alb, cloudfront, config)
    return {
        "status": "unknown" if errors else section_status(ecs_status, alb_status, cloudfront_status),
        "reasons": [] if errors else reasons,
        "errors": errors,
        "ecs": ecs,
        "alb": alb,
        "cloudfront": cloudfront,
    }


def _ecs_summary(config: dict) -> dict:
    client = _boto3_client("ecs")
    response = client.describe_services(
        cluster=config["ecs_cluster_name"],
        services=[config["ecs_service_name"]],
    )
    failures = response.get("failures") or []
    services = response.get("services") or []
    if failures or not services:
        return {
            "cluster_name": config["ecs_cluster_name"],
            "service_name": config["ecs_service_name"],
            "desired_count": 0,
            "running_count": 0,
            "pending_count": 0,
            "status": "UNKNOWN",
            "failures": failures,
        }
    service = services[0]
    return {
        "cluster_name": config["ecs_cluster_name"],
        "service_name": config["ecs_service_name"],
        "status": service.get("status"),
        "desired_count": service.get("desiredCount", 0),
        "running_count": service.get("runningCount", 0),
        "pending_count": service.get("pendingCount", 0),
    }


def _ecs_metrics(config: dict, now) -> dict:
    queries = [
        _metric_query("ecs_cpu_avg", "AWS/ECS", "CPUUtilization", "Average", [
            {"Name": "ClusterName", "Value": config["ecs_cluster_name"]},
            {"Name": "ServiceName", "Value": config["ecs_service_name"]},
        ]),
        _metric_query("ecs_cpu_max", "AWS/ECS", "CPUUtilization", "Maximum", [
            {"Name": "ClusterName", "Value": config["ecs_cluster_name"]},
            {"Name": "ServiceName", "Value": config["ecs_service_name"]},
        ]),
        _metric_query("ecs_mem_avg", "AWS/ECS", "MemoryUtilization", "Average", [
            {"Name": "ClusterName", "Value": config["ecs_cluster_name"]},
            {"Name": "ServiceName", "Value": config["ecs_service_name"]},
        ]),
        _metric_query("ecs_mem_max", "AWS/ECS", "MemoryUtilization", "Maximum", [
            {"Name": "ClusterName", "Value": config["ecs_cluster_name"]},
            {"Name": "ServiceName", "Value": config["ecs_service_name"]},
        ]),
    ]
    values = _get_metric_values(queries, now, config["metric_window_minutes"])
    return {
        "cpu_utilization_avg": values.get("ecs_cpu_avg"),
        "cpu_utilization_max": values.get("ecs_cpu_max"),
        "memory_utilization_avg": values.get("ecs_mem_avg"),
        "memory_utilization_max": values.get("ecs_mem_max"),
    }


def _alb_summary(config: dict, now) -> dict:
    elbv2 = _boto3_client("elbv2")
    response = elbv2.describe_target_groups(Names=[config["target_group_name"]])
    target_group = response["TargetGroups"][0]
    target_group_arn = target_group["TargetGroupArn"]
    target_group_label = _arn_suffix(target_group_arn, "targetgroup/")
    load_balancer_arns = target_group.get("LoadBalancerArns") or []
    load_balancer_label = None
    if load_balancer_arns:
        load_balancer_label = _arn_suffix(load_balancer_arns[0], "loadbalancer/")

    health = elbv2.describe_target_health(TargetGroupArn=target_group_arn)
    descriptions = health.get("TargetHealthDescriptions", [])
    healthy = sum(1 for item in descriptions if (item.get("TargetHealth") or {}).get("State") == "healthy")
    unhealthy = sum(1 for item in descriptions if (item.get("TargetHealth") or {}).get("State") != "healthy")
    alb = {
        "target_group_name": config["target_group_name"],
        "target_group_arn": target_group_arn,
        "healthy_host_count": healthy,
        "unhealthy_host_count": unhealthy,
    }

    if load_balancer_label:
        dimensions = [
            {"Name": "TargetGroup", "Value": target_group_label},
            {"Name": "LoadBalancer", "Value": load_balancer_label},
        ]
        values = _get_metric_values([
            _metric_query("alb_5xx", "AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "Sum", dimensions),
            _metric_query("alb_latency_avg", "AWS/ApplicationELB", "TargetResponseTime", "Average", dimensions),
            _metric_query("alb_latency_p95", "AWS/ApplicationELB", "TargetResponseTime", "p95", dimensions),
        ], now, config["metric_window_minutes"])
        alb.update({
            "target_5xx_count_5m": int(values.get("alb_5xx") or 0),
            "target_response_time_avg": values.get("alb_latency_avg"),
            "target_response_time_p95": values.get("alb_latency_p95"),
            "target_response_time_avg_seconds": values.get("alb_latency_avg"),
            "target_response_time_p95_seconds": values.get("alb_latency_p95"),
        })
    return alb


def _cloudfront_summary(config: dict, now) -> dict:
    distribution_id = config.get("cloudfront_distribution_id")
    if not distribution_id:
        return {"distribution_id": None, "error_rate_5xx_5m": None}
    dimensions = [
        {"Name": "DistributionId", "Value": distribution_id},
        {"Name": "Region", "Value": "Global"},
    ]
    values = _get_metric_values([
        _metric_query("cloudfront_5xx", "AWS/CloudFront", "5xxErrorRate", "Average", dimensions),
    ], now, config["metric_window_minutes"], region_name="us-east-1")
    return {
        "distribution_id": distribution_id,
        "error_rate_5xx_5m": values.get("cloudfront_5xx") or 0.0,
    }


def _collect_datastores(config: dict, now) -> dict:
    errors: list[dict] = []
    redis = _safe(
        "elasticache",
        lambda: _redis_summary(config, now),
        errors,
        {"replication_group_id": config["redis_replication_group_id"]},
        now,
    )
    rds = _safe(
        "rds",
        lambda: _rds_summary(config, now),
        errors,
        {"db_instance_id": config["rds_db_instance_id"]},
        now,
    )
    redis_status = _redis_status(redis, config)
    rds_status = _rds_status(rds, config)
    reasons = _datastore_reasons(redis, rds, config)
    return {
        "status": "unknown" if errors else section_status(redis_status, rds_status),
        "reasons": [] if errors else reasons,
        "errors": errors,
        "redis": redis,
        "rds": rds,
    }


def _redis_summary(config: dict, now) -> dict:
    replication_group_id = config["redis_replication_group_id"]
    client = _boto3_client("elasticache")
    response = client.describe_replication_groups(ReplicationGroupId=replication_group_id)
    group = response["ReplicationGroups"][0]
    member_clusters = group.get("MemberClusters") or []
    values = _redis_metric_values(member_clusters, now, config["metric_window_minutes"])
    return {
        "replication_group_id": replication_group_id,
        "status": group.get("Status"),
        "node_count": len(member_clusters),
        "cpu_utilization_avg": _avg_present(values.get("cpu") or []),
        "memory_usage_percent": _avg_present(values.get("memory_usage_percent") or []),
        "freeable_memory_mib": _bytes_to_mib(_sum_present(values.get("memory") or [])),
        "current_connections": _int_or_none(_sum_present(values.get("connections") or [])),
        "evictions_5m": int(_sum_present(values.get("evictions") or []) or 0),
    }


def _redis_metric_values(member_clusters: list[str], now, minutes: int) -> dict:
    queries = []
    lookup: dict[str, str] = {}
    for index, cluster_id in enumerate(member_clusters):
        dimensions = [
            {"Name": "CacheClusterId", "Value": cluster_id},
            {"Name": "CacheNodeId", "Value": "0001"},
        ]
        for field, metric_name, stat in [
            ("cpu", "EngineCPUUtilization", "Average"),
            ("memory_usage_percent", "DatabaseMemoryUsagePercentage", "Average"),
            ("memory", "FreeableMemory", "Average"),
            ("connections", "CurrConnections", "Average"),
            ("evictions", "Evictions", "Sum"),
        ]:
            metric_id = f"redis_{field}_{index}"
            lookup[metric_id] = field
            queries.append(_metric_query(metric_id, "AWS/ElastiCache", metric_name, stat, dimensions))
    raw = _get_metric_values(queries, now, minutes) if queries else {}
    result = {"cpu": [], "memory_usage_percent": [], "memory": [], "connections": [], "evictions": []}
    for metric_id, value in raw.items():
        result[lookup[metric_id]].append(value)
    return result


def _rds_summary(config: dict, now) -> dict:
    db_instance_id = config["rds_db_instance_id"]
    client = _boto3_client("rds")
    response = client.describe_db_instances(DBInstanceIdentifier=db_instance_id)
    instance = response["DBInstances"][0]
    dimensions = [{"Name": "DBInstanceIdentifier", "Value": db_instance_id}]
    values = _get_metric_values([
        _metric_query("rds_cpu", "AWS/RDS", "CPUUtilization", "Average", dimensions),
        _metric_query("rds_connections", "AWS/RDS", "DatabaseConnections", "Average", dimensions),
        _metric_query("rds_memory", "AWS/RDS", "FreeableMemory", "Average", dimensions),
        _metric_query("rds_storage", "AWS/RDS", "FreeStorageSpace", "Average", dimensions),
    ], now, config["metric_window_minutes"])
    return {
        "db_instance_id": db_instance_id,
        "status": instance.get("DBInstanceStatus"),
        "cpu_utilization_avg": values.get("rds_cpu"),
        "database_connections": _int_or_none(values.get("rds_connections")),
        "freeable_memory_mib": _bytes_to_mib(values.get("rds_memory")),
        "free_storage_mib": _bytes_to_mib(values.get("rds_storage")),
        "allocated_storage_gib": instance.get("AllocatedStorage"),
        "max_allocated_storage_gib": instance.get("MaxAllocatedStorage"),
    }


def _collect_data_pipeline(config: dict, now) -> dict:
    errors: list[dict] = []
    lambdas = _safe("lambda_cloudwatch", lambda: _lambda_summaries(config, now), errors, [], now)
    dynamodb = _safe("dynamodb_cloudwatch", lambda: _dynamodb_summary(config, now), errors, {
        "table_name": config["dynamodb_table_name"],
    }, now)
    dlq = _safe(
        "sqs_dlq_cloudwatch",
        lambda: _dlq_summary(config, now),
        errors,
        {"queue_name": config["dlq_queue_name"]},
        now,
    )
    schedulers = _safe("scheduler", lambda: _scheduler_summaries(config), errors, [], now)
    status = worst_status([
        _lambda_status(item) for item in lambdas
    ] + [_dynamodb_status(dynamodb), _dlq_status(dlq), _scheduler_status(schedulers)])
    return {
        "status": "unknown" if errors else status,
        "reasons": [] if errors else _data_pipeline_reasons(lambdas, dynamodb, dlq, schedulers),
        "errors": errors,
        "lambdas": lambdas,
        "dynamodb": dynamodb,
        "dlq": dlq,
        "schedulers": schedulers,
    }


def _lambda_summaries(config: dict, now) -> list[dict]:
    result = []
    for name in config["lambda_function_names"]:
        dimensions = [{"Name": "FunctionName", "Value": name}]
        values = _get_metric_values([
            _metric_query(f"{_safe_metric_id(name)}_inv", "AWS/Lambda", "Invocations", "Sum", dimensions),
            _metric_query(f"{_safe_metric_id(name)}_err", "AWS/Lambda", "Errors", "Sum", dimensions),
            _metric_query(f"{_safe_metric_id(name)}_thr", "AWS/Lambda", "Throttles", "Sum", dimensions),
            _metric_query(f"{_safe_metric_id(name)}_dur", "AWS/Lambda", "Duration", "p95", dimensions),
        ], now, config["metric_window_minutes"])
        prefix = _safe_metric_id(name)
        result.append({
            "name": name,
            "invocations_5m": int(values.get(f"{prefix}_inv") or 0),
            "errors_5m": int(values.get(f"{prefix}_err") or 0),
            "throttles_5m": int(values.get(f"{prefix}_thr") or 0),
            "duration_p95_ms": values.get(f"{prefix}_dur"),
        })
    return result


def _dynamodb_summary(config: dict, now) -> dict:
    dimensions = [{"Name": "TableName", "Value": config["dynamodb_table_name"]}]
    values = _get_metric_values([
        _metric_query("ddb_read_throttle", "AWS/DynamoDB", "ReadThrottleEvents", "Sum", dimensions),
        _metric_query("ddb_write_throttle", "AWS/DynamoDB", "WriteThrottleEvents", "Sum", dimensions),
        _metric_query("ddb_system_errors", "AWS/DynamoDB", "SystemErrors", "Sum", dimensions),
    ], now, config["metric_window_minutes"])
    return {
        "table_name": config["dynamodb_table_name"],
        "read_throttle_events_5m": int(values.get("ddb_read_throttle") or 0),
        "write_throttle_events_5m": int(values.get("ddb_write_throttle") or 0),
        "system_errors_5m": int(values.get("ddb_system_errors") or 0),
    }


def _dlq_summary(config: dict, now) -> dict:
    queue_name = config["dlq_queue_name"]
    dimensions = [{"Name": "QueueName", "Value": queue_name}]
    values = _get_metric_values([
        _metric_query("dlq_visible", "AWS/SQS", "ApproximateNumberOfMessagesVisible", "Average", dimensions),
        _metric_query("dlq_age", "AWS/SQS", "ApproximateAgeOfOldestMessage", "Maximum", dimensions),
    ], now, config["metric_window_minutes"])
    return {
        "queue_name": queue_name,
        "messages_visible": _int_or_none(values.get("dlq_visible")) or 0,
        "oldest_message_age_seconds": _int_or_none(values.get("dlq_age")) or 0,
    }


def _scheduler_summaries(config: dict) -> list[dict]:
    client = _boto3_client("scheduler")
    result = []
    for name in config["scheduler_names"]:
        response = client.get_schedule(Name=name)
        result.append({"name": name, "state": response.get("State", "UNKNOWN")})
    return result


def _collect_factory_freshness(config: dict, now) -> dict:
    from cloud_infra import dynamo

    errors: list[dict] = []
    factories = []
    for factory_id in config["factory_ids"]:
        try:
            latest = dynamo.get_factory_latest(factory_id)
            factories.append(_factory_summary(factory_id, latest))
        except Exception as exc:
            errors.append(_error_item("dynamodb:GetItem", exc, now, factory_id=factory_id))
            factories.append({"factory_id": factory_id, "status": "unknown"})
    return {
        "status": "unknown" if errors else worst_status([item.get("pipeline_status") or item.get("status") for item in factories]),
        "reasons": [] if errors else _factory_freshness_reasons(factories),
        "errors": errors,
        "factories": factories,
    }


def _factory_summary(factory_id: str, latest: dict) -> dict:
    pipeline = latest.get("pipeline_status") or {}
    risk = latest.get("risk") or {}
    return {
        "factory_id": factory_id,
        "pipeline_status": pipeline.get("status", "unknown"),
        "latest_infra_state_age_seconds": pipeline.get("latest_infra_state_age_seconds"),
        "last_infra_state_at": latest.get("last_infra_state_at"),
        "risk_score": risk.get("score"),
        "risk_level": risk.get("level"),
        "top_causes": risk.get("top_causes") or [],
    }


def _get_metric_values(queries: list[dict], now, minutes: int, region_name: str | None = None) -> dict:
    client = _boto3_client("cloudwatch", region_name=region_name)
    response = client.get_metric_data(
        MetricDataQueries=queries,
        StartTime=now - timedelta(minutes=minutes),
        EndTime=now,
        ScanBy="TimestampDescending",
    )
    values = {}
    for item in response.get("MetricDataResults", []):
        metric_values = item.get("Values") or []
        values[item["Id"]] = round(float(metric_values[0]), 4) if metric_values else None
    return values


def _metric_query(metric_id: str, namespace: str, metric_name: str, stat: str, dimensions: list[dict]) -> dict:
    return {
        "Id": metric_id,
        "MetricStat": {
            "Metric": {
                "Namespace": namespace,
                "MetricName": metric_name,
                "Dimensions": dimensions,
            },
            "Period": 60,
            "Stat": stat,
        },
        "ReturnData": True,
    }


def _ecs_status(ecs: dict, config: dict) -> str:
    desired = int(ecs.get("desired_count") or 0)
    running = int(ecs.get("running_count") or 0)
    if desired > 0 and running == 0:
        return "critical"
    if running < desired:
        return "warning"
    if (ecs.get("cpu_utilization_max") or 0) >= config["ecs_cpu_warning_percent"]:
        return "warning"
    if (ecs.get("memory_utilization_max") or 0) >= config["ecs_memory_warning_percent"]:
        return "warning"
    return "normal"


def _alb_status(alb: dict, config: dict) -> str:
    healthy = int(alb.get("healthy_host_count") or 0)
    if healthy == 0:
        return "critical"
    if int(alb.get("target_5xx_count_5m") or 0) > 0:
        return "warning"
    if (alb.get("target_response_time_p95") or alb.get("target_response_time_avg") or 0) >= config["alb_latency_warning_seconds"]:
        return "warning"
    return "normal"


def _cloudfront_status(cloudfront: dict, config: dict) -> str:
    if (cloudfront.get("error_rate_5xx_5m") or 0) >= config["cloudfront_5xx_warning_percent"]:
        return "warning"
    return "normal"


def _redis_status(redis: dict, config: dict) -> str:
    if redis.get("status") and redis.get("status") != "available":
        return "critical"
    if (redis.get("cpu_utilization_avg") or 0) >= config["redis_cpu_warning_percent"]:
        return "warning"
    freeable = redis.get("freeable_memory_mib")
    if freeable is not None and freeable < config["redis_freeable_memory_warning_mib"]:
        return "warning"
    if int(redis.get("evictions_5m") or 0) > 0:
        return "warning"
    return "normal"


def _rds_status(rds: dict, config: dict) -> str:
    if rds.get("status") and rds.get("status") != "available":
        return "critical"
    if (rds.get("cpu_utilization_avg") or 0) >= config["rds_cpu_warning_percent"]:
        return "warning"
    free_storage = rds.get("free_storage_mib")
    if free_storage is not None and free_storage < config["rds_free_storage_warning_mib"]:
        return "warning"
    return "normal"


def _lambda_status(item: dict) -> str:
    if int(item.get("errors_5m") or 0) > 0 or int(item.get("throttles_5m") or 0) > 0:
        return "warning"
    return "normal"


def _dynamodb_status(item: dict) -> str:
    if int(item.get("system_errors_5m") or 0) > 0:
        return "critical"
    if int(item.get("read_throttle_events_5m") or 0) > 0 or int(item.get("write_throttle_events_5m") or 0) > 0:
        return "warning"
    return "normal"


def _dlq_status(item: dict) -> str:
    if int(item.get("messages_visible") or 0) > 0:
        return "warning"
    return "normal"


def _scheduler_status(items: list[dict]) -> str:
    if not items:
        return "unknown"
    disabled = [item for item in items if item.get("state") != "ENABLED"]
    return "warning" if disabled else "normal"


def _backend_reasons(ecs: dict, alb: dict, cloudfront: dict, config: dict) -> list[str]:
    reasons = []
    desired = int(ecs.get("desired_count") or 0)
    running = int(ecs.get("running_count") or 0)
    if desired > 0 and running == 0:
        reasons.append("ecs_running_count=0")
    elif running < desired:
        reasons.append("ecs_running_count<desired_count")
    if (ecs.get("cpu_utilization_max") or 0) >= config["ecs_cpu_warning_percent"]:
        reasons.append("ecs_cpu_utilization_max>=threshold")
    if (ecs.get("memory_utilization_max") or 0) >= config["ecs_memory_warning_percent"]:
        reasons.append("ecs_memory_utilization_max>=threshold")
    if int(alb.get("healthy_host_count") or 0) == 0:
        reasons.append("alb_healthy_host_count=0")
    if int(alb.get("target_5xx_count_5m") or 0) > 0:
        reasons.append("alb_target_5xx_count_5m>0")
    if (alb.get("target_response_time_p95") or alb.get("target_response_time_avg") or 0) >= config["alb_latency_warning_seconds"]:
        reasons.append("alb_target_response_time>=threshold")
    if (cloudfront.get("error_rate_5xx_5m") or 0) >= config["cloudfront_5xx_warning_percent"]:
        reasons.append("cloudfront_5xx_error_rate>=threshold")
    return reasons


def _datastore_reasons(redis: dict, rds: dict, config: dict) -> list[str]:
    reasons = []
    if redis.get("status") and redis.get("status") != "available":
        reasons.append("redis_status!=available")
    if (redis.get("cpu_utilization_avg") or 0) >= config["redis_cpu_warning_percent"]:
        reasons.append("redis_cpu_utilization_avg>=threshold")
    freeable = redis.get("freeable_memory_mib")
    if freeable is not None and freeable < config["redis_freeable_memory_warning_mib"]:
        reasons.append("redis_freeable_memory_low")
    if int(redis.get("evictions_5m") or 0) > 0:
        reasons.append("redis_evictions_5m>0")
    if rds.get("status") and rds.get("status") != "available":
        reasons.append("rds_status!=available")
    if (rds.get("cpu_utilization_avg") or 0) >= config["rds_cpu_warning_percent"]:
        reasons.append("rds_cpu_utilization_avg>=threshold")
    free_storage = rds.get("free_storage_mib")
    if free_storage is not None and free_storage < config["rds_free_storage_warning_mib"]:
        reasons.append("rds_free_storage_low")
    return reasons


def _data_pipeline_reasons(lambdas: list[dict], dynamodb: dict, dlq: dict, schedulers: list[dict]) -> list[str]:
    reasons = []
    for item in lambdas:
        name = item.get("name", "unknown")
        if int(item.get("errors_5m") or 0) > 0:
            reasons.append(f"lambda_errors_5m>0:{name}")
        if int(item.get("throttles_5m") or 0) > 0:
            reasons.append(f"lambda_throttles_5m>0:{name}")
    if int(dynamodb.get("system_errors_5m") or 0) > 0:
        reasons.append("dynamodb_system_errors_5m>0")
    if int(dynamodb.get("read_throttle_events_5m") or 0) > 0:
        reasons.append("dynamodb_read_throttle_events_5m>0")
    if int(dynamodb.get("write_throttle_events_5m") or 0) > 0:
        reasons.append("dynamodb_write_throttle_events_5m>0")
    if int(dlq.get("messages_visible") or 0) > 0:
        reasons.append("dlq_messages_visible>0")
    for item in schedulers:
        if item.get("state") != "ENABLED":
            reasons.append(f"scheduler_disabled:{item.get('name', 'unknown')}")
    return reasons


def _factory_freshness_reasons(factories: list[dict]) -> list[str]:
    reasons = []
    for item in factories:
        status = item.get("pipeline_status") or item.get("status")
        if status and status != "normal":
            reasons.append(f"factory_pipeline_status:{item.get('factory_id', 'unknown')}={status}")
    return reasons


def _section_errors(*sections: dict) -> list[dict]:
    errors = []
    for section in sections:
        errors.extend(section.get("errors") or [])
    return errors


def _safe(collector: str, func, errors: list[dict], fallback, now=None):
    try:
        return func()
    except Exception as exc:
        errors.append(_error_item(collector, exc, now))
        if isinstance(fallback, dict):
            return {**fallback, "status": "unknown"}
        return fallback


def _error_item(source: str, exc: Exception, now=None, **extra) -> dict:
    code = None
    response = getattr(exc, "response", None)
    if isinstance(response, dict):
        code = (response.get("Error") or {}).get("Code")
    item = {
        "source": source,
        "message": str(exc),
    }
    if code:
        item["code"] = code
    if now is not None:
        item["at"] = format_utc(now)
    item.update(extra)
    return item


def _bytes_to_mib(value) -> float | None:
    if value is None:
        return None
    return round(float(value) / 1024 / 1024, 2)


def _avg_present(values: list) -> float | None:
    present = [float(value) for value in values if value is not None]
    if not present:
        return None
    return round(sum(present) / len(present), 4)


def _sum_present(values: list) -> float | None:
    present = [float(value) for value in values if value is not None]
    if not present:
        return None
    return round(sum(present), 4)


def _int_or_none(value):
    if value is None:
        return None
    return int(round(float(value)))


def _arn_suffix(arn: str, marker: str) -> str:
    return arn.split(marker, 1)[1]


def _safe_metric_id(name: str) -> str:
    chars = [char.lower() if char.isalnum() else "_" for char in name]
    result = "".join(chars).strip("_")
    if not result or not result[0].isalpha():
        result = f"m_{result}"
    return result[:100]


def _boto3_client(service: str, region_name: str | None = None):
    import boto3

    if region_name:
        return boto3.client(service, region_name=region_name)
    return boto3.client(service)
