# ==============================================================
# Newsconseen Phase 3B — Alert API Routes
# ==============================================================

import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel

from alerts.evaluator import AlertEvaluator, run_all_companies

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/alerts", tags=["Alerts"])


class EvaluateRequest(BaseModel):
    company_id: str
    dry_run:    bool = False


class TestRequest(BaseModel):
    company_id: str
    channel:    str           # email | whatsapp | sms
    recipient:  str           # email address, phone number, or WhatsApp number
    name:       Optional[str] = "Test Recipient"


# ----------------------------------------------------------
# Alert evaluation endpoints
# ----------------------------------------------------------

@router.post("/evaluate")
def evaluate_alerts(
    request: EvaluateRequest,
    x_cron_secret: Optional[str] = Header(None),
):
    """
    Evaluate all alert rules for a company and send notifications.
    Can be called manually or by Airflow on schedule.

    dry_run=true evaluates and logs without sending notifications.
    Useful for testing alert rules before enabling live notifications.
    """
    evaluator = AlertEvaluator(
        company_id=request.company_id,
        dry_run=request.dry_run,
    )
    return evaluator.run()


@router.post("/evaluate/all")
def evaluate_all(
    dry_run:       bool = Query(False),
    x_cron_secret: Optional[str] = Header(None),
):
    """
    Evaluate alerts for all active companies.
    Protected by x-cron-secret header when called from Airflow.
    """
    from config.settings import settings
    if not settings.cron_secret:
        raise HTTPException(status_code=503, detail="Cron endpoints disabled — set CRON_SECRET env var")
    if x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=403, detail="Unauthorized")

    return run_all_companies(dry_run=dry_run)


@router.get("/status")
def alerts_status():
    """Check which notification channels are configured."""
    from alerts.channels.email import EmailChannel
    from alerts.channels.whatsapp import WhatsAppChannel
    from alerts.channels.sms import SmsChannel

    email_ch    = EmailChannel()
    whatsapp_ch = WhatsAppChannel()
    sms_ch      = SmsChannel()

    return {
        "channels": {
            "email": {
                "configured": email_ch.is_configured(),
                "backend":    "sendgrid" if email_ch.sendgrid_key else ("smtp" if email_ch.smtp_host else "none"),
                "note": None if email_ch.is_configured() else
                        "Set SENDGRID_API_KEY or SMTP_HOST + SMTP_USER + SMTP_PASSWORD",
            },
            "whatsapp": {
                "configured": whatsapp_ch.is_configured(),
                "note": None if whatsapp_ch.is_configured() else
                        "Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN",
            },
            "sms": {
                "configured": sms_ch.is_configured(),
                "provider":   sms_ch.provider or "none",
                "note": None if sms_ch.is_configured() else
                        "Set SMS_PROVIDER=africastalking (AT_API_KEY, AT_USERNAME) or SMS_PROVIDER=twilio",
            },
        },
        "default_recipients": {
            "email":     bool(os.getenv("ALERT_DEFAULT_EMAIL")),
            "phone":     bool(os.getenv("ALERT_DEFAULT_PHONE")),
            "whatsapp":  bool(os.getenv("ALERT_DEFAULT_WHATSAPP")),
        },
        "schedule": "Every 4 hours via Airflow DAG: alert_evaluator",
    }


@router.post("/test")
def test_channel(request: TestRequest):
    """
    Send a test notification to verify channel configuration.
    Use this after setting up credentials to confirm delivery.
    """
    channel = request.channel.lower()

    if channel == "email":
        from alerts.channels.email import EmailChannel
        ch = EmailChannel()
        if not ch.is_configured():
            raise HTTPException(
                status_code=400,
                detail="Email not configured. Set SENDGRID_API_KEY or SMTP credentials.",
            )
        from alerts.rules import Alert
        from datetime import datetime, timezone
        test_alert = Alert(
            alert_type="test", severity="info",
            title="Newsconseen email alerts configured",
            message="Your email alerts are working correctly. You will receive operational alerts here.",
            company_id=request.company_id,
            suggested_action="No action needed — this is a test message.",
            triggered_at=datetime.now(timezone.utc).isoformat(),
        )
        success = ch.send(test_alert, request.recipient, request.name or "")

    elif channel == "whatsapp":
        from alerts.channels.whatsapp import WhatsAppChannel
        ch = WhatsAppChannel()
        if not ch.is_configured():
            raise HTTPException(
                status_code=400,
                detail="WhatsApp not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.",
            )
        success = ch.send_test(request.recipient)

    elif channel == "sms":
        from alerts.channels.sms import SmsChannel
        ch = SmsChannel()
        if not ch.is_configured():
            raise HTTPException(
                status_code=400,
                detail=f"SMS not configured. Set SMS_PROVIDER and credentials.",
            )
        success = ch.send_test(request.recipient)

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown channel '{channel}'. Use: email | whatsapp | sms",
        )

    if not success:
        raise HTTPException(
            status_code=500,
            detail=f"Test message failed to deliver via {channel}. Check logs for details.",
        )

    return {
        "status":    "sent",
        "channel":   channel,
        "recipient": request.recipient,
        "message":   f"Test notification sent via {channel}. Check your {channel} for delivery.",
    }


@router.get("/preview")
def preview_alerts(
    company_id: str = Query(...),
    dry_run:    bool = Query(True),
):
    """
    Preview which alerts would fire for a company without sending.
    Returns the full list of alerts with severity, message, and action.
    Always runs in dry_run mode regardless of parameter.
    """
    evaluator = AlertEvaluator(
        company_id=company_id,
        dry_run=True,
    )
    result = evaluator.run()

    # Return just the alerts, clean for UI display
    alerts = result.get("alerts", [])
    return {
        "company_id":  company_id,
        "alert_count": len(alerts),
        "critical":    [a for a in alerts if a.get("severity") == "critical"],
        "warning":     [a for a in alerts if a.get("severity") == "warning"],
        "info":        [a for a in alerts if a.get("severity") == "info"],
    }
