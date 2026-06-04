import logging

from cloud_infra import dynamo, s3_writer
from cloud_infra.config import config
from cloud_infra.fast_collectors import collect_fast
from cloud_infra.time_utils import format_utc, utc_now


logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    event = event or {}
    cfg = {**config(), **event.get("config_overrides", {})}
    now = utc_now()
    now_iso = format_utc(now)
    write_dynamodb = bool(event.get("write_dynamodb", True))
    write_s3 = bool(event.get("write_s3", True))

    fast = collect_fast(cfg, now)
    history = None
    if write_dynamodb:
        history = dynamo.write_fast_snapshot(fast, now_iso, cfg["history_ttl_hours"])
    s3_key = None
    if write_s3 and history:
        s3_key = s3_writer.put_fast_snapshot(history)

    logger.info(
        "cloud infra fast collection done: backend=%s data_pipeline=%s factory_freshness=%s errors=%d",
        fast["backend_runtime"]["status"],
        fast["data_pipeline"]["status"],
        fast["factory_freshness"]["status"],
        len(fast.get("errors") or []),
    )
    return {
        "status": "ok",
        "updated_at": now_iso,
        "overall_status": history.get("overall_status") if history else None,
        "dynamodb_sk": history.get("sk") if history else None,
        "s3_key": s3_key,
        "errors": fast.get("errors") or [],
    }

