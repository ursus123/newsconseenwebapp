from .models import DataZone, ZoneSource


RAW_SOURCE_REGISTRY = {
    table: ZoneSource(
        name=table, zone=DataZone.RAW, table=table,
        purpose="ingestion_evidence", freshness_column="_loaded_at",
        sensitivity="source_evidence",
    )
    for table in (
        "people", "enterprises", "products", "transactions", "tasks",
        "addresses", "relationships", "services", "geospatial", "documents",
        "schedules", "signals", "channels", "territories", "animals", "plots",
        "observations", "kinetic_log", "ml_predictions",
    )
}
