from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from deps.rbac import (
    Principal,
    get_current_principal,
    require_factory_access,
    require_system_access,
)
from services import s3

router = APIRouter(prefix="/reports", tags=["reports"])

# Cloud infra reports are stored under the same reports/ prefix as factories
# (factory_id == "cloud-infra"), but they describe platform/system state, so
# access is gated by system view permission instead of per-factory access.
CLOUD_INFRA_REPORT_ID = "cloud-infra"


@router.get("")
async def list_reports(
    principal: Principal = Depends(get_current_principal),
):
    """List daily Markdown reports from S3 reports/ prefix."""
    try:
        reports = await s3.list_daily_reports()
    except s3.S3UnavailableError as exc:
        raise HTTPException(status_code=504, detail="S3 request timed out") from exc

    if principal.can_access_all_factories and principal.can_access_system:
        return reports

    allowed = principal.allowed_factory_ids or frozenset()
    visible = []
    for report in reports:
        factory_id = report.get("factory_id")
        if factory_id == CLOUD_INFRA_REPORT_ID:
            if principal.can_access_system:
                visible.append(report)
        elif principal.can_access_all_factories or factory_id in allowed:
            visible.append(report)
    return visible


@router.get("/{report_date}/{factory_id}", response_class=PlainTextResponse)
async def get_report(
    report_date: str,
    factory_id: str,
    principal: Principal = Depends(get_current_principal),
):
    """Return a Markdown report from S3 reports/ prefix.

    Skeleton — S3 objects will be populated by future lambda-report-generator work.
    """
    if factory_id == CLOUD_INFRA_REPORT_ID:
        require_system_access(principal)
    else:
        require_factory_access(principal, factory_id)
    try:
        markdown = await s3.get_report_markdown(report_date, factory_id)
        return PlainTextResponse(markdown, media_type="text/markdown")
    except s3.S3ObjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Report not found") from exc
    except s3.S3UnavailableError as exc:
        raise HTTPException(status_code=504, detail="S3 request timed out") from exc
