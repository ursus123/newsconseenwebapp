# ==============================================================
# Newsconseen Proactive Intelligence — Alert API Routes
# ==============================================================
# FastAPI endpoints for alert management.
#
# GET  /alerts/rules              — list all alert rules
# GET  /alerts/config             — get tenant alert configuration
# POST /alerts/config             — update alert configuration
# POST /alerts/evaluate           — manually trigger evaluation
# POST /alerts/evaluate/enterprise— evaluate for one enterprise
# GET  /alerts/log                — recent alert history
# GET  /alerts/status             — channel configuration status
# POST /alerts/test               — send a test alert
# ==============================================================

import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel

from alerts.rules import RULE_CATALOG, Alert
from alerts.evaluator import AlertEvaluator
from notifications.router import DeliveryRouter
from notifications.channels import WhatsAppChannel, EmailChannel, SmsChannel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/alerts", tags=["Alerts"])


# ----------------------------------------------------------
# Request models
# ----------------------------------------------------------

class AlertConfigUpdate(BaseModel):
    company_id: str
    rule_id:    str
    enabled:    Optional[bool]  = None
    threshold:  Optional[float] = None
    channels:   Optional[list[str]] = None


class TestAlertRequest(BaseModel):
    company_id:    str
    channel:       str          # "whatsapp" | "email" | "sms"
    recipient:     str          # phone number or email address
    enterprise_id: Optional[str] = "test"


# ----------------------------------------------------------
# Endpoints
# ----------------------------------------------------------

@router.get("/rules")
def list_rules(
    category: Optional[str] = Query(None, description="inventory | people | tasks | financial | system"),
):
    """List all available alert rules with metadata."""
    rules = list(RULE_CATALOG.values())
    if category:
        rules = [r for r in rules if r.get("category") == category]
    return {
        "rules":      rules,
        "total":      len(rules),
        "categories": list({r["category"] for r in RULE_CATALOG.values()}),
    }


@router.get("/status")
def alert_status():
    """Check which notification channels are configured."""
    whatsapp = WhatsAppChannel()
    email    = EmailChannel()
    sms      = SmsChannel()

    return {
        "channels": {
            "whatsapp": {
                "configured": whatsapp.is_configured(),
                "note":       "Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_ID",
            },
            "email": {
                "configured": email.is_configured(),
                "note":       "Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD",
            },
            "sms": {
                "configured": sms.is_configured(),
                "note":       "Set AT_API_KEY + AT_USERNAME (Africa's Talking) or TWILIO_* credentials",
            },
        },
        "any_configured": any([
            whatsapp.is_configured(),
            email.is_configured(),
            sms.is_configured(),
        ]),
    }


@router.post("/evaluate")
def evaluate_alerts(
    company_id:    str = Query(...),
    x_cron_secret: str = Header(None),
):
    """
    Evaluate all alert rules for a tenant and deliver any that fire.

    Called by:
      - Railway cron schedule (nightly + morning)
      - After ETL completion
      - Manually from Pipelines page

    Protected by x-cron-secret header.
    """
    from config.settings import settings

    if x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=403, detail="Unauthorized")

    evaluator = AlertEvaluator(company_id=company_id)
    alerts    = evaluator.evaluate()

    if not alerts:
        return {
            "status":        "ok",
            "alerts_fired":  0,
            "delivered":     0,
            "company_id":    company_id,
        }

    router_ = DeliveryRouter(company_id=company_id)
    all_results = router_.deliver_batch(alerts)

    total_delivered = sum(
        sum(1 for r in results if r.success)
        for results in all_results.values()
    )

    return {
        "status":       "ok",
        "alerts_fired": len(alerts),
        "delivered":    total_delivered,
        "company_id":   company_id,
        "summary": [
            {
                "rule_id":      a.rule_id,
                "level":        a.level,
                "title":        a.title,
                "enterprise_id":a.enterprise_id,
            }
            for a in alerts
        ],
    }


@router.post("/evaluate/enterprise")
def evaluate_enterprise_alerts(
    company_id:    str = Query(...),
    enterprise_id: str = Query(...),
    rule_ids:      Optional[str] = Query(None, description="Comma-separated rule IDs"),
    x_cron_secret: str = Header(None),
):
    """
    Evaluate alert rules for a specific enterprise.
    Called after ETL refresh for that enterprise.
    """
    from config.settings import settings
    if x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=403, detail="Unauthorized")

    rule_id_list = rule_ids.split(",") if rule_ids else None

    evaluator = AlertEvaluator(company_id=company_id)
    alerts    = evaluator.evaluate_enterprise(enterprise_id, rule_id_list)

    if not alerts:
        return {"status": "ok", "alerts_fired": 0, "enterprise_id": enterprise_id}

    delivery_router = DeliveryRouter(company_id=company_id)
    results = delivery_router.deliver_batch(alerts)
    delivered = sum(sum(1 for r in res if r.success) for res in results.values())

    return {
        "status":        "ok",
        "alerts_fired":  len(alerts),
        "delivered":     delivered,
        "enterprise_id": enterprise_id,
        "alerts": [
            {"rule_id": a.rule_id, "level": a.level, "title": a.title}
            for a in alerts
        ],
    }


@router.post("/test")
def send_test_alert(request: TestAlertRequest):
    """
    Send a test alert to verify channel configuration.
    Does not evaluate any rules — just sends a test message.
    """
    test_alert = Alert(
        rule_id="test",
        level="info",
        title="🟢 Newsconseen alert test",
        message=(
            "This is a test alert from Newsconseen.\n"
            "Your notification channel is working correctly.\n"
            "You will receive real operational alerts at this address."
        ),
        enterprise_id=request.enterprise_id or "test",
        company_id=request.company_id,
        channels=[request.channel],
    )

    channel = request.channel.lower()
    recipient = request.recipient

    if channel == "whatsapp":
        result = WhatsAppChannel().send(
            recipient, test_alert.title, test_alert.message, "info"
        )
    elif channel == "email":
        result = EmailChannel().send(
            recipient, test_alert.title, test_alert.message, "info"
        )
    elif channel == "sms":
        result = SmsChannel().send(
            recipient, test_alert.title, test_alert.message, "info"
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unknown channel: {channel}")

    return {
        "success":   result.success,
        "channel":   result.channel,
        "recipient": result.recipient,
        "error":     result.error,
        "note":      "Test alert sent" if result.success else "Test alert failed",
    }


@router.get("/rules/{rule_id}")
def get_rule(rule_id: str):
    """Get metadata for a specific alert rule."""
    rule = RULE_CATALOG.get(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail=f"Rule '{rule_id}' not found")
    return rule


@router.get("/categories")
def list_categories():
    """List all alert categories."""
    from collections import Counter
    cats = Counter(r["category"] for r in RULE_CATALOG.values())
    return {
        "categories": [
            {"id": cat, "count": count}
            for cat, count in cats.most_common()
        ]
    }
