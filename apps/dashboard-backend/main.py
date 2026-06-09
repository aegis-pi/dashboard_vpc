import asyncio
import logging
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from routers import admin_users, auth_me, chat, cloud_infra, factories, reports, ws
from services import ddb
from services.metadata import check_metadata_db, ensure_metadata_schema
from services.redis_client import get_redis

app = FastAPI(title="Aegis Dashboard Backend", version="0.1.0")
settings = get_settings()
logger = logging.getLogger("aegis.dashboard_backend")
cors_allow_origins = [
    origin.strip()
    for origin in settings.cors_allow_origins.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(factories.router)
app.include_router(chat.router)
app.include_router(cloud_infra.router)
app.include_router(reports.router)
app.include_router(admin_users.router)
app.include_router(auth_me.router)
app.include_router(ws.router)


@app.middleware("http")
async def log_http_request(request: Request, call_next):
    started_at = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    except Exception:
        logger.exception("http_request_failed path=%s", request.url.path)
        raise
    finally:
        duration_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "http_request path=%s method=%s status=%s duration_ms=%.2f",
            request.url.path,
            request.method,
            status_code,
            duration_ms,
        )


@app.on_event("startup")
async def _warmup_ddb():
    """Establish DDB connection pool before ALB routes traffic.

    Prevents semaphore cascade failures on cold starts: without this,
    the first batch of concurrent requests each block on a slow cold-start
    DDB call, saturate the semaphore, and the entire semaphore budget is
    consumed by timeout waits — causing immediate 504s for all new requests.
    """
    settings = get_settings()
    try:
        await ensure_metadata_schema(settings)
        logger.info("metadata_schema ok")
    except Exception as exc:
        logger.warning("metadata_schema failed err=%s", exc)

    factory_ids = [f.strip() for f in settings.dashboard_factory_ids.split(",") if f.strip()]
    probe = factory_ids[0] if factory_ids else "factory-a"
    try:
        await ddb.get_factory_latest(probe)
        logger.info("ddb_warmup ok probe=%s", probe)
    except Exception as exc:
        logger.warning("ddb_warmup failed probe=%s err=%s", probe, exc)


@app.get("/healthz", tags=["health"])
async def healthz():
    return {"status": "ok"}


@app.get("/readyz", tags=["health"])
async def readyz():
    settings = get_settings()
    dependencies = {}
    factory_ids = [
        factory_id.strip()
        for factory_id in settings.dashboard_factory_ids.split(",")
        if factory_id.strip()
    ]
    probe_factory_id = factory_ids[0] if factory_ids else "factory-a"

    try:
        await ddb.get_factory_latest(probe_factory_id)
        dependencies["dynamodb"] = "ok"
    except Exception:
        dependencies["dynamodb"] = "failed"

    try:
        redis = await get_redis()
        await asyncio.wait_for(
            redis.ping(),
            timeout=settings.redis_pubsub_operation_timeout_seconds,
        )
        dependencies["redis"] = "ok"
    except Exception:
        dependencies["redis"] = "failed"

    try:
        await check_metadata_db(settings)
        dependencies["rds_metadata"] = "ok"
    except Exception:
        dependencies["rds_metadata"] = "failed"

    if any(status != "ok" for status in dependencies.values()):
        raise HTTPException(
            status_code=503,
            detail={"status": "degraded", "dependencies": dependencies},
        )
    return {"status": "ok", "dependencies": dependencies}
