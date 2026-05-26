from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from deps.auth import verify_cognito_token
from services import s3

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("")
async def list_reports(
    _claims: dict = Depends(verify_cognito_token),
):
    """List daily report metadata from aegis-daily-report DDB table.

    Skeleton — DDB query implemented in Step 8 after lambda-report-generator.
    """
    return []


@router.get("/{report_date}/{factory_id}", response_class=PlainTextResponse)
async def get_report(
    report_date: str,
    factory_id: str,
    _claims: dict = Depends(verify_cognito_token),
):
    """Return a Markdown report from S3 reports/ prefix.

    Skeleton — S3 objects are populated by lambda-report-generator (Step 8).
    """
    try:
        markdown = await s3.get_report_markdown(report_date, factory_id)
        return PlainTextResponse(markdown, media_type="text/markdown")
    except Exception:
        raise HTTPException(status_code=503, detail="Report not yet available (Step 8)")
