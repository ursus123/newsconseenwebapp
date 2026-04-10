/**
 * CytoscapeNetworkGraph
 *
 * Hub-and-spoke graph for Network Intelligence.
 * Central "Network" hub + one node per member enterprise.
 * Node size  ∝ health_score (larger = healthier).
 * Node color  = health grade (A green, B blue, C amber, D red).
 * Click member → detail panel.
 */
import { useEffect, useRef, useState } from "react";
import { loadCytoscape } from "@/utils/loadCytoscape";
import { X } from "lucide-react";

const GRADE_COLORS = {
  A: "#10b981",
  B: "#3b82f6",
  C: "#f59e0b",
  D: "#f43f5e",
};
const DEFAULT_COLOR = "#94a3b8";

function gradeColor(grade) {
  return GRADE_COLORS[grade] || DEFAULT_COLOR;
}

export default function CytoscapeNetworkGraph({ members = [] }) {
  const containerRef = useRef(null);
  const cyRef        = useRef(null);
  const [cyLib, setCyLib]       = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => { loadCytoscape().then(setCyLib).catch(() => {}); }, []);

  useEffect(() => {
    if (!cyLib || !containerRef.current || members.length === 0) return;

    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

    const HUB = "__hub__";

    const elements = [
      {
        data: {
          id:    HUB,
          label: "Network",
          type:  "hub",
          size:  54,
          color: "#6366f1",
        }
      },
      ...members.map(m => ({
        data: {
          id:     m.company_id,
          label:  m.name || m.company_id,
          type:   "member",
          size:   Math.max(22, Math.min(46, (m.health_score || 50) * 0.46)),
          color:  gradeColor(m.health_grade),
          grade:  m.health_grade || "?",
          member: m,
        }
      })),
      ...members.map(m => ({
        data: {
          id:     `edge__${m.company_id}`,
          source: HUB,
          target: m.company_id,
          color:  gradeColor(m.health_grade),
        }
      })),
    ];

    const cy = cyLib({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node[type='hub']",
          style: {
            "background-color": "#6366f1",
            "label":            "data(label)",
            "color":            "#fff",
            "font-size":        11,
            "font-weight":      "bold",
            "text-valign":      "center",
            "text-halign":      "center",
            "width":            "data(size)",
            "height":           "data(size)",
            "border-width":     0,
          }
        },
        {
          selector: "node[type='member']",
          style: {
            "background-color": "data(color)",
            "label":            "data(label)",
            "color":            "#1e293b",
            "font-size":        9,
            "text-valign":      "bottom",
            "text-halign":      "center",
            "text-margin-y":    4,
            "text-max-width":   90,
            "text-wrap":        "ellipsis",
            "width":            "data(size)",
            "height":           "data(size)",
            "border-width":     2,
            "border-color":     "#fff",
          }
        },
        {
          selector: "node:selected",
          style: { "border-width": 3, "border-color": "#0f172a" }
        },
        {
          selector: "edge",
          style: {
            "width":       1.5,
            "line-color":  "data(color)",
            "curve-style": "straight",
            "opacity":     0.4,
          }
        },
        { selector: ".highlighted", style: { "opacity": 1,    "z-index": 9999 } },
        { selector: ".faded",       style: { "opacity": 0.08 } },
      ],
      layout: {
        name:          "concentric",
        animate:       true,
        animationDuration: 700,
        concentric:    n => (n.id() === HUB ? 2 : 1),
        levelWidth:    () => 1,
        spacingFactor: 2.2,
        padding:       40,
      },
      wheelSensitivity: 0.3,
    });

    cy.on("tap", "node[type='member']", e => {
      const node = e.target;
      cy.elements().addClass("faded");
      node.removeClass("faded").addClass("highlighted");
      cy.getElementById(HUB).removeClass("faded");
      cy.getElementById(`edge__${node.id()}`).removeClass("faded").addClass("highlighted");
      setSelected(node.data("member"));
    });

    cy.on("tap", e => {
      if (e.target === cy) {
        cy.elements().removeClass("faded highlighted");
        setSelected(null);
      }
    });

    cyRef.current = cy;

    const ro = new ResizeObserver(() => { if (cyRef.current) cyRef.current.resize(); });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }
    };
  }, [cyLib, members]);

  if (!members.length) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <div>
          <p className="text-sm font-semibold text-slate-800">Network Graph</p>
          <p className="text-[10px] text-slate-400">
            {members.length} members · node size = health score · colour = grade · click to inspect
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
          {Object.entries(GRADE_COLORS).map(([grade, color]) => (
            <span key={grade} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
              Grade {grade}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: DEFAULT_COLOR }} />
            Ungraded
          </span>
        </div>
      </div>

      <div className="relative" style={{ height: 400 }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {/* Member detail panel */}
        {selected && (
          <div className="absolute top-3 right-3 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-3">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-slate-800 leading-tight">{selected.name}</p>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-bold mt-0.5 inline-block"
                  style={{
                    background: gradeColor(selected.health_grade) + "20",
                    color: gradeColor(selected.health_grade),
                  }}
                >
                  Grade {selected.health_grade || "?"} · {selected.health_score ?? "—"}
                </span>
              </div>
              <button
                onClick={() => {
                  cyRef.current?.elements().removeClass("faded highlighted");
                  setSelected(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              {[
                ["Active people",   selected.people_active != null ? selected.people_active.toLocaleString() : "—"],
                ["Revenue (30d)",   selected.revenue_30d != null ? `$${selected.revenue_30d.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"],
                ["Task completion", selected.task_completion != null ? `${Number(selected.task_completion).toFixed(0)}%` : "—"],
                ["Stock alerts",    (selected.expiring_7d || 0) + (selected.low_stock || 0) > 0
                  ? `${(selected.expiring_7d || 0) + (selected.low_stock || 0)} items`
                  : "✓ OK"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-semibold text-slate-700">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="absolute bottom-3 right-3 text-[10px] text-slate-400 pointer-events-none">
          Scroll to zoom · Drag to pan
        </p>
      </div>
    </div>
  );
}
