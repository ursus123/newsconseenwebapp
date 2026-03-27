# ==============================================================
# Newsconseen Phase 3B — Notification Router
# ==============================================================
# Decides who gets which alert via which channel.
# Enforces frequency caps — no duplicate alerts within N hours.
# Routes to all configured channels per recipient.
# ==============================================================

import logging
from datetime import datetime, timezone
from typing import Optional

import requests

from config.settings import settings, HEADERS
from alerts.rules import Alert

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Default alert config — applies when operator has not
# configured custom settings in Base44 AlertConfig entity
# ----------------------------------------------------------
DEFAULT_CONFIG = {
    # Which alert types are enabled
    "enabled_types": ["all"],

    # Thresholds
    "expiry_critical_days":    7,
    "expiry_warning_days":     30,
    "completion_rate_min":     70,
    "retention_drop_pct":      10,
    "revenue_drop_pct":        20,
    "overdue_spike_threshold": 5,
    "min_staff_count":         1,

    # Frequency caps — hours between same alert type
    "frequency_cap_hours": {
        "expiry_critical":  24,
        "expiry_warning":   72,
        "out_of_stock":     12,
        "low_stock":        48,
        "retention_drop":   168,   # weekly
        "staff_shortage":   24,
        "completion_low":   48,
        "overdue_spike":    24,
        "negative_cashflow":72,
        "revenue_drop":     168,
    },

    # Severity filter per channel
    # critical → all channels
    # warning  → preferred channel only
    # info     → digest (not individual notifications)
    "channel_severity": {
        "whatsapp": ["critical", "warning"],
        "email":    ["critical", "warning", "info"],
        "sms":      ["critical"],
    },
}


class NotificationRouter:
    """
    Routes fired alerts to the correct recipients via the
    correct channels with frequency capping.

    Usage:
        router = NotificationRouter(company_id="abc123")
        results = router.route(alerts, recipient_config)
    """

    def __init__(self, company_id: str):
        self.company_id = company_id

    def route(
        self,
        alerts:    list[Alert],
        config:    dict,
        dry_run:   bool = False,
    ) -> dict:
        """
        Route a list of alerts to their recipients.

        config: loaded from Base44 AlertConfig + DEFAULT_CONFIG
        dry_run: if True, log what would be sent without sending

        Returns summary of sent/skipped/failed notifications.
        """
        if not alerts:
            return {"sent": 0, "skipped": 0, "failed": 0, "details": []}

        # Load alert log to check frequency caps
        recent_alerts = self._load_recent_alert_log()

        results = {"sent": 0, "skipped": 0, "failed": 0, "details": []}

        recipients = config.get("recipients", [])
        if not recipients:
            logger.warning(
                "NotificationRouter: no recipients configured for company_id=%s",
                self.company_id,
            )
            return results

        for alert in alerts:
            # Check frequency cap
            cap_key = f"{alert.company_id}:{alert.alert_type}:{alert.enterprise_id}"
            if cap_key in recent_alerts:
                hours_since = recent_alerts[cap_key]
                cap_hours   = DEFAULT_CONFIG["frequency_cap_hours"].get(
                    alert.alert_type, 24
                )
                if hours_since < cap_hours:
                    logger.debug(
                        "NotificationRouter: skipping %s — fired %dh ago (cap=%dh)",
                        alert.alert_type, hours_since, cap_hours,
                    )
                    results["skipped"] += 1
                    results["details"].append({
                        "alert_type": alert.alert_type,
                        "status":     "skipped",
                        "reason":     f"frequency cap ({cap_hours}h)",
                    })
                    continue

            # Route to each recipient
            for recipient in recipients:
                channels  = self._select_channels(alert, recipient, config)
                sent_any  = False

                for channel in channels:
                    if dry_run:
                        logger.info(
                            "DRY RUN: would send %s via %s to %s",
                            alert.alert_type, channel,
                            recipient.get("name", "recipient"),
                        )
                        results["sent"] += 1
                        sent_any = True
                        continue

                    success = self._send_via_channel(alert, recipient, channel)
                    if success:
                        results["sent"] += 1
                        sent_any = True
                        results["details"].append({
                            "alert_type": alert.alert_type,
                            "severity":   alert.severity,
                            "channel":    channel,
                            "recipient":  recipient.get("name", ""),
                            "status":     "sent",
                        })
                    else:
                        results["failed"] += 1
                        results["details"].append({
                            "alert_type": alert.alert_type,
                            "channel":    channel,
                            "status":     "failed",
                        })

                # Log to AlertLog entity in Base44
                if sent_any and not dry_run:
                    self._log_alert(alert, channels, recipients)

        logger.info(
            "NotificationRouter: sent=%d skipped=%d failed=%d for company_id=%s",
            results["sent"], results["skipped"], results["failed"], self.company_id,
        )
        return results

    def _select_channels(
        self, alert: Alert, recipient: dict, config: dict
    ) -> list[str]:
        """
        Determine which channels to use for this alert + recipient combo.

        Logic:
          1. Get recipient's preferred channels
          2. Filter by severity (critical → all, warning → preferred, info → digest)
          3. Return only channels that are configured with credentials
        """
        severity_map = DEFAULT_CONFIG["channel_severity"]
        available_channels = []

        for channel in ["whatsapp", "email", "sms"]:
            allowed_severities = severity_map.get(channel, ["critical"])
            if alert.severity not in allowed_severities:
                continue

            # Check recipient has this channel configured
            if channel == "whatsapp" and recipient.get("whatsapp"):
                available_channels.append("whatsapp")
            elif channel == "email" and recipient.get("email"):
                available_channels.append("email")
            elif channel == "sms" and recipient.get("phone"):
                available_channels.append("sms")

        # If no channels available, fall back to email for any severity
        if not available_channels and recipient.get("email"):
            available_channels.append("email")

        return available_channels

    def _send_via_channel(
        self, alert: Alert, recipient: dict, channel: str
    ) -> bool:
        """Dispatch to the correct channel sender."""
        try:
            if channel == "whatsapp":
                from alerts.channels.whatsapp import WhatsAppChannel
                sender = WhatsAppChannel()
                return sender.send(alert, recipient["whatsapp"])

            elif channel == "email":
                from alerts.channels.email import EmailChannel
                sender = EmailChannel()
                return sender.send(alert, recipient["email"], recipient.get("name", ""))

            elif channel == "sms":
                from alerts.channels.sms import SmsChannel
                sender = SmsChannel()
                return sender.send(alert, recipient["phone"])

            else:
                logger.warning("NotificationRouter: unknown channel %s", channel)
                return False

        except Exception as e:
            logger.error(
                "NotificationRouter._send_via_channel: %s via %s failed — %s",
                alert.alert_type, channel, e,
            )
            return False

    def _load_recent_alert_log(self) -> dict:
        """
        Load AlertLog from Base44 to check frequency caps.
        Returns dict of {company:type:enterprise → hours_since_last_fire}.
        Falls back to empty dict if entity not configured yet.
        """
        try:
            alert_log_url = getattr(settings, "base44_alert_log_url", None)
            if not alert_log_url:
                return {}

            resp = requests.get(
                alert_log_url,
                params={
                    "company_id": self.company_id,
                    "limit": 500,
                    "is_resolved": False,
                },
                headers=HEADERS,
                timeout=10,
            )
            resp.raise_for_status()
            records = resp.json()
            if isinstance(records, dict):
                records = records.get("data", [])

            now = datetime.now(timezone.utc)
            caps = {}
            for record in records:
                triggered = record.get("triggered_at")
                if not triggered:
                    continue
                try:
                    fired_at = datetime.fromisoformat(triggered.replace("Z", "+00:00"))
                    hours    = (now - fired_at).total_seconds() / 3600
                    key      = f"{record.get('company_id')}:{record.get('alert_type')}:{record.get('enterprise_id')}"
                    if key not in caps or hours < caps[key]:
                        caps[key] = hours
                except Exception:
                    continue

            return caps

        except Exception as e:
            logger.debug("NotificationRouter: could not load alert log — %s", e)
            return {}

    def _log_alert(self, alert: Alert, channels: list, recipients: list):
        """Save fired alert to Base44 AlertLog entity."""
        try:
            alert_log_url = getattr(settings, "base44_alert_log_url", None)
            if not alert_log_url:
                return

            requests.post(
                alert_log_url,
                json={
                    **alert.to_dict(),
                    "sent_to":        [r.get("name", "") for r in recipients],
                    "channel_used":   channels,
                    "delivery_status":"sent",
                    "is_resolved":    False,
                },
                headers=HEADERS,
                timeout=10,
            ).raise_for_status()

        except Exception as e:
            logger.warning("NotificationRouter._log_alert: failed — %s", e)

    @staticmethod
    def load_config(company_id: str) -> dict:
        """
        Load alert configuration for a company.
        Merges DEFAULT_CONFIG with operator overrides from Base44 AlertConfig entity.
        Operator settings always win.
        """
        config = dict(DEFAULT_CONFIG)

        try:
            alert_config_url = getattr(settings, "base44_alert_config_url", None)
            if not alert_config_url:
                return config

            resp = requests.get(
                alert_config_url,
                params={"company_id": company_id, "limit": 100},
                headers=HEADERS,
                timeout=10,
            )
            resp.raise_for_status()
            records = resp.json()
            if isinstance(records, dict):
                records = records.get("data", [])

            # Each record overrides one config key
            for record in records:
                key   = record.get("config_key")
                value = record.get("config_value")
                if key and value is not None:
                    config[key] = value

            logger.debug(
                "NotificationRouter: loaded config for company_id=%s", company_id
            )

        except Exception as e:
            logger.debug(
                "NotificationRouter: using default config (%s)", e
            )

        return config
