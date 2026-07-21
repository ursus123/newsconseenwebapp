from datetime import datetime, timezone

from sqlalchemy import text

from database import get_engine_safe

from .analytics_registry import ANALYTICS_REGISTRY
from .models import ZoneResult
from .policy import assert_zone_allowed


class DerivedIntelligenceRepository:
    """Read-only governed access to registered derived analytical products."""

    def __init__(self, engine=None, maximum_age_seconds: int = 3600):
        self.engine = engine or get_engine_safe()
        self.maximum_age_seconds = maximum_age_seconds

    def read(self, context, product_name: str, *, limit: int = 100) -> ZoneResult:
        source = ANALYTICS_REGISTRY.get(product_name)
        if not source:
            raise ValueError(f"Analytics product '{product_name}' is not registered")
        assert_zone_allowed("derived_metric", source.zone)
        if self.engine is None:
            return ZoneResult("unavailable", source.qualified_table, limitation="Derived intelligence store is unavailable; canonical operations remain authoritative.", operator_action="restore_analytics_database")
        limit = max(1, min(int(limit), 500))
        sql = text(
            f"SELECT * FROM {source.qualified_table} WHERE {source.tenant_column} = :tenant_id "
            f"ORDER BY {source.freshness_column} DESC NULLS LAST LIMIT {limit}"
        )
        try:
            with self.engine.connect() as conn:
                rows = [dict(row) for row in conn.execute(sql, {"tenant_id": context.tenant_id}).mappings().all()]
            latest = max((row.get(source.freshness_column) for row in rows if row.get(source.freshness_column)), default=None)
            age = None
            if latest:
                stamp = latest if getattr(latest, "tzinfo", None) else latest.replace(tzinfo=timezone.utc)
                age = max(0, int((datetime.now(timezone.utc) - stamp).total_seconds()))
            stale = age is not None and age > self.maximum_age_seconds
            return ZoneResult(
                "stale" if stale else ("empty" if not rows else "available"),
                source.qualified_table, data=rows,
                freshness={"computed_at": str(latest) if latest else None, "age_seconds": age, "maximum_age_seconds": self.maximum_age_seconds, "stale": stale},
                lineage={"derived_from": list(source.derived_from), "methodology": source.methodology, "confidence_kind": source.confidence_kind, "tenant_filter_enforced": True},
                limitation="Derived result is older than its freshness policy." if stale else None,
                operator_action="run_analytics_refresh" if stale else None,
            )
        except Exception as exc:
            return ZoneResult("failed", source.qualified_table, limitation=str(exc)[:180], operator_action="inspect_analytics_job")

    def inventory(self, context) -> dict:
        # Inventory is contract-first and intentionally does not query every
        # product. Products are read on demand to protect latency.
        return {
            name: {
                "status": "registered" if self.engine is not None else "store_unavailable",
                "source": source.qualified_table,
                "purpose": source.purpose,
                "derived_from": list(source.derived_from),
                "methodology": source.methodology,
                "confidence_kind": source.confidence_kind,
            }
            for name, source in ANALYTICS_REGISTRY.items()
        }
