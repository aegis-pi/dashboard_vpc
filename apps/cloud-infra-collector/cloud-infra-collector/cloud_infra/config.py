import os


def csv_env(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


def int_env(name: str, default: int) -> int:
    return int(os.environ.get(name, str(default)))


def float_env(name: str, default: float) -> float:
    return float(os.environ.get(name, str(default)))


def config() -> dict:
    return {
        "table_name": os.environ.get("DYNAMODB_TABLE_NAME", "AEGIS-DynamoDB-FactoryStatus"),
        "bucket_name": os.environ.get("S3_BUCKET_NAME", "aegis-bucket-data"),
        "aws_region": os.environ.get("AWS_REGION", "ap-south-1"),
        "history_ttl_hours": int_env("FAST_HISTORY_TTL_HOURS", 6),
        "slow_history_ttl_hours": int_env("SLOW_HISTORY_TTL_HOURS", 24),
        "metric_window_minutes": int_env("FAST_METRIC_WINDOW_MINUTES", 5),
        "s3_latest_lookback_hours": int_env("S3_LATEST_LOOKBACK_HOURS", 24),
        "k8s_top_pods_limit": int_env("K8S_TOP_PODS_LIMIT", 5),
        "ecs_cluster_name": os.environ.get("ECS_CLUSTER_NAME", "KJW-AEGIS-Data-ECSCluster"),
        "ecs_service_name": os.environ.get("ECS_SERVICE_NAME", "KJW-AEGIS-Data-Service-Backend"),
        "eks_cluster_name": os.environ.get("EKS_CLUSTER_NAME", "AEGIS-EKS"),
        "argocd_namespace": os.environ.get("ARGOCD_NAMESPACE", "argocd"),
        "target_group_name": os.environ.get("ALB_TARGET_GROUP_NAME", "kjw-aegis-data-tg-backend"),
        "cloudfront_distribution_id": os.environ.get("CLOUDFRONT_DISTRIBUTION_ID", "ETJBZLAO51AZW"),
        "redis_replication_group_id": os.environ.get("REDIS_REPLICATION_GROUP_ID", "kjw-aegis-data-redis"),
        "rds_db_instance_id": os.environ.get("RDS_DB_INSTANCE_ID", "kjw-aegis-data-pg"),
        "dlq_queue_name": os.environ.get("DLQ_QUEUE_NAME", "kjw-aegis-data-notifier-dlq"),
        "lambda_function_names": csv_env(
            "PIPELINE_LAMBDA_NAMES",
            "AEGIS-Lambda-DataProcessor,AEGIS-Lambda-GraphAggregator5m",
        ),
        "dynamodb_table_name": os.environ.get("MONITORED_DYNAMODB_TABLE_NAME", "AEGIS-DynamoDB-FactoryStatus"),
        "scheduler_names": csv_env(
            "SCHEDULER_NAMES",
            "AEGIS-Schedule-DataProcessorRefresh1m,AEGIS-Schedule-GraphAggregator5m",
        ),
        "factory_ids": csv_env("FACTORY_IDS", "factory-a,factory-b,factory-c"),
        "ecs_cpu_warning_percent": float_env("ECS_CPU_WARNING_PERCENT", 85.0),
        "ecs_memory_warning_percent": float_env("ECS_MEMORY_WARNING_PERCENT", 85.0),
        "alb_latency_warning_seconds": float_env("ALB_LATENCY_WARNING_SECONDS", 1.0),
        "redis_cpu_warning_percent": float_env("REDIS_CPU_WARNING_PERCENT", 85.0),
        "redis_freeable_memory_warning_mib": float_env("REDIS_FREEABLE_MEMORY_WARNING_MIB", 128.0),
        "rds_cpu_warning_percent": float_env("RDS_CPU_WARNING_PERCENT", 85.0),
        "rds_free_storage_warning_mib": float_env("RDS_FREE_STORAGE_WARNING_MIB", 1024.0),
        "cloudfront_5xx_warning_percent": float_env("CLOUDFRONT_5XX_WARNING_PERCENT", 1.0),
    }
