# ==============================================================
# Newsconseen Phase 3B — Alert Evaluator
# ==============================================================
# Orchestrates the full alert pipeline for all companies.
# Called by Airflow DAG every 4 hours.
# Also callable via POST /alerts/evaluate for immediate runs.
#
# Pipeline per company:
#   1. Fetch analytics data from python_layer endpoints
#   2. Load alert config (defaults + operator overrides)
#   3. Evaluate all alert rules
#   4. Route fired alerts to recipients via channels
#   5. Log results to Base44 AlertLog entity
# ==============================================================

import logging
from datetime import datetime, timezone
from typing import Optional

import requests

from alerts.rules import AlertRuleEngine
from alerts.router import NotificationRouter

logger = logging.getLogger(__name__)

RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app"


class AlertEvaluator:
    """
    Runs the full alert pipeline for a single company.

    Usage:
        evaluator = AlertEvaluator(company_id="abc123")
        result    = evaluator.run()
    """

    def __init__(
        self,
        company_id:  str,
        railway_url: str = RAILWAY_URL,
        dry_run:     bool = False,
    ):
        self.company_id  = company_id
        self.railway_url = railway_url
        self.dry_run     = dry_run

    def run(self) -> dict:
        """
        Execute the full alert pipeline for this company.
        Returns a summary of alerts fired and notifications sent.
        """
        started_at = datetime.now(timezone.utc)
        logger.info(
            "AlertEvaluator: starting for company_id=%s (dry_run=%s)",
            self.company_id, self.dry_run,
        )

        # Step 1 — fetch analytics data
        analytics = self._fetch_analytics()
        if not analytics:
            return {
                "status":      "skipped",
                "reason":      "could not fetch analytics data",
                "company_id":  self.company_id,
                "alerts_fired":0,
            }

        # Step 2 — load config
        config = NotificationRouter.load_config(self.company_id)
        recipients = self._load_recipients(config)
        if not recipients and not self.dry_run:
            logger.info(
                "AlertEvaluator: no recipients configured for %s — skipping notifications",
                self.company_id,
            )

        config["recipients"] = recipients

        # Step 3 — evaluate rules
        rule_engine = AlertRuleEngine(company_id=self.company_id)
        alerts      = rule_engine.evaluate_all(analytics, config)

        if not alerts:
            logger.info(
                "AlertEvaluator: no alerts fired for company_id=%s", self.company_id
            )
            return {
                "status":       "ok",
                "company_id":   self.company_id,
                "alerts_fired": 0,
                "notifications_sent": 0,
                "duration_s":   (datetime.now(timezone.utc) - started_at).total_seconds(),
            }

        logger.info(
            "AlertEvaluator: %d alerts fired for company_id=%s",
            len(alerts), self.company_id,
        )

        # Step 4 — route notifications
        router  = NotificationRouter(company_id=self.company_id)
        results = router.route(alerts, config, dry_run=self.dry_run)

        duration = (datetime.now(timezone.utc) - started_at).total_seconds()

        return {
            "status":             "completed",
            "company_id":         self.company_id,
            "dry_run":            self.dry_run,
            "alerts_fired":       len(alerts),
            "alerts": [a.to_dict() for a in alerts],
            "notifications_sent": results["sent"],
            "notifications_skipped": results["skipped"],
            "notifications_failed":  results["failed"],
            "duration_s":         round(duration, 2),
        }

    def _fetch_analytics(self) -> dict:
        """
        Fetch all relevant analytics tables from python_layer.
        Returns dict of table_name → records.
        """
        endpoints = {
            "product_summary":     "/product-summary",
            "people_summary":      "/people-summary",
            "task_summary":        "/task-summary",
            "transaction_summary": "/transaction-summary",
        }

        analytics = {}
        for table, endpoint in endpoints.items():
            try:
                resp = requests.get(
                    f"{self.railway_url}{endpoint}",
                    params={"company_id": self.company_id},
                    timeout=15,
                )
                resp.raise_for_status()
                data = resp.json()
                analytics[table] = data if isinstance(data, list) else data.get("data", [])
                logger.debug(
                    "AlertEvaluator: fetched %d rows from %s",
                    len(analytics[table]), table,
                )
            except Exception as e:
                logger.warning(
                    "AlertEvaluator: could not fetch %s — %s", table, e
                )
                analytics[table] = []

        return analytics

    def _load_recipients(self, config: dict) -> list:
        """
        Load recipient list from config.
        Recipients can come from:
          1. Base44 AlertConfig entity (operator-configured)
          2. Environment variable defaults (ALERT_DEFAULT_EMAIL, etc.)
        """
        from config.settings import settings
        import os

        recipients = config.get("recipients", [])

        # Add env var defaults if no recipients configured
        if not recipients:
            default_email = os.getenv("ALERT_DEFAULT_EMAIL", "")
            default_phone = os.getenv("ALERT_DEFAULT_PHONE", "")
            default_whatsapp = os.getenv("ALERT_DEFAULT_WHATSAPP", "")

            if any([default_email, default_phone, default_whatsapp]):
                recipients = [{
                    "name":      "Default Recipient",
                    "email":     default_email or None,
                    "phone":     default_phone or None,
                    "whatsapp":  default_whatsapp or None,
                }]
                logger.info(
                    "AlertEvaluator: using env var default recipients for %s",
                    self.company_id,
                )

        return [r for r in recipients if any([
            r.get("email"), r.get("phone"), r.get("whatsapp")
        ])]


def run_all_companies(
    railway_url: str = RAILWAY_URL,
    dry_run:     bool = False,
) -> dict:
    """
    Run alert evaluation for all active companies.
    Called by Airflow DAG on schedule.

    Fetches company list from enterprise_summary,
    then runs AlertEvaluator per unique company_id.
    """
    logger.info("AlertEvaluator: starting run for all companies (dry_run=%s)", dry_run)
    results = {}

    try:
        resp = requests.get(
            f"{railway_url}/enterprise-summary",
            timeout=15,
        )
        resp.raise_for_status()
        enterprises = resp.json()
        if isinstance(enterprises, dict):
            enterprises = enterprises.get("data", [])
    except Exception as e:
        logger.error("AlertEvaluator: could not fetch enterprise list — %s", e)
        return {"status": "failed", "error": str(e)}

    # Get unique company_ids
    company_ids = list({
        e.get("company_id")
        for e in enterprises
        if e.get("company_id")
    })

    logger.info("AlertEvaluator: found %d companies to evaluate", len(company_ids))

    for company_id in company_ids:
        try:
            evaluator = AlertEvaluator(
                company_id=company_id,
                railway_url=railway_url,
                dry_run=dry_run,
            )
            results[company_id] = evaluator.run()
        except Exception as e:
            logger.error(
                "AlertEvaluator: failed for company_id=%s — %s", company_id, e
            )
            results[company_id] = {"status": "error", "error": str(e)}

    total_alerts = sum(
        r.get("alerts_fired", 0) for r in results.values()
    )
    total_sent = sum(
        r.get("notifications_sent", 0) for r in results.values()
    )

    logger.info(
        "AlertEvaluator: completed — %d companies · %d alerts · %d notifications",
        len(company_ids), total_alerts, total_sent,
    )

    return {
        "status":       "completed",
        "companies":    len(company_ids),
        "total_alerts": total_alerts,
        "total_sent":   total_sent,
        "results":      results,
    }
