"""Tenant-controlled advisor portfolio and routing for Idjwi.

Provider secrets are deliberately not stored here. Connections reference a secret
held by the deployment environment or an external vault. Idjwi policy stores only
provider/model metadata, permitted objectives, data classification, and budgets.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Optional

from sqlalchemy import text

from database import get_engine_safe
from .llm_registry import MODEL_REGISTRY, ModelSpec, provider_status


DDL = """
CREATE TABLE IF NOT EXISTS analytics.idjwi_advisor_policies (
    company_id          TEXT PRIMARY KEY,
    default_mode        TEXT NOT NULL DEFAULT 'automatic',
    default_profile     TEXT NOT NULL DEFAULT 'balanced',
    allow_external      BOOLEAN NOT NULL DEFAULT TRUE,
    allow_comparison    BOOLEAN NOT NULL DEFAULT FALSE,
    monthly_budget_usd  NUMERIC,
    rules               JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_by          TEXT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS analytics.idjwi_advisor_connections (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id          TEXT NOT NULL,
    provider            TEXT NOT NULL,
    model_id            TEXT NOT NULL,
    label               TEXT,
    credential_ref      TEXT,
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    objectives          JSONB NOT NULL DEFAULT '[]'::jsonb,
    data_classes        JSONB NOT NULL DEFAULT '["public","internal"]'::jsonb,
    priority            INT NOT NULL DEFAULT 100,
    created_by          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, provider, model_id)
);
CREATE INDEX IF NOT EXISTS idx_idjwi_advisors_company
    ON analytics.idjwi_advisor_connections (company_id, enabled, priority);
"""

PROFILE_TIERS = {
    "fast": ("triage", "execution", "strategy"),
    "balanced": ("execution", "triage", "strategy"),
    "deep": ("strategy", "execution", "triage"),
    "coding": ("coding", "execution", "strategy", "triage"),
    "research": ("research", "strategy", "execution", "triage"),
}


@dataclass(frozen=True)
class AdvisorSelection:
    mode: str
    profile: str
    model_id: Optional[str]
    provider: Optional[str]
    reason: str
    source: str
    data_classification: str = "internal"
    comparison_models: tuple[str, ...] = ()
    credential_ref: Optional[str] = None

    def public_dict(self) -> dict:
        result = asdict(self)
        result["comparison_models"] = list(self.comparison_models)
        result.pop("credential_ref", None)
        return result


def ensure_tables(engine=None) -> bool:
    eng = engine or get_engine_safe()
    if not eng:
        return False
    try:
        with eng.connect() as conn:
            conn.execute(text(DDL))
            conn.commit()
        return True
    except Exception:
        return False


def _default_policy() -> dict:
    return {
        "default_mode": "automatic",
        "default_profile": "balanced",
        "allow_external": True,
        "allow_comparison": False,
        "monthly_budget_usd": None,
        "rules": [],
        "source": "newsconseen_default",
    }


def get_policy(company_id: str, engine=None) -> dict:
    eng = engine or get_engine_safe()
    if not eng or not company_id or not ensure_tables(eng):
        return _default_policy()
    try:
        with eng.connect() as conn:
            row = conn.execute(text("""
                SELECT default_mode, default_profile, allow_external,
                       allow_comparison, monthly_budget_usd, rules, updated_by, updated_at
                FROM analytics.idjwi_advisor_policies WHERE company_id = :cid
            """), {"cid": company_id}).mappings().fetchone()
        if not row:
            return _default_policy()
        result = dict(row)
        result["monthly_budget_usd"] = float(result["monthly_budget_usd"]) if result["monthly_budget_usd"] is not None else None
        result["rules"] = result.get("rules") or []
        result["source"] = "tenant_policy"
        return result
    except Exception:
        return _default_policy()


def save_policy(company_id: str, policy: dict, actor: str, engine=None) -> dict:
    eng = engine or get_engine_safe()
    if not eng or not ensure_tables(eng):
        raise RuntimeError("Advisor policy storage is unavailable")
    mode = policy.get("default_mode", "automatic")
    if mode not in {"core", "automatic", "selected", "compare"}:
        raise ValueError("Invalid advisor mode")
    profile = policy.get("default_profile", "balanced")
    if profile not in PROFILE_TIERS:
        raise ValueError("Invalid reasoning profile")
    with eng.connect() as conn:
        conn.execute(text("""
            INSERT INTO analytics.idjwi_advisor_policies
                (company_id, default_mode, default_profile, allow_external,
                 allow_comparison, monthly_budget_usd, rules, updated_by, updated_at)
            VALUES (:cid, :mode, :profile, :external, :comparison, :budget,
                    CAST(:rules AS jsonb), :actor, NOW())
            ON CONFLICT (company_id) DO UPDATE SET
                default_mode = EXCLUDED.default_mode,
                default_profile = EXCLUDED.default_profile,
                allow_external = EXCLUDED.allow_external,
                allow_comparison = EXCLUDED.allow_comparison,
                monthly_budget_usd = EXCLUDED.monthly_budget_usd,
                rules = EXCLUDED.rules,
                updated_by = EXCLUDED.updated_by,
                updated_at = NOW()
        """), {
            "cid": company_id, "mode": mode, "profile": profile,
            "external": bool(policy.get("allow_external", True)),
            "comparison": bool(policy.get("allow_comparison", False)),
            "budget": policy.get("monthly_budget_usd"),
            "rules": json.dumps(policy.get("rules") or []), "actor": actor,
        })
        conn.commit()
    return get_policy(company_id, eng)


def list_connections(company_id: str, engine=None, include_credential_ref: bool = False) -> list[dict]:
    eng = engine or get_engine_safe()
    rows = []
    if eng and company_id and ensure_tables(eng):
        try:
            with eng.connect() as conn:
                rows = conn.execute(text("""
                    SELECT id, provider, model_id, label, credential_ref, enabled,
                           objectives, data_classes, priority, updated_at
                    FROM analytics.idjwi_advisor_connections
                    WHERE company_id = :cid ORDER BY priority, provider, model_id
                """), {"cid": company_id}).mappings().all()
        except Exception:
            rows = []
    if rows:
        public_rows = []
        for row in rows:
            item = dict(row)
            credential_ref = item.get("credential_ref")
            item["credential_configured"] = bool(credential_ref)
            if not include_credential_ref:
                item.pop("credential_ref", None)
            public_rows.append(item)
        return public_rows
    # Managed adapters are visible as defaults, but secret values are never exposed.
    statuses = provider_status()
    return [
        {
            "id": f"managed:{spec.id}", "provider": spec.provider,
            "model_id": spec.id, "label": spec.label,
            "credential_configured": bool(statuses.get(spec.provider)),
            "enabled": bool(statuses.get(spec.provider)), "objectives": [],
            "data_classes": ["public", "internal"], "priority": 100,
            "source": "newsconseen_managed",
        }
        for spec in MODEL_REGISTRY.values()
    ]


def save_connection(company_id: str, connection: dict, actor: str, engine=None) -> dict:
    eng = engine or get_engine_safe()
    if not eng or not ensure_tables(eng):
        raise RuntimeError("Advisor connection storage is unavailable")
    model_id = str(connection.get("model_id") or "").strip()
    provider = str(connection.get("provider") or "").strip().lower()
    if not model_id or not provider:
        raise ValueError("provider and model_id are required")
    if model_id not in MODEL_REGISTRY:
        raise ValueError("model_id is not registered in the current Idjwi advisor adapters")
    if MODEL_REGISTRY[model_id].provider != provider:
        raise ValueError("provider does not match the registered model adapter")
    credential_ref = str(connection.get("credential_ref") or "").strip() or None
    if credential_ref and not credential_ref.startswith(("env:", "vault:")):
        raise ValueError("credential_ref must use env: or vault:; plaintext secrets are forbidden")
    with eng.connect() as conn:
        conn.execute(text("""
            INSERT INTO analytics.idjwi_advisor_connections
                (company_id, provider, model_id, label, credential_ref, enabled,
                 objectives, data_classes, priority, created_by, updated_at)
            VALUES (:cid, :provider, :model, :label, :credential, :enabled,
                    CAST(:objectives AS jsonb), CAST(:classes AS jsonb), :priority, :actor, NOW())
            ON CONFLICT (company_id, provider, model_id) DO UPDATE SET
                label = EXCLUDED.label, credential_ref = EXCLUDED.credential_ref,
                enabled = EXCLUDED.enabled, objectives = EXCLUDED.objectives,
                data_classes = EXCLUDED.data_classes, priority = EXCLUDED.priority,
                updated_at = NOW()
        """), {
            "cid": company_id, "provider": provider, "model": model_id,
            "label": connection.get("label") or model_id, "credential": credential_ref,
            "enabled": bool(connection.get("enabled", True)),
            "objectives": json.dumps(connection.get("objectives") or []),
            "classes": json.dumps(connection.get("data_classes") or ["public", "internal"]),
            "priority": int(connection.get("priority", 100)), "actor": actor,
        })
        conn.commit()
    return next((row for row in list_connections(company_id, eng) if row.get("model_id") == model_id), {})


def select_advisor(
    company_id: str,
    *,
    objective: str = "general",
    profile: Optional[str] = None,
    mode: Optional[str] = None,
    requested_model: Optional[str] = None,
    data_classification: str = "internal",
) -> AdvisorSelection:
    policy = get_policy(company_id)
    selected_mode = (mode or policy.get("default_mode") or "automatic").lower()
    selected_profile = (profile or policy.get("default_profile") or "balanced").lower()
    if selected_mode == "core" or not policy.get("allow_external", True):
        return AdvisorSelection("core", selected_profile, None, None, "Idjwi Core selected by tenant policy", "tenant_policy", data_classification)

    if selected_mode == "compare" and not policy.get("allow_comparison", False):
        selected_mode = "automatic"

    connections = [c for c in list_connections(company_id, include_credential_ref=True) if c.get("enabled")]
    allowed = []
    for connection in connections:
        objectives = connection.get("objectives") or []
        classes = connection.get("data_classes") or []
        if objectives and objective not in objectives and "*" not in objectives:
            continue
        if classes and data_classification not in classes:
            continue
        allowed.append(connection)

    if selected_mode == "compare" and len(allowed) >= 2:
        comparison = tuple(str(item.get("model_id")) for item in allowed[:3] if item.get("model_id"))
        primary = allowed[0]
        return AdvisorSelection(
            "compare", selected_profile, primary.get("model_id"), primary.get("provider"),
            f"Independent comparison across {len(comparison)} tenant-permitted advisors",
            "tenant_policy", data_classification, comparison, primary.get("credential_ref"),
        )

    if requested_model:
        exact = next((c for c in allowed if c.get("model_id") == requested_model), None)
        if exact:
            return AdvisorSelection(selected_mode, selected_profile, exact["model_id"], exact["provider"], "Advisor explicitly selected within tenant policy", exact.get("source", "tenant_connection"), data_classification, (), exact.get("credential_ref"))

    tiers = PROFILE_TIERS.get(selected_profile, PROFILE_TIERS["balanced"])
    for tier in tiers:
        for connection in allowed:
            spec: Optional[ModelSpec] = MODEL_REGISTRY.get(connection.get("model_id"))
            if spec and spec.task_tier == tier:
                return AdvisorSelection(selected_mode, selected_profile, spec.id, spec.provider, f"Automatic routing for {objective} using {selected_profile} profile", connection.get("source", "tenant_connection"), data_classification, (), connection.get("credential_ref"))
    if allowed:
        connection = allowed[0]
        return AdvisorSelection(selected_mode, selected_profile, connection.get("model_id"), connection.get("provider"), "Highest-priority permitted advisor", connection.get("source", "tenant_connection"), data_classification, (), connection.get("credential_ref"))
    return AdvisorSelection("core", selected_profile, None, None, "No permitted advisor available; Idjwi Core fallback", "fallback", data_classification)


def resolve_credential(credential_ref: Optional[str]) -> Optional[str]:
    """Resolve a request-scoped advisor key without exposing or persisting its value."""
    if not credential_ref:
        return None
    if credential_ref.startswith("env:"):
        import os
        return os.getenv(credential_ref[4:].strip()) or None
    # vault: references require the deployment's vault integration; never fake or log them.
    return None
