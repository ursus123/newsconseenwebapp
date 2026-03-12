import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Network, RefreshCw } from "lucide-react";
import { buildGraph, NODE_CONFIG } from "@/components/entitygraph/graphConfig";
import Graph2D from "@/components/entitygraph/Graph2D";
import Graph3D from "@/components/entitygraph/Graph3D";
import GraphSidePanel from "@/components/entitygraph/GraphSidePanel";

export default function EntityGraph() {
  const [enterprises, setEnterprises] = useState([]);
  const [people, setPeople] = useState([]);
  const [services, setServices] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState({ enterprise: true, person: true, service: true });
  const [mode, setMode] = useState("3d"); // "2d" | "3d"

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [ents, ppl, svcs, rels] = await Promise.all([
        base44.entities.Enterprise.list("-created_date", 500),
        base44.entities.Person.list("-created_date", 500),
        base44.entities.Service.list("-created_date", 500),
        base44.entities.Relationship.list("-created_date", 1000),
      ]);
      setEnterprises(ents);
      setPeople(ppl);
      setServices(svcs);
      setRelationships(rels);
      setLoading(false);
    };
    load();
  }, []);

  const { nodes, links } = useMemo(
    () => buildGraph(enterprises, people, services, relationships, filter),
    [enterprises, people, services, relationships, filter]
  );

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Network className="w-6 h-6 text-indigo-500" />
            Entity Graph
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {mode === "3d"
              ? "3D — drag to orbit · scroll to zoom · click to inspect"
              : "2D — drag nodes · pan canvas · click to inspect"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 2D / 3D toggle */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 gap-1">
            <button
              onClick={() => { setMode("2d"); setSelected(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === "2d" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}
            >
              2D
            </button>
            <button
              onClick={() => { setMode("3d"); setSelected(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === "3d" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}
            >
              3D
            </button>
          </div>

          {/* Type filter toggles */}
          {Object.entries(NODE_CONFIG).map(([type, cfg]) => (
            <button
              key={type}
              onClick={() => setFilter((f) => ({ ...f, [type]: !f[type] }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                filter[type] ? "text-white border-transparent shadow-sm" : "bg-white text-slate-400 border-slate-200"
              }`}
              style={filter[type] ? { backgroundColor: cfg.hex, borderColor: cfg.hex } : {}}
            >
              <span>{cfg.icon}</span> {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-sm text-slate-400">Loading entity data…</p>
          </div>
        </div>
      ) : nodes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Network className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No data to display</p>
            <p className="text-slate-300 text-sm mt-1">Add Enterprises, People, or Services first</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 flex-1 overflow-hidden min-h-0">
          {/* Canvas area */}
          {mode === "2d" ? (
            <Graph2D nodes={nodes} links={links} selected={selected} onSelect={setSelected} />
          ) : (
            <Graph3D nodes={nodes} links={links} selected={selected} onSelect={setSelected} />
          )}

          {/* Side panel */}
          <GraphSidePanel
            nodes={nodes}
            links={links}
            selected={selected}
            enterprises={enterprises}
            people={people}
            services={services}
          />
        </div>
      )}
    </div>
  );
}