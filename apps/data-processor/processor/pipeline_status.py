from datetime import datetime, timezone

# Thresholds align with the dashboard staleness contract:
# warning after 60s, critical after 120s.
_WARNING_SECONDS = 60
_CRITICAL_SECONDS = 120


def calculate(last_infra_state_at: str | None, now: datetime | None = None) -> dict:
    if now is None:
        now = datetime.now(timezone.utc)

    if last_infra_state_at is None:
        return {"status": "critical", "latest_infra_state_age_seconds": None}

    try:
        last_seen = datetime.fromisoformat(last_infra_state_at.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return {"status": "critical", "latest_infra_state_age_seconds": None}

    age = int((now - last_seen).total_seconds())

    if age > _CRITICAL_SECONDS:
        status = "critical"
    elif age > _WARNING_SECONDS:
        status = "warning"
    else:
        status = "normal"

    return {"status": status, "latest_infra_state_age_seconds": age}
