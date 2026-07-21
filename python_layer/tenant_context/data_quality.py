from datetime import datetime, timezone


def section_quality(entity: str, rows: list[dict], tenant_id: str) -> dict:
    missing_tenant = sum(str(row.get("company_id") or "") != tenant_id for row in rows)
    missing_enterprise = sum("enterprise_id" in row and not row.get("enterprise_id") for row in rows)
    missing_owner = 0
    if entity == "task":
        missing_owner = sum(not row.get("assigned_to_name") for row in rows)
    updated = [str(row.get("updated_at")) for row in rows if row.get("updated_at")]
    return {
        "records_examined": len(rows),
        "tenant_scope_violations": missing_tenant,
        "missing_enterprise_links": missing_enterprise,
        "missing_ownership": missing_owner,
        "latest_updated_at": max(updated) if updated else None,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
