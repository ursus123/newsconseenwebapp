"""Precise, multi-dimensional Company Graph completeness diagnostics."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .contracts import GraphCompletenessDiagnostics, GraphDiagnosticDimension


ANALYTICAL_SOURCES = {"insight", "risk", "opportunity", "recommendation", "decision"}


def _dimension(state, count, total, explanation, affected=()):
    return GraphDiagnosticDimension(
        state=state, count=count, total=total, explanation=explanation,
        affected_sources=sorted(affected),
    )


def _stale_count(records: dict[str, list[dict]], *, days: int = 90) -> int:
    threshold = datetime.now(timezone.utc) - timedelta(days=days)
    count = 0
    for rows in records.values():
        for row in rows:
            value = row.get("updated_at") or row.get("observed_at") or row.get("recorded_at")
            if not value:
                continue
            try:
                parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                if parsed < threshold:
                    count += 1
            except ValueError:
                count += 1
    return count


def build_diagnostics(*, source_status, records, nodes, edges, mapping,
                      disconnected_count: int, expired_count: int,
                      missing_assignments: int):
    total_sources = len(source_status)
    unavailable = [item.source_id for item in source_status if item.state == "unavailable"]
    partial_sources = [item.source_id for item in source_status if item.state == "partial"]
    unauthorized = [item.source_id for item in source_status if item.state == "unauthorized"]
    available = [item.source_id for item in source_status if item.state in {"available", "empty"}]
    truncated = [item.source_id for item in source_status if item.may_be_truncated]
    analytical = [item for item in source_status if item.source_id in ANALYTICAL_SOURCES]
    analytical_bad = [item.source_id for item in analytical if item.state in {"unavailable", "unauthorized", "partial"}]
    analytical_records = sum(item.returned_records for item in analytical if item.state in {"available", "empty"})
    stale = _stale_count(records)

    if not total_sources:
        source_state = "empty"
    elif unavailable and not available:
        source_state = "unavailable"
    elif unavailable or partial_sources:
        source_state = "partial"
    else:
        source_state = "complete"
    auth_state = "unauthorized" if unauthorized and len(unauthorized) == total_sources else ("partial" if unauthorized else "complete")
    mapping_problem = mapping["candidates"] - mapping["mapped"]
    diagnostics = GraphCompletenessDiagnostics(
        source_availability=_dimension(source_state, len(unavailable) + len(partial_sources), total_sources, "Availability of configured canonical, analytical and external graph sources.", unavailable + partial_sources),
        authorization_coverage=_dimension(auth_state, len(unauthorized), total_sources, "Sources excluded by the requesting principal's permissions.", unauthorized),
        pagination_completeness=_dimension("partial" if truncated else "complete", len(truncated), total_sources, "Whether every source page was read for the selected scope.", truncated),
        truncation=_dimension("partial" if truncated else "complete", len(truncated), total_sources, "Sources that reached the configured record limit.", truncated),
        mapping_coverage=_dimension("partial" if mapping_problem else ("not_applicable" if not mapping["candidates"] else "complete"), mapping_problem, mapping["candidates"], "Registry relationship candidates successfully mapped to visible endpoints."),
        unmatched_endpoints=_dimension("partial" if mapping["unmatched_endpoints"] else "complete", mapping["unmatched_endpoints"], mapping["candidates"], "Relationship references whose endpoint record was not present in the authorized packet."),
        unknown_predicates=_dimension("partial" if mapping["unknown_predicates"] else "complete", mapping["unknown_predicates"], mapping["candidates"], "Predicates absent from the governed ontology registry."),
        disconnected_records=_dimension("partial" if disconnected_count else ("empty" if not nodes else "complete"), disconnected_count, len(nodes), "Visible records with no visible governed edge."),
        stale_records=_dimension("partial" if stale else ("empty" if not nodes else "complete"), stale, sum(len(rows) for rows in records.values()), "Records whose latest known update or observation is older than 90 days."),
        expired_relationships=_dimension("partial" if expired_count else "complete", expired_count, len(edges), "Relationships whose governed temporal state is expired."),
        duplicate_relationships=_dimension("partial" if mapping["duplicates"] else "complete", mapping["duplicates"], mapping["candidates"], "Duplicate source-predicate-target assertions before graph deduplication."),
        missing_assignments=_dimension("partial" if missing_assignments else "complete", missing_assignments, len(records.get("task", [])), "Open work with no person assignment."),
        analytical_availability=_dimension("unavailable" if analytical and len(analytical_bad) == len(analytical) else ("partial" if analytical_bad else ("empty" if analytical_records == 0 else "complete")), len(analytical_bad), len(analytical), "Availability and returned coverage of analytical intelligence sources.", analytical_bad),
    )

    if not nodes:
        if auth_state == "unauthorized":
            overall, explanation = "unauthorized", "No graph records are authorized for this principal."
        elif source_state == "unavailable":
            overall, explanation = "unavailable", "Configured graph sources could not be reached."
        else:
            overall, explanation = "empty", "Authorized sources were read but returned no graph records for this scope."
    elif any((unavailable, partial_sources, unauthorized, truncated, mapping_problem, disconnected_count, stale, expired_count, mapping["duplicates"], missing_assignments, analytical_bad)):
        overall, explanation = "partial", "The graph is usable, but one or more diagnostic dimensions are incomplete."
    else:
        overall, explanation = "complete", "All configured and authorized diagnostic dimensions are complete for this bounded request."
    return overall, explanation, diagnostics


def source_failure_metadata(entity_type: str, category: str) -> tuple[list[str], str]:
    capabilities = ["graph_display", "idjwi_reasoning", "relationship_quality"]
    if entity_type in ANALYTICAL_SOURCES:
        capabilities.extend(["daily_briefing", "risk_and_opportunity_intelligence"])
    action = {
        "authorization": "Request access from the tenant administrator.",
        "data_source": "Check Supabase connectivity, schema migration and source credentials, then retry.",
        "timeout": "Retry the request or narrow the operational scope.",
        "mapping": "Review the ontology registry and source field mapping.",
    }.get(category, "Open Data Readiness and inspect this source.")
    return capabilities, action
