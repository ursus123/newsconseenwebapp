# ==============================================================
# Newsconseen — Scheduled Report Delivery Routes
# ==============================================================
# Endpoints:
#   GET  /reports/schedule              — get digest config for a company
#   POST /reports/schedule              — save/update digest config
#   POST /reports/send-digest           — trigger digest immediately
#
# Cron hook (called from /cron/etl-all):
#   run_scheduled_digests(company_ids)  — send any due digests
# ==============================================================

import logging
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Query
from pydantic import BaseModel

from reports.digest_engine import build_digest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports", tags=["Reports"])

# ── In-memory config store — keyed by company_id ─────────────
# Persists across requests; resets on Railway deploy (acceptable —
# operators simply re-save from the UI, and ETL cron continues to
# send while the store is warm).
_DIGEST_CONFIG: dict[str, dict] = {}


# ── SendGrid / SMTP sender ────────────────────────────────────
def _send_email(to_email: str, to_name: str, subject: str, html: str, plain: str) -> bool:
    """
    Send a single email via SendGrid or SMTP.
    Reuses the same credentials as the Alerts email channel.
    Returns True on success.
    """
    sendgrid_key = os.getenv("SENDGRID_API_KEY", "")
    from_email   = os.getenv("ALERT_FROM_EMAIL", "reports@newsconseen.com")
    from_name    = os.getenv("ALERT_FROM_NAME",  "Newsconseen Reports")

    if sendgrid_key:
        try:
            import requests as http
            resp = http.post(
                "https://api.sendgrid.com/v3/mail/send",
                json={
                    "personalizations": [{"to": [{"email": to_email, "name": to_name}]}],
                    "from":    {"email": from_email, "name": from_name},
                    "subject": subject,
                    "content": [
                        {"type": "text/plain", "value": plain},
                        {"type": "text/html",  "value": html},
                    ],
                },
                headers={"Authorization": f"Bearer {sendgrid_key}", "Content-Type": "application/json"},
                timeout=15,
            )
            if resp.status_code in (200, 202):
                logger.info("reports: SendGrid OK → %s", to_email)
                return True
            logger.error("reports: SendGrid %s — %s", resp.status_code, resp.text[:200])
        except Exception as e:
            logger.error("reports: SendGrid exception — %s", e)
        return False

    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASSWORD", "")
    if smtp_host and smtp_user and smtp_pass:
        try:
            import smtplib
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText
            smtp_port = int(os.getenv("SMTP_PORT", "587"))

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"]    = f"{from_name} <{from_email}>"
            msg["To"]      = f"{to_name} <{to_email}>" if to_name else to_email
            msg.attach(MIMEText(plain, "plain"))
            msg.attach(MIMEText(html, "html"))

            with smtplib.SMTP(smtp_host, smtp_port) as srv:
                srv.ehlo(); srv.starttls()
                srv.login(smtp_user, smtp_pass)
                srv.sendmail(from_email, to_email, msg.as_string())
            logger.info("reports: SMTP OK → %s", to_email)
            return True
        except Exception as e:
            logger.error("reports: SMTP exception — %s", e)

    logger.warning("reports: no email backend configured (set SENDGRID_API_KEY or SMTP_HOST/USER/PASSWORD)")
    return False


# ── Helpers ───────────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_due(config: dict) -> bool:
    """
    Returns True if a digest should be sent now based on frequency + last_sent.
    Evaluation is called every hour from ETL cron.
    """
    if not config.get("enabled", False):
        return False

    freq      = config.get("frequency", "weekly")
    last_sent = config.get("last_sent")
    now       = datetime.now(timezone.utc)

    if not last_sent:
        return True  # never sent — send on first eligible run

    try:
        last = datetime.fromisoformat(last_sent)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        delta = (now - last).total_seconds()
    except Exception:
        return True

    # Grace window: ±30 min so a cron that runs slightly late still fires
    if freq == "daily":
        return delta >= (23 * 3600 + 30 * 60)
    if freq == "weekly":
        return delta >= (6 * 24 * 3600 + 23 * 3600)
    if freq == "monthly":
        return delta >= (27 * 24 * 3600)
    return False


def _deliver_digest(company_id: str, config: dict) -> dict:
    """Build and send digest to all configured recipients."""
    recipients = config.get("recipients") or []
    if not recipients:
        return {"status": "skipped", "reason": "no recipients"}

    company_name = config.get("company_name", "Your Organisation")
    try:
        digest = build_digest(company_id, company_name)
    except Exception as e:
        logger.error("reports: build_digest failed for %s — %s", company_id, e)
        return {"status": "error", "reason": str(e)}

    sent, failed = 0, 0
    for recipient in recipients:
        email = recipient if isinstance(recipient, str) else recipient.get("email", "")
        name  = "" if isinstance(recipient, str) else recipient.get("name", "")
        if not email or "@" not in email:
            continue
        ok = _send_email(email, name, digest["subject"], digest["html"], digest["plain"])
        if ok:
            sent += 1
        else:
            failed += 1

    _DIGEST_CONFIG[company_id]["last_sent"] = _now_iso()
    return {"status": "sent", "sent": sent, "failed": failed}


# ── Pydantic models ────────────────────────────────────────────
class Recipient(BaseModel):
    email: str
    name:  Optional[str] = ""


class DigestConfig(BaseModel):
    company_id:   str
    company_name: Optional[str] = "Your Organisation"
    enabled:      bool = True
    frequency:    str  = "weekly"   # daily | weekly | monthly
    recipients:   List[Recipient] = []


# ── API Endpoints ──────────────────────────────────────────────
@router.get("/schedule")
def get_schedule(company_id: str = Query(...)):
    """Return saved digest configuration for a company."""
    config = _DIGEST_CONFIG.get(company_id, {})
    # Strip nothing — recipients stored as dicts with no secrets
    return {
        "company_id":   company_id,
        "enabled":      config.get("enabled", False),
        "frequency":    config.get("frequency", "weekly"),
        "recipients":   config.get("recipients", []),
        "company_name": config.get("company_name", ""),
        "last_sent":    config.get("last_sent"),
        "configured":   bool(config),
    }


@router.post("/schedule")
def save_schedule(body: DigestConfig):
    """Save or update digest configuration for a company."""
    _DIGEST_CONFIG[body.company_id] = {
        "enabled":      body.enabled,
        "frequency":    body.frequency,
        "recipients":   [r.dict() for r in body.recipients],
        "company_name": body.company_name,
        "last_sent":    _DIGEST_CONFIG.get(body.company_id, {}).get("last_sent"),
    }
    logger.info(
        "reports: schedule saved company=%s freq=%s recipients=%d enabled=%s",
        body.company_id, body.frequency, len(body.recipients), body.enabled,
    )
    return {"status": "saved", "company_id": body.company_id}


@router.post("/send-digest", status_code=202)
def send_digest_now(
    company_id:       str             = Query(...),
    background_tasks: BackgroundTasks = None,
):
    """
    Trigger an immediate digest delivery for a company.
    Returns 202 — delivery happens in the background.
    """
    config = _DIGEST_CONFIG.get(company_id)
    if not config:
        return {"status": "skipped", "reason": "no schedule configured for this company"}

    if background_tasks:
        background_tasks.add_task(_deliver_digest, company_id, config)
    else:
        _deliver_digest(company_id, config)

    return {"status": "accepted", "company_id": company_id}


# ── Cron hook ─────────────────────────────────────────────────
def run_scheduled_digests(company_ids: list) -> dict:
    """
    Called from /cron/etl-all after data quality evaluation.
    Sends digests for any company that has a due schedule.
    """
    results: dict = {}
    for company_id in company_ids:
        config = _DIGEST_CONFIG.get(str(company_id))
        if not config:
            continue
        if not _is_due(config):
            results[str(company_id)] = {"status": "not_due"}
            continue
        try:
            result = _deliver_digest(str(company_id), config)
            results[str(company_id)] = result
            logger.info("reports cron: company=%s → %s", company_id, result)
        except Exception as e:
            logger.warning("reports cron: company=%s failed — %s", company_id, e)
            results[str(company_id)] = {"status": "error", "reason": str(e)}

    sent_count = sum(1 for r in results.values() if r.get("status") == "sent")
    return {
        "evaluated": len(company_ids),
        "scheduled": len(results),
        "sent":      sent_count,
        "results":   results,
    }
