import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Network, RefreshCw, Search, X, Download, ChevronDown } from "lucide-react";
import { buildGraph, NODE_CONFIG, VIEW_PRESETS } from "@/components/entitygraph/graphConfig";
import { useEntityListFn } from "@/components/shared/useDataQuery";
import Graph2D from "@/components/entitygraph/Graph2D";
import GraphSidePanel from "@/components/entitygraph/GraphSidePanel";
import GraphFilterPanel from "@/components/entitygraph/GraphFilterPanel";

const INITIAL_FILTER = { enterprise: true, person: true, service: false, product: false, task: false, transaction: false, address: false };
const CLUSTER_THRESHOLD = 5;

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
  // Current user (for tenant isolation)
  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });
  const listFn = useEntityListFn(currentUser);

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
  const [selected,          setSelected]          = useState(null);
  const [filter,            setFilter]            = useState(INITIAL_FILTER);
  const [colorBy,           setColorBy]           = useState("default");
  const [mode,              setMode]              = useState("2d");
  const [searchQuery,       setSearchQuery]       = useState("");
  const [highlightPath,     setHighlightPath]     = useState(null);
  const [showExport,        setShowExport]        = useState(false);
  const [showPresets,       setShowPresets]       = useState(false);
  const [focusMode,         setFocusMode]         = useState(false);
  const [focusedEnterprise, setFocusedEnterprise] = useState(null);
  const [depth,             setDepth]             = useState(1);
  const [expandedClusters,  setExpandedClusters]  = useState(new Set());
  const [collapsedTypes,    setCollapsedTypes]    = useState(new Set()); // global collapse per type
  const searchRef = useRef(null);

  const setLoad = (key, state) => setLoadStates(prev => ({ ...prev, [key]: state }));

  // Phase 1: Load core data — SCOPED TO TENANT
  useEffect(() => {
    if (!currentUser) return;
    const loadCore = async () => {
      setLoad("core", LOAD_STATES.loading);
      const [ents, ppl, svcs, rels] = await Promise.all([
        listFn(base44.entities.Enterprise),
        listFn(base44.entities.Person),
        listFn(base44.entities.Service),
        listFn(base44.entities.Relationship),
      ]);
      setEnterprises(ents);
      setPeople(ppl);
      setServices(svcs);
      setRelationships(rels);
      setLoad("core", LOAD_STATES.loaded);
    };
    loadCore();
  }, [currentUser]);

  // Phase 2: Load secondary data after core is loaded
  useEffect(() => {
    if (loadStates.core !== LOAD_STATES.loaded || !currentUser) return;
    const loadSecondary = async () => {
      setLoad("products", LOAD_STATES.loading);
      const prds = await listFn(base44.entities.Product);
      setProducts(prds);
      setLoad("products", LOAD_STATES.loaded);

      setLoad("addresses", LOAD_STATES.loading);
      const adrs = await listFn(base44.entities.Address);
      setAddresses(adrs);
      setLoad("addresses", LOAD_STATES.loaded);
    };
    loadSecondary();
  }, [loadStates.core, currentUser]);

  // Phase 3: Load heavy data (tasks, transactions) last
  useEffect(() => {
    if (loadStates.products !== LOAD_STATES.loaded || !currentUser) return;
    const loadHeavy = async () => {
      setLoad("tasks", LOAD_STATES.loading);
      const tsks = await listFn(base44.entities.Task);
      setTasks(tsks);
      setLoad("tasks", LOAD_STATES.loaded);

      setLoad("transactions", LOAD_STATES.loading);
      const txns = await listFn(base44.entities.Transaction);
      setTransactions(txns);
      setLoad("transactions", LOAD_STATES.loaded);
    };
    loadHeavy();
  }, [loadStates.products, currentUser]);

  const isLoading = loadStates.core === LOAD_STATES.loading || loadStates.core === LOAD_STATES.idle;

  const { nodes: rawNodes, links: rawLinks } = useMemo(
    () => buildGraph(enterprises, people, services, products, tasks, transactions, addresses, relationships, filter, colorBy),
    [enterprises, people, services, products, tasks, transactions, addresses, relationships, filter, colorBy]
  );

  // Focus mode: filter to focused enterprise + its direct connections only
  const { nodes: focusedNodes, links: focusedLinks } = useMemo(() => {
    if (!focusMode) return { nodes: rawNodes, links: rawLinks };
    // Show all enterprises always; expand only the focused one
    const entNodes = rawNodes.filter(n => n.type === "enterprise");
    if (!focusedEnterprise) return { nodes: entNodes, links: [] };
    const connectedLinks = rawLinks.filter(l => l.source === focusedEnterprise || l.target === focusedEnterprise);
    const connectedIds = new Set(connectedLinks.flatMap(l => [l.source, l.target]));
    const visibleNodes = rawNodes.filter(n => n.type === "enterprise" || connectedIds.has(n.id));
    const visibleIds = new Set(visibleNodes.map(n => n.id));
    return {
      nodes: visibleNodes,
      links: rawLinks.filter(l => visibleIds.has(l.source) && visibleIds.has(l.target)),
    };
  }, [focusMode, focusedEnterprise, rawNodes, rawLinks]);

  // Depth filter: restrict to nodes within `depth` hops of any enterprise
  const { nodes: depthNodes, links: depthLinks } = useMemo(() => {
    if (depth >= 3) return { nodes: focusedNodes, links: focusedLinks };
    const entIds = new Set(focusedNodes.filter(n => n.type === "enterprise").map(n => n.id));
    const adj = {};
    focusedLinks.forEach(l => {
      if (!adj[l.source]) adj[l.source] = [];
      if (!adj[l.target]) adj[l.target] = [];
      adj[l.source].push(l.target);
      adj[l.target].push(l.source);
    });
    const visited = new Set(entIds);
    let frontier = [...entIds];
    for (let d = 0; d < depth; d++) {
      const next = [];
      frontier.forEach(id => (adj[id] || []).forEach(nb => { if (!visited.has(nb)) { visited.add(nb); next.push(nb); } }));
      frontier = next;
    }
    const dNodes = focusedNodes.filter(n => visited.has(n.id));
    const dLinks = focusedLinks.filter(l => visited.has(l.source) && visited.has(l.target));
    return { nodes: dNodes, links: dLinks };
  }, [depth, focusedNodes, focusedLinks]);

  // Clustering: replace large per-enterprise groups with cluster nodes
  const { nodes, links } = useMemo(() => {
    const CLUSTER_TYPES = ["person", "product", "task", "transaction"];
    const entNodes = depthNodes.filter(n => n.type === "enterprise");
    const clusterIcons = { person: "👥", product: "📦", task: "✅", transaction: "💳" };
    const clusterColors = { person: NODE_CONFIG.person, product: NODE_CONFIG.product, task: NODE_CONFIG.task, transaction: NODE_CONFIG.transaction };
    const removedIds = new Set();
    const addedClusters = [];
    const addedLinks = [];

    entNodes.forEach(ent => {
      CLUSTER_TYPES.forEach(type => {
        const clusterId = `${ent.id}_${type}`;
        if (expandedClusters.has(clusterId)) return;
        const connectedOfType = depthLinks
          .filter(l => (l.source === ent.id || l.target === ent.id))
          .map(l => l.source === ent.id ? l.target : l.source)
          .filter(nid => {
            const n = depthNodes.find(x => x.id === nid);
            return n?.type === type;
          });
        if (connectedOfType.length > CLUSTER_THRESHOLD) {
          connectedOfType.forEach(id => removedIds.add(id));
          const cfg = clusterColors[type];
          addedClusters.push({
            id: clusterId,
            type,
            isCluster: true,
            clusterId,
            clusterCount: connectedOfType.length,
            label: `${connectedOfType.length} ${cfg.label}s`,
            raw: null,
          });
          addedLinks.push({
            id: `clust_link_${clusterId}`,
            source: ent.id,
            target: clusterId,
            label: type,
            edgeType: type,
          });
        }
      });
    });

    const filteredNodes = depthNodes.filter(n => !removedIds.has(n.id));
    const filteredLinks = depthLinks.filter(l => !removedIds.has(l.source) && !removedIds.has(l.target));
    return {
      nodes: [...filteredNodes, ...addedClusters],
      links: [...filteredLinks, ...addedLinks],
    };
  }, [depthNodes, depthLinks, expandedClusters]);

  const handleClusterClick = (clusterId) => {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId); else next.add(clusterId);
      return next;
    });
  };

  // Global collapse: if a type is in collapsedTypes, replace ALL its nodes with a single node
  const { nodes: collapsedNodes, links: collapsedLinks } = useMemo(() => {
    if (collapsedTypes.size === 0) return { nodes, links };

    const removedIds = new Set();
    const globalClusters = [];
    const globalLinks = [];

    collapsedTypes.forEach(type => {
      const typeNodes = nodes.filter(n => n.type === type && !n.isCluster);
      if (typeNodes.length <= 1) return;
      const cfg = NODE_CONFIG[type];
      const globalId = `global_cluster_${type}`;
      typeNodes.forEach(n => removedIds.add(n.id));
      globalClusters.push({
        id: globalId,
        type,
        isCluster: true,
        clusterId: globalId,
        clusterCount: typeNodes.length,
        label: `${typeNodes.length} ${cfg.label}s`,
        raw: null,
      });
      // Reconnect links that pointed to removed nodes → point to global cluster
      const targetIds = new Set(typeNodes.map(n => n.id));
      const seenGlobalLinks = new Set();
      links.forEach(l => {
        const srcRemoved = removedIds.has(l.source) && targetIds.has(l.source);
        const tgtRemoved = removedIds.has(l.target) && targetIds.has(l.target);
        if (srcRemoved || tgtRemoved) {
          const newSrc = srcRemoved ? globalId : l.source;
          const newTgt = tgtRemoved ? globalId : l.target;
          if (newSrc === newTgt) return;
          const key = [newSrc, newTgt].sort().join("|");
          if (seenGlobalLinks.has(key)) return;
          seenGlobalLinks.add(key);
          globalLinks.push({ ...l, id: `gcl_${key}`, source: newSrc, target: newTgt });
        }
      });
    });

    const keptNodes = nodes.filter(n => !removedIds.has(n.id));
    const keptLinks = links.filter(l => !removedIds.has(l.source) && !removedIds.has(l.target));
    return {
      nodes: [...keptNodes, ...globalClusters],
      links: [...keptLinks, ...globalLinks],
    };
  }, [nodes, links, collapsedTypes]);

  // Counts per type (raw, before collapse)
  const typeCounts = useMemo(() => {
    const counts = {};
    rawNodes.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1; });
    return counts;
  }, [rawNodes]);

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

      {/* Header row 2: filter toggles + focus mode + depth + node count */}
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

        <div className="h-4 w-px bg-slate-200 mx-1" />

        {/* Focus Mode */}
        <button
          onClick={() => { setFocusMode(v => !v); setFocusedEnterprise(null); }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all ${
            focusMode ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-500 border-slate-200"
          }`}
          title="Focus Mode: click an enterprise to expand only its connections"
        >
          🎯 Focus
        </button>

        {/* Depth slider */}
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1">
          <span className="text-xs text-slate-500">Depth</span>
          <input
            type="range" min={1} max={3} value={depth}
            onChange={e => setDepth(Number(e.target.value))}
            className="w-16 accent-indigo-500"
          />
          <span className="text-xs font-mono text-slate-600 w-3">{depth}</span>
        </div>

        {/* Node count indicator */}
        <span className={`text-xs px-2 py-1 rounded-xl border font-medium ${displayNodes.length > 100 ? "text-amber-600 bg-amber-50 border-amber-200" : "text-slate-400 bg-white border-slate-200"}`}>
          {displayNodes.length} nodes · {displayLinks.length} links
          {displayNodes.length > 100 && " · Use Focus Mode for clarity"}
        </span>

        {isCapped && (
          <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2 py-1 rounded-xl">
            ⚠ Capped at {MAX_NODES} of {nodes.length}
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
            onSelect={(id) => {
              // In focus mode, clicking an enterprise focuses it
              if (focusMode) {
                const n = displayNodes.find(x => x.id === id);
                if (n?.type === "enterprise") {
                  setFocusedEnterprise(prev => prev === id ? null : id);
                  return;
                }
              }
              setSelected(id);
            }}
            colorBy={colorBy}
            searchQuery={searchQuery}
            highlightPath={highlightPath}
            onClusterClick={handleClusterClick}
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