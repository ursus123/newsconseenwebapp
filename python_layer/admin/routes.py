"""
admin/routes.py
----------------
Platform-level multi-tenant administration endpoints.

All routes require EITHER:
  Header: Authorization: Bearer <verified Supabase session, role=super_admin>  (browser path)
  Header: x-admin-secret: <ADMIN_SECRET env var>  (server-side automation fallback)

The Authorization path is checked first and is the only path the frontend
uses today — x-admin-secret exists solely for future non-browser callers and
is never sent by the client bundle.

Endpoints
---------
GET  /admin/tenants                    List all tenants with health signals
GET  /admin/tenants/{company_id}       Single tenant detail + full health
POST /admin/tenants                    Manually create + provision a new tenant
POST /admin/tenants/{company_id}/etl   Trigger full ETL for one tenant
POST /admin/tenants/{company_id}/suspend    Suspend a tenant
POST /admin/tenants/{company_id}/reactivate Reactivate a suspended tenant
GET  /admin/health                     Platform-wide health summary
GET  /admin/audit                      Recent admin actions log
POST /admin/seed-demo-tenant           Seed (idempotent) a demo tenant with
                                        realistic sample data across all 7
                                        core entities, for sales demos and
                                        manual QA
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["Platform Admin"])


# ── Auth helper ───────────────────────────────────────────────────────────────

def _check_auth(x_admin_secret: Optional[str], authorization: Optional[str] = None) -> None:
    if authorization:
        from onboarding.auth import verify_super_admin
        verify_super_admin(authorization)  # raises 401/403 on failure
        return
    from config.settings import settings
    secret = settings.admin_secret
    if not secret:
        raise HTTPException(status_code=503, detail="Admin API is disabled — set ADMIN_SECRET env var")
    if x_admin_secret != secret:
        raise HTTPException(status_code=401, detail="Invalid admin secret")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── DB helpers ────────────────────────────────────────────────────────────────

def _get_engine():
    from database import get_engine_safe
    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return engine


def _fetch_all_tenants(engine) -> list[dict]:
    """
    Pull all distinct company_ids from the analytics layer.
    Joins onboarding_log for provision metadata and people_summary for counts.
    Falls back gracefully if tables are empty.
    """
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT
                    e.company_id,
                    e.enterprise_name,
                    e.enterprise_type,
                    e.status            AS tenant_status,
                    e.subscription_tier,
                    e.subscription_status,
                    e.trial_ends_at,
                    e.country,
                    e.created_date,
                    o.ai_readiness_score,
                    o.taxonomy_count,
                    o.workflows_created,
                    o.provisioned_at,
                    o.cluster,
                    ps.total_count      AS people_count,
                    ps.loaded_at        AS last_etl_at
                FROM analytics.enterprise_summary e
                LEFT JOIN analytics.onboarding_log o
                    ON o.company_id = e.company_id
                LEFT JOIN (
                    SELECT company_id,
                           MAX(total_count) AS total_count,
                           MAX(loaded_at)   AS loaded_at
                    FROM analytics.people_summary
                    GROUP BY company_id
                ) ps ON ps.company_id = e.company_id
                WHERE e.company_id IS NOT NULL
                  AND e.company_id != ''
                ORDER BY e.created_date DESC NULLS LAST
            """)).fetchall()

            return [dict(r._mapping) for r in rows]
    except Exception as exc:
        logger.debug("admin: tenant fetch failed — %s", exc)
        return []


def _log_admin_action(engine, action: str, company_id: str, performed_by: str, detail: str = "") -> None:
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO analytics.admin_audit_log
                    (action, company_id, performed_by, detail)
                VALUES (:action, :company_id, :performed_by, :detail)
            """), {"action": action, "company_id": company_id,
                   "performed_by": performed_by, "detail": detail})
    except Exception as exc:
        logger.debug("admin: audit log write failed — %s", exc)


# ── Request models ────────────────────────────────────────────────────────────

class CreateTenantRequest(BaseModel):
    enterprise_name:  str
    enterprise_type:  str
    country:          str
    admin_email:      str                    # sent an invite (informational — Base44 manages actual user creation)
    admin_name:       Optional[str] = ""
    subscription_tier: str = "professional"
    notes:            Optional[str] = ""
    performed_by:     str = "platform_admin" # who is creating this tenant


class UpdateTenantRequest(BaseModel):
    subscription_tier:   Optional[str] = None
    subscription_status: Optional[str] = None
    notes:               Optional[str] = None
    performed_by:        str = "platform_admin"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/health")
def admin_platform_health(
    x_admin_secret: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Platform-wide health: tenant count, total ETL coverage, last backup."""
    _check_auth(x_admin_secret, authorization)
    engine = _get_engine()

    result = {
        "tenant_count":        0,
        "total_people":        0,
        "total_transactions":  0,
        "provisioned_tenants": 0,
        "last_backup_at":      None,
        "db_ok":               True,
    }

    try:
        with engine.connect() as conn:
            r = conn.execute(text(
                "SELECT COUNT(DISTINCT company_id) AS cnt FROM analytics.enterprise_summary "
                "WHERE company_id IS NOT NULL AND company_id != ''"
            )).fetchone()
            result["tenant_count"] = r.cnt if r else 0

            r = conn.execute(text(
                "SELECT COUNT(*) AS cnt FROM analytics.people_summary"
            )).fetchone()
            result["total_people"] = r.cnt if r else 0

            r = conn.execute(text(
                "SELECT COUNT(*) AS cnt FROM analytics.transaction_summary"
            )).fetchone()
            result["total_transactions"] = r.cnt if r else 0

            r = conn.execute(text(
                "SELECT COUNT(DISTINCT company_id) AS cnt FROM analytics.onboarding_log"
            )).fetchone()
            result["provisioned_tenants"] = r.cnt if r else 0

            r = conn.execute(text(
                "SELECT started_at FROM analytics.backup_log "
                "WHERE status = 'success' ORDER BY started_at DESC LIMIT 1"
            )).fetchone()
            result["last_backup_at"] = str(r.started_at) if r else None

    except Exception as exc:
        result["db_ok"] = False
        result["error"] = str(exc)

    return result


@router.get("/tenants")
def list_tenants(
    x_admin_secret: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
    search: str = Query(default=""),
    status: str = Query(default=""),
    limit:  int = Query(default=100, le=500),
):
    """List all tenants with health signals. Supports search + status filter."""
    _check_auth(x_admin_secret, authorization)
    engine = _get_engine()

    tenants = _fetch_all_tenants(engine)

    # Deduplicate by company_id (take first row per company)
    seen = set()
    unique = []
    for t in tenants:
        cid = t.get("company_id")
        if cid and cid not in seen:
            seen.add(cid)
            unique.append(t)
    tenants = unique

    if search:
        q = search.lower()
        tenants = [t for t in tenants if
                   q in (t.get("enterprise_name") or "").lower() or
                   q in (t.get("company_id") or "").lower() or
                   q in (t.get("admin_email") or "").lower()]

    if status:
        tenants = [t for t in tenants if t.get("tenant_status") == status]

    # Stringify any non-serialisable fields
    for t in tenants:
        for k, v in t.items():
            if hasattr(v, "isoformat"):
                t[k] = str(v)

    return {
        "tenants":      tenants[:limit],
        "total":        len(tenants),
        "returned":     min(len(tenants), limit),
    }


@router.get("/tenants/{company_id}")
def get_tenant(
    company_id: str,
    x_admin_secret: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Full detail view for a single tenant including enrichment coverage."""
    _check_auth(x_admin_secret, authorization)
    engine = _get_engine()

    tenants = _fetch_all_tenants(engine)
    match = next((t for t in tenants if t.get("company_id") == company_id), None)

    if not match:
        raise HTTPException(status_code=404, detail=f"Tenant '{company_id}' not found")

    # Stringify dates
    for k, v in match.items():
        if hasattr(v, "isoformat"):
            match[k] = str(v)

    # Enrichment coverage
    enrichment = {}
    try:
        with engine.connect() as conn:
            for entity in ("person", "enterprise", "product", "transaction"):
                table = f"{entity}_enrichment"
                r = conn.execute(text(
                    f"SELECT COUNT(*) AS cnt FROM analytics.{table} "
                    f"WHERE company_id = :cid"
                ), {"cid": company_id}).fetchone()
                enrichment[entity] = r.cnt if r else 0
    except Exception:
        pass

    # Recent onboarding log entries
    onboarding_history = []
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT enterprise_type, cluster, ai_readiness_score,
                       taxonomy_count, workflows_created, provisioned_at
                FROM analytics.onboarding_log
                WHERE company_id = :cid
                ORDER BY provisioned_at DESC
                LIMIT 5
            """), {"cid": company_id}).fetchall()
            onboarding_history = [dict(r._mapping) for r in rows]
            for h in onboarding_history:
                for k, v in h.items():
                    if hasattr(v, "isoformat"):
                        h[k] = str(v)
    except Exception:
        pass

    # Admin audit log
    audit = []
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT action, performed_by, detail, created_at
                FROM analytics.admin_audit_log
                WHERE company_id = :cid
                ORDER BY created_at DESC
                LIMIT 10
            """), {"cid": company_id}).fetchall()
            audit = [dict(r._mapping) for r in rows]
            for a in audit:
                for k, v in a.items():
                    if hasattr(v, "isoformat"):
                        a[k] = str(v)
    except Exception:
        pass

    return {
        **match,
        "enrichment_counts": enrichment,
        "onboarding_history": onboarding_history,
        "admin_audit": audit,
    }


@router.post("/tenants", status_code=201)
def create_tenant(
    req: CreateTenantRequest,
    x_admin_secret: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """
    Manually provision a new tenant from the admin UI.

    Creates the Enterprise record in Base44, assigns company_id,
    calls /onboarding/provision for taxonomy + workflows,
    and records the action in admin_audit_log.
    """
    _check_auth(x_admin_secret, authorization)
    engine = _get_engine()

    from config.settings import settings, HEADERS
    import httpx

    # Step 1: Create Enterprise in Base44
    enterprise_id = str(uuid.uuid4())
    trial_end = datetime.now(timezone.utc).strftime("%Y-%m-%d")  # admin provisions immediately active

    payload = {
        "enterprise_name":    req.enterprise_name,
        "enterprise_type":    req.enterprise_type,
        "country":            req.country,
        "status":             "active",
        "operating_status":   "open",
        "subscription_tier":  req.subscription_tier,
        "subscription_status": "active",
        "company_id":         enterprise_id,
        "description":        req.notes or "",
    }

    enterprise_record = None
    try:
        if settings.base44_enterprises_url:
            resp = httpx.post(
                settings.base44_enterprises_url,
                json=payload,
                headers=HEADERS,
                timeout=15,
            )
            if resp.status_code in (200, 201):
                enterprise_record = resp.json()
                real_id = enterprise_record.get("id") or enterprise_id
                enterprise_id = real_id
            else:
                logger.warning("admin: Base44 enterprise create returned %d", resp.status_code)
    except Exception as exc:
        logger.warning("admin: Base44 enterprise create failed — %s", exc)

    # Step 2: Run onboarding/provision
    provision_result = {}
    try:
        from onboarding.routes import provision_tenant, ProvisionRequest
        prov_req = ProvisionRequest(
            company_id=enterprise_id,
            enterprise_type=req.enterprise_type,
            enterprise_name=req.enterprise_name,
            steps_completed=7,
        )
        provision_result = provision_tenant(prov_req)
    except Exception as exc:
        logger.warning("admin: onboarding provision failed — %s", exc)

    # Step 3: Trigger ETL
    try:
        import threading
        from etl.enterprises import load_enterprise_summary
        threading.Thread(target=load_enterprise_summary, daemon=True).start()
    except Exception:
        pass

    # Step 4: Log
    _log_admin_action(
        engine,
        action="create_tenant",
        company_id=enterprise_id,
        performed_by=req.performed_by,
        detail=f"enterprise_name={req.enterprise_name} type={req.enterprise_type} admin_email={req.admin_email}",
    )

    return {
        "status":          "created",
        "company_id":      enterprise_id,
        "enterprise_name": req.enterprise_name,
        "enterprise_type": req.enterprise_type,
        "admin_email":     req.admin_email,
        "provision":       provision_result if isinstance(provision_result, dict) else {},
        "next_steps": [
            f"Invite {req.admin_email} to Base44 and set their company_id to {enterprise_id}",
            "Operator can now log in and their onboarding is pre-provisioned",
        ],
    }


@router.post("/tenants/{company_id}/etl")
def trigger_tenant_etl(
    company_id: str,
    x_admin_secret: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
    performed_by: str = Query(default="platform_admin"),
):
    """Trigger a full ETL run for a specific tenant."""
    _check_auth(x_admin_secret, authorization)
    engine = _get_engine()

    # Fire ETL for all entities in background
    try:
        import threading
        from etl.people        import load_people_summary
        from etl.enterprises   import load_enterprise_summary
        from etl.products      import load_product_summary
        from etl.transactions  import load_transaction_summary
        from etl.tasks         import load_task_summary

        def _run():
            for fn in (load_people_summary, load_enterprise_summary,
                       load_product_summary, load_transaction_summary, load_task_summary):
                try:
                    fn()
                except Exception as e:
                    logger.warning("admin ETL: %s failed — %s", fn.__name__, e)

        threading.Thread(target=_run, daemon=True).start()
        status = "triggered"
    except Exception as exc:
        logger.error("admin: ETL trigger failed — %s", exc)
        status = f"error: {exc}"

    _log_admin_action(engine, "trigger_etl", company_id, performed_by)

    return {
        "status":     status,
        "company_id": company_id,
        "message":    "ETL running in background — analytics tables will update in ~30s",
    }


@router.post("/tenants/{company_id}/suspend")
def suspend_tenant(
    company_id: str,
    x_admin_secret: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
    performed_by: str = Query(default="platform_admin"),
    reason: str = Query(default=""),
):
    """Mark a tenant as suspended in the admin_audit_log."""
    _check_auth(x_admin_secret, authorization)
    engine = _get_engine()

    _log_admin_action(
        engine, "suspend_tenant", company_id, performed_by,
        detail=f"reason={reason}",
    )

    # Write suspension flag to analytics
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO analytics.tenant_flags (company_id, flag, set_by, set_at, reason)
                VALUES (:cid, 'suspended', :by, NOW(), :reason)
                ON CONFLICT (company_id, flag) DO UPDATE
                    SET set_by = EXCLUDED.set_by, set_at = NOW(), reason = EXCLUDED.reason
            """), {"cid": company_id, "by": performed_by, "reason": reason})
    except Exception as exc:
        logger.debug("admin: tenant_flags write skipped — %s", exc)

    return {"status": "suspended", "company_id": company_id}


@router.post("/tenants/{company_id}/reactivate")
def reactivate_tenant(
    company_id: str,
    x_admin_secret: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
    performed_by: str = Query(default="platform_admin"),
):
    """Remove suspension flag for a tenant."""
    _check_auth(x_admin_secret, authorization)
    engine = _get_engine()

    _log_admin_action(engine, "reactivate_tenant", company_id, performed_by)

    try:
        with engine.begin() as conn:
            conn.execute(text("""
                DELETE FROM analytics.tenant_flags
                WHERE company_id = :cid AND flag = 'suspended'
            """), {"cid": company_id})
    except Exception as exc:
        logger.debug("admin: tenant_flags delete skipped — %s", exc)

    return {"status": "reactivated", "company_id": company_id}


@router.get("/audit")
def get_admin_audit(
    x_admin_secret: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
    limit: int = Query(default=50, le=200),
):
    """Recent platform admin actions across all tenants."""
    _check_auth(x_admin_secret, authorization)
    engine = _get_engine()

    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT action, company_id, performed_by, detail, created_at
                FROM analytics.admin_audit_log
                ORDER BY created_at DESC
                LIMIT :lim
            """), {"lim": limit}).fetchall()

            entries = [dict(r._mapping) for r in rows]
            for e in entries:
                for k, v in e.items():
                    if hasattr(v, "isoformat"):
                        e[k] = str(v)
            return {"entries": entries, "count": len(entries)}

    except Exception as exc:
        logger.debug("admin: audit fetch failed — %s", exc)
        return {"entries": [], "count": 0}


# ── Demo tenant seeding ─────────────────────────────────────────────────────

_DEMO_COMPANY_ID = "demo-tenant"


@router.post("/seed-demo-tenant")
def seed_demo_tenant(
    x_admin_secret: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """
    Seed (idempotently) a demo tenant with realistic sample data across all 7
    core entities, for sales demos and manual QA. Safe to call repeatedly —
    checks for existing demo People before creating anything.
    """
    _check_auth(x_admin_secret, authorization)

    from data_sources import supabase_source

    existing = supabase_source.list_records("person", company_id=_DEMO_COMPANY_ID, limit=1)
    if existing:
        return {"status": "already_seeded", "company_id": _DEMO_COMPANY_ID}

    def _create(entity: str, payload: dict) -> dict:
        payload = {**payload, "company_id": _DEMO_COMPANY_ID}
        result = supabase_source.create_record(entity, payload, company_id=_DEMO_COMPANY_ID)
        if result.get("error"):
            raise RuntimeError(f"seed-demo-tenant: {entity} create failed — {result['error']}")
        return result

    created = {"enterprises": 0, "people": 0, "products": 0, "tasks": 0, "transactions": 0, "relationships": 0, "addresses": 0}

    enterprises = [
        _create("enterprise", {
            "enterprise_name": "Sunrise Family Clinic", "enterprise_type": "commercial",
            "enterprise_tier": "headquarters", "operating_status": "open", "status": "active",
            "city": "Nairobi", "country": "Kenya",
        }),
        _create("enterprise", {
            "enterprise_name": "Sunrise Family Clinic — Westlands Branch", "enterprise_type": "commercial",
            "enterprise_tier": "branch", "operating_status": "open", "status": "active",
            "city": "Nairobi", "country": "Kenya",
        }),
    ]
    created["enterprises"] = len(enterprises)
    hq_id, branch_id = enterprises[0]["id"], enterprises[1]["id"]

    people = [
        _create("person", {"first_name": "Amina", "last_name": "Kimani", "person_type": "staff", "engagement_model": "employed", "status": "active", "email": "amina.kimani@demo.newsconseen.com"}),
        _create("person", {"first_name": "David", "last_name": "Otieno", "person_type": "staff", "engagement_model": "employed", "status": "active", "email": "david.otieno@demo.newsconseen.com"}),
        _create("person", {"first_name": "Grace", "last_name": "Wanjiru", "person_type": "client", "engagement_model": "enrolled", "status": "active", "email": "grace.wanjiru@demo.newsconseen.com"}),
        _create("person", {"first_name": "Peter", "last_name": "Mwangi", "person_type": "client", "engagement_model": "enrolled", "status": "active", "email": "peter.mwangi@demo.newsconseen.com"}),
        _create("person", {"first_name": "Sarah", "last_name": "Njoroge", "person_type": "client", "engagement_model": "enrolled", "status": "active", "email": "sarah.njoroge@demo.newsconseen.com"}),
        _create("person", {"first_name": "James", "last_name": "Kariuki", "person_type": "contact", "engagement_model": "contracted", "status": "active", "email": "james.kariuki@demo.newsconseen.com"}),
    ]
    created["people"] = len(people)
    staff_id, client_id = people[0]["id"], people[2]["id"]

    products = [
        _create("product", {"name": "General Consultation", "item_type": "service_package", "item_class": "unrestricted", "unit_of_measure": "session", "status": "active"}),
        _create("product", {"name": "Amoxicillin 500mg", "item_type": "physical", "item_class": "controlled", "unit_of_measure": "box", "status": "active", "stock_quantity": 40, "min_stock_level": 10}),
        _create("product", {"name": "Blood Pressure Monitor", "item_type": "physical", "item_class": "reusable", "unit_of_measure": "piece", "status": "active", "stock_quantity": 5, "min_stock_level": 2}),
        _create("product", {"name": "Annual Wellness Package", "item_type": "service_package", "item_class": "unrestricted", "unit_of_measure": "kit", "status": "active"}),
    ]
    created["products"] = len(products)

    tasks = [
        _create("task", {"title": "Follow-up appointment — Grace Wanjiru", "task_type": "visit", "status": "open", "enterprise": hq_id, "assigned_to_name": "Amina Kimani"}),
        _create("task", {"title": "Restock Amoxicillin", "task_type": "procurement", "status": "open", "enterprise": hq_id, "assigned_to_name": "David Otieno"}),
        _create("task", {"title": "Annual wellness check — Peter Mwangi", "task_type": "visit", "status": "completed", "enterprise": branch_id, "assigned_to_name": "Amina Kimani"}),
        _create("task", {"title": "Equipment maintenance — BP monitor", "task_type": "maintenance", "status": "open", "enterprise": hq_id, "assigned_to_name": "David Otieno"}),
    ]
    created["tasks"] = len(tasks)

    transactions = [
        _create("transaction", {"transaction_type": "service_fee", "amount": 45.00, "status": "posted", "enterprise": hq_id, "description": "General consultation — Grace Wanjiru"}),
        _create("transaction", {"transaction_type": "service_fee", "amount": 120.00, "status": "posted", "enterprise": branch_id, "description": "Wellness package — Peter Mwangi"}),
        _create("transaction", {"transaction_type": "supply_purchase", "amount": 300.00, "status": "posted", "enterprise": hq_id, "description": "Amoxicillin restock"}),
        _create("transaction", {"transaction_type": "service_fee", "amount": 45.00, "status": "draft", "enterprise": hq_id, "description": "Consultation — Sarah Njoroge (pending)"}),
    ]
    created["transactions"] = len(transactions)

    relationships = [
        _create("relationship", {"relationship_type": "employment", "person_name": "Amina Kimani", "enterprise_name": "Sunrise Family Clinic", "role": "Registered Nurse"}),
    ]
    created["relationships"] = len(relationships)

    addresses = [
        _create("address", {"label": "Headquarters", "address_line1": "123 Kenyatta Ave", "city": "Nairobi", "country": "Kenya", "enterprise_id": hq_id}),
    ]
    created["addresses"] = len(addresses)

    # Fire-and-forget ETL refresh for the demo tenant
    try:
        import os
        import threading
        import requests as req
        railway_url = os.getenv("RAILWAY_URL", "https://newsconseenwebapp-production.up.railway.app")

        def _fire_etl():
            for slug in ("people", "enterprise", "product", "task", "transaction", "relationship", "address"):
                try:
                    req.post(f"{railway_url}/load/{slug}-summary", timeout=15)
                except Exception:
                    pass

        threading.Thread(target=_fire_etl, daemon=True).start()
    except Exception as exc:
        logger.debug("admin: seed-demo-tenant ETL trigger skipped — %s", exc)

    return {"status": "seeded", "company_id": _DEMO_COMPANY_ID, "created": created}
