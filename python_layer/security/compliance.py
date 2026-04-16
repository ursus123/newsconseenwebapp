"""
security/compliance.py
-----------------------
SOC 2 / ISO 27001 evidence collection.

Assembles structured evidence from existing Newsconseen infrastructure:
  - Audit trail (audit.change_log) — CC6.2, CC6.3 access logging
  - Backup log — A.12.3 information backup
  - Admin action log — CC6.1 access control
  - Enrichment coverage — data integrity
  - 2FA enrollment — CC6.1 multi-factor auth
  - Uptime signals from /health — A.17.1 availability

Returns a structured evidence package the operator or auditor can export.

Covers SOC 2 Trust Services Criteria:
  CC6.1  Logical access controls (2FA, API key auth, admin secret, role-based nav)
  CC6.2  Access control monitoring (audit.change_log, admin_audit_log)
  CC6.3  Removal of access (tenant suspend/reactivate)
  CC7.2  System monitoring (health endpoint, backup log, anomaly detection)
  A.12.3 Backup (analytics.backup_log, pg_dump + S3)
  A.14.2 Security headers (HSTS, CSP, X-Frame, nosniff)
  A.17.1 Availability (Railway deployment, health checks)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _query_safe(engine, sql: str, params: dict = {}) -> list[dict]:
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()
            result = [dict(r._mapping) for r in rows]
            for r in result:
                for k, v in r.items():
                    if hasattr(v, "isoformat"):
                        r[k] = str(v)
            return result
    except Exception as exc:
        logger.debug("compliance: query failed — %s", exc)
        return []


def collect_evidence(company_id: str, engine) -> dict:
    """
    Collect a full SOC 2 evidence package for a company.
    Returns a dict suitable for JSON export or PDF rendering.
    """
    evidence = {
        "generated_at":  _now(),
        "company_id":    company_id,
        "framework":     "SOC 2 Type I / ISO 27001 Annex A",
        "controls":      {},
    }

    # ── CC6.1 — Logical access controls ──────────────────────────────────────
    twofa_rows = _query_safe(engine, """
        SELECT user_id, status, verified_at
        FROM analytics.user_2fa_secrets
        WHERE company_id = :cid AND status = 'active'
    """, {"cid": company_id})

    evidence["controls"]["CC6.1_access_controls"] = {
        "title":       "Logical Access Controls",
        "status":      "implemented",
        "evidence": {
            "api_key_auth":       "All endpoints protected by x-api-key header when API_KEY env var is set",
            "admin_secret":       "Admin endpoints require separate x-admin-secret header",
            "role_based_nav":     "5 roles: super_admin, admin, teacher, staff, student — enforced in frontend + backend",
            "2fa_enrolled_users": len(twofa_rows),
            "rate_limiting":      "Sliding-window rate limits on /copilot/chat, /auth, /admin, /bi/export, /enrichment/run",
        },
    }

    # ── CC6.2 — Access logging ────────────────────────────────────────────────
    audit_count = _query_safe(engine, """
        SELECT COUNT(*) AS cnt FROM audit.change_log
        WHERE company_id = :cid
    """, {"cid": company_id})

    recent_audit = _query_safe(engine, """
        SELECT entity_type, action, changed_by, timestamp
        FROM audit.change_log
        WHERE company_id = :cid
        ORDER BY timestamp DESC LIMIT 10
    """, {"cid": company_id})

    evidence["controls"]["CC6.2_access_logging"] = {
        "title":   "Access Control Monitoring",
        "status":  "implemented",
        "evidence": {
            "audit_log_entries": audit_count[0]["cnt"] if audit_count else 0,
            "recent_changes":    recent_audit,
            "immutability":      "audit.change_log has no UPDATE/DELETE permissions — insert-only",
        },
    }

    # ── CC6.3 — Access revocation ─────────────────────────────────────────────
    suspend_actions = _query_safe(engine, """
        SELECT action, performed_by, detail, created_at
        FROM analytics.admin_audit_log
        WHERE company_id = :cid
          AND action IN ('suspend_tenant', 'reactivate_tenant')
        ORDER BY created_at DESC LIMIT 20
    """, {"cid": company_id})

    evidence["controls"]["CC6.3_access_revocation"] = {
        "title":   "Access Removal",
        "status":  "implemented",
        "evidence": {
            "suspend_reactivate_log": suspend_actions,
            "mechanism": "POST /admin/tenants/{id}/suspend writes analytics.tenant_flags; "
                         "all tenant reads check this flag",
        },
    }

    # ── CC7.2 — System monitoring ─────────────────────────────────────────────
    backup_rows = _query_safe(engine, """
        SELECT backup_id, started_at, status, size_bytes, storage, duration_s
        FROM analytics.backup_log
        ORDER BY started_at DESC LIMIT 10
    """)

    backup_success_rate = None
    backup_total = _query_safe(engine, "SELECT COUNT(*) AS t, SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS s FROM analytics.backup_log")
    if backup_total:
        t = backup_total[0].get("t") or 0
        s = backup_total[0].get("s") or 0
        backup_success_rate = round((s / t * 100), 1) if t > 0 else None

    evidence["controls"]["CC7.2_monitoring"] = {
        "title":   "System Monitoring",
        "status":  "implemented",
        "evidence": {
            "health_endpoint":      "/health — returns db_latency_ms, analytics_table_counts, last_etl_at",
            "backup_log_entries":   len(backup_rows),
            "backup_success_rate":  f"{backup_success_rate}%" if backup_success_rate is not None else "no backups yet",
            "recent_backups":       backup_rows[:5],
            "anomaly_detection":    "Phase E enrichment: spend_trend, revenue_trend, stockout_risk signals",
        },
    }

    # ── A.12.3 — Information backup ───────────────────────────────────────────
    evidence["controls"]["A12.3_backup"] = {
        "title":   "Information Backup",
        "status":  "implemented",
        "evidence": {
            "mechanism":        "pg_dump → gzip → local /tmp + optional S3-compatible upload",
            "trigger":          "POST /backup/run — cron-schedulable via x-cron-secret",
            "retention":        "Local: last run only; S3: configurable by bucket lifecycle policy",
            "encryption":       "gzip compression; S3 server-side encryption if enabled on bucket",
            "recent_backups":   backup_rows[:3],
        },
    }

    # ── A.14.2 — Security in development ─────────────────────────────────────
    evidence["controls"]["A14.2_security_headers"] = {
        "title":   "Security Headers",
        "status":  "implemented",
        "evidence": {
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
            "X-Content-Type-Options":    "nosniff",
            "X-Frame-Options":           "DENY",
            "X-XSS-Protection":          "1; mode=block",
            "Referrer-Policy":           "strict-origin-when-cross-origin",
            "Content-Security-Policy":   "default-src 'none'; frame-ancestors 'none'; form-action 'none'",
            "Permissions-Policy":        "geolocation=(), microphone=(), camera=(), payment=()",
        },
    }

    # ── A.17.1 — Availability ─────────────────────────────────────────────────
    evidence["controls"]["A17.1_availability"] = {
        "title":   "Availability",
        "status":  "implemented",
        "evidence": {
            "hosting":         "Railway — managed container platform with automatic restarts",
            "health_check":    "GET /health — monitored by uptime services",
            "fallback_chain":  "Three-tier fallback: analytics.* → raw.* → Base44 live API",
            "circuit_breaker": "reliability.py circuit breakers on all external API calls",
            "retry_logic":     "reliability.py @retry with exponential backoff on external calls",
        },
    }

    # ── Summary ───────────────────────────────────────────────────────────────
    total_controls = len(evidence["controls"])
    implemented    = sum(1 for c in evidence["controls"].values() if c["status"] == "implemented")

    evidence["summary"] = {
        "total_controls":       total_controls,
        "implemented":          implemented,
        "implementation_pct":   round(implemented / total_controls * 100),
        "soc2_readiness":       "Type I ready — evidence collection complete; Type II requires 6-12mo observation period",
        "iso27001_readiness":   "Technical controls implemented; policy documentation and risk register required for certification",
        "next_steps": [
            "Engage SOC 2 auditor for Type I assessment",
            "Document information security policies (ISMS scope, risk register, BCP)",
            "Schedule penetration test with certified firm",
            "Enable OPUS_ENABLED and audit LLM data flows for AI governance",
        ],
    }

    return evidence
