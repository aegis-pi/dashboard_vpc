import time

from fastapi import APIRouter, Depends, HTTPException, Query

from deps.rbac import Principal, get_current_principal, require_factory_access
from services import ddb

router = APIRouter(prefix="/factories", tags=["factories"])

_factories_cache: list | None = None
_factories_cache_at: float = 0.0
_FACTORIES_TTL = 10.0


def _ddb_gateway_timeout() -> HTTPException:
    return HTTPException(status_code=504, detail="DynamoDB request timed out")


def _normalize_factories(items: list) -> list:
    result = []
    for i in items:
        factory_id = i.get("factory_id") or i.get("pk", "").removeprefix("FACTORY#")
        risk = i.get("risk") or {}
        infra = i.get("infra_state") or {}
        fs = i.get("factory_state") or {}
        ps = i.get("pipeline_status") or {}
        nodes = infra.get("nodes") or []
        workloads = infra.get("workloads") or []
        ns = infra.get("node_summary") or {}
        node_ready = infra.get("nodes_ready") if infra.get("nodes_ready") is not None else ns.get("ready")
        node_total = infra.get("nodes_total") if infra.get("nodes_total") is not None else (ns.get("total") or (len(nodes) or None))
        workload_ready = infra.get("pods_ready")
        workload_total = len(workloads) or None
        result.append(
            {
                "factory_id": factory_id,
                "environment_type": i.get("environment_type"),
                "risk_level": risk.get("level"),
                "risk_score": risk.get("score"),
                "top_causes": risk.get("top_causes"),
                "updated_at": i.get("updated_at"),
                "pipeline_status": ps.get("status"),
                "display_status": (i.get("dashboard") or {}).get("display_status"),
                "last_factory_state_at": fs.get("source_timestamp"),
                "last_infra_state_at": infra.get("source_timestamp"),
                "node_ready": node_ready,
                "node_total": node_total,
                "workload_ready": workload_ready,
                "workload_total": workload_total,
            }
        )
    return result


@router.get("")
async def list_factories(
    principal: Principal = Depends(get_current_principal),
):
    global _factories_cache, _factories_cache_at
    if _factories_cache is not None and time.monotonic() - _factories_cache_at < _FACTORIES_TTL:
        result = _factories_cache
    else:
        try:
            items = await ddb.list_factories()
        except ddb.DynamoDBUnavailableError as exc:
            raise _ddb_gateway_timeout() from exc
        result = _normalize_factories(items)
        _factories_cache = result
        _factories_cache_at = time.monotonic()
    if principal.can_access_all_factories:
        return result
    allowed = principal.allowed_factory_ids or frozenset()
    return [item for item in result if item["factory_id"] in allowed]


@router.get("/{factory_id}")
async def get_factory(
    factory_id: str,
    principal: Principal = Depends(get_current_principal),
):
    require_factory_access(principal, factory_id)
    try:
        item = await ddb.get_factory_latest(factory_id)
    except ddb.DynamoDBUnavailableError as exc:
        raise _ddb_gateway_timeout() from exc
    if item is None:
        raise HTTPException(status_code=404, detail=f"Factory '{factory_id}' not found")
    return item


@router.get("/{factory_id}/history")
async def get_factory_history(
    factory_id: str,
    window: str = Query(default="1h", pattern=r"^\d+[hmd]$"),
    limit: int = Query(default=500, ge=1, le=2000),
    principal: Principal = Depends(get_current_principal),
):
    """Return the most recent HISTORY#STATE items (newest-first cap, returned ascending).

    window examples: 1h, 2h, 24h, 7d, 30m
    limit: hard cap on items returned (default 500, max 2000).
    """
    require_factory_access(principal, factory_id)
    try:
        return await ddb.get_factory_history(factory_id, window, limit)
    except ddb.DynamoDBUnavailableError as exc:
        raise _ddb_gateway_timeout() from exc
