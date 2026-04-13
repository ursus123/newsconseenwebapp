# ==============================================================
# Newsconseen — Report Digest Engine
# ==============================================================
# Builds operational summary email digests from Layer 2 analytics.
#
# Fetches from:
#   GET /people-summary        → headcount, active staff, churn risk
#   GET /transaction-summary   → revenue totals, overdue invoices
#   GET /task-summary          → completion rate, overdue tasks
#   GET /dataquality/report    → data health score + top issues
#
# Returns: {subject, html, plain}
# ==============================================================

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import requests

logger = logging.getLogger(__name__)

RAILWAY_URL = os.getenv("RAILWAY_INTERNAL_URL", "http://localhost:8000")
API_KEY     = os.getenv("API_KEY", "")
HEADERS     = {"x-api-key": API_KEY} if API_KEY else {}


def _get(path: str, company_id: str) -> dict:
    """Fetch from local Railway endpoint, return {} on failure."""
    try:
        url = f"{RAILWAY_URL}{path}?company_id={company_id}"
        res = requests.get(url, headers=HEADERS, timeout=15)
        if res.ok:
            return res.json()
    except Exception as e:
        logger.warning("digest_engine: %s → %s", path, e)
    return {}


def _fmt_num(val, fallback="—") -> str:
    if val is None:
        return fallback
    try:
        n = int(val)
        return f"{n:,}"
    except Exception:
        return str(val)


def _fmt_currency(val, fallback="—") -> str:
    if val is None:
        return fallback
    try:
        return f"${float(val):,.2f}"
    except Exception:
        return str(val)


def build_digest(company_id: str, company_name: str = "Your Organisation") -> dict:
    """
    Aggregate analytics snapshots and build an HTML digest email.
    Returns {"subject": str, "html": str, "plain": str}.
    """
    now_label = datetime.now(timezone.utc).strftime("%B %d, %Y")

    # ── Fetch analytics ────────────────────────────────────────────
    people      = _get("/people-summary",      company_id)
    transactions= _get("/transaction-summary", company_id)
    tasks       = _get("/task-summary",        company_id)
    dq          = _get("/dataquality/report",  company_id)

    # ── Extract metrics ────────────────────────────────────────────
    total_people    = people.get("total_people")     or people.get("total")
    active_staff    = people.get("active_staff")
    churn_risk      = people.get("churn_risk_count") or people.get("high_risk_count")

    total_revenue   = transactions.get("total_revenue") or transactions.get("revenue_total")
    overdue_count   = transactions.get("overdue_count") or transactions.get("unpaid_count")
    overdue_amount  = transactions.get("overdue_amount")

    task_total      = tasks.get("total_tasks")       or tasks.get("total")
    task_done       = tasks.get("completed_tasks")   or tasks.get("completed")
    task_overdue    = tasks.get("overdue_tasks")     or tasks.get("overdue")
    completion_rate = tasks.get("completion_rate")
    if completion_rate is None and task_total and task_done:
        try:
            completion_rate = round(int(task_done) / int(task_total) * 100, 1)
        except Exception:
            pass

    dq_score    = dq.get("overall_score")
    dq_grade    = dq.get("grade", "—")
    dq_issues   = dq.get("total_issues", 0)
    dq_critical = dq.get("critical_count", 0)
    top_issues  = (dq.get("issues") or [])[:3]

    # ── Score colour helpers ──────────────────────────────────────
    def score_color(s):
        if s is None: return "#6b7280"
        if s >= 90: return "#059669"
        if s >= 75: return "#d97706"
        if s >= 60: return "#ea580c"
        return "#dc2626"

    def rate_color(r):
        if r is None: return "#6b7280"
        if r >= 80: return "#059669"
        if r >= 60: return "#d97706"
        return "#dc2626"

    dq_color   = score_color(dq_score)
    rate_color_ = rate_color(completion_rate)

    # ── Build stat rows ────────────────────────────────────────────
    stats = [
        ("People",         _fmt_num(total_people),    "#6366f1"),
        ("Active Staff",   _fmt_num(active_staff),    "#0891b2"),
        ("Churn Risk",     _fmt_num(churn_risk),      "#dc2626" if churn_risk else "#6b7280"),
        ("Revenue",        _fmt_currency(total_revenue), "#059669"),
        ("Overdue Invoices", _fmt_num(overdue_count), "#dc2626" if overdue_count else "#6b7280"),
        ("Overdue Amount",   _fmt_currency(overdue_amount), "#dc2626" if overdue_amount else "#6b7280"),
        ("Tasks Total",    _fmt_num(task_total),      "#6366f1"),
        ("Completed",      _fmt_num(task_done),       "#059669"),
        ("Overdue Tasks",  _fmt_num(task_overdue),    "#dc2626" if task_overdue else "#6b7280"),
    ]

    # ── HTML email ─────────────────────────────────────────────────
    stat_cells = ""
    for label, value, color in stats:
        stat_cells += f"""
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">{label}</td>
          <td style="padding:8px 0;font-size:13px;font-weight:600;color:{color};text-align:right;border-bottom:1px solid #f3f4f6;">{value}</td>
        </tr>"""

    issue_rows = ""
    for issue in top_issues:
        sev = issue.get("severity", "warning")
        dot_color = "#dc2626" if sev == "critical" else "#d97706"
        issue_rows += f"""
        <tr>
          <td style="padding:6px 0;font-size:12px;color:#374151;border-bottom:1px solid #f9fafb;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:{dot_color};margin-right:6px;"></span>
            {issue.get("message", "")}
          </td>
          <td style="padding:6px 0;font-size:11px;color:#9ca3af;text-align:right;border-bottom:1px solid #f9fafb;text-transform:capitalize;">
            {issue.get("entity_type", "")}
          </td>
        </tr>"""

    dq_section = ""
    if dq_score is not None:
        dq_section = f"""
      <div style="margin-top:24px;padding:16px 20px;background:#f8fafc;border-radius:10px;border:1px solid #e5e7eb;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#374151;">Data Health</p>
          <span style="font-size:20px;font-weight:900;color:{dq_color};">{dq_grade} {dq_score}</span>
        </div>
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">{dq_issues} issue(s) — {dq_critical} critical</p>
        {f'<table style="width:100%;border-collapse:collapse;margin-top:8px;">{issue_rows}</table>' if issue_rows else '<p style="margin:4px 0 0;font-size:12px;color:#059669;font-weight:600;">All clear — no data quality issues</p>'}
      </div>"""

    completion_display = f"{completion_rate}%" if completion_rate is not None else "—"

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;background:#f1f5f9;margin:0;padding:24px 16px;">
  <div style="max-width:580px;margin:0 auto;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4f46e5 0%,#0891b2 100%);border-radius:14px 14px 0 0;padding:28px 28px 20px;">
      <p style="margin:0 0 4px;font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1.5px;">Operational Digest</p>
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#ffffff;">{company_name}</h1>
      <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.7);">{now_label}</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;padding:24px 28px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">

      <!-- Key metrics -->
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">Key Metrics</p>
      <table style="width:100%;border-collapse:collapse;">
        {stat_cells}
      </table>

      <!-- Task completion rate -->
      <div style="margin-top:20px;padding:14px 16px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <p style="margin:0;font-size:13px;font-weight:600;color:#166534;">Task Completion Rate</p>
          <span style="font-size:20px;font-weight:900;color:{rate_color_};">{completion_display}</span>
        </div>
      </div>

      {dq_section}

      <!-- CTA -->
      <div style="margin-top:24px;text-align:center;">
        <a href="https://app.newsconseen.com" style="display:inline-block;padding:12px 28px;background:#4f46e5;color:#ffffff;font-size:13px;font-weight:600;border-radius:10px;text-decoration:none;">
          Open Dashboard →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 14px 14px;padding:14px 28px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        Newsconseen Autonomous SME Operating System ·
        <a href="https://app.newsconseen.com/settings#reports" style="color:#6366f1;text-decoration:none;">Manage digest settings</a>
      </p>
    </div>

  </div>
</body>
</html>"""

    # ── Plain text ─────────────────────────────────────────────────
    plain_lines = [
        f"OPERATIONAL DIGEST — {company_name}",
        f"{now_label}",
        "=" * 50,
        "",
        "KEY METRICS",
        "-" * 30,
    ]
    for label, value, _ in stats:
        plain_lines.append(f"{label}: {value}")

    if completion_rate is not None:
        plain_lines += ["", f"Task Completion Rate: {completion_rate}%"]

    if dq_score is not None:
        plain_lines += [
            "",
            "DATA HEALTH",
            "-" * 30,
            f"Score: {dq_grade} ({dq_score})",
            f"Issues: {dq_issues} ({dq_critical} critical)",
        ]
        for issue in top_issues:
            plain_lines.append(f"  [{issue.get('severity','?').upper()}] {issue.get('message','')}")

    plain_lines += [
        "",
        "Open your dashboard: https://app.newsconseen.com",
        "",
        "— Newsconseen Autonomous SME Operating System",
        "Manage digest settings: https://app.newsconseen.com/settings#reports",
    ]

    subject = f"[{company_name}] Operational Digest — {now_label}"

    return {
        "subject": subject,
        "html":    html,
        "plain":   "\n".join(plain_lines),
    }
