# ==============================================================
# Newsconseen → n8n Event Emitter
# ==============================================================
# Fire-and-forget event emission to an n8n webhook URL.
# All calls are async (daemon thread) — never blocks the caller.
#
# Usage:
#   from n8n.emitter import emit_event
#   emit_event("etl_complete", {"entity": "people", "rows": 42})
#
# Configure in Railway:
#   N8N_WEBHOOK_URL  — the n8n "Webhook" node URL for Newsconseen events
#   N8N_SECRET       — optional shared secret (sent as X-Newsconseen-Secret header)
# ==============================================================

import logging
import os
import threading
import time
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

# ── Event type constants ─────────────────────────────────────────────────────

# ETL
ETL_COMPLETE        = "etl_complete"
ETL_FAILED          = "etl_failed"
PIPELINE_STARTED    = "pipeline_started"

# Records
RECORD_CREATED      = "record_created"
RECORDS_IMPORTED    = "records_imported"   # bulk import completed

# Alerts
ALERT_FIRED         = "alert_fired"
ALERT_RESOLVED      = "alert_resolved"

# Copilot
COPILOT_QUESTION    = "copilot_question"

# System
HEALTH_DEGRADED     = "health_degraded"


def emit_event(
    event_type: str,
    payload: dict[str, Any],
    company_id: str | None = None,
) -> None:
    """
    Send an event to the configured n8n webhook — asynchronously.

    Silently does nothing if N8N_WEBHOOK_URL is not set.
    Never raises — all errors are logged as warnings.

    Args:
        event_type:  One of the ETL_*, RECORD_*, ALERT_* constants above,
                     or any custom string.
        payload:     Dict of event-specific data. Merged with standard envelope.
        company_id:  Optional tenant identifier stamped on the event.
    """
    webhook_url = os.getenv("N8N_WEBHOOK_URL", "").strip()
    if not webhook_url:
        return

    envelope = {
        "event":      event_type,
        "source":     "newsconseen",
        "timestamp":  datetime.utcnow().isoformat() + "Z",
        "company_id": company_id,
        **payload,
    }

    secret = os.getenv("N8N_SECRET", "").strip()
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Newsconseen-Secret"] = secret

    def _fire():
        try:
            import requests
            resp = requests.post(
                webhook_url,
                json=envelope,
                headers=headers,
                timeout=8,
            )
            if resp.ok:
                logger.info(
                    "n8n event emitted: %s (status=%d)", event_type, resp.status_code
                )
            else:
                logger.warning(
                    "n8n webhook returned %d for event %s: %s",
                    resp.status_code, event_type, resp.text[:200],
                )
        except Exception as exc:
            logger.warning("n8n emit_event failed (event=%s): %s", event_type, exc)

    threading.Thread(target=_fire, daemon=True).start()


def emit_etl_complete(
    results: dict,
    company_ids: list[str],
    duration_seconds: float | None = None,
) -> None:
    """Convenience wrapper for ETL completion events."""
    success = sum(1 for r in results.values() if r.get("status") == "success")
    total   = len(results)
    failed  = [k for k, r in results.items() if r.get("status") == "error"]

    emit_event(
        ETL_COMPLETE if not failed else ETL_FAILED,
        {
            "success":          success,
            "total":            total,
            "failed_pipelines": failed,
            "all_success":      success == total,
            "company_ids":      company_ids,
            "duration_seconds": duration_seconds,
            "results_summary":  {
                k: {"status": r.get("status"), "rows": r.get("rows_loaded", 0)}
                for k, r in results.items()
            },
        },
    )


def emit_alert_fired(
    alert_name: str,
    severity: str,
    entity_type: str,
    affected_count: int,
    company_id: str,
    detail: dict | None = None,
) -> None:
    """Convenience wrapper for alert events."""
    emit_event(
        ALERT_FIRED,
        {
            "alert_name":     alert_name,
            "severity":       severity,
            "entity_type":    entity_type,
            "affected_count": affected_count,
            "detail":         detail or {},
        },
        company_id=company_id,
    )
