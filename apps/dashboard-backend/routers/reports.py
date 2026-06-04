from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from deps.rbac import Principal, get_current_principal, require_factory_access
from services import s3

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("")
async def list_reports(
    principal: Principal = Depends(get_current_principal),
):
    """List daily Markdown reports from S3 reports/ prefix."""
    try:
        reports = await s3.list_daily_reports()
        if principal.can_access_all_factories:
            return reports
        allowed = principal.allowed_factory_ids or frozenset()
        return [report for report in reports if report.get("factory_id") in allowed]
    except s3.S3UnavailableError as exc:
        raise HTTPException(status_code=504, detail="S3 request timed out") from exc


@router.get("/{report_date}/{factory_id}", response_class=PlainTextResponse)
async def get_report(
    report_date: str,
    factory_id: str,
    principal: Principal = Depends(get_current_principal),
):
    """Return a Markdown report from S3 reports/ prefix.

    Skeleton — S3 objects will be populated by future lambda-report-generator work.
    """
    require_factory_access(principal, factory_id)
    try:
        markdown = await s3.get_report_markdown(report_date, factory_id)
        return PlainTextResponse(markdown, media_type="text/markdown")
    except s3.S3ObjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Report not found") from exc
    except s3.S3UnavailableError as exc:
        raise HTTPException(status_code=504, detail="S3 request timed out") from exc
