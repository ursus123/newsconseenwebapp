/**
 * CytoscapeRelationshipGraph — v2
 *
 * Nodes: Person · Enterprise · Product · Service · Address · Task · Transaction
 * Edges: all 9 relationship types + task→person, task→enterprise,
 *        transaction→enterprise, transaction→person
 *
 * Fixes from audit:
 *  - Node IDs use entity IDs when available (person_id, enterprise_id,
 *    address_id) — falls back to name strings only when ID absent
 *  - Duplicate name guard: same display name → same node
 *  - Task layer: task nodes linked to assigned person + enterprise
 *  - Transaction layer: transaction nodes linked to enterprise + person
 *  - Edge labels carry quantity (item edges) and rate (service edges)
 *  - Layer toggle: Relationships / + Tasks / + Transactions / Full
 *  - Ended edges dashed; orphaned relationship_type guard
 */
import { useEffect, useRef, useState, useMemo } from "react";
import cytoscape from "cytoscape";
import { Network, GitBranch, Circle, Grid3x3, X, Layers } from "lucide-react";

// ── Node colours ──────────────────────────────────────────────────────────────
const NODE_COLORS = {
  person:      "#3b82f6",
  enterprise:  "#8b5cf6",
  product:     "#f59e0b",
  service:     "#06b6d4",
  address:     "#10b981",
  task:        "#64748b",
  transaction: "#f43f5e",
};

// ── Edge colours ──────────────────────────────────────────────────────────────
const EDGE_COLORS = {
  person_enterprise:     "#3b82f6",
  person_person:         "#f43f5e",
  enterprise_enterprise: "#8b5cf6",
  item_enterprise:       "#f59e0b",
  item_person:           "#f97316",
  person_service:        "#06b6d4",
  enterprise_service:    "#6366f1",
  person_address:        "#10b981",
  enterprise_address:    "#14b8a6",
  task_person:           "#94a3b8",
  task_enterprise:       "#cbd5e1",
  transaction_enterprise:"#fda4af",
  transaction_person:    "#fca5a5",
};

const LAYOUTS = [
  { id: "cose",         label: "Force",  icon: Network   },
  { id: "breadthfirst", label: "Tree",   icon: GitBranch },
  { id: "circle",       label: "Circle", icon: Circle    },
  { id: "grid",         label: "Grid",   icon: Grid3x3   },
];

const LAYERS = [
  { id: "rels",   label: "Relationships" },
  { id: "tasks",  label: "+ Tasks"       },
  { id: "txns",   label: "+ Transactions"},
  { id: "full",   label: "Full"          },
];

// ── Stable node ID: prefer entity ID, fall back to type__name ─────────────────
function nodeId(type, name, id) {
  if (id && id !== "undefined" && id !== "null") return `${type}__id__${id}`;
  if (!name || name === "undefined" || name === "null") return null;
  return `${type}__${name}`;
}

// ── Derive src/tgt node IDs from a Relationship record ───────────────────────
function edgeEndpoints(r) {
  switch (r.relationship_type) {
    case "person_enterprise":
      return [
        nodeId("person",     r.person_name,          r.person_id),
        nodeId("enterprise", r.enterprise_name,       r.enterprise_id),
      ];
    case "item_enterprise":
      return [
        nodeId("product",    r.item_name,             r.item_id),
        nodeId("enterprise", r.enterprise_name,       r.enterprise_id),
      ];
    case "item_person":
      return [
        nodeId("product",    r.item_name,             r.item_id),
        nodeId("person",     r.person_name,           r.person_id),
      ];
    case "person_service":
      return [
        nodeId("person",     r.person_name,           r.person_id),
        nodeId("service",    r.service_name,          r.service_id),
      ];
    case "enterprise_service":
      return [
        nodeId("enterprise", r.enterprise_name,       r.enterprise_id),
        nodeId("service",    r.service_name,          r.service_id),
      ];
    case "person_address":
      return [
        nodeId("person",     r.person_name,           r.person_id),
        nodeId("address",    r.location,              r.address_id),
      ];
    case "enterprise_address":
      return [
        nodeId("enterprise", r.enterprise_name,       r.enterprise_id),
        nodeId("address",    r.location,              r.address_id),
      ];
    case "person_person":
      return [
        nodeId("person",     r.person_name,           r.person_id),
        nodeId("person",     r.secondary_person,      r.secondary_person_id),
      ];
    case "enterprise_enterprise":
      return [
        nodeId("enterprise", r.enterprise_name,       r.enterprise_id),
        nodeId("enterprise", r.secondary_enterprise,  r.secondary_enterprise_id),
      ];
    default:
      return [null, null];
  }
}

// ── Edge label: show quantity or rate if present ──────────────────────────────
function edgeLabel(r) {
  if (r.quantity)          return `qty: ${r.quantity}`;
  if (r.rate)              return `$${Number(r.rate).toFixed(0)}/hr`;
  if (r.contracted_hours)  return `${r.contracted_hours}h/wk`;
  return r.role || "";
}

export default function CytoscapeRelationshipGraph({
  relationships = [],
  filterType    = "all",
  tasks         = [],
  transactions  = [],
  people        = [],
  enterprises   = [],
}) {
  const containerRef = useRef(null);
  const cyRef        = useRef(null);

  const [layoutId,     setLayoutId]     = useState("cose");
  const [layerId,      setLayerId]      = useState("rels");
  const [selectedNode, setSelectedNode] = useState(null);
  const [stats,        setStats]        = useState({ nodes: 0, edges: 0, topNode: null, topDegree: 0 });

  // ── Build element set ───────────────────────────────────────────────────────
  const elements = useMemo(() => {
    const nodeMap = new Map(); // id → element
    const edgeArr = [];
    const edgeIds = new Set();

    const addNode = (id, label, type, meta = {}) => {
      if (!id || !label) return;
      // Dedup by display label within same type (catches renamed entities)
      const labelKey = `${type}__label__${label}`;
      if (!nodeMap.has(id)) {
        if (nodeMap.has(labelKey)) {
          // Already exists under a different ID — alias to the existing node
          nodeMap.set(id, nodeMap.get(labelKey));
        } else {
          const el = { data: { id, label, type, color: NODE_COLORS[type] || "#94a3b8", ...meta } };
          nodeMap.set(id, el);
          nodeMap.set(labelKey, el);
        }
      }
    };

    const addEdge = (src, tgt, type, edgeMeta = {}) => {
      if (!src || !tgt) return;
      // Resolve label-keyed nodes
      const srcEl = nodeMap.get(src);
      const tgtEl = nodeMap.get(tgt);
      const srcId = srcEl?.data?.id ?? src;
      const tgtId = tgtEl?.data?.id ?? tgt;
      if (!nodeMap.has(srcId) && !nodeMap.has(src)) return;
      if (!nodeMap.has(tgtId) && !nodeMap.has(tgt)) return;
      const eid = edgeMeta.id || `${srcId}__${tgtId}__${type}`;
      if (edgeIds.has(eid)) return;
      edgeIds.add(eid);
      edgeArr.push({
        data: {
          id:     eid,
          source: srcId,
          target: tgtId,
          type,
          color:  EDGE_COLORS[type] || "#94a3b8",
          ...edgeMeta,
        }
      });
    };

    // ── Layer 1: Relationship edges ──────────────────────────────────────────
    const filtered = filterType === "all"
      ? relationships
      : relationships.filter(r => r.relationship_type === filterType);

    filtered.forEach(r => {
      if (!r.relationship_type) return; // guard: skip bad records

      // Register all nodes from this record
      if (r.person_name)          addNode(nodeId("person",     r.person_name,         r.person_id),          r.person_name,          "person");
      if (r.enterprise_name)      addNode(nodeId("enterprise", r.enterprise_name,      r.enterprise_id),      r.enterprise_name,      "enterprise");
      if (r.item_name)            addNode(nodeId("product",    r.item_name,            r.item_id),            r.item_name,            "product");
      if (r.service_name)         addNode(nodeId("service",    r.service_name,         r.service_id),         r.service_name,         "service");
      if (r.secondary_person)     addNode(nodeId("person",     r.secondary_person,     r.secondary_person_id),r.secondary_person,     "person");
      if (r.secondary_enterprise) addNode(nodeId("enterprise", r.secondary_enterprise, r.secondary_enterprise_id), r.secondary_enterprise, "enterprise");
      if (r.location)             addNode(nodeId("address",    r.location,             r.address_id),         r.location,             "address");

      const [src, tgt] = edgeEndpoints(r);
      addEdge(src, tgt, r.relationship_type, {
        id:     r.id,
        label:  edgeLabel(r),
        status: r.status || "active",
      });
    });

    // ── Layer 2: Task nodes ──────────────────────────────────────────────────
    if (layerId === "tasks" || layerId === "full") {
      tasks.forEach(t => {
        if (!t.title && !t.task_type) return;
        const label = t.title || t.task_type || "Task";
        const tid   = nodeId("task", label, t.id);
        addNode(tid, label.length > 20 ? label.slice(0, 18) + "…" : label, "task",
          { status: t.status, fullLabel: label });

        // task → assigned person
        if (t.assigned_to || t.person_name) {
          const pname = t.assigned_to || t.person_name;
          const pid   = nodeId("person", pname, t.person_id);
          if (nodeMap.has(pid) || nodeMap.has(`person__label__${pname}`)) {
            addEdge(tid, pid, "task_person", { label: t.status || "" });
          } else {
            // person not in relationships yet — add them
            addNode(pid, pname, "person");
            addEdge(tid, pid, "task_person", { label: t.status || "" });
          }
        }

        // task → enterprise
        if (t.enterprise_name || t.enterprise_id) {
          const ename = t.enterprise_name || "";
          const eid   = nodeId("enterprise", ename, t.enterprise_id);
          if (ename || t.enterprise_id) {
            if (!nodeMap.has(eid) && ename) addNode(eid, ename, "enterprise");
            if (nodeMap.has(eid)) addEdge(tid, eid, "task_enterprise", { label: t.task_type || "" });
          }
        }
      });
    }

    // ── Layer 3: Transaction nodes ───────────────────────────────────────────
    if (layerId === "txns" || layerId === "full") {
      transactions.forEach(tx => {
        if (!tx.transaction_type && !tx.description) return;
        const label = tx.description
          ? (tx.description.length > 20 ? tx.description.slice(0, 18) + "…" : tx.description)
          : (tx.transaction_type || "Transaction");
        const amt   = tx.amount ? `$${Number(tx.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "";
        const txid  = nodeId("transaction", label, tx.id);
        addNode(txid, `${label}${amt ? " · " + amt : ""}`, "transaction", {
          amount: tx.amount,
          transaction_type: tx.transaction_type,
        });

        // tx → enterprise
        if (tx.enterprise_name || tx.enterprise_id) {
          const ename = tx.enterprise_name || "";
          const eid   = nodeId("enterprise", ename, tx.enterprise_id);
          if (ename && !nodeMap.has(eid)) addNode(eid, ename, "enterprise");
          if (nodeMap.has(eid)) addEdge(txid, eid, "transaction_enterprise", { label: tx.transaction_type || "" });
        }

        // tx → person
        if (tx.person_name || tx.person_id) {
          const pname = tx.person_name || "";
          const pid   = nodeId("person", pname, tx.person_id);
          if (pname && !nodeMap.has(pid)) addNode(pid, pname, "person");
          if (nodeMap.has(pid)) addEdge(txid, pid, "transaction_person", { label: amt });
        }
      });
    }

    // Collect unique node elements (filter out label-key entries)
    const nodes = [];
    const seenIds = new Set();
    nodeMap.forEach((el, key) => {
      if (!key.includes("__label__") && !seenIds.has(el.data.id)) {
        seenIds.add(el.data.id);
        nodes.push(el);
      }
    });

    return [...nodes, ...edgeArr];
  }, [relationships, filterType, tasks, transactions, layerId]);

  // ── Render Cytoscape ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

    const nodeCount = elements.filter(e => !e.data.source).length;
    if (nodeCount === 0) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            "label":            "data(label)",
            "color":            "#1e293b",
            "font-size":        9,
            "text-valign":      "bottom",
            "text-halign":      "center",
            "text-margin-y":    4,
            "text-max-width":   80,
            "text-wrap":        "ellipsis",
            "width":            26,
            "height":           26,
            "border-width":     2,
            "border-color":     "#fff",
          }
        },
        {
          selector: "node[type='task']",
          style: { "shape": "diamond", "width": 22, "height": 22 }
        },
        {
          selector: "node[type='transaction']",
          style: { "shape": "round-rectangle", "width": 28, "height": 18 }
        },
        {
          selector: "node:selected",
          style: { "border-width": 3, "border-color": "#0f172a", "width": 34, "height": 34 }
        },
        {
          selector: "edge",
          style: {
            "width":              1.5,
            "line-color":         "data(color)",
            "target-arrow-color": "data(color)",
            "target-arrow-shape": "triangle",
            "curve-style":        "bezier",
            "opacity":            0.65,
            "label":              "data(label)",
            "font-size":          7,
            "text-rotation":      "autorotate",
            "color":              "#64748b",
            "text-background-color": "#ffffff",
            "text-background-opacity": 0.7,
            "text-background-padding": "1px",
          }
        },
        {
          selector: "edge[status='ended']",
          style: { "line-style": "dashed", "opacity": 0.25 }
        },
        {
          selector: "edge[type='task_person'],edge[type='task_enterprise']",
          style: { "line-style": "dotted", "opacity": 0.45, "width": 1 }
        },
        {
          selector: "edge[type='transaction_enterprise'],edge[type='transaction_person']",
          style: { "line-style": "dashed", "opacity": 0.5, "width": 1 }
        },
        { selector: ".highlighted", style: { "opacity": 1,    "z-index": 9999 } },
        { selector: ".faded",       style: { "opacity": 0.06 } },
      ],
      layout: {
        name:              layoutId,
        animate:           true,
        animationDuration: 600,
        padding:           30,
        nodeRepulsion:     () => 8000,
        idealEdgeLength:   () => 90,
        edgeElasticity:    () => 0.45,
        numIter:           1000,
        directed:          false,
        spacingFactor:     1.8,
        rows:              Math.ceil(Math.sqrt(nodeCount)),
      },
      wheelSensitivity: 0.3,
    });

    // Stats
    let topNode = null, topDegree = 0;
    cy.nodes().forEach(n => {
      const d = n.degree(false);
      if (d > topDegree) { topDegree = d; topNode = n.data("label"); }
    });
    setStats({
      nodes:     nodeCount,
      edges:     elements.filter(e => e.data.source).length,
      topNode,
      topDegree,
    });

    cy.on("tap", "node", e => {
      const node      = e.target;
      const connected = node.connectedEdges();
      const neighbors = node.neighborhood("node");
      cy.elements().addClass("faded");
      node.removeClass("faded").addClass("highlighted");
      connected.removeClass("faded").addClass("highlighted");
      neighbors.removeClass("faded").addClass("highlighted");
      setSelectedNode({
        label:     node.data("label"),
        type:      node.data("type"),
        degree:    node.degree(false),
        meta:      {
          amount:           node.data("amount"),
          transaction_type: node.data("transaction_type"),
          status:           node.data("status"),
        },
        neighbors: neighbors.map(n => ({ label: n.data("label"), type: n.data("type") })),
      });
    });

    cy.on("tap", e => {
      if (e.target === cy) {
        cy.elements().removeClass("faded highlighted");
        setSelectedNode(null);
      }
    });

    cyRef.current = cy;

    const ro = new ResizeObserver(() => { if (cyRef.current) cyRef.current.resize(); });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      try { if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; } } catch (_) {}
    };
  }, [elements, layoutId]);

  const nodeCount = elements.filter(e => !e.data.source).length;

  if (nodeCount < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
        <Network className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">Not enough data to render graph</p>
        <p className="text-xs mt-1">Add relationships to see the network</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{stats.nodes}</span> nodes ·{" "}
          <span className="font-semibold text-slate-700">{stats.edges}</span> edges
          {stats.topNode && (
            <span className="ml-2 hidden sm:inline">
              · Most connected: <span className="font-semibold text-slate-700">{stats.topNode}</span>{" "}
              <span className="text-slate-400">({stats.topDegree})</span>
            </span>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          {/* Layer toggle */}
          <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg mr-1">
            {LAYERS.map(l => (
              <button
                key={l.id}
                onClick={() => setLayerId(l.id)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                  layerId === l.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {l.id === "rels" && <Network className="w-3 h-3" />}
                {l.id === "full" && <Layers className="w-3 h-3" />}
                <span className="hidden sm:inline">{l.label}</span>
              </button>
            ))}
          </div>
          {/* Layout toggle */}
          <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg">
            {LAYOUTS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setLayoutId(id)}
                title={label}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  layoutId === id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden md:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative" style={{ height: 520 }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-xl p-2.5 text-[10px] space-y-1 pointer-events-none">
          {Object.entries(NODE_COLORS).map(([type, color]) => {
            const shape = type === "task" ? "◆" : type === "transaction" ? "▬" : "●";
            return (
              <div key={type} className="flex items-center gap-1.5">
                <span style={{ color }}>{shape}</span>
                <span className="capitalize text-slate-600">{type}</span>
              </div>
            );
          })}
          <div className="border-t border-slate-100 pt-1 space-y-0.5">
            <div className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-slate-400 inline-block" /><span className="text-slate-400">transaction</span></div>
            <div className="flex items-center gap-1.5"><span className="w-4 border-t border-dotted border-slate-400 inline-block" /><span className="text-slate-400">task · ended</span></div>
          </div>
        </div>

        {/* Node detail panel */}
        {selectedNode && (
          <div className="absolute top-3 right-3 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-slate-800 leading-tight text-sm">{selectedNode.label}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full capitalize font-medium"
                    style={{
                      background: (NODE_COLORS[selectedNode.type] || "#94a3b8") + "20",
                      color: NODE_COLORS[selectedNode.type] || "#94a3b8",
                    }}
                  >
                    {selectedNode.type}
                  </span>
                  {selectedNode.meta?.status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {selectedNode.meta.status}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => { cyRef.current?.elements().removeClass("faded highlighted"); setSelectedNode(null); }}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedNode.meta?.amount && (
              <p className="text-xs text-rose-600 font-semibold mb-1">
                ${Number(selectedNode.meta.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                {selectedNode.meta.transaction_type && ` · ${selectedNode.meta.transaction_type.replace(/_/g, " ")}`}
              </p>
            )}

            <p className="text-xs text-slate-500 mb-2">
              {selectedNode.degree} connection{selectedNode.degree !== 1 ? "s" : ""}
            </p>
            {selectedNode.neighbors.length > 0 && (
              <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                {selectedNode.neighbors.map((n, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: NODE_COLORS[n.type] || "#94a3b8" }}
                    />
                    <span className="text-slate-600 truncate">{n.label}</span>
                    <span className="text-slate-300 text-[10px] ml-auto shrink-0">{n.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="absolute bottom-3 right-3 text-[10px] text-slate-400 pointer-events-none">
          Scroll to zoom · Drag to pan · Click node to inspect
        </p>
      </div>
    </div>
  );
}
