from fastapi import APIRouter, Depends, HTTPException, Query

from deps.auth import verify_cognito_token
from services import ddb

router = APIRouter(prefix="/factories", tags=["factories"])


def _ddb_gateway_timeout() -> HTTPException:
    return HTTPException(status_code=504, detail="DynamoDB request timed out")


@router.get("")
async def list_factories(
    _claims: dict = Depends(verify_cognito_token),
):
    try:
        items = await ddb.list_factories()
    except ddb.DynamoDBUnavailableError as exc:
        raise _ddb_gateway_timeout() from exc
    result = []
    for i in items:
        factory_id = i.get("factory_id") or i.get("pk", "").removeprefix("FACTORY#")
        risk = i.get("risk") or {}
        infra = i.get("infra_state") or {}
        fs = i.get("factory_state") or {}
        ps = i.get("pipeline_status") or {}
        ns = infra.get("node_summary") or {}
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
                "node_ready": ns.get("ready"),
                "node_total": ns.get("total"),
            }
        )
    return result


@router.get("/{factory_id}")
async def get_factory(
    factory_id: str,
    _claims: dict = Depends(verify_cognito_token),
):
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
    _claims: dict = Depends(verify_cognito_token),
):
    """Return HISTORY#STATE items with risk/factory_state/infra_state extracted.

    window examples: 1h, 2h, 24h, 7d, 30m
    HISTORY#RISK / HISTORY#FACTORY / HISTORY#INFRA prefixes are not queried.
    """
    try:
        return await ddb.get_factory_history(factory_id, window)
    except ddb.DynamoDBUnavailableError as exc:
        raise _ddb_gateway_timeout() from exc
