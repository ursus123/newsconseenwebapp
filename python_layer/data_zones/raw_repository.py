from sqlalchemy import text

from database import get_engine_safe

from .models import ZoneResult
from .policy import assert_zone_allowed
from .raw_registry import RAW_SOURCE_REGISTRY


class RawEvidenceRepository:
    """Read-only source evidence. Raw payloads never enter Idjwi context."""

    def __init__(self, engine=None):
        self.engine = engine or get_engine_safe()

    def diagnostics(self, context, source_name: str) -> ZoneResult:
        source = RAW_SOURCE_REGISTRY.get(source_name)
        if not source:
            raise ValueError(f"Raw source '{source_name}' is not registered")
        assert_zone_allowed("import_diagnostic", source.zone)
        if self.engine is None:
            return ZoneResult("unavailable", source.qualified_table, limitation="Raw evidence store is unavailable.", operator_action="restore_analytics_database")
        sql = text(
            f"SELECT COUNT(*) AS record_count, MAX({source.freshness_column}) AS latest_at "
            f"FROM {source.qualified_table} WHERE {source.tenant_column} = :tenant_id"
        )
        try:
            with self.engine.connect() as conn:
                row = conn.execute(sql, {"tenant_id": context.tenant_id}).mappings().one()
            return ZoneResult(
                "empty" if not row["record_count"] else "available", source.qualified_table,
                data={"record_count": int(row["record_count"] or 0)},
                freshness={"latest_source_record_at": str(row["latest_at"]) if row["latest_at"] else None},
                lineage={"purpose": source.purpose, "payload_exposed": False, "tenant_filter_enforced": True},
            )
        except Exception as exc:
            return ZoneResult("failed", source.qualified_table, limitation=str(exc)[:180], operator_action="inspect_raw_pipeline")

    def inventory(self, context) -> dict:
        return {name: self.diagnostics(context, name).__dict__ for name in RAW_SOURCE_REGISTRY}
