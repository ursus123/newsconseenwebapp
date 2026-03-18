import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Network, RefreshCw, Search, X, Download, ChevronDown } from "lucide-react";
import { buildGraph, NODE_CONFIG, VIEW_PRESETS } from "@/components/entitygraph/graphConfig";
import Graph2D from "@/components/entitygraph/Graph2D";
import GraphSidePanel from "@/components/entitygraph/GraphSidePanel";

const INITIAL_FILTER = { enterprise: true, person: true, service: true, product: true, task: false, transaction: false, address: false };

const COLOR_BY_OPTIONS = [
  { value: "default", label: "Default Colors" },
  { value: "status",  label: "By Status" },
  { value: "health",  label: "By Health Score" },
  { value: "activity", label: "By Activity" },
];

const LOAD_STATES = { idle: "idle", loading: "loading", loaded: "loaded" };

function LoadBadge({ type, state }) {
  if (state === LOAD_STATES.loading)
    return <span className="text-[9px] text-amber-500 font-semibold animate-pulse">Loading {type}…</span>;
  if (state === LOAD_STATES.loaded)
    return <span className="text-[9px] text-emerald-500 font-semibold">✓ {type}</span>;
  return null;
}

function exportAsJSON(nodes, links) {
  const data = JSON.stringify({ nodes: nodes.map(n => ({ id: n.id, type: n.type, label: n.label })), links }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "entity-graph.json"; a.click();
}

function exportAsCSV(nodes) {
  const rows = [["id", "type", "label", "status"]];
  nodes.forEach(n => rows.push([n.id, n.type, n.label, n.raw?.status || ""]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "entity-graph.csv"; a.click();
}

function exportAsPNG() {
  const canvas = document.querySelector("canvas");
  if (canvas) {
    const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = "entity-graph.png"; a.click();
  } else {
    // For 2D SVG-based graph, use html2canvas polyfill or just notify
    alert("Export PNG works best in 3D mode. Use browser Print → Save as PDF for 2D.");
  }
}

export default function EntityGraph() {
  // Data
  const [enterprises,  setEnterprises]  = useState([]);
  const [people,       setPeople]       = useState([]);
  const [services,     setServices]     = useState([]);
  const [products,     setProducts]     = useState([]);
  const [tasks,        setTasks]        = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [addresses,    setAddresses]    = useState([]);
  const [relationships,setRelationships]= useState([]);

  // Load states (lazy loading per entity type)
  const [loadStates, setLoadStates] = useState({
    core: LOAD_STATES.idle,
    products: LOAD_STATES.idle,
    tasks: LOAD_STATES.idle,
    transactions: LOAD_STATES.idle,
    addresses: LOAD_STATES.idle,
  });

  // UI state
  const [selected,       setSelected]       = useState(null);
  const [filter,         setFilter]         = useState(INITIAL_FILTER);
  const [colorBy,        setColorBy]        = useState("default");
  const [mode,           setMode]           = useState("2d");
  const [searchQuery,    setSearchQuery]    = useState("");
  const [highlightPath,  setHighlightPath]  = useState(null);
  const [showExport,     setShowExport]     = useState(false);
  const [showPresets,    setShowPresets]    = useState(false);
  const searchRef = useRef(null);

  const setLoad = (key, state) => setLoadStates(prev => ({ ...prev, [key]: state }));

  // Phase 1: Load core data (enterprises, people, services, relationships)
  useEffect(() => {
    const loadCore = async () => {
      setLoad("core", LOAD_STATES.loading);
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
      setLoad("core", LOAD_STATES.loaded);
    };
    loadCore();
  }, []);

  // Phase 2: Load secondary data after core is loaded
  useEffect(() => {
    if (loadStates.core !== LOAD_STATES.loaded) return;
    const loadSecondary = async () => {
      setLoad("products", LOAD_STATES.loading);
      const prds = await base44.entities.Product.list("-created_date", 300);
      setProducts(prds);
      setLoad("products", LOAD_STATES.loaded);

      setLoad("addresses", LOAD_STATES.loading);
      const adrs = await base44.entities.Address.list("-created_date", 200);
      setAddresses(adrs);
      setLoad("addresses", LOAD_STATES.loaded);
    };
    loadSecondary();
  }, [loadStates.core]);

  // Phase 3: Load heavy data (tasks, transactions) last
  useEffect(() => {
    if (loadStates.products !== LOAD_STATES.loaded) return;
    const loadHeavy = async () => {
      setLoad("tasks", LOAD_STATES.loading);
      const tsks = await base44.entities.Task.list("-created_date", 300);
      setTasks(tsks);
      setLoad("tasks", LOAD_STATES.loaded);

      setLoad("transactions", LOAD_STATES.loading);
      const txns = await base44.entities.Transaction.list("-created_date", 200);
      setTransactions(txns);
      setLoad("transactions", LOAD_STATES.loaded);
    };
    loadHeavy();
  }, [loadStates.products]);

  const isLoading = loadStates.core === LOAD_STATES.loading || loadStates.core === LOAD_STATES.idle;

  const { nodes, links } = useMemo(
    () => buildGraph(enterprises, people, services, products, tasks, transactions, addresses, relationships, filter, colorBy),
    [enterprises, people, services, products, tasks, transactions, addresses, relationships, filter, colorBy]
  );

  // Max nodes cap
  const MAX_NODES = 300;
  const isCapped = nodes.length > MAX_NODES;
  const displayNodes = useMemo(() => {
    if (!isCapped) return nodes;
    const degreeMap = {};
    links.forEach(l => { degreeMap[l.source] = (degreeMap[l.source] || 0) + 1; degreeMap[l.target] = (degreeMap[l.target] || 0) + 1; });
    return [...nodes].sort((a, b) => (degreeMap[b.id] || 0) - (degreeMap[a.id] || 0)).slice(0, MAX_NODES);
  }, [nodes, links, isCapped]);

  const displayNodeIds = useMemo(() => new Set(displayNodes.map(n => n.id)), [displayNodes]);
  const displayLinks = useMemo(() => links.filter(l => displayNodeIds.has(l.source) && displayNodeIds.has(l.target)), [links, displayNodeIds]);

  const applyPreset = (presetName) => {
    setFilter(VIEW_PRESETS[presetName] || INITIAL_FILTER);
    setShowPresets(false);
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") { setSearchQuery(""); setHighlightPath(null); }
  }, []);

  const matchCount = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return displayNodes.filter(n => n.label.toLowerCase().includes(searchQuery.toLowerCase())).length;
  }, [searchQuery, displayNodes]);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-0 overflow-hidden" onKeyDown={handleKeyDown}>
      {/* Header row 1: title + mode + search + export + presets */}
      <div className="flex items-center justify-between mb-2 shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Network className="w-5 h-5 text-indigo-500" />
            Entity Graph
          </h1>
          {/* Load badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {Object.entries(loadStates).map(([k, s]) => <LoadBadge key={k} type={k} state={s} />)}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search nodes…"
              className="pl-7 pr-7 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 w-44"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3 h-3" />
              </button>
            )}
            {matchCount !== null && (
              <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {matchCount}
              </span>
            )}
          </div>

          {/* 2D/3D toggle */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 gap-1">
            <button onClick={() => { setMode("2d"); setSelected(null); }} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${mode === "2d" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}>2D</button>
          </div>

          {/* Color By */}
          <select
            value={colorBy}
            onChange={e => setColorBy(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            {COLOR_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* View Presets */}
          <div className="relative">
            <button
              onClick={() => setShowPresets(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all"
            >
              View <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showPresets && (
              <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-lg z-50 min-w-44 py-1">
                {Object.keys(VIEW_PRESETS).map(preset => (
                  <button key={preset} onClick={() => applyPreset(preset)}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors">
                    {preset}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export */}
          <div className="relative">
            <button
              onClick={() => setShowExport(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            {showExport && (
              <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-lg z-50 min-w-44 py-1">
                <button onClick={() => { exportAsPNG(); setShowExport(false); }} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Export as PNG</button>
                <button onClick={() => { exportAsJSON(displayNodes, displayLinks); setShowExport(false); }} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Export as JSON</button>
                <button onClick={() => { exportAsCSV(displayNodes); setShowExport(false); }} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Export node list as CSV</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Header row 2: filter toggles */}
      <div className="flex items-center gap-2 mb-3 shrink-0 flex-wrap">
        {Object.entries(NODE_CONFIG).map(([type, cfg]) => (
          <button
            key={type}
            onClick={() => setFilter(f => ({ ...f, [type]: !f[type] }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all ${
              filter[type] ? "text-white border-transparent shadow-sm" : "bg-white text-slate-400 border-slate-200"
            }`}
            style={filter[type] ? { backgroundColor: cfg.hex, borderColor: cfg.hex } : {}}
          >
            <span>{cfg.icon}</span> {cfg.label}
          </button>
        ))}
        {isCapped && (
          <span className="ml-2 text-[10px] text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2 py-1 rounded-xl">
            ⚠ Showing top {MAX_NODES} of {nodes.length} nodes (most connected)
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-sm text-slate-400">Loading entity network…</p>
          </div>
        </div>
      ) : displayNodes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Network className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No data to display</p>
            <p className="text-slate-300 text-sm mt-1">Enable more entity types with the filter buttons above</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 flex-1 overflow-hidden min-h-0">
          <Graph2D
            nodes={displayNodes}
            links={displayLinks}
            selected={selected}
            onSelect={setSelected}
            colorBy={colorBy}
            searchQuery={searchQuery}
            highlightPath={highlightPath}
          />
          <GraphSidePanel
            nodes={displayNodes}
            links={displayLinks}
            selected={selected}
            enterprises={enterprises}
            people={people}
            services={services}
            products={products}
            tasks={tasks}
            transactions={transactions}
            onHighlightPath={setHighlightPath}
          />
        </div>
      )}
    </div>
  );
}