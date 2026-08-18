import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPANY_GRAPH_PRESENTATION_REGISTRY,
  COMPANY_GRAPH_PRESENTATION_VERSION,
  graphAccessibleNodeName,
  graphImportanceBand,
} from "./companyGraphPresentationRegistry.js";

test("Company Graph presentation registry is versioned and covers operational ontology types", () => {
  assert.equal(COMPANY_GRAPH_PRESENTATION_VERSION, "company-graph-presentation.v1");
  for (const type of ["enterprise", "operational_unit", "person", "task", "transaction", "product", "service", "risk", "decision", "action", "external_observation"]) {
    const presentation = COMPANY_GRAPH_PRESENTATION_REGISTRY[type];
    assert.ok(presentation, `${type} must have a presentation contract`);
    assert.match(presentation.accent, /^#[0-9a-f]{6}$/i);
    assert.ok(presentation.shape);
    assert.ok(presentation.iconKey);
    assert.ok(presentation.preferredLayouts.length > 0);
  }
});

test("accessible node names expose semantic type, label, detail and status", () => {
  assert.equal(
    graphAccessibleNodeName({ entity_type: "task", label: "Confirm delivery", sublabel: "Due today", status: "open" }),
    "Task, Confirm delivery, Due today, status open",
  );
});

test("importance bands are deterministic presentation metadata", () => {
  assert.equal(graphImportanceBand(0.9), "critical");
  assert.equal(graphImportanceBand(0.7), "high");
  assert.equal(graphImportanceBand(0.5), "medium");
  assert.equal(graphImportanceBand(0.2), "standard");
});
