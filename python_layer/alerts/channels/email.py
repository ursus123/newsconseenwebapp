# ==============================================================
# Email Alert Channel
# ==============================================================
# Sends alert notifications via email.
# Supports two backends:
#   SendGrid API (recommended for production)
#   SMTP        (works with any email provider)
#
# Set one of these in Railway environment variables:
#   SENDGRID_API_KEY → uses SendGrid
#   SMTP_HOST + SMTP_USER + SMTP_PASSWORD → uses SMTP
#
# ALERT_FROM_EMAIL — the sender address (required)
# ALERT_FROM_NAME  — the sender display name (optional)
# ==============================================================

import logging
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from alerts.rules import Alert

logger = logging.getLogger(__name__)


class EmailChannel:
    """
    Sends alert notifications via email.
    Auto-detects SendGrid vs SMTP based on environment variables.
    """

    def __init__(self):
        self.from_email     = os.getenv("ALERT_FROM_EMAIL", "alerts@newsconseen.com")
        self.from_name      = os.getenv("ALERT_FROM_NAME",  "Newsconseen Alerts")
        self.sendgrid_key   = os.getenv("SENDGRID_API_KEY", "")
        self.smtp_host      = os.getenv("SMTP_HOST", "")
        self.smtp_port      = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user      = os.getenv("SMTP_USER", "")
        self.smtp_password  = os.getenv("SMTP_PASSWORD", "")

    def is_configured(self) -> bool:
        return bool(
            self.sendgrid_key or
            (self.smtp_host and self.smtp_user and self.smtp_password)
        )

    def send(
        self,
        alert:      Alert,
        to_email:   str,
        to_name:    str = "",
    ) -> bool:
        """
        Send alert notification via email.
        Returns True on success, False on failure.
        """
        if not self.is_configured():
            logger.warning(
                "EmailChannel: not configured — set SENDGRID_API_KEY or "
                "SMTP_HOST + SMTP_USER + SMTP_PASSWORD in Railway"
            )
            return False

        if not to_email or "@" not in to_email:
            logger.warning("EmailChannel: invalid email %s", to_email)
            return False

        subject  = self._build_subject(alert)
        html     = self._build_html(alert)
        plain    = self._build_plain(alert)

        if self.sendgrid_key:
            return self._send_sendgrid(to_email, to_name, subject, html, plain)
        else:
            return self._send_smtp(to_email, to_name, subject, html, plain)

    def _build_subject(self, alert: Alert) -> str:
        prefix = {
            "critical": "🔴 CRITICAL",
            "warning":  "🟡 Warning",
            "info":     "🔵 Info",
        }.get(alert.severity, "⚪ Alert")
        return f"[Newsconseen] {prefix}: {alert.title}"

    def _build_plain(self, alert: Alert) -> str:
        lines = [
            f"{alert.emoji} {alert.title.upper()}",
            "=" * 50,
            "",
            alert.message,
            "",
        ]
        if alert.enterprise_name:
            lines.append(f"Location: {alert.enterprise_name}")
        if alert.suggested_action:
            lines.append(f"\nRecommended action: {alert.suggested_action}")
        lines += [
            "",
            f"Severity: {alert.severity.upper()}",
            f"Alert type: {alert.alert_type}",
            f"Triggered: {alert.triggered_at[:19].replace('T', ' ')} UTC",
            "",
            "— Newsconseen Operational Intelligence",
            "Manage alert settings in your Newsconseen dashboard.",
        ]
        return "\n".join(lines)

    def _build_html(self, alert: Alert) -> str:
        severity_colors = {
            "critical": "#dc2626",  # red
            "warning":  "#d97706",  # amber
            "info":     "#2563eb",  # blue
        }
        color = severity_colors.get(alert.severity, "#6b7280")

        enterprise_row = ""
        if alert.enterprise_name:
            enterprise_row = f"""
            <tr>
              <td style="padding:4px 0;color:#6b7280;font-size:13px;">📍 Location</td>
              <td style="padding:4px 0;font-size:13px;font-weight:500;">{alert.enterprise_name}</td>
            </tr>"""

        action_block = ""
        if alert.suggested_action:
            action_block = f"""
            <div style="margin-top:16px;padding:12px 16px;background:#f0fdf4;border-left:3px solid #16a34a;border-radius:4px;">
              <p style="margin:0;font-size:13px;color:#15803d;">
                <strong>💡 Recommended action:</strong> {alert.suggested_action}
              </p>
            </div>"""

        return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background:{color};padding:20px 24px;">
      <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:1px;">
        {alert.severity.upper()} ALERT
      </p>
      <h1 style="margin:4px 0 0;font-size:18px;font-weight:600;color:#ffffff;">
        {alert.emoji} {alert.title}
      </h1>
    </div>

    <!-- Body -->
    <div style="padding:24px;">
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
        {alert.message}
      </p>

      {action_block}

      <!-- Meta -->
      <table style="margin-top:20px;border-top:1px solid #e5e7eb;padding-top:16px;width:100%;border-collapse:collapse;">
        {enterprise_row}
        <tr>
          <td style="padding:4px 0;color:#6b7280;font-size:13px;">Alert type</td>
          <td style="padding:4px 0;font-size:13px;">{alert.alert_type.replace('_', ' ').title()}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#6b7280;font-size:13px;">Triggered</td>
          <td style="padding:4px 0;font-size:13px;">{alert.triggered_at[:19].replace('T', ' ')} UTC</td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
        Newsconseen Operational Intelligence · Manage alert settings in your dashboard
      </p>
    </div>
  </div>
</body>
</html>"""

    def _send_sendgrid(
        self, to_email, to_name, subject, html, plain
    ) -> bool:
        try:
            import requests as req
            resp = req.post(
                "https://api.sendgrid.com/v3/mail/send",
                json={
                    "personalizations": [{
                        "to": [{"email": to_email, "name": to_name}],
                    }],
                    "from":    {"email": self.from_email, "name": self.from_name},
                    "subject": subject,
                    "content": [
                        {"type": "text/plain", "value": plain},
                        {"type": "text/html",  "value": html},
                    ],
                },
                headers={
                    "Authorization": f"Bearer {self.sendgrid_key}",
                    "Content-Type":  "application/json",
                },
                timeout=15,
            )
            if resp.status_code in (200, 202):
                logger.info("EmailChannel: sent via SendGrid to %s", to_email)
                return True
            else:
                logger.error(
                    "EmailChannel: SendGrid returned %s — %s",
                    resp.status_code, resp.text[:200],
                )
                return False

        except Exception as e:
            logger.error("EmailChannel._send_sendgrid: %s", e)
            return False

    def _send_smtp(
        self, to_email, to_name, subject, html, plain
    ) -> bool:
        try:
            import smtplib

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"]    = f"{self.from_name} <{self.from_email}>"
            msg["To"]      = f"{to_name} <{to_email}>" if to_name else to_email

            msg.attach(MIMEText(plain, "plain"))
            msg.attach(MIMEText(html, "html"))

            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.from_email, to_email, msg.as_string())

            logger.info("EmailChannel: sent via SMTP to %s", to_email)
            return True

        except Exception as e:
            logger.error("EmailChannel._send_smtp: %s", e)
            return False
