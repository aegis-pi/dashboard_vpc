from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from deps.auth import verify_cognito_token
from services import s3

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("")
async def list_reports(
    _claims: dict = Depends(verify_cognito_token),
):
    """List daily Markdown reports from S3 reports/ prefix."""
    try:
        return await s3.list_daily_reports()
    except s3.S3UnavailableError as exc:
        raise HTTPException(status_code=504, detail="S3 request timed out") from exc


@router.get("/{report_date}/{factory_id}", response_class=PlainTextResponse)
async def get_report(
    report_date: str,
    factory_id: str,
    _claims: dict = Depends(verify_cognito_token),
):
    """Return a Markdown report from S3 reports/ prefix.

    Skeleton — S3 objects will be populated by future lambda-report-generator work.
    """
    try:
        markdown = await s3.get_report_markdown(report_date, factory_id)
        return PlainTextResponse(markdown, media_type="text/markdown")
    except s3.S3ObjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Report not found") from exc
    except s3.S3UnavailableError as exc:
        raise HTTPException(status_code=504, detail="S3 request timed out") from exc
