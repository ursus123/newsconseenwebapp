import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Network, RefreshCw, Search, X, Download, ChevronDown, Target } from "lucide-react";
import { buildGraph, NODE_CONFIG, VIEW_PRESETS } from "@/components/entitygraph/graphConfig";
import { useEntityListFn } from "@/components/shared/useDataQuery";
import Graph2D from "@/components/entitygraph/Graph2D";
import GraphSidePanel from "@/components/entitygraph/GraphSidePanel";
import GraphFilterPanel from "@/components/entitygraph/GraphFilterPanel";
import HierarchyView from "@/components/entitygraph/HierarchyView";
import PeopleDistributionView from "@/components/entitygraph/PeopleDistributionView";
import ServiceCoverageView from "@/components/entitygraph/ServiceCoverageView";
import ProductDependencyView from "@/components/entitygraph/ProductDependencyView";
import AssignmentView from "@/components/entitygraph/AssignmentView";
import SharedResourcesView from "@/components/entitygraph/SharedResourcesView";
import AnomalyView from "@/components/entitygraph/AnomalyView";
import AddressesView from "@/components/entitygraph/AddressesView";
import ProductsView from "@/components/entitygraph/ProductsView";

const VIEWS = [
  { id: "hierarchy",   icon: "🏢", label: "Enterprise Structure" },
  { id: "people",      icon: "👥", label: "Who Works Where" },
  { id: "services",    icon: "⚙️",  label: "Service Coverage" },
  { id: "products",    icon: "📦", label: "Products" },
  { id: "addresses",   icon: "📍", label: "Addresses" },
  { id: "assignments", icon: "🔗", label: "Staff-Client Links" },
  { id: "shared",      icon: "🔄", label: "Shared Resources" },
  { id: "anomalies",   icon: "⚠️",  label: "Anomalies" },
  { id: "graph",       icon: "🕸️",  label: "Graph View" },
];

const INITIAL_FILTER = { enterprise: true, person: true, service: false, product: false, task: false, transaction: false, address: false };
const CLUSTER_THRESHOLD = 5;

const COLOR_BY_OPTIONS = [
  { value: "default", label: "Default Colors" },
  { value: "status",  label: "By Status" },
  { value: "health",  label: "By Health Score" },
  { value: "activity", label: "By Activity" },
];

const LOAD_STATES = { idle: "idle", loading: "loading", loaded: "loaded" };

const LOAD_LABELS = {
  core: "People & Services",
  products: "Products",
  tasks: "Tasks",
  transactions: "Transactions",
  addresses: "Locations",
};

function LoadBadge({ type, state }) {
  const label = LOAD_LABELS[type] || type;
  if (state === LOAD_STATES.loading)
    return <span className="text-[9px] text-amber-500 font-semibold animate-pulse">Loading {label}…</span>;
  if (state === LOAD_STATES.loaded)
    return <span className="text-[9px] text-emerald-500 font-semibold">✓ {label}</span>;
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

  // Intelligence UI state
  const [activeView,         setActiveView]         = useState("hierarchy");
  const [selectedEnterprise, setSelectedEnterprise] = useState("all");

  // Graph view UI state (preserved for graph tab)
  const [selected,          setSelected]          = useState(null);
  const [filter,            setFilter]            = useState(INITIAL_FILTER);
  const [colorBy,           setColorBy]           = useState("status");
  const [searchQuery,       setSearchQuery]       = useState("");
  const [highlightPath,     setHighlightPath]     = useState(null);
  const [showExport,        setShowExport]        = useState(false);
  const [focusMode,         setFocusMode]         = useState(true);
  const [focusedEnterprise, setFocusedEnterprise] = useState(null);
  const [depth,             setDepth]             = useState(1);
  const [expandedClusters,  setExpandedClusters]  = useState(new Set());
  const [collapsedTypes,    setCollapsedTypes]    = useState(new Set());
  const searchRef = useRef(null);

  const setLoad = (key, state) => setLoadStates(prev => ({ ...prev, [key]: state }));

  // Phase 1: Load core data — SCOPED TO TENANT
  useEffect(() => {
    if (!currentUser) return;
    if (loadStates.core !== LOAD_STATES.idle) return;
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
  }, [currentUser, loadStates.core]);

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

  // Relationship-based enterprise→people lookup (shared across anomaly + badge count)
  const enterprisePeopleNames = useMemo(() => {
    const map = {};
    relationships.filter(r => r.relationship_type === "person_enterprise" && r.status !== "ended" && r.enterprise_name && r.person_name).forEach(r => {
      if (!map[r.enterprise_name]) map[r.enterprise_name] = new Set();
      map[r.enterprise_name].add(r.person_name.trim());
    });
    return map;
  }, [relationships]);

  const peopleByName = useMemo(() => {
    const map = {};
    people.forEach(p => { map[`${p.first_name} ${p.last_name}`.trim()] = p; });
    return map;
  }, [people]);

  const anomalyDetails = useMemo(() => {
    if (isLoading) return [];
    const issues = [];
    enterprises.forEach(e => {
      const entName = e.enterprise_name;
      const entPeopleNames = enterprisePeopleNames[entName] || new Set();
      const entPeople = [...entPeopleNames].map(n => peopleByName[n]).filter(Boolean);
      const staff = entPeople.filter(p => ["employee", "contractor", "freelancer"].includes(p.person_type) && p.status === "active");
      const clients = entPeople.filter(p => ["client", "patient"].includes(p.person_type) && p.status === "active");
      if (!staff.length) issues.push({ severity: "critical", enterprise: entName, type: "No active staff", detail: `${entName} has no active staff members`, action: "Add staff in People page" });
      if (!clients.length) issues.push({ severity: "warning", enterprise: entName, type: "No active clients", detail: `${entName} has no active clients`, action: "Add clients in People page" });
      const recentTasks = tasks.filter(t =>
        t.enterprise === entName && (new Date() - new Date(t.scheduled_date || t.created_date)) / (1000 * 60 * 60 * 24) <= 30
      );
      if (clients.length > 0 && !recentTasks.length) issues.push({ severity: "critical", enterprise: entName, type: "No recent activity", detail: `${entName} has no tasks in 30 days`, action: "Check Tasks page" });
      const expiring = staff.filter(s => {
        if (!s.certification_expiry) return false;
        const days = (new Date(s.certification_expiry) - new Date()) / (1000 * 60 * 60 * 24);
        return days > 0 && days <= 90;
      });
      if (expiring.length > 0) issues.push({ severity: "warning", enterprise: entName, type: "Expiring certifications", detail: `${expiring.length} certifications expiring within 90 days at ${entName}`, action: "Review staff certifications" });
      const entAddrs = addresses.filter(a => a.enterprise === entName);
      if (!entAddrs.length) issues.push({ severity: "warning", enterprise: entName, type: "No locations defined", detail: `${entName} has no addresses`, action: "Add locations in Addresses page" });
    });
    const lowStock = products.filter(p => p.stock_quantity != null && p.min_stock_level != null && p.stock_quantity <= p.min_stock_level && p.status === "active");
    if (lowStock.length > 0) issues.push({ severity: "critical", enterprise: "All", type: "Low stock items", detail: `${lowStock.length} products at or below minimum: ${lowStock.slice(0, 3).map(p => p.name).join(", ")}`, action: "Reorder from Products page" });
    const unpaid = transactions.filter(t => t.payment_status === "unpaid" && (t.amount || 0) > 0);
    if (unpaid.length > 0) {
      const total = unpaid.reduce((s, t) => s + (t.amount || 0), 0);
      issues.push({ severity: "warning", enterprise: "All", type: "Outstanding payments", detail: `${unpaid.length} unpaid invoices: $${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, action: "Review Transactions page" });
    }
    return issues;
  }, [enterprises, enterprisePeopleNames, peopleByName, tasks, products, transactions, addresses, isLoading]);
  const anomalies = anomalyDetails;

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
    // Global cluster (e.g. "global_cluster_person") → toggle collapsedTypes
    if (clusterId.startsWith("global_cluster_")) {
      const type = clusterId.replace("global_cluster_", "");
      setCollapsedTypes(prev => { const s = new Set(prev); s.delete(type); return s; });
      return;
    }
    // Per-enterprise cluster → toggle expandedClusters
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

  // Max nodes cap (applied after collapse)
  const MAX_NODES = 300;
  const isCapped = collapsedNodes.length > MAX_NODES;
  const displayNodes = useMemo(() => {
    if (!isCapped) return collapsedNodes;
    const degreeMap = {};
    collapsedLinks.forEach(l => { degreeMap[l.source] = (degreeMap[l.source] || 0) + 1; degreeMap[l.target] = (degreeMap[l.target] || 0) + 1; });
    return [...collapsedNodes].sort((a, b) => (degreeMap[b.id] || 0) - (degreeMap[a.id] || 0)).slice(0, MAX_NODES);
  }, [collapsedNodes, collapsedLinks, isCapped]);

  const displayNodeIds = useMemo(() => new Set(displayNodes.map(n => n.id)), [displayNodes]);
  const displayLinks = useMemo(() => collapsedLinks.filter(l => displayNodeIds.has(l.source) && displayNodeIds.has(l.target)), [collapsedLinks, displayNodeIds]);

  const applyPreset = (presetName) => {
    setFilter(VIEW_PRESETS[presetName] || INITIAL_FILTER);
  };

  const handleRefresh = () => {
    setEnterprises([]); setPeople([]); setServices([]); setProducts([]);
    setTasks([]); setTransactions([]); setAddresses([]); setRelationships([]);
    setLoadStates({ core: LOAD_STATES.idle, products: LOAD_STATES.idle, tasks: LOAD_STATES.idle, transactions: LOAD_STATES.idle, addresses: LOAD_STATES.idle });
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") { setSearchQuery(""); setHighlightPath(null); }
  }, []);

  const matchCount = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return displayNodes.filter(n => n.label.toLowerCase().includes(searchQuery.toLowerCase())).length;
  }, [searchQuery, displayNodes]);

  return (
    <div className="flex flex-col h-full overflow-hidden" onKeyDown={handleKeyDown}>
      {/* Navigation bar */}
      <div className="flex items-center gap-2 bg-white border-b border-slate-100 px-4 py-3 shrink-0 flex-wrap shadow-sm z-20">
        <h1 className="text-base font-bold text-slate-800 mr-2 flex items-center gap-2">
          <Network className="w-4 h-4 text-indigo-500" />
          Enterprise Intelligence
        </h1>

        {/* Desktop tabs */}
        <div className="hidden lg:flex gap-1">
          {VIEWS.map(view => (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                activeView === view.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {view.icon} {view.label}
              {view.id === "anomalies" && anomalies.length > 0 && (
                <span className="bg-rose-500 text-white text-[9px] rounded-full px-1 ml-1">{anomalies.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Mobile tabs - horizontal scroll */}
        <div className="flex lg:hidden gap-1 overflow-x-auto pb-1 max-w-[60vw]" style={{ scrollbarWidth: "none" }}>
          {VIEWS.map(view => (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-semibold transition-all whitespace-nowrap shrink-0 ${
                activeView === view.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {view.icon}
              <span className="hidden sm:inline">{view.label}</span>
              {view.id === "anomalies" && anomalies.length > 0 && (
                <span className="bg-rose-500 text-white text-[9px] rounded-full px-1">{anomalies.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={selectedEnterprise}
            onChange={e => setSelectedEnterprise(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-1.5 bg-white text-slate-600 focus:outline-none"
          >
            <option value="all">All Enterprises</option>
            {enterprises.map(e => <option key={e.id} value={e.id}>{e.enterprise_name}</option>)}
          </select>
          {anomalies.length > 0 && activeView !== "anomalies" && (
            <button onClick={() => setActiveView("anomalies")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500 text-white">
              ⚠️ {anomalies.length} Issues
            </button>
          )}
          <button onClick={handleRefresh} title="Refresh all data" className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-sm text-slate-400">Loading enterprise data…</p>
            <div className="flex gap-2 flex-wrap justify-center">
              {Object.entries(loadStates).map(([k, s]) => <LoadBadge key={k} type={k} state={s} />)}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          {activeView === "hierarchy" && (
            <HierarchyView enterprises={enterprises} people={people} services={services} products={products} tasks={tasks} transactions={transactions} addresses={addresses} relationships={relationships} selectedEnterprise={selectedEnterprise} />
          )}
          {activeView === "people" && (
            <PeopleDistributionView enterprises={enterprises} people={people} relationships={relationships} selectedEnterprise={selectedEnterprise} />
          )}
          {activeView === "services" && (
            <ServiceCoverageView enterprises={enterprises} services={services} people={people} tasks={tasks} selectedEnterprise={selectedEnterprise} />
          )}
          {activeView === "products" && (
            <ProductsView enterprises={enterprises} products={products} relationships={relationships} selectedEnterprise={selectedEnterprise} />
          )}
          {activeView === "addresses" && (
            <AddressesView enterprises={enterprises} addresses={addresses} relationships={relationships} selectedEnterprise={selectedEnterprise} />
          )}
          {activeView === "assignments" && (
            <AssignmentView enterprises={enterprises} people={people} relationships={relationships} tasks={tasks} addresses={addresses} selectedEnterprise={selectedEnterprise} />
          )}
          {activeView === "shared" && (
            <SharedResourcesView enterprises={enterprises} people={people} products={products} services={services} />
          )}
          {activeView === "anomalies" && (
            <AnomalyView anomalies={anomalyDetails} enterprises={enterprises} people={people} products={products} services={services} tasks={tasks} transactions={transactions} addresses={addresses} relationships={relationships} />
          )}
          {activeView === "graph" && (
            <>
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 shrink-0 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search nodes…" className="pl-7 pr-7 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none w-40" />
                {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-3 h-3" /></button>}
              </div>
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
                <span className="text-xs text-slate-500">Depth</span>
                <input type="range" min={1} max={3} value={depth} onChange={e => setDepth(Number(e.target.value))} className="w-16 accent-indigo-500" />
                <span className="text-xs font-bold text-indigo-600 w-3">{depth}</span>
              </div>
              <button onClick={() => { setFocusMode(v => !v); if (focusMode) setFocusedEnterprise(null); }} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all ${focusMode ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"}`}>
                <Target className="w-3.5 h-3.5" />{focusMode ? "Focus ON" : "Focus"}
              </button>
              <select value={colorBy} onChange={e => setColorBy(e.target.value)} className="text-xs border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-600 focus:outline-none">
                {COLOR_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="relative ml-auto">
                <button onClick={() => setShowExport(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all">
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
                {showExport && (
                  <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-lg z-50 min-w-44 py-1">
                    <button onClick={() => { exportAsPNG(); setShowExport(false); }} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Export as PNG</button>
                    <button onClick={() => { exportAsJSON(displayNodes, displayLinks); setShowExport(false); }} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Export as JSON</button>
                    <button onClick={() => { exportAsCSV(displayNodes); setShowExport(false); }} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Export as CSV</button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 flex-1 overflow-hidden p-4">
              <GraphFilterPanel filter={filter} setFilter={setFilter} collapsedTypes={collapsedTypes} setCollapsedTypes={setCollapsedTypes} counts={typeCounts} focusMode={focusMode} setFocusMode={setFocusMode} setFocusedEnterprise={setFocusedEnterprise} depth={depth} setDepth={setDepth} nodeCount={displayNodes.length} linkCount={displayLinks.length} />
              <div className="flex-1 min-h-0 overflow-hidden">
                {displayNodes.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center border border-slate-200 rounded-2xl bg-slate-50">
                    <div className="text-center">
                      <Network className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                      <p className="text-slate-400 font-medium">No data to display</p>
                    </div>
                  </div>
                ) : (
                  <Graph2D nodes={displayNodes} links={displayLinks} selected={selected} onSelect={(id) => { if (focusMode) { const n = displayNodes.find(x => x.id === id); if (n?.type === "enterprise") { setFocusedEnterprise(prev => prev === id ? null : id); return; } } setSelected(id); }} colorBy={colorBy} searchQuery={searchQuery} highlightPath={highlightPath} onClusterClick={handleClusterClick} />
                )}
              </div>
              <GraphSidePanel nodes={displayNodes} links={displayLinks} selected={selected} enterprises={enterprises} people={people} services={services} products={products} tasks={tasks} transactions={transactions} onHighlightPath={setHighlightPath} />
            </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}