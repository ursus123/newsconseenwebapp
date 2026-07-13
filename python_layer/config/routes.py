"""
config/routes.py
-----------------
GET /config/metric-registry — returns the canonical KPI registry
(config/metric_registry.py's METRIC_REGISTRY) so the frontend and
DataModels.jsx's API Catalogue read the same source of truth instead
of hardcoding metric descriptions independently.
"""

from fastapi import APIRouter

from config.metric_registry import METRIC_REGISTRY

router = APIRouter(prefix="/config", tags=["Config"])


@router.get("/metric-registry")
def get_metric_registry():
    return {"metrics": METRIC_REGISTRY}
