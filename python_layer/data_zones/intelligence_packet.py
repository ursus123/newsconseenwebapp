from .analytics_repository import DerivedIntelligenceRepository
from .raw_repository import RawEvidenceRepository


DEFAULT_PRODUCTS = ("people_summary", "enterprise_summary", "task_summary", "transaction_summary")
DEFAULT_RAW_SOURCES = ("people", "enterprises", "tasks", "transactions")


def build_intelligence_packet(context, canonical_snapshot: dict, *, analytics_repository=None, raw_repository=None) -> dict:
    analytics_repository = analytics_repository or DerivedIntelligenceRepository()
    raw_repository = raw_repository or RawEvidenceRepository()
    derived = {name: analytics_repository.read(context, name).__dict__ for name in DEFAULT_PRODUCTS}
    raw = {name: raw_repository.diagnostics(context, name).__dict__ for name in DEFAULT_RAW_SOURCES}
    derived_available = any(item["status"] in {"available", "stale"} for item in derived.values())
    from .analytics_products import ANALYTICS_PRODUCT_CONTRACTS
    layer_contracts = {}
    for contract in ANALYTICS_PRODUCT_CONTRACTS.values():
        layer_contracts.setdefault(contract.layer.value, []).append(contract.name)
    return {
        "canonical_context": {
            "status": canonical_snapshot.get("status"),
            "layer": canonical_snapshot.get("layer"),
            "generated_at": canonical_snapshot.get("generated_at"),
            "sources": [section.get("source") for section in canonical_snapshot.get("sections", {}).values()],
            "authoritative": True,
        },
        "derived_intelligence": derived,
        "source_evidence": raw,
        "authority": {
            "operational_truth": "public",
            "derived_intelligence": "analytics",
            "source_evidence": "raw",
            "canonical_wins_conflicts": True,
        },
        "status": "ready" if derived_available else "canonical_only",
        "analytics_layers": layer_contracts,
        "limitations": [] if derived_available else ["Derived intelligence is unavailable; Idjwi remains operational from canonical public data."],
    }
