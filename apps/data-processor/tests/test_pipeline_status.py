from datetime import datetime, timedelta, timezone

from processor.pipeline_status import calculate


def _now():
    return datetime(2026, 5, 21, 12, 0, 0, tzinfo=timezone.utc)


def _ts(seconds_ago: int) -> str:
    dt = _now() - timedelta(seconds=seconds_ago)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def test_normal_fresh():
    result = calculate(_ts(10), _now())
    assert result["status"] == "normal"
    assert result["latest_infra_state_age_seconds"] == 10


def test_normal_boundary():
    result = calculate(_ts(40), _now())
    assert result["status"] == "normal"


def test_warning():
    result = calculate(_ts(55), _now())
    assert result["status"] == "warning"


def test_critical():
    result = calculate(_ts(90), _now())
    assert result["status"] == "critical"


def test_none_returns_critical():
    result = calculate(None, _now())
    assert result["status"] == "critical"
    assert result["latest_infra_state_age_seconds"] is None


def test_invalid_timestamp_returns_critical():
    result = calculate("not-a-timestamp", _now())
    assert result["status"] == "critical"
