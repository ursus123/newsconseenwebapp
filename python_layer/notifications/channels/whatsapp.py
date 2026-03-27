# ==============================================================
# WhatsApp Business API Channel
# ==============================================================
# Sends alert notifications via WhatsApp Business API.
# Uses the Cloud API (Meta's hosted solution) — no need to
# manage your own WhatsApp Business server.
#
# Setup:
#   1. Create a Meta Business account
#   2. Create a WhatsApp Business App at developers.facebook.com
#   3. Get your Phone Number ID and Access Token
#   4. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN
#      in Railway environment variables
#
# Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
# ==============================================================

import logging
import os
from typing import Optional

import requests

from alerts.rules import Alert

logger = logging.getLogger(__name__)

WHATSAPP_API_BASE = "https://graph.facebook.com/v18.0"


class WhatsAppChannel:
    """
    Sends alert notifications via WhatsApp Business Cloud API.

    Supports two message types:
      - text      — plain text for simple alerts
      - template  — pre-approved templates for rich formatting
                    (requires Meta template approval)

    For SME deployments, plain text is recommended — it works
    immediately without template approval.
    """

    def __init__(self):
        self.phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
        self.access_token    = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
        self.api_url = (
            f"{WHATSAPP_API_BASE}/{self.phone_number_id}/messages"
            if self.phone_number_id else ""
        )

    def is_configured(self) -> bool:
        return bool(self.phone_number_id and self.access_token)

    def send(self, alert: Alert, to_number: str) -> bool:
        """
        Send an alert notification via WhatsApp.

        to_number: recipient's WhatsApp number in international format
                   e.g. "+254712345678", "254712345678"

        Returns True on success, False on failure.
        """
        if not self.is_configured():
            logger.warning(
                "WhatsAppChannel: not configured — set WHATSAPP_PHONE_NUMBER_ID "
                "and WHATSAPP_ACCESS_TOKEN in Railway environment variables"
            )
            return False

        # Normalize phone number
        number = self._normalize_number(to_number)
        if not number:
            logger.warning("WhatsAppChannel: invalid number %s", to_number)
            return False

        message = self._build_message(alert)

        try:
            resp = requests.post(
                self.api_url,
                json={
                    "messaging_product": "whatsapp",
                    "recipient_type":    "individual",
                    "to":                number,
                    "type":              "text",
                    "text": {
                        "preview_url": False,
                        "body":        message,
                    },
                },
                headers={
                    "Authorization": f"Bearer {self.access_token}",
                    "Content-Type":  "application/json",
                },
                timeout=15,
            )
            resp.raise_for_status()
            message_id = resp.json().get("messages", [{}])[0].get("id", "")
            logger.info(
                "WhatsAppChannel: sent %s to %s (msg_id=%s)",
                alert.alert_type, number, message_id,
            )
            return True

        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response else "unknown"
            error  = e.response.json() if e.response else {}
            logger.error(
                "WhatsAppChannel: HTTP %s sending to %s — %s",
                status, number, error.get("error", {}).get("message", str(e)),
            )
            return False
        except Exception as e:
            logger.error("WhatsAppChannel: failed sending to %s — %s", number, e)
            return False

    def _build_message(self, alert: Alert) -> str:
        """
        Build WhatsApp message text from alert.
        WhatsApp supports basic formatting: *bold*, _italic_, ~strikethrough~
        Max length: 4096 characters.
        """
        lines = [
            f"{alert.emoji} *{alert.title}*",
            "",
            alert.message,
        ]

        if alert.enterprise_name:
            lines.append(f"📍 {alert.enterprise_name}")

        if alert.suggested_action:
            lines.append(f"\n💡 *Action:* {alert.suggested_action}")

        lines.append(f"\n_Newsconseen · {alert.triggered_at[:10]}_")

        return "\n".join(lines)

    def _normalize_number(self, number: str) -> Optional[str]:
        """
        Normalize phone number to international format without +.
        WhatsApp Cloud API requires numbers without + prefix.
        """
        if not number:
            return None

        # Remove spaces, dashes, parentheses
        cleaned = "".join(c for c in number if c.isdigit() or c == "+")
        cleaned = cleaned.replace("+", "")

        # Must be at least 10 digits
        if len(cleaned) < 10:
            return None

        return cleaned

    def send_test(self, to_number: str) -> bool:
        """
        Send a test message to verify WhatsApp configuration.
        Call from /alerts/test endpoint.
        """
        from alerts.rules import Alert
        from datetime import datetime, timezone

        test_alert = Alert(
            alert_type="test",
            severity="info",
            title="Newsconseen Copilot connected",
            message="Your WhatsApp alerts are configured correctly. You will receive operational alerts here.",
            company_id="test",
            suggested_action="No action needed — this is a test message.",
            triggered_at=datetime.now(timezone.utc).isoformat(),
        )
        return self.send(test_alert, to_number)
