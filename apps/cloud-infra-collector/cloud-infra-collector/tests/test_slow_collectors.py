from datetime import datetime, timezone

from cloud_infra.slow_collectors import (
    _asg_status,
    _cluster_status,
    _nodegroups_status,
    _recent_days,
    _recent_hours,
    _storage_status,
)


def test_eks_status_helpers():
    assert _cluster_status({"status": "ACTIVE"}) == "normal"
    assert _cluster_status({"status": "UPDATING"}) == "warning"
    assert _cluster_status({"status": "FAILED"}) == "critical"
    assert _cluster_status({}) == "unknown"

    assert _nodegroups_status([{"status": "ACTIVE", "health_issues": []}]) == "normal"
    assert _nodegroups_status([{"status": "ACTIVE", "health_issues": [{"code": "x"}]}]) == "warning"
    assert _nodegroups_status([{"status": "DEGRADED", "health_issues": []}]) == "critical"
    assert _nodegroups_status([]) == "unknown"

    assert _asg_status({"desired_capacity": 2, "healthy_instances": 2}) == "normal"
    assert _asg_status({"desired_capacity": 2, "healthy_instances": 1}) == "warning"
    assert _asg_status({"desired_capacity": 2, "healthy_instances": 0}) == "critical"


def test_storage_status_and_limited_prefix_windows():
    assert _storage_status(None, None, None) == "unknown"
    assert _storage_status("2026-06-01T01:00:00Z", None, "2026-06-01T01:00:00Z") == "warning"
    assert _storage_status("2026-06-01T01:00:00Z", "2026-06-01T01:00:00Z", "2026-06-01T01:00:00Z") == "normal"

    now = datetime(2026, 6, 1, 1, 20, tzinfo=timezone.utc)
    hours = list(_recent_hours(now, 3))
    assert [item.hour for item in hours] == [1, 0, 23]

    days = list(_recent_days(now, 3))
    assert [item.date().isoformat() for item in days] == ["2026-06-01", "2026-05-31"]
