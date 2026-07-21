from datetime import datetime, timedelta, timezone

import pytest

from data_zones.analytics_repository import DerivedIntelligenceRepository
from data_zones.analytics_registry import ANALYTICS_REGISTRY
from data_zones.intelligence_packet import build_intelligence_packet
from data_zones.models import DataZone, ZoneResult
from data_zones.policy import assert_zone_allowed, canonical_wins
from data_zones.raw_repository import RawEvidenceRepository
from tenant_context.models import TenantContext


def context():
    return TenantContext(
        user_id="u1", tenant_id="tenant-a", role="admin", request_id="r1",
        auth_source="profile", profile_found=True, profile_user_id_matches=True,
        permissions=("*.read",),
    )


def test_zone_policy_forbids_raw_operational_truth():
    with pytest.raises(ValueError):
        assert_zone_allowed("operational_fact", DataZone.RAW)
    with pytest.raises(ValueError):
        assert_zone_allowed("operational_action", DataZone.ANALYTICS)
    assert_zone_allowed("operational_fact", DataZone.CANONICAL)


def test_canonical_wins_conflicts():
    result = canonical_wins(12, 10)
    assert result["value"] == 12
    assert result["authority"] == "public"
    assert result["conflict"] is True


def test_raw_repository_returns_diagnostics_not_payload():
    result = RawEvidenceRepository(engine=None).diagnostics(context(), "people")
    assert result.status == "unavailable"
    assert result.data is None


def test_unregistered_zone_tables_are_rejected():
    with pytest.raises(ValueError):
        RawEvidenceRepository(engine=None).diagnostics(context(), "auth_users")
    with pytest.raises(ValueError):
        DerivedIntelligenceRepository(engine=None).read(context(), "secret_table")


def test_analytics_contracts_include_lineage_and_methodology():
    for source in ANALYTICS_REGISTRY.values():
        assert source.derived_from
        assert source.methodology
        assert source.tenant_column == "company_id"


def test_missing_analytics_keeps_canonical_packet_operational():
    class Analytics:
        def read(self, *_args, **_kwargs):
            return ZoneResult("unavailable", "analytics.test")

    class Raw:
        def diagnostics(self, *_args, **_kwargs):
            return ZoneResult("unavailable", "raw.test")

    packet = build_intelligence_packet(
        context(), {"status": "ready", "layer": "core", "sections": {}},
        analytics_repository=Analytics(), raw_repository=Raw(),
    )
    assert packet["status"] == "canonical_only"
    assert packet["canonical_context"]["authoritative"] is True
    assert packet["authority"]["canonical_wins_conflicts"] is True


def test_stale_policy_metadata_is_explicit():
    source = ANALYTICS_REGISTRY["task_summary"]
    assert source.freshness_column == "loaded_at"
    assert source.confidence_kind == "deterministic"


def test_zone_registries_do_not_overlap_authority():
    assert all(source.zone is DataZone.ANALYTICS for source in ANALYTICS_REGISTRY.values())


def test_raw_query_is_tenant_scoped_and_returns_no_payload():
    captured = {}

    class Result:
        def mappings(self): return self
        def one(self): return {"record_count": 4, "latest_at": None}

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_): return None
        def execute(self, statement, params):
            captured.update(sql=str(statement), params=params)
            return Result()

    class Engine:
        def connect(self): return Connection()

    result = RawEvidenceRepository(engine=Engine()).diagnostics(context(), "people")
    assert "company_id = :tenant_id" in captured["sql"]
    assert captured["params"] == {"tenant_id": "tenant-a"}
    assert result.data == {"record_count": 4}
    assert result.lineage["payload_exposed"] is False


def test_analytics_query_is_tenant_scoped_and_carries_lineage():
    captured = {}
    stamp = datetime.now(timezone.utc) - timedelta(minutes=5)

    class Result:
        def mappings(self): return self
        def all(self): return [{"company_id": "tenant-a", "loaded_at": stamp, "total_tasks": 7}]

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_): return None
        def execute(self, statement, params):
            captured.update(sql=str(statement), params=params)
            return Result()

    class Engine:
        def connect(self): return Connection()

    result = DerivedIntelligenceRepository(engine=Engine()).read(context(), "task_summary")
    assert "company_id = :tenant_id" in captured["sql"]
    assert captured["params"] == {"tenant_id": "tenant-a"}
    assert result.status == "available"
    assert result.lineage["derived_from"] == ["public.tasks"]
    assert result.lineage["methodology"]
