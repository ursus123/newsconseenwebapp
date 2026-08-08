import fs from "node:fs";
import cytoscape from "cytoscape";
import {
  buildOperationalFocus,
  buildSemanticClusters,
  filterForMode,
  semanticPositions,
  toCytoscapeElements,
} from "../src/services/companyGraphService.js";

const packetPath = process.argv[2];
const mode = process.argv[3] || "operational_focus";
if (!packetPath) throw new Error("Usage: node scripts/diagnose-company-graph-pipeline.mjs <packet.json> [layout]");

const packet = JSON.parse(fs.readFileSync(packetPath, "utf8"));
const rawNodes = packet.nodes || [];
const rawEdges = packet.edges || [];
const rawNodeIds = new Set(rawNodes.map(node => node.id));
const danglingRawEdges = rawEdges.filter(edge => !rawNodeIds.has(edge.source) || !rawNodeIds.has(edge.target));

const clustered = buildSemanticClusters(rawNodes, rawEdges);
const focused = mode === "operational_focus"
  ? buildOperationalFocus(clustered.nodes, clustered.edges, packet)
  : clustered;
const filtered = filterForMode(focused.nodes, focused.edges, mode);
const visibleIds = new Set(filtered.nodes.map(node => node.id));
const afterVisibleTypes = {
  nodes: filtered.nodes,
  edges: filtered.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
};
const positions = semanticPositions(afterVisibleTypes.nodes, mode, { edges: afterVisibleTypes.edges });
const elements = toCytoscapeElements(afterVisibleTypes.nodes, afterVisibleTypes.edges, positions);
const projectedNodes = elements.filter(element => !element.data.source && !element.data.target);
const projectedEdges = elements.filter(element => element.data.source && element.data.target);
const cy = cytoscape({ headless: true, elements });

const focusedEdgeIds = new Set(focused.edges.map(edge => edge.id));
const filteredEdgeIds = new Set(filtered.edges.map(edge => edge.id));
const removedByFocus = rawEdges.filter(edge => !focusedEdgeIds.has(edge.id));
const removedByMode = focused.edges.filter(edge => !filteredEdgeIds.has(edge.id));
const removedEndpointTypes = {};
for (const edge of removedByMode) {
  const sourceType = rawNodes.find(node => node.id === edge.source)?.entity_type || "missing";
  const targetType = rawNodes.find(node => node.id === edge.target)?.entity_type || "missing";
  const key = `${sourceType} → ${targetType}`;
  removedEndpointTypes[key] = (removedEndpointTypes[key] || 0) + 1;
}

const report = {
  contract: "company-graph-pipeline-diagnostic.v1",
  graph_contract: packet.contract_version,
  mode,
  stages: {
    backend_packet: { nodes: rawNodes.length, edges: rawEdges.length, dangling_edges: danglingRawEdges.length },
    semantic_clustering: { nodes: clustered.nodes.length, edges: clustered.edges.length, clusters: clustered.clusters.length },
    operational_focus: { nodes: focused.nodes.length, edges: focused.edges.length },
    mode_filter: { nodes: filtered.nodes.length, edges: filtered.edges.length },
    cytoscape_projection: { nodes: projectedNodes.length, edges: projectedEdges.length },
    cytoscape_headless: { nodes: cy.nodes().length, edges: cy.edges().length },
  },
  losses: {
    semantic_clustering: rawEdges.length - clustered.edges.length,
    operational_focus: clustered.edges.length - focused.edges.length,
    mode_filter: focused.edges.length - filtered.edges.length,
    visible_type_filter: filtered.edges.length - afterVisibleTypes.edges.length,
    during_projection: afterVisibleTypes.edges.length - projectedEdges.length,
    rejected_by_cytoscape: projectedEdges.length - cy.edges().length,
    removed_endpoint_types: removedEndpointTypes,
  },
  visible_edge_sample: projectedEdges.slice(0, 5).map(edge => ({
    id: edge.data.id,
    source: edge.data.source,
    predicate: edge.data.predicate,
    target: edge.data.target,
    classes: edge.classes,
  })),
};

cy.destroy();
console.log(JSON.stringify(report, null, 2));
