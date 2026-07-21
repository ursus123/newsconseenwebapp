from fastapi import HTTPException

from company_graph import routes
from company_graph.service import build_graph_packet
from tenant_context.models import TenantContext, TenantRepositoryResult


class FakeRepository:
    def __init__(self, records):
        self.records = records

    def list_entities(self, context, entity, *, limit=500):
        return TenantRepositoryResult(self.records.get(entity, [])[:limit], context, entities=(entity,))


def _context():
    return TenantContext(
        user_id="user-1", tenant_id="tenant-a", role="admin", request_id="req-1",
        auth_source="test", profile_found=True, profile_user_id_matches=True,
        permissions=("*.read",),
    )


def test_graph_packet_explains_canonical_and_derived_edges():
    repository = FakeRepository({
        "enterprise": [{"id": "e1", "company_id": "tenant-a", "enterprise_name": "Acme"}],
        "person": [{"id": "p1", "company_id": "tenant-a", "first_name": "Ada", "last_name": "Lovelace"}],
        "task": [{"id": "t1", "company_id": "tenant-a", "title": "Review", "enterprise_id": "e1"}],
        "relationship": [{"id": "r1", "company_id": "tenant-a", "relationship_type": "works_for", "person_id": "p1", "enterprise_id": "e1", "status": "active"}],
    })

    packet = build_graph_packet(_context(), repository)

    assert packet.company_id == "tenant-a"
    canonical = next(edge for edge in packet.edges if edge.predicate == "works_for")
    assert canonical.evidence.assertion_type == "fact"
    assert canonical.evidence.source_table == "public.relationships"
    assert canonical.evidence.confidence == 1
    derived = next(edge for edge in packet.edges if edge.predicate == "belongs_to")
    assert derived.evidence.assertion_type == "derived"
    assert derived.evidence.derivation_rule == "canonical_field:enterprise_id"


def test_neighborhood_is_bounded_to_selected_node():
    repository = FakeRepository({
        "enterprise": [{"id": "e1", "enterprise_name": "Acme"}, {"id": "e2", "enterprise_name": "Other"}],
        "person": [{"id": "p1", "first_name": "Ada"}],
        "relationship": [{"id": "r1", "relationship_type": "works_for", "person_id": "p1", "enterprise_id": "e1"}],
    })
    packet = build_graph_packet(_context(), repository, center="enterprise:e1", depth=1)
    assert {node.id for node in packet.nodes} == {"enterprise:e1", "person:p1"}
    assert packet.scope == "neighborhood"


def test_graph_overview_requires_verified_tenant(client, monkeypatch):
    def forbidden(_authorization, _company_id):
        raise HTTPException(status_code=403, detail={"code": "tenant_mismatch"})

    monkeypatch.setattr(routes, "verify_tenant_access", forbidden)
    response = client.get("/company-graph/overview?company_id=tenant-b", headers={"Authorization": "Bearer test"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "tenant_mismatch"


def test_graph_overview_returns_governed_packet(client, monkeypatch):
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "user-1", "company_id": "tenant-a", "role": "admin",
        "tenant_auth_source": "user_profiles", "profile_found": True,
        "profile_user_id_matches": True,
    })

    def list_entities(_self, context, entity, *, limit=5000):
        data = {
            "enterprise": [{"id": "e1", "company_id": context.tenant_id, "enterprise_name": "Acme"}],
            "person": [{"id": "p1", "company_id": context.tenant_id, "first_name": "Ada"}],
            "relationship": [{"id": "r1", "company_id": context.tenant_id, "relationship_type": "works_for", "person_id": "p1", "enterprise_id": "e1"}],
        }.get(entity, [])
        return TenantRepositoryResult(data, context, entities=(entity,))

    monkeypatch.setattr(routes.SupabaseTenantContextRepository, "list_entities", list_entities)
    response = client.get("/company-graph/overview?company_id=tenant-a", headers={"Authorization": "Bearer test"})
    body = response.json()
    assert response.status_code == 200
    assert body["provenance"]["tenant_verified"] is True
    assert body["edges"][0]["evidence"]["source_table"] == "public.relationships"
