"""
config/routes.py
-----------------
GET /config/metric-registry — returns the canonical KPI registry
(config/metric_registry.py's METRIC_REGISTRY) so the frontend and
DataModels.jsx's API Catalogue read the same source of truth instead
of hardcoding metric descriptions independently.

GET /config/validate — reports which Settings fields (config/settings.py)
are set vs missing, at a glance. Never returns actual secret values — only
presence/absence for credential-bearing fields. Admin-secret protected,
same auth as every other admin-adjacent endpoint.
"""

from typing import Optional

from fastapi import APIRouter, Header

from config.metric_registry import METRIC_REGISTRY
from config.settings import settings

router = APIRouter(prefix="/config", tags=["Config"])

_SENSITIVE_MARKERS = ("key", "secret", "password", "_url")


@router.get("/metric-registry")
def get_metric_registry():
    return {"metrics": METRIC_REGISTRY}


@router.get("/validate")
def validate_config(
    x_admin_secret: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    """Env-var validation dashboard — which settings are configured, without
    ever exposing the actual secret values."""
    from admin.routes import _check_auth
    _check_auth(x_admin_secret, authorization)

    fields = {}
    missing_count = 0
    for name in type(settings).model_fields:
        value = getattr(settings, name, None)
        is_set = value is not None and value != ""
        if not is_set:
            missing_count += 1
        is_sensitive = any(m in name for m in _SENSITIVE_MARKERS)
        fields[name] = {
            "set":   is_set,
            "value": (None if is_sensitive else value) if is_set else None,
        }

    return {
        "total_fields":   len(fields),
        "missing_count":  missing_count,
        "fields":         fields,
    }
