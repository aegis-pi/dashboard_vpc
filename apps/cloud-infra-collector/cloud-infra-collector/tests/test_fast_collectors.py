from cloud_infra.fast_collectors import (
    _alb_status,
    _collect_datastores,
    _data_pipeline_reasons,
    _dlq_status,
    _ecs_status,
    _factory_summary,
    _rds_status,
    _redis_status,
    _scheduler_status,
)


def test_backend_status_helpers():
    config = {
        "ecs_cpu_warning_percent": 85.0,
        "ecs_memory_warning_percent": 85.0,
        "alb_latency_warning_seconds": 1.0,
    }

    assert _ecs_status({"desired_count": 1, "running_count": 0}, config) == "critical"
    assert _ecs_status({"desired_count": 2, "running_count": 1}, config) == "warning"
    assert _ecs_status({"desired_count": 1, "running_count": 1, "cpu_utilization_max": 90}, config) == "warning"
    assert _ecs_status({"desired_count": 1, "running_count": 1}, config) == "normal"

    assert _alb_status({"healthy_host_count": 0}, config) == "critical"
    assert _alb_status({"healthy_host_count": 1, "target_5xx_count_5m": 1}, config) == "warning"
    assert _alb_status({"healthy_host_count": 1, "target_response_time_p95": 1.2}, config) == "warning"
    assert _alb_status({"healthy_host_count": 1}, config) == "normal"


def test_scheduler_and_factory_summary():
    assert _scheduler_status([{"state": "ENABLED"}]) == "normal"
    assert _scheduler_status([{"state": "DISABLED"}]) == "warning"

    summary = _factory_summary(
        "factory-a",
        {
            "last_infra_state_at": "2026-06-01T15:29:00Z",
            "pipeline_status": {"status": "critical", "latest_infra_state_age_seconds": 360},
            "risk": {"score": 0, "level": "danger", "top_causes": [{"field": "data_freshness"}]},
        },
    )
    assert summary["factory_id"] == "factory-a"
    assert summary["pipeline_status"] == "critical"
    assert summary["risk_level"] == "danger"


def test_datastore_status_helpers():
    config = {
        "redis_cpu_warning_percent": 85.0,
        "redis_freeable_memory_warning_mib": 128.0,
        "rds_cpu_warning_percent": 85.0,
        "rds_free_storage_warning_mib": 1024.0,
    }

    assert _redis_status({"status": "available", "cpu_utilization_avg": 1}, config) == "normal"
    assert _redis_status({"status": "modifying"}, config) == "critical"
    assert _redis_status({"status": "available", "cpu_utilization_avg": 90}, config) == "warning"
    assert _redis_status({"status": "available", "freeable_memory_mib": 64}, config) == "warning"
    assert _redis_status({"status": "available", "evictions_5m": 1}, config) == "warning"

    assert _rds_status({"status": "available", "cpu_utilization_avg": 1}, config) == "normal"
    assert _rds_status({"status": "stopped"}, config) == "critical"
    assert _rds_status({"status": "available", "cpu_utilization_avg": 90}, config) == "warning"
    assert _rds_status({"status": "available", "free_storage_mib": 512}, config) == "warning"

    assert _dlq_status({"messages_visible": 0}) == "normal"
    assert _dlq_status({"messages_visible": 1}) == "warning"


def test_data_pipeline_reasons_include_dlq_and_scheduler():
    reasons = _data_pipeline_reasons(
        [{"name": "processor", "errors_5m": 1, "throttles_5m": 0}],
        {"system_errors_5m": 0, "read_throttle_events_5m": 1, "write_throttle_events_5m": 0},
        {"messages_visible": 2},
        [{"name": "refresh", "state": "DISABLED"}],
    )

    assert "lambda_errors_5m>0:processor" in reasons
    assert "dynamodb_read_throttle_events_5m>0" in reasons
    assert "dlq_messages_visible>0" in reasons
    assert "scheduler_disabled:refresh" in reasons


def test_collect_datastores_marks_section_unknown_on_partial_failure(monkeypatch):
    import cloud_infra.fast_collectors as collectors

    monkeypatch.setattr(collectors, "_redis_summary", lambda config, now: {"status": "available"})

    def _raise(config, now):
        raise RuntimeError("rds denied")

    monkeypatch.setattr(collectors, "_rds_summary", _raise)
    datastores = _collect_datastores(
        {
            "redis_replication_group_id": "redis",
            "rds_db_instance_id": "rds",
            "redis_cpu_warning_percent": 85.0,
            "redis_freeable_memory_warning_mib": 128.0,
            "rds_cpu_warning_percent": 85.0,
            "rds_free_storage_warning_mib": 1024.0,
        },
        None,
    )

    assert datastores["status"] == "unknown"
    assert datastores["errors"][0]["source"] == "rds"
    assert datastores["rds"]["status"] == "unknown"
