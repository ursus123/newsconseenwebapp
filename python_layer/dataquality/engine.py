# ==============================================================
# Newsconseen — Data Quality Engine
# ==============================================================
# Evaluates completeness, duplicates, and invalid values across
# all 7 entities for a given company.
#
# Read priority:
#   Tier 1 — raw.* PostgreSQL tables (full records, populated by ETL)
#   Tier 2 — Base44 live API (if raw tables are empty or DB unavailable)
#
# Produces a DataQualityReport with:
#   overall_score   (0–100)
#   issues          (list of typed issues ordered by severity × impact)
#   by_entity       (entity → score)
#   evaluated_at    (ISO timestamp)
# ==============================================================

import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Entity rule definitions ────────────────────────────────────────────────────
# required:          NULL or empty → critical issue when >10%, warning otherwise
# recommended:       NULL or empty → warning (never critical)
# duplicate_fields:  group-by these columns to detect likely duplicates
# valid_enums:       field → set of canonical values; anything else → warning
# raw_table:         PostgreSQL raw.* table name
# base44_url_attr:   settings attribute name for Base44 fallback URL
# page:              frontend page name for "Fix →" link

ENTITY_RULES = {
    "people": {
        "raw_table":        "raw.people",
        "base44_url_attr":  "base44_people_url",
        "page":             "People",
        "required":         ["person_type", "status"],
        "recommended":      ["email", "first_name"],
        "duplicate_fields": ["first_name", "last_name"],
        "valid_enums": {
            "person_type": {"staff", "client", "contact", "volunteer"},
            "status":      {"active", "inactive", "on_leave"},
        },
    },
    "enterprises": {
        "raw_table":        "raw.enterprises",
        "base44_url_attr":  "base44_enterprises_url",
        "page":             "Enterprises",
        "required":         ["enterprise_type", "status", "enterprise_name"],
        "recommended":      ["country"],
        "duplicate_fields": ["enterprise_name"],
        "valid_enums": {
            "enterprise_type": {"commercial", "nonprofit", "government",
                                "household", "cooperative", "trust"},
            "status":          {"active", "inactive", "prospect", "archived"},
        },
    },
    "products": {
        "raw_table":        "raw.products",
        "base44_url_attr":  "base44_products_url",
        "page":             "Products",
        "required":         ["item_type", "status", "name"],
        "recommended":      ["unit_price", "stock_quantity"],
        "duplicate_fields": ["name"],
        "valid_enums": {
            "item_type": {"physical", "living", "digital",
                         "service_package", "financial_instrument"},
            "status":    {"active", "inactive", "discontinued"},
        },
    },
    "tasks": {
        "raw_table":        "raw.tasks",
        "base44_url_attr":  "base44_tasks_url",
        "page":             "Tasks",
        "required":         ["status", "title"],
        "recommended":      ["due_date", "assigned_to_name"],
        "duplicate_fields": ["title"],
        "valid_enums": {
            "status": {"open", "in_progress", "completed", "cancelled"},
        },
    },
    "transactions": {
        "raw_table":        "raw.transactions",
        "base44_url_attr":  "base44_transactions_url",
        "page":             "Transactions",
        "required":         ["transaction_type", "status", "amount"],
        "recommended":      ["reference_number", "due_date"],
        "duplicate_fields": ["reference_number"],
        "valid_enums": {
            "status": {"draft", "posted", "void", "paid", "overdue"},
        },
    },
    "relationships": {
        "raw_table":        "raw.relationships",
        "base44_url_attr":  "base44_relationships_url",
        "page":             "Relationships",
        "required":         ["relationship_type", "status"],
        "recommended":      [],
        "duplicate_fields": ["person_id", "enterprise_id"],
        "valid_enums": {},
    },
    "addresses": {
        "raw_table":        "raw.addresses",
        "base44_url_attr":  "base44_addresses_url",
        "page":             "Addresses",
        "required":         ["address_type"],
        "recommended":      ["city", "country"],
        "duplicate_fields": ["address_line1", "city"],
        "valid_enums": {},
    },
}


# ── Data loaders ───────────────────────────────────────────────────────────────

def _load_from_pg(table: str, company_id: str):
    """Load full records from a raw.* PostgreSQL table."""
    try:
        import pandas as pd
        from database import get_engine_safe
        from sqlalchemy import text
        engine = get_engine_safe()
        if not engine:
            return None
        df = pd.read_sql(
            text(f"SELECT * FROM {table} WHERE company_id = :cid LIMIT 5000"),  # noqa: S608
            engine,
            params={"cid": company_id},
        )
        return df if not df.empty else None
    except Exception as e:
        logger.debug("dataquality: pg load %s failed — %s", table, e)
        return None


def _load_from_base44(url_attr: str, company_id: str):
    """Fallback: fetch records directly from Base44 REST API."""
    try:
        import pandas as pd
        from config.settings import get_settings
        from etl.utils import fetch_json_to_df, HEADERS
        settings = get_settings()
        url = getattr(settings, url_attr, None)
        if not url:
            return None
        df = fetch_json_to_df(url, HEADERS)
        if df.empty:
            return None
        if "company_id" in df.columns:
            df = df[df["company_id"] == company_id]
        return df if not df.empty else None
    except Exception as e:
        logger.debug("dataquality: base44 load %s failed — %s", url_attr, e)
        return None


def _load(entity: str, rules: dict, company_id: str):
    """Three-tier load: raw PG → Base44 live."""
    df = _load_from_pg(rules["raw_table"], company_id)
    if df is None:
        df = _load_from_base44(rules["base44_url_attr"], company_id)
    return df


# ── Score helpers ──────────────────────────────────────────────────────────────

def _severity(pct: float, required: bool) -> str:
    if required and pct > 10:
        return "critical"
    if pct > 25:
        return "warning"
    if pct > 0:
        return "warning"
    return "info"


def _score_deduction(severity: str, pct: float) -> float:
    if severity == "critical":
        return min(25, pct * 2.5)
    if severity == "warning":
        return min(12, pct * 0.8)
    return 0


# ── Core evaluator ─────────────────────────────────────────────────────────────

def evaluate(company_id: str) -> dict:
    """
    Run data quality checks for a company across all 7 entities.
    Returns a DataQualityReport dict.
    """
    all_issues   = []
    entity_scores = {}
    entity_totals = {}

    for entity_name, rules in ENTITY_RULES.items():
        try:
            df = _load(entity_name, rules, company_id)
            if df is None or df.empty:
                entity_scores[entity_name] = 100   # no data = no issues
                entity_totals[entity_name] = 0
                continue

            total = len(df)
            entity_totals[entity_name] = total
            entity_issues = []
            deduction = 0.0

            # ── 1. Missing required fields ─────────────────────────────────
            for field in rules["required"]:
                if field not in df.columns:
                    continue
                null_mask = df[field].isna() | (df[field].astype(str).str.strip() == "")
                count = int(null_mask.sum())
                if count == 0:
                    continue
                pct = round(count / total * 100, 1)
                sev = _severity(pct, required=True)
                deduction += _score_deduction(sev, pct)
                entity_issues.append({
                    "entity_type":      entity_name,
                    "issue_type":       "missing_field",
                    "severity":         sev,
                    "field":            field,
                    "count":            count,
                    "total":            total,
                    "pct":              pct,
                    "message":          f"{count} {entity_name} ({pct}%) missing '{field}'",
                    "suggested_action": f"Open {rules['page']} and filter records where {field} is empty",
                    "page":             rules["page"],
                })

            # ── 2. Missing recommended fields ──────────────────────────────
            for field in rules["recommended"]:
                if field not in df.columns:
                    continue
                null_mask = df[field].isna() | (df[field].astype(str).str.strip() == "")
                count = int(null_mask.sum())
                if count == 0:
                    continue
                pct = round(count / total * 100, 1)
                if pct < 5:   # skip minor gaps
                    continue
                deduction += _score_deduction("warning", pct)
                entity_issues.append({
                    "entity_type":      entity_name,
                    "issue_type":       "missing_recommended",
                    "severity":         "warning",
                    "field":            field,
                    "count":            count,
                    "total":            total,
                    "pct":              pct,
                    "message":          f"{count} {entity_name} ({pct}%) missing '{field}' (recommended)",
                    "suggested_action": f"Add {field} to improve reporting and alerts",
                    "page":             rules["page"],
                })

            # ── 3. Duplicate detection ─────────────────────────────────────
            dup_fields = [f for f in rules["duplicate_fields"] if f in df.columns]
            if dup_fields:
                subset = df[dup_fields].copy()
                # Only consider rows where ALL dup fields are non-null
                complete = subset.dropna()
                if not complete.empty:
                    duped = complete[complete.duplicated(keep=False)]
                    dup_count = len(duped)
                    if dup_count > 0:
                        pct = round(dup_count / total * 100, 1)
                        deduction += _score_deduction("warning", pct)
                        entity_issues.append({
                            "entity_type":      entity_name,
                            "issue_type":       "duplicate",
                            "severity":         "warning",
                            "field":            " + ".join(dup_fields),
                            "count":            dup_count,
                            "total":            total,
                            "pct":              pct,
                            "message":          (
                                f"{dup_count} {entity_name} ({pct}%) may be duplicates "
                                f"(same {', '.join(dup_fields)})"
                            ),
                            "suggested_action": (
                                f"Review {rules['page']} for duplicate "
                                f"{', '.join(dup_fields)} entries and merge or delete"
                            ),
                            "page": rules["page"],
                        })

            # ── 4. Invalid enum values ─────────────────────────────────────
            for field, valid in rules["valid_enums"].items():
                if field not in df.columns:
                    continue
                populated = df[field].dropna()
                populated = populated[populated.astype(str).str.strip() != ""]
                if populated.empty:
                    continue
                invalid_mask = ~populated.isin(valid)
                inv_count = int(invalid_mask.sum())
                if inv_count == 0:
                    continue
                pct = round(inv_count / total * 100, 1)
                deduction += _score_deduction("warning", pct)
                examples = populated[invalid_mask].unique()[:3].tolist()
                entity_issues.append({
                    "entity_type":      entity_name,
                    "issue_type":       "invalid_value",
                    "severity":         "warning",
                    "field":            field,
                    "count":            inv_count,
                    "total":            total,
                    "pct":              pct,
                    "message":          (
                        f"{inv_count} {entity_name} ({pct}%) have unrecognised "
                        f"'{field}' values (e.g. {examples})"
                    ),
                    "suggested_action": (
                        f"Update {field} values in {rules['page']} "
                        f"to match the standard taxonomy"
                    ),
                    "page": rules["page"],
                })

            all_issues.extend(entity_issues)
            entity_scores[entity_name] = max(0, int(100 - deduction))

        except Exception as exc:
            logger.warning("dataquality: entity=%s error — %s", entity_name, exc)
            entity_scores[entity_name] = 100   # skip broken entity silently

    # ── Overall score ──────────────────────────────────────────────────────────
    scored = [s for s in entity_scores.values() if entity_totals.get(
        next((e for e, s2 in entity_scores.items() if s2 == s), None), 0) > 0]
    if not scored:
        overall_score = 100
    else:
        # Weighted average — entities with more records have more weight
        total_records = sum(entity_totals.values()) or 1
        overall_score = int(
            sum(
                entity_scores[e] * entity_totals.get(e, 0)
                for e in entity_scores
            ) / total_records
        )

    # Sort issues: critical first, then by pct descending
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    all_issues.sort(key=lambda i: (severity_order.get(i["severity"], 9), -i["pct"]))

    critical_count = sum(1 for i in all_issues if i["severity"] == "critical")
    warning_count  = sum(1 for i in all_issues if i["severity"] == "warning")

    return {
        "overall_score":   overall_score,
        "grade":           "A" if overall_score >= 90 else
                           "B" if overall_score >= 75 else
                           "C" if overall_score >= 60 else
                           "D" if overall_score >= 40 else "F",
        "issues":          all_issues,
        "total_issues":    len(all_issues),
        "critical_count":  critical_count,
        "warning_count":   warning_count,
        "by_entity":       entity_scores,
        "record_counts":   entity_totals,
        "evaluated_at":    _now_iso(),
        "company_id":      company_id,
    }


# ── Broken relationship detection ───────────────────────────────────────────
# relationships has bare UUID reference columns with no SQL FK constraints
# (by design — this codebase uses name-based joins, see ARCHITECTURE.md).
# Nothing else validates person_id/enterprise_id actually point at real
# records, so a dangling reference is invisible everywhere else today.
# Scoped to person/enterprise refs only (the two dominant relationship
# categories) rather than also checking item_id/service_id, to keep this
# check fast and simple — extend if item/service relationships turn out to
# need the same treatment.

def check_broken_relationships(company_id: str) -> dict:
    """
    Find Relationship records whose person_id/enterprise_id (or their
    secondary_* counterparts) point at an id that doesn't exist in
    raw.people / raw.enterprises for this company.
    """
    try:
        rel_df = _load_from_pg("raw.relationships", company_id)
        if rel_df is None or rel_df.empty:
            return {"broken_count": 0, "total": 0, "examples": []}

        people_df = _load_from_pg("raw.people", company_id)
        ent_df    = _load_from_pg("raw.enterprises", company_id)
        people_ids = set(people_df["id"].astype(str)) if people_df is not None and "id" in people_df.columns else set()
        ent_ids    = set(ent_df["id"].astype(str))    if ent_df is not None    and "id" in ent_df.columns    else set()

        ref_fields = [
            ("person_id",              people_ids),
            ("secondary_person_id",    people_ids),
            ("enterprise_id",          ent_ids),
            ("secondary_enterprise_id",ent_ids),
        ]

        examples = []
        broken = 0
        for _, row in rel_df.iterrows():
            reasons = []
            for field, valid_ids in ref_fields:
                val = row.get(field)
                if val and str(val) not in valid_ids:
                    reasons.append(f"{field} {val} not found")
            if reasons:
                broken += 1
                if len(examples) < 5:
                    examples.append({
                        "id":                str(row.get("id")),
                        "relationship_type": row.get("relationship_type"),
                        "reasons":           reasons,
                    })

        return {"broken_count": broken, "total": len(rel_df), "examples": examples}
    except Exception as exc:
        logger.warning("dataquality: broken-relationship check failed — %s", exc)
        return {"broken_count": 0, "total": 0, "examples": [], "error": str(exc)}


# ── Per-table sync freshness ────────────────────────────────────────────────
# raw.* tables are a full REPLACE on every ETL run (etl/load.py load_raw),
# stamped with a _loaded_at column at write time. No per-table freshness was
# exposed anywhere before this — /health only has one aggregate last_etl_at
# timestamp sourced from analytics.people_summary.

_RAW_TABLES = [
    "people", "enterprises", "products", "tasks", "transactions",
    "relationships", "addresses", "services",
    "documents", "schedules", "signals", "channels", "territories",
    "animals", "plots", "observations",
]

_STALE_HOURS = 24


def check_sync_freshness(company_id: str, tables: list[str] | None = None) -> dict:
    """MAX(_loaded_at) per raw.* table for this company — answers "which
    tables are synced to the datamart, and how recently."

    Args:
        tables: restrict the scan to this subset of raw.* table names
            (e.g. the 4 tables a network rollup already fetches per member)
            instead of the full _RAW_TABLES list — callers that only need
            a cheap proxy check should pass a small subset rather than
            paying for all 15+ tables per call.
    """
    try:
        from datetime import datetime, timezone
        from database import get_engine_safe
        from sqlalchemy import text

        engine = get_engine_safe()
        if not engine:
            return {}

        scan_tables = tables if tables is not None else _RAW_TABLES

        result = {}
        with engine.connect() as conn:
            for table in scan_tables:
                try:
                    exists = conn.execute(
                        text(
                            "SELECT 1 FROM information_schema.tables "
                            "WHERE table_schema = 'raw' AND table_name = :t LIMIT 1"
                        ),
                        {"t": table},
                    ).fetchone()
                    if not exists:
                        result[table] = {"last_synced": None, "is_stale": True, "status": "not_created"}
                        continue

                    ts = conn.execute(
                        text(f"SELECT MAX(_loaded_at) FROM raw.{table} WHERE company_id = :cid"),  # noqa: S608
                        {"cid": company_id},
                    ).scalar()
                    if not ts:
                        result[table] = {"last_synced": None, "is_stale": True, "status": "no_data_for_company"}
                        continue

                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    age_hours = (datetime.now(timezone.utc) - ts).total_seconds() / 3600
                    result[table] = {
                        "last_synced": ts.isoformat(),
                        "is_stale":    age_hours > _STALE_HOURS,
                        "status":      "synced",
                    }
                except Exception as exc:
                    logger.debug("dataquality: sync-freshness %s failed — %s", table, exc)
                    result[table] = {"last_synced": None, "is_stale": True, "status": "error"}
        return result
    except Exception as exc:
        logger.warning("dataquality: sync freshness check failed — %s", exc)
        return {}


# ── Degraded features — entity emptiness → downstream feature impact ───────
# Template-driven rather than hand-built per company: cross-referenced
# against record_counts at report time, so any entity with 0 records
# automatically surfaces its mapped features as degraded.

DEGRADED_FEATURES = {
    "people": [
        {"feature": "Dashboard headcount card",     "page": "Dashboard"},
        {"feature": "People page",                  "page": "People"},
        {"feature": "Attendance tracking",           "page": "Attendance"},
        {"feature": "Person-linked relationships",   "page": "Relationships"},
    ],
    "enterprises": [
        {"feature": "Dashboard enterprise card",     "page": "Dashboard"},
        {"feature": "Enterprises page",              "page": "Enterprises"},
        {"feature": "Company Graph",                 "page": "CompanyGraphHome"},
    ],
    "transactions": [
        {"feature": "Dashboard revenue card",        "page": "Dashboard"},
        {"feature": "AR aging report",               "page": "Reports"},
        {"feature": "Revenue KPI goals",              "page": "Dashboard"},
        {"feature": "Reports revenue charts",         "page": "Reports"},
    ],
    "tasks": [
        {"feature": "Dashboard task card",           "page": "Dashboard"},
        {"feature": "Tasks page",                    "page": "Tasks"},
        {"feature": "Staff utilisation report",       "page": "Reports"},
    ],
    "products": [
        {"feature": "Dashboard inventory card",      "page": "Dashboard"},
        {"feature": "Products page",                 "page": "Products"},
        {"feature": "Inventory health / at-risk stock","page": "Products"},
    ],
    "relationships": [
        {"feature": "Relationships page",            "page": "Relationships"},
        {"feature": "Cross-entity dashboards (Enterprise People, Item Assignment, Role Gaps, Accountability)", "page": "Reports"},
    ],
    "addresses": [
        {"feature": "Addresses page",                "page": "Addresses"},
        {"feature": "Map / spatial views",            "page": "MapExplorer"},
    ],
}


def get_degraded_features(record_counts: dict) -> list:
    """Any entity with 0 records surfaces its mapped downstream features."""
    degraded = []
    for entity, count in record_counts.items():
        if count == 0 and entity in DEGRADED_FEATURES:
            degraded.append({"entity": entity, "features": DEGRADED_FEATURES[entity]})
    return degraded
