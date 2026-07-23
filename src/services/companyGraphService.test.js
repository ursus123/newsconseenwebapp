import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIdjwiGraphAction,
  buildIdjwiGraphContext,
  buildOperationalFocus,
  IDJWI_GRAPH_INTENTS,
  semanticPositions,
  serializeGovernedGraphPacket,
} from "./companyGraphService.js";

const packet = {
  contract_version: "company-graph.v1",
  company_id: "tenant-a",
  scope: { type: "organization", id: "tenant-a" },
  nodes: [{
    id: "enterprise:e1", entity_type: "enterprise", entity_id: "e1",
    label: "Acme", status: "active", sensitivity: "internal",
    attributes: {
      enterprise_type: "commercial", status: "active",
      email: "LEAK-EMAIL", amount: "LEAK-AMOUNT", raw_payload: "LEAK-RAW",
    },
    permitted_actions: [],
  }],
  edges: [], counts: { enterprise: 1 },
  provenance: {
    generated_at: "2026-07-22T00:00:00Z", projection: "test",
    source_of_truth: "test", tenant_verified: true, authorization_enforced: true,
    authorization_fingerprint: "fingerprint", policy_version: "graph-policy.v1",
    contract_version: "company-graph.v1", cache: "none",
  },
  source_status: [],
  completeness: { state: "complete", sources_total: 0, sources_available: 0, sources_unavailable: 0, sources_unauthorized: 0, mapping_complete: true, authorization_filtered: false, explanation: "test" },
  truncation: { truncated: false, sources_at_limit: [], returned_nodes: 1, returned_edges: 0, continuation_available: false },
  quality: { unconnected_count: 1, expired_relationship_count: 0, duplicate_edge_count: 0, missing_assignment_count: 0, issues: [] },
  permitted_actions: [{ action: "export", allowed: true, requires_approval: false }],
  assertion_history: [{
    assertion_key: "key-1", source: "risk:r1", predicate: "references", target: "enterprise:e1",
    from_state: "proposed", to_state: "rejected", reason: "Wrong match",
    actor_user_id: "LEAK-USER-ID", occurred_at: "2026-07-22T00:00:00Z", evidence_version: 2,
  }],
};

test("export and Idjwi serializers retain only classified exposable attributes", () => {
  const exported = serializeGovernedGraphPacket(packet);
  const idjwi = buildIdjwiGraphContext(packet);
  for (const value of [exported, idjwi]) {
    const text = JSON.stringify(value);
    assert.equal(text.includes("LEAK-EMAIL"), false);
    assert.equal(text.includes("LEAK-AMOUNT"), false);
    assert.equal(text.includes("LEAK-RAW"), false);
    assert.equal(text.includes("LEAK-USER-ID"), false);
    assert.equal(value.assertion_history[0].actor, "authorized_operator");
    assert.equal(value.nodes[0].attributes.enterprise_type, "commercial");
    assert.equal(value.nodes[0].attributes.status, "active");
  }
});

test("Company Graph actions carry an explicit governed Idjwi intent", () => {
  const action = buildIdjwiGraphAction(packet, IDJWI_GRAPH_INTENTS.EXPLAIN_COMPANY_GRAPH);
  assert.equal(action.intent, "explain_company_graph");
  assert.equal(action.context.intent, "explain_company_graph");
  assert.throws(() => buildIdjwiGraphAction(packet, "find_something_vaguely"), /Unsupported Idjwi graph intent/);
});

test("Idjwi receives the exact semantic packet displayed by Company Graph", () => {
  const partial = {
    ...packet,
    edges: [{
      id: "edge-1", source: "enterprise:e1", target: "person:p1",
      predicate: "employs", direction: "outbound",
      assertion_class: "canonical relationship", status: "active",
      evidence: [{ explanation: "Canonical relationship record" }],
      sensitivity: "internal", permitted_actions: [],
    }],
    nodes: [
      ...packet.nodes,
      {
        id: "person:p1", entity_type: "person", entity_id: "p1",
        label: "Authorized person", sensitivity: "role-restricted",
        attributes: {}, permitted_actions: [],
      },
    ],
    quality: { ...packet.quality, unconnected_count: 0 },
    source_status: [{
      source_id: "analytics", state: "unavailable", last_success_at: "2026-07-21T00:00:00Z",
    }],
  };
  const context = buildIdjwiGraphContext(partial, {
    tenantId: "tenant-a", role: "admin", page: "CompanyGraphHome",
    productSurface: "web", selectedEdgeId: "edge-1",
  });
  assert.deepEqual(context.semantic_summary, {
    node_count: 2, edge_count: 1, disconnected_count: 0,
    unavailable_source_count: 1,
  });
  assert.deepEqual(context.counts, { enterprise: 1, person: 1 });
  assert.deepEqual(context.relationship_predicates, ["employs"]);
  assert.deepEqual(context.unavailable_sources, ["analytics"]);
  assert.equal(context.selected_edge_id, "edge-1");
  assert.equal(context.tenant_id, "tenant-a");
  assert.equal(context.role, "admin");
  assert.equal(context.page, "CompanyGraphHome");
  assert.equal(context.product_surface, "web");
});

test("Operational Focus is bounded, prioritizes governed work, and summarizes omitted records", () => {
  const nodes = [
    ...Array.from({ length: 40 }, (_, index) => ({
      id: `person:p${index}`, entity_type: "person", entity_id: `p${index}`,
      label: `Person ${index}`, status: "active", importance: 0.1, attributes: {},
    })),
    {
      id: "risk:r1", entity_type: "risk", entity_id: "r1", label: "Critical supply risk",
      status: "open", importance: 1, risk_level: "critical", attributes: { severity: "critical" },
    },
  ];
  const result = buildOperationalFocus(nodes, [], {
    truncation: { omitted_nodes: 12 },
    quality: { unconnected_count: 41 },
    completeness: { state: "partial" },
  }, 36);
  assert.equal(result.nodes.some(node => node.id === "risk:r1"), true);
  assert.equal(result.nodes.length, 37);
  assert.equal(result.nodes.at(-1).entity_type, "quality_cluster");
  assert.equal(result.nodes.at(-1).presentation_only, true);
});

test("semantic positions remain stable when a neighborhood expands", () => {
  const base = [
    { id: "enterprise:e1", entity_type: "enterprise" },
    { id: "task:t1", entity_type: "task" },
  ];
  const first = semanticPositions(base, "operational_flow");
  const expanded = semanticPositions([...base, { id: "transaction:x1", entity_type: "transaction" }], "operational_flow");
  assert.deepEqual(first["enterprise:e1"], expanded["enterprise:e1"]);
  assert.deepEqual(first["task:t1"], expanded["task:t1"]);
  assert.notDeepEqual(first["enterprise:e1"], first["task:t1"]);
});
