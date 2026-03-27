# ==============================================================
# Newsconseen Proactive Intelligence — Alert Evaluator
# ==============================================================
# Runs all enabled alert rules against the current analytics
# data for every enterprise in a tenant.
#
# Steps:
#   1. Fetch analytics data from python_layer endpoints
#   2. Load operator alert config (which rules, what thresholds)
#   3. Run each enabled rule against each enterprise
#   4. Deduplicate — don't re-fire alerts already sent today
#   5. Return list of Alerts ready for delivery
#
# Called by:
#   - Scheduled cron (nightly + morning run)
#   - POST /alerts/evaluate (manual trigger)
#   - After ETL completion (triggered ETL → evaluate → notify)
# ==============================================================

import logging
from datetime import datetime, timezone
from typing import Optional

import requests

from alerts.rules import RULE_FUNCTIONS, RULE_CATALOG, Alert
from config.settings import settings

logger = logging.getLogger(__name__)

RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app"


class AlertEvaluator:
    """
    Evaluates alert rules against current analytics data.

    Usage:
        evaluator = AlertEvaluator(company_id="abc123")
        alerts = evaluator.evaluate()
        # alerts is a list of Alert objects ready for delivery
    """

    def __init__(
        self,
        company_id:  str,
        base_url:    str = RAILWAY_URL,
        alert_config:dict = None,
    ):
        self.company_id   = company_id
        self.base_url     = base_url
        # alert_config: {rule_id: {enabled: bool, threshold: ..., channels: [...]}}
        # Loaded from Base44 AlertConfig entity if not provided
        self.alert_config = alert_config or self._load_alert_config()

    def evaluate(self) -> list[Alert]:
        """
        Run all enabled rules against all enterprises for this tenant.
        Returns list of alerts that fired and passed deduplication.
        """
        logger.info(
            "AlertEvaluator: starting evaluation for company_id=%s",
            self.company_id,
        )

        # Fetch all analytics data in parallel
        analytics = self._fetch_analytics()

        if not analytics:
            logger.warning(
                "AlertEvaluator: no analytics data available for company_id=%s",
                self.company_id,
            )
            return []

        # Get list of enterprises for this tenant
        enterprises = analytics.get("enterprises", [])
        if not enterprises:
            logger.info(
                "AlertEvaluator: no enterprises found for company_id=%s",
                self.company_id,
            )
            return []

        # Load already-sent alerts for deduplication
        sent_today = self._load_sent_today()

        fired_alerts = []

        for enterprise in enterprises:
            enterprise_id = enterprise.get("id")
            if not enterprise_id:
                continue

            for rule_id, eval_fn in RULE_FUNCTIONS.items():
                # Check if rule is enabled for this tenant
                config = self.alert_config.get(rule_id, {})
                if config.get("enabled") is False:
                    continue

                # Deduplicate — skip if same rule+enterprise already alerted today
                dedup_key = f"{rule_id}:{enterprise_id}"
                if dedup_key in sent_today:
                    logger.debug(
                        "AlertEvaluator: skipping %s for %s (already sent today)",
                        rule_id, enterprise_id,
                    )
                    continue

                try:
                    alert = eval_fn(
                        enterprise_id=enterprise_id,
                        company_id=self.company_id,
                        analytics=analytics,
                        config=config,
                    )

                    if alert:
                        fired_alerts.append(alert)
                        logger.info(
                            "AlertEvaluator: rule %s fired for enterprise %s — %s",
                            rule_id, enterprise_id, alert.title,
                        )

                except Exception as e:
                    logger.error(
                        "AlertEvaluator: rule %s failed for enterprise %s — %s",
                        rule_id, enterprise_id, e,
                    )

        logger.info(
            "AlertEvaluator: evaluation complete — %d alerts fired across %d enterprises",
            len(fired_alerts), len(enterprises),
        )

        return fired_alerts

    def evaluate_enterprise(
        self, enterprise_id: str, rule_ids: list[str] = None
    ) -> list[Alert]:
        """
        Evaluate rules for a single enterprise.
        Optionally restrict to specific rule_ids.
        Used for on-demand evaluation after ETL refresh.
        """
        analytics = self._fetch_analytics()
        if not analytics:
            return []

        rules_to_run = rule_ids or list(RULE_FUNCTIONS.keys())
        fired = []

        for rule_id in rules_to_run:
            eval_fn = RULE_FUNCTIONS.get(rule_id)
            if not eval_fn:
                continue

            config = self.alert_config.get(rule_id, {})
            if config.get("enabled") is False:
                continue

            try:
                alert = eval_fn(
                    enterprise_id=enterprise_id,
                    company_id=self.company_id,
                    analytics=analytics,
                    config=config,
                )
                if alert:
                    fired.append(alert)
            except Exception as e:
                logger.error("AlertEvaluator.evaluate_enterprise: %s — %s", rule_id, e)

        return fired

    # ----------------------------------------------------------
    # Analytics data fetcher
    # ----------------------------------------------------------

    def _fetch_analytics(self) -> dict:
        """
        Fetch all analytics data from python_layer endpoints.
        Returns a combined dict with all entity summaries.
        """
        endpoints = {
            "people":        "/people-summary",
            "products":      "/product-summary",
            "tasks":         "/task-summary",
            "transactions":  "/transaction-summary",
            "enterprises":   "/enterprise-summary",
            "relationships": "/relationship-summary",
        }

        analytics = {}
        params = {"company_id": self.company_id}

        for key, endpoint in endpoints.items():
            try:
                resp = requests.get(
                    f"{self.base_url}{endpoint}",
                    params=params,
                    timeout=15,
                )
                resp.raise_for_status()
                data = resp.json()
                analytics[key] = data if isinstance(data, list) else data.get("data", [])
                logger.debug(
                    "AlertEvaluator: fetched %d %s records",
                    len(analytics[key]), key,
                )
            except Exception as e:
                logger.warning(
                    "AlertEvaluator: could not fetch %s — %s", endpoint, e
                )
                analytics[key] = []

        # Add metadata
        analytics["_fetched_at"]   = datetime.now(timezone.utc).isoformat()
        analytics["_company_id"]   = self.company_id

        return analytics

    # ----------------------------------------------------------
    # Deduplication
    # ----------------------------------------------------------

    def _load_sent_today(self) -> set[str]:
        """
        Load alert deduplication keys for alerts already sent today.
        Returns set of "{rule_id}:{enterprise_id}" strings.

        Fetches from Base44 AlertLog entity if configured.
        Falls back to empty set (no deduplication) if not available.
        """
        try:
            alert_log_url = getattr(settings, "base44_alert_log_url", None)
            if not alert_log_url:
                return set()

            today = datetime.now(timezone.utc).date().isoformat()

            resp = requests.get(
                alert_log_url,
                params={
                    "company_id": self.company_id,
                    "sent_date":  today,
                    "limit":      1000,
                },
                headers={"api_key": settings.base44_api_key},
                timeout=10,
            )
            resp.raise_for_status()
            logs = resp.json()
            if isinstance(logs, list):
                return {f"{log['rule_id']}:{log['enterprise_id']}" for log in logs}
            return set()

        except Exception as e:
            logger.debug("AlertEvaluator._load_sent_today: %s", e)
            return set()

    # ----------------------------------------------------------
    # Alert config loader
    # ----------------------------------------------------------

    def _load_alert_config(self) -> dict:
        """
        Load operator alert configuration from Base44 AlertConfig entity.
        Returns dict: {rule_id: {enabled, threshold, channels, ...}}

        If no config exists, uses defaults from RULE_CATALOG.
        This means all rules are enabled by default on first use.
        """
        # Build defaults from RULE_CATALOG
        defaults = {
            rule_id: {
                "enabled":   True,
                "threshold": meta.get("default_threshold"),
                "channels":  meta.get("channels", ["email"]),
            }
            for rule_id, meta in RULE_CATALOG.items()
        }

        try:
            alert_config_url = getattr(settings, "base44_alert_config_url", None)
            if not alert_config_url:
                return defaults

            resp = requests.get(
                alert_config_url,
                params={"company_id": self.company_id, "limit": 100},
                headers={"api_key": settings.base44_api_key},
                timeout=10,
            )
            resp.raise_for_status()
            configs = resp.json()

            if not isinstance(configs, list):
                return defaults

            # Merge operator config over defaults
            for cfg in configs:
                rule_id = cfg.get("rule_id")
                if rule_id and rule_id in defaults:
                    defaults[rule_id].update({
                        k: v for k, v in cfg.items()
                        if k in ("enabled", "threshold", "channels")
                    })

            return defaults

        except Exception as e:
            logger.debug("AlertEvaluator._load_alert_config: %s", e)
            return defaults
