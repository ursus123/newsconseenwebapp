/**
 * CytoscapeRelationshipGraph
 *
 * Force-directed graph of the Relationship entity.
 * Nodes: Person (blue), Enterprise (violet), Product (amber),
 *        Service (cyan), Address (emerald).
 * Edges: coloured by relationship_type; dashed if ended.
 *
 * Click node   → highlight neighbourhood + detail panel.
 * Click canvas → deselect.
 * Scroll       → zoom. Drag → pan.
 * Layout switcher: Force / Tree / Circle / Grid.
 */
import { useEffect, useRef, useState, useMemo } from "react";
import cytoscape from "cytoscape";
import { Network, GitBranch, Circle, Grid3x3, X } from "lucide-react";

const NODE_COLORS = {
  person:     "#3b82f6",
  enterprise: "#8b5cf6",
  product:    "#f59e0b",
  service:    "#06b6d4",
  address:    "#10b981",
};

const EDGE_COLORS = {
  person_enterprise:    "#3b82f6",
  person_person:        "#f43f5e",
  enterprise_enterprise:"#8b5cf6",
  item_enterprise:      "#f59e0b",
  item_person:          "#f97316",
  person_service:       "#06b6d4",
  enterprise_service:   "#6366f1",
  person_address:       "#10b981",
  enterprise_address:   "#14b8a6",
};

const TYPE_LABELS = {
  person_enterprise:    "Person → Enterprise",
  person_person:        "Person → Person",
  enterprise_enterprise:"Enterprise → Enterprise",
  item_enterprise:      "Item → Enterprise",
  item_person:          "Item → Person",
  person_service:       "Person → Service",
  enterprise_service:   "Enterprise → Service",
  person_address:       "Person → Address",
  enterprise_address:   "Enterprise → Address",
};

const LAYOUTS = [
  { id: "cose",         label: "Force",  icon: Network    },
  { id: "breadthfirst", label: "Tree",   icon: GitBranch  },
  { id: "circle",       label: "Circle", icon: Circle     },
  { id: "grid",         label: "Grid",   icon: Grid3x3    },
];

function getEdgeEndpoints(r) {
  switch (r.relationship_type) {
    case "person_enterprise":    return [`person__${r.person_name}`,     `enterprise__${r.enterprise_name}`];
    case "item_enterprise":      return [`product__${r.item_name}`,      `enterprise__${r.enterprise_name}`];
    case "item_person":          return [`product__${r.item_name}`,      `person__${r.person_name}`];
    case "person_service":       return [`person__${r.person_name}`,     `service__${r.service_name}`];
    case "enterprise_service":   return [`enterprise__${r.enterprise_name}`, `service__${r.service_name}`];
    case "person_address":       return [`person__${r.person_name}`,     `address__${r.location || r.address_name}`];
    case "enterprise_address":   return [`enterprise__${r.enterprise_name}`, `address__${r.location || r.address_name}`];
    case "person_person":        return [`person__${r.person_name}`,     `person__${r.secondary_person}`];
    case "enterprise_enterprise":return [`enterprise__${r.enterprise_name}`, `enterprise__${r.secondary_enterprise}`];
    default: return [null, null];
  }
}

function isValidId(id) {
  if (!id) return false;
  const INVALID = ["person__undefined","enterprise__undefined","product__undefined","service__undefined","address__undefined","person__null","enterprise__null"];
  return !INVALID.includes(id);
}

export default function CytoscapeRelationshipGraph({ relationships = [], filterType = "all" }) {
  const containerRef = useRef(null);
  const cyRef        = useRef(null);
  const [layoutId, setLayoutId]         = useState("cose");
  const [selectedNode, setSelectedNode] = useState(null);
  const [stats, setStats]               = useState({ nodes: 0, edges: 0, topNode: null, topDegree: 0 });

  const elements = useMemo(() => {
    const nodeMap = new Map();
    const edges   = [];
    const edgeIds = new Set();

    const addNode = (id, label, type) => {
      if (isValidId(id) && label && !nodeMap.has(id)) {
        nodeMap.set(id, { data: { id, label, type, color: NODE_COLORS[type] || "#94a3b8" } });
      }
    };

    const filtered = filterType === "all"
      ? relationships
      : relationships.filter(r => r.relationship_type === filterType);

    filtered.forEach(r => {
      if (r.person_name)          addNode(`person__${r.person_name}`,          r.person_name,          "person");
      if (r.enterprise_name)      addNode(`enterprise__${r.enterprise_name}`,  r.enterprise_name,      "enterprise");
      if (r.item_name)            addNode(`product__${r.item_name}`,           r.item_name,            "product");
      if (r.service_name)         addNode(`service__${r.service_name}`,        r.service_name,         "service");
      if (r.secondary_person)     addNode(`person__${r.secondary_person}`,     r.secondary_person,     "person");
      if (r.secondary_enterprise) addNode(`enterprise__${r.secondary_enterprise}`, r.secondary_enterprise, "enterprise");
      if (r.location)             addNode(`address__${r.location}`,            r.location,             "address");

      const [src, tgt] = getEdgeEndpoints(r);
      if (isValidId(src) && isValidId(tgt) && nodeMap.has(src) && nodeMap.has(tgt)) {
        const edgeId = r.id || `${src}__${tgt}`;
        if (!edgeIds.has(edgeId)) {
          edgeIds.add(edgeId);
          edges.push({
            data: {
              id:     edgeId,
              source: src,
              target: tgt,
              type:   r.relationship_type,
              label:  r.role || "",
              color:  EDGE_COLORS[r.relationship_type] || "#94a3b8",
              status: r.status || "active",
            }
          });
        }
      }
    });

    return [...nodeMap.values(), ...edges];
  }, [relationships, filterType]);

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
          }
        },
        {
          selector: "edge[status='ended']",
          style: { "line-style": "dashed", "opacity": 0.25 }
        },
        { selector: ".highlighted", style: { "opacity": 1, "z-index": 9999 } },
        { selector: ".faded",       style: { "opacity": 0.07 } },
      ],
      layout: {
        name:              layoutId,
        animate:           true,
        animationDuration: 600,
        padding:           30,
        // cose
        nodeRepulsion:     () => 7000,
        idealEdgeLength:   () => 90,
        edgeElasticity:    () => 0.45,
        numIter:           1000,
        // breadthfirst
        directed:          false,
        spacingFactor:     1.8,
        // grid
        rows: Math.ceil(Math.sqrt(nodeCount)),
      },
      wheelSensitivity: 0.3,
    });

    // Compute stats
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
      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }
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
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
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
        <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg">
          {LAYOUTS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setLayoutId(id)}
              title={label}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                layoutId === id
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative" style={{ height: 500 }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-xl p-2.5 text-[10px] space-y-1 pointer-events-none">
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ background: color }} />
              <span className="capitalize text-slate-600">{type}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
            <span className="w-4 border-t border-dashed border-slate-400 inline-block" />
            <span className="text-slate-400">ended</span>
          </div>
        </div>

        {/* Node detail panel */}
        {selectedNode && (
          <div className="absolute top-3 right-3 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-slate-800 leading-tight text-sm">{selectedNode.label}</p>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full capitalize mt-0.5 inline-block font-medium"
                  style={{
                    background: NODE_COLORS[selectedNode.type] + "20",
                    color: NODE_COLORS[selectedNode.type],
                  }}
                >
                  {selectedNode.type}
                </span>
              </div>
              <button
                onClick={() => {
                  cyRef.current?.elements().removeClass("faded highlighted");
                  setSelectedNode(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-2">
              {selectedNode.degree} connection{selectedNode.degree !== 1 ? "s" : ""}
            </p>
            {selectedNode.neighbors.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {selectedNode.neighbors.map((n, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: NODE_COLORS[n.type] || "#94a3b8" }}
                    />
                    <span className="text-slate-600 truncate">{n.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hint */}
        <p className="absolute bottom-3 right-3 text-[10px] text-slate-400 pointer-events-none">
          Scroll to zoom · Drag to pan · Click node to inspect
        </p>
      </div>
    </div>
  );
}
