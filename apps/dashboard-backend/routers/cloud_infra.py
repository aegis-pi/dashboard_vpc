from fastapi import APIRouter, Depends, HTTPException, Query

from deps.rbac import Principal, get_current_principal, require_system_access
from services import cloud_infra, ddb

router = APIRouter(prefix="/cloud-infra", tags=["cloud-infra"])


def _ddb_gateway_timeout() -> HTTPException:
    return HTTPException(status_code=504, detail="DynamoDB request timed out")


@router.get("")
async def get_cloud_infra(
    principal: Principal = Depends(get_current_principal),
):
    require_system_access(principal)
    try:
        return await cloud_infra.get_latest()
    except ddb.DynamoDBUnavailableError as exc:
        raise _ddb_gateway_timeout() from exc


@router.get("/history")
async def get_cloud_infra_history(
    window: str = Query(default="1h", pattern=r"^(1h|6h|24h)$"),
    track: str = Query(default="fast", pattern=r"^(fast|slow)$"),
    limit: int = Query(default=500, ge=1, le=2000),
    principal: Principal = Depends(get_current_principal),
):
    require_system_access(principal)
    try:
        return await cloud_infra.get_history(window=window, track=track, limit=limit)
    except ddb.DynamoDBUnavailableError as exc:
        raise _ddb_gateway_timeout() from exc
