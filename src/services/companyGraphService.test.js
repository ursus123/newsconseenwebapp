import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIdjwiGraphAction,
  buildIdjwiGraphContext,
  buildOperationalFocus,
  buildSemanticClusters,
  createLatestGraphRequestCoordinator,
  GRAPH_LAYOUT_CONTRACT_VERSION,
  GRAPH_LAYOUT_REGISTRY,
  IDJWI_GRAPH_INTENTS,
  semanticPositions,
  serializeGovernedGraphPacket,
  toCytoscapeElements,
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
  briefing: {
    contract_version: "company-graph-daily-briefing.v1",
    what_matters_today: [],
    workflow_contract: ["evidence", "recommendation", "decision", "approval", "action", "task_or_agent_execution", "outcome"],
  },
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
    assert.equal(value.briefing.contract_version, "company-graph-daily-briefing.v1");
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

test("semantic layout registry covers each operational question", () => {
  assert.equal(GRAPH_LAYOUT_CONTRACT_VERSION, "company-graph-layouts.v1");
  for (const mode of ["operational_focus", "organizational_structure", "responsibilities_work", "customers_suppliers", "products_services", "risks_opportunities", "decisions_actions", "data_quality", "external_disruptions", "selected_neighborhood"]) {
    assert.ok(GRAPH_LAYOUT_REGISTRY[mode]?.question, `${mode} must state its operational question`);
    assert.ok(GRAPH_LAYOUT_REGISTRY[mode]?.strategy, `${mode} must select a layout strategy`);
  }
});

test("Operational Focus anchors the selected unit and neighborhood layout uses relationship depth", () => {
  const layoutNodes = [
    { id: "operational_unit:u1", entity_id: "u1", entity_type: "operational_unit", importance: 0.8 },
    { id: "task:t1", entity_type: "task", importance: 0.7 },
    { id: "person:p1", entity_type: "person", importance: 0.5 },
  ];
  const edges = [
    { source: "operational_unit:u1", target: "task:t1" },
    { source: "task:t1", target: "person:p1" },
  ];
  const focus = semanticPositions(layoutNodes, "operational_focus", { anchorNodeId: "operational_unit:u1", edges });
  assert.deepEqual(focus["operational_unit:u1"], { x: 620, y: 470 });
  const neighborhood = semanticPositions(layoutNodes, "selected_neighborhood", { anchorNodeId: "operational_unit:u1", edges });
  const firstDistance = Math.abs(neighborhood["task:t1"].x - 620) + Math.abs(neighborhood["task:t1"].y - 470);
  const secondDistance = Math.abs(neighborhood["person:p1"].x - 620) + Math.abs(neighborhood["person:p1"].y - 470);
  assert.ok(secondDistance > firstDistance);
});

test("semantic clusters summarize authorized low-attention populations without concealing critical records", () => {
  const completed = Array.from({ length: 18 }, (_, index) => ({
    id: `task:done-${index}`, entity_type: "task", entity_id: `done-${index}`,
    label: `Completed task ${index}`, status: "completed", importance: 0.1,
    is_unconnected: index > 0, attributes: { status: "completed", import_name: "Import 24" },
  }));
  const critical = { id: "task:critical", entity_type: "task", entity_id: "critical", label: "Critical task", status: "open", importance: 1, risk_level: "critical", attributes: {} };
  const enterprise = { id: "enterprise:e1", entity_type: "enterprise", entity_id: "e1", label: "Acme", status: "active", importance: 0.9, attributes: {} };
  const result = buildSemanticClusters([...completed, critical, enterprise], [
    { id: "edge:1", source: "task:done-0", target: "enterprise:e1", predicate: "assigned_to", confidence: 1 },
  ]);
  const cluster = result.clusters.find(node => node.attributes.cluster_key === "completed_tasks");
  assert.equal(cluster.attributes.record_count, 18);
  assert.equal(cluster.attributes.critical_records_excluded, true);
  assert.equal(result.nodes.some(node => node.id === critical.id), true);
  assert.equal(result.nodes.some(node => node.id === "task:done-0"), false);
  assert.equal(result.edges.some(edge => edge.source === cluster.id && edge.target === enterprise.id), true);
  const expanded = buildSemanticClusters([...completed, critical, enterprise], [], { expandedClusterIds: [cluster.id] });
  assert.equal(expanded.nodes.filter(node => node.entity_type === "task").length, 19);
});

test("Cytoscape projection carries semantic node cards and governed assertion classes", () => {
  const elements = toCytoscapeElements([
    { id: "enterprise:e1", entity_type: "enterprise", label: "Acme", sublabel: "Supplier", status: "active", importance: 0.8 },
    { id: "product:p1", entity_type: "product", label: "Medicine", status: "active", importance: 0.5 },
  ], [{
    id: "edge:1", source: "enterprise:e1", target: "product:p1", label: "supplies",
    assertion_class: "advisor_proposal", assertion_state: "proposed", confidence: 0.72,
    evidence: [{ evidence_id: "evidence:1" }],
  }]);
  const node = elements.find(element => element.data.id === "enterprise:e1");
  const edge = elements.find(element => element.data.id === "edge:1");
  assert.equal(node.data.nodeColor, "#ffffff");
  assert.equal(node.data.importanceBand, "critical");
  assert.equal(node.data.statusLabel, "active");
  assert.match(node.data.mediumLabel, /● active/);
  assert.match(node.data.accessibleName, /Enterprise, Acme, Supplier, status active/);
  assert.match(edge.classes, /assertion-advisor-proposal/);
  assert.match(edge.classes, /edge-proposed/);
  assert.match(edge.classes, /has-evidence/);
  assert.match(edge.data.detailLabel, /proposed · 72% · 1 evidence/);
});

test("latest graph request coordinator suppresses a stale neighborhood response", async () => {
  const pending = [];
  const fetcher = (url, options) => new Promise((resolve, reject) => {
    pending.push({ url, options, resolve, reject });
    options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  const coordinator = createLatestGraphRequestCoordinator(fetcher);
  const first = coordinator.run("/neighborhood/enterprise/e1");
  const second = coordinator.run("/neighborhood/person/p1");
  pending[1].resolve({ ok: true, marker: "person" });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.stale, true);
  assert.equal(secondResult.stale, false);
  assert.equal(secondResult.response.marker, "person");
});
