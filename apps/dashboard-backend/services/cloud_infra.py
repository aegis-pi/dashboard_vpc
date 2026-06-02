from copy import deepcopy
from datetime import datetime, timezone

from services import ddb

FAST_STALE_SECONDS = 180
SLOW_STALE_SECONDS = 900


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _age_seconds(value: str | None, now: datetime) -> int | None:
    parsed = _parse_iso(value)
    if parsed is None:
        return None
    return max(0, int((now - parsed.astimezone(timezone.utc)).total_seconds()))


def _status_with_staleness(item: dict, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    result = deepcopy(item)

    fast_age = _age_seconds(result.get("fast_updated_at"), now)
    slow_age = _age_seconds(result.get("slow_updated_at"), now)
    fast_stale = fast_age is None or fast_age > FAST_STALE_SECONDS
    slow_stale = slow_age is None or slow_age > SLOW_STALE_SECONDS

    result["available"] = True
    result["fast_age_seconds"] = fast_age
    result["slow_age_seconds"] = slow_age
    result["fast_stale"] = fast_stale
    result["slow_stale"] = slow_stale
    result["stale_threshold_seconds"] = {
        "fast": FAST_STALE_SECONDS,
        "slow": SLOW_STALE_SECONDS,
    }

    if fast_stale and isinstance(result.get("fast"), dict):
        result["fast"]["status"] = "unknown"
    if slow_stale and isinstance(result.get("slow"), dict):
        result["slow"]["status"] = "unknown"
    if (fast_stale or slow_stale) and result.get("overall_status") == "normal":
        result["overall_status"] = "warning"

    return result


async def get_latest() -> dict:
    item = await ddb.get_cloud_infra_latest()
    if item is None:
        return {"available": False}
    return _status_with_staleness(item)


async def get_history(window: str = "1h", track: str = "fast", limit: int = 500) -> list[dict]:
    return await ddb.get_cloud_infra_history(window=window, track=track, max_items=limit)
