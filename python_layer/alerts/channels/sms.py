# ==============================================================
# SMS Alert Channel
# ==============================================================
# Sends alert notifications via SMS.
# Supports two providers:
#
#   Africa's Talking — recommended for African markets
#     Best coverage: Kenya, Uganda, Nigeria, Ghana, Tanzania,
#     Rwanda, Ethiopia, Côte d'Ivoire, Zambia, Cameroon
#     Docs: https://developers.africastalking.com/docs/sms
#
#   Twilio — recommended for global / US / Europe
#     Docs: https://www.twilio.com/docs/sms
#
# Set in Railway environment variables:
#   SMS_PROVIDER = africastalking | twilio
#
#   For Africa's Talking:
#     AT_API_KEY, AT_USERNAME, AT_SENDER_ID (optional)
#
#   For Twilio:
#     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
# ==============================================================

import logging
import os
from typing import Optional

from alerts.rules import Alert

logger = logging.getLogger(__name__)


class SmsChannel:
    """
    Sends SMS alert notifications.
    Auto-detects Africa's Talking vs Twilio from environment.
    """

    def __init__(self):
        self.provider = os.getenv("SMS_PROVIDER", "").lower()

        # Africa's Talking
        self.at_key       = os.getenv("AT_API_KEY", "")
        self.at_username  = os.getenv("AT_USERNAME", "")
        self.at_sender_id = os.getenv("AT_SENDER_ID", "Newsconseen")

        # Twilio
        self.twilio_sid   = os.getenv("TWILIO_ACCOUNT_SID", "")
        self.twilio_token = os.getenv("TWILIO_AUTH_TOKEN", "")
        self.twilio_from  = os.getenv("TWILIO_FROM_NUMBER", "")

        # Auto-detect provider if not explicitly set
        if not self.provider:
            if self.at_key and self.at_username:
                self.provider = "africastalking"
            elif self.twilio_sid and self.twilio_token:
                self.provider = "twilio"

    def is_configured(self) -> bool:
        if self.provider == "africastalking":
            return bool(self.at_key and self.at_username)
        elif self.provider == "twilio":
            return bool(self.twilio_sid and self.twilio_token and self.twilio_from)
        return False

    def send(self, alert: Alert, to_number: str) -> bool:
        """
        Send alert notification via SMS.
        Message is limited to 160 characters (single SMS).
        Returns True on success, False on failure.
        """
        if not self.is_configured():
            logger.warning(
                "SmsChannel: not configured — set SMS_PROVIDER and "
                "credentials in Railway environment variables"
            )
            return False

        number  = self._normalize_number(to_number)
        if not number:
            logger.warning("SmsChannel: invalid number %s", to_number)
            return False

        message = alert.short_message  # 160-char safe

        if self.provider == "africastalking":
            return self._send_africastalking(number, message)
        elif self.provider == "twilio":
            return self._send_twilio(number, message)
        else:
            logger.error("SmsChannel: unknown provider %s", self.provider)
            return False

    def _send_africastalking(self, to: str, message: str) -> bool:
        """Send via Africa's Talking SMS API."""
        try:
            import requests
            resp = requests.post(
                "https://api.africastalking.com/version1/messaging",
                data={
                    "username": self.at_username,
                    "to":       to,
                    "message":  message,
                    "from":     self.at_sender_id or None,
                },
                headers={
                    "apiKey":       self.at_key,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept":       "application/json",
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()

            sms_data   = data.get("SMSMessageData", {})
            recipients = sms_data.get("Recipients", [])

            if recipients and recipients[0].get("status") == "Success":
                logger.info(
                    "SmsChannel [AT]: sent to %s (cost=%s)",
                    to, recipients[0].get("cost", "?"),
                )
                return True
            else:
                err = sms_data.get("Message", "Unknown error")
                logger.error("SmsChannel [AT]: delivery failed — %s", err)
                return False

        except Exception as e:
            logger.error("SmsChannel._send_africastalking: %s", e)
            return False

    def _send_twilio(self, to: str, message: str) -> bool:
        """Send via Twilio SMS API."""
        try:
            import requests
            from requests.auth import HTTPBasicAuth

            # Ensure number has + prefix for Twilio
            to_formatted   = f"+{to}" if not to.startswith("+") else to
            from_formatted = self.twilio_from

            resp = requests.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{self.twilio_sid}/Messages.json",
                data={
                    "To":   to_formatted,
                    "From": from_formatted,
                    "Body": message,
                },
                auth=HTTPBasicAuth(self.twilio_sid, self.twilio_token),
                timeout=15,
            )
            resp.raise_for_status()
            msg_sid = resp.json().get("sid", "")
            logger.info("SmsChannel [Twilio]: sent to %s (sid=%s)", to, msg_sid)
            return True

        except Exception as e:
            logger.error("SmsChannel._send_twilio: %s", e)
            return False

    def _normalize_number(self, number: str) -> Optional[str]:
        """
        Normalize phone number — strip spaces, dashes, parentheses.
        Returns digits only (without +) for Africa's Talking.
        Africa's Talking accepts: +254712345678 or 254712345678
        Twilio requires: +254712345678 (added in send method)
        """
        if not number:
            return None
        cleaned = "".join(c for c in number if c.isdigit() or c == "+")
        cleaned = cleaned.lstrip("+")
        if len(cleaned) < 9:
            return None
        return cleaned

    def send_test(self, to_number: str) -> bool:
        """Send a test SMS to verify configuration."""
        from alerts.rules import Alert
        from datetime import datetime, timezone
        test = Alert(
            alert_type="test", severity="info",
            title="Newsconseen SMS configured",
            message="Your SMS alerts are working. You will receive critical operational alerts here.",
            company_id="test",
            suggested_action="No action needed.",
            triggered_at=datetime.now(timezone.utc).isoformat(),
        )
        return self.send(test, to_number)
