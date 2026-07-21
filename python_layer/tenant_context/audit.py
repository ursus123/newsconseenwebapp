def safe_audit_envelope(context, *, entity: str, permission: str, outcome: str, result_count=None) -> dict:
    """Return audit metadata without credentials or cross-tenant identifiers."""
    return {
        "request_id": context.request_id,
        "actor_verified": bool(context.user_id),
        "tenant_id": context.tenant_id,
        "scope_type": context.scope_type,
        "scope_id": context.scope_id,
        "entity": entity,
        "permission": permission,
        "tenant_filter_enforced": True,
        "outcome": outcome,
        "result_count": result_count,
    }
