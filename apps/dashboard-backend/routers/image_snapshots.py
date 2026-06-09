from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from deps.rbac import Principal, get_current_principal, require_system_access
from services import s3

router = APIRouter(prefix="/image-snapshots", tags=["image-snapshots"])


@router.get("/range")
async def get_image_snapshot_range(
    factory_id: str = Query(..., min_length=1, max_length=80),
    principal: Principal = Depends(get_current_principal),
):
    """Return S3 availability bounds for image snapshot pickers."""
    require_system_access(principal)
    try:
        return await s3.get_image_snapshot_range(factory_id)
    except s3.S3UnavailableError as exc:
        raise HTTPException(status_code=504, detail="S3 request timed out") from exc


@router.get("")
async def list_image_snapshots(
    factory_id: str = Query(..., min_length=1, max_length=80),
    start: str = Query(..., min_length=16, max_length=40),
    end: str = Query(..., min_length=16, max_length=40),
    limit: int = Query(120, ge=1, le=300),
    principal: Principal = Depends(get_current_principal),
):
    """List AI-triggered image snapshots from S3 for human review."""
    require_system_access(principal)
    try:
        start_time = datetime.fromisoformat(start)
        end_time = datetime.fromisoformat(end)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid time range") from exc
    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="start must be before end")

    try:
        items = await s3.list_image_snapshots(factory_id, start_time, end_time, max_objects=limit)
    except s3.S3UnavailableError as exc:
        raise HTTPException(status_code=504, detail="S3 request timed out") from exc

    return {
        "factory_id": factory_id,
        "start": start,
        "end": end,
        "count": len(items),
        "items": items,
    }
