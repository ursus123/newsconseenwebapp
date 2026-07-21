from .models import DataZone


ZONE_POLICY = {
    "operational_fact": (DataZone.CANONICAL,),
    "operational_action": (DataZone.CANONICAL,),
    "derived_metric": (DataZone.ANALYTICS, DataZone.CANONICAL),
    "forecast": (DataZone.ANALYTICS,),
    "source_lineage": (DataZone.RAW, DataZone.CANONICAL),
    "import_diagnostic": (DataZone.RAW,),
}


def assert_zone_allowed(purpose: str, zone: DataZone):
    allowed = ZONE_POLICY.get(purpose, ())
    if zone not in allowed:
        raise ValueError(f"Zone '{zone.value}' is not allowed for purpose '{purpose}'")


def canonical_wins(canonical_value, analytical_value) -> dict:
    conflict = canonical_value is not None and analytical_value is not None and canonical_value != analytical_value
    return {
        "value": canonical_value if canonical_value is not None else analytical_value,
        "authority": "public" if canonical_value is not None else "analytics",
        "conflict": conflict,
        "warning": "Derived intelligence disagrees with current canonical operations." if conflict else None,
    }
