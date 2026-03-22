import React, { useState } from "react";
import { Info, ChevronDown, ChevronRight, ExternalLink, AlertTriangle } from "lucide-react";
import { NODE_CONFIG, LINK_COLORS, computeEnterpriseHealth, computeGraphAnalytics, findShortestPath } from "./graphConfig";
import { Link } from "react-router-dom";

function Badge({ children, color }) {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide" style={{ backgroundColor: color + "22", color }}>
      {children}
    </span>
  );
}

function ProgressBar({ value, max, color }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function DetailRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-1 text-[11px]">
      <span className="text-slate-400 w-20 shrink-0">{label}</span>
      <span className="text-slate-700 font-medium flex-1 break-words">{value}</span>
    </div>
  );
}

function EnterpriseDetail({ node, nodes, links }) {
  const health = computeEnterpriseHealth(node.raw);
  const healthColor = health >= 80 ? "#16a34a" : health >= 50 ? "#f59e0b" : "#dc2626";
  const connectedLinks = links.filter(l => l.source === node.id || l.target === node.id);
  const connectedNodes = connectedLinks.map(l => nodes.find(n => n.id === (l.source === node.id ? l.target : l.source))).filter(Boolean);
  const people = connectedNodes.filter(n => n.type === "person").slice(0, 5);
  const taskCount = connectedNodes.filter(n => n.type === "task").length;
  const txnCount = connectedNodes.filter(n => n.type === "transaction").length;
  const productCount = connectedNodes.filter(n => n.type === "product").length;
  return (
    <div className="space-y-2.5">
      <div>
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-slate-500">Health Score</span>
          <span className="font-bold" style={{ color: healthColor }}>{health}/100</span>
        </div>
        <ProgressBar value={health} max={100} color={healthColor} />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[["People", people.length, "#0ea5e9"], ["Tasks", taskCount, "#f97316"], ["Txns", txnCount, "#dc2626"]].map(([l, v, c]) => (
          <div key={l} className="bg-slate-50 rounded-lg p-1.5 text-center">
            <p className="text-sm font-bold" style={{ color: c }}>{v}</p>
            <p className="text-[9px] text-slate-400">{l}</p>
          </div>
        ))}
      </div>
      {people.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Connected People</p>
          {people.map(p => <p key={p.id} className="text-[11px] text-slate-600">👤 {p.label}</p>)}
        </div>
      )}
      <DetailRow label="Type" value={node.raw.enterprise_type?.replace(/_/g, " ")} />
      <DetailRow label="Status" value={node.raw.status} />
      <DetailRow label="City" value={[node.raw.city, node.raw.country].filter(Boolean).join(", ")} />
      <DetailRow label="Operating" value={node.raw.operating_status} />
      <Link to="/Enterprises" className="flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-700 font-medium mt-1">
        Open in Enterprises <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  );
}

function PersonDetail({ node, nodes, links }) {
  const connLinks = links.filter(l => l.source === node.id || l.target === node.id);
  const connNodes = connLinks.map(l => nodes.find(n => n.id === (l.source === node.id ? l.target : l.source))).filter(Boolean);
  const enterprises = connNodes.filter(n => n.type === "enterprise");
  const tasks = connNodes.filter(n => n.type === "task");
  const overdue = tasks.filter(n => n.raw?.due_date && new Date(n.raw.due_date) < new Date() && n.raw?.status !== "completed");
  const avail = node.raw?.availability_status;
  const availColor = avail === "available" ? "#16a34a" : avail === "busy" ? "#f59e0b" : "#dc2626";
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Badge color={availColor}>{avail || "unknown"}</Badge>
        {node.raw.person_type && <Badge color="#6366f1">{node.raw.person_type}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {[["Tasks", tasks.length, "#f97316"], ["Overdue", overdue.length, "#dc2626"]].map(([l, v, c]) => (
          <div key={l} className="bg-slate-50 rounded-lg p-1.5 text-center">
            <p className="text-sm font-bold" style={{ color: c }}>{v}</p>
            <p className="text-[9px] text-slate-400">{l}</p>
          </div>
        ))}
      </div>
      {enterprises.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Enterprises</p>
          {enterprises.map(e => <p key={e.id} className="text-[11px] text-slate-600">🏢 {e.label}</p>)}
        </div>
      )}
      <DetailRow label="Role" value={node.raw.primary_role} />
      <DetailRow label="Engagement" value={node.raw.engagement_type?.replace(/_/g, " ")} />
      <DetailRow label="Email" value={node.raw.email} />
      <DetailRow label="Phone" value={node.raw.phone} />
      <Link to="/People" className="flex items-center gap-1 text-[11px] text-sky-500 hover:text-sky-700 font-medium mt-1">
        Open in People <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  );
}

function ProductDetail({ node }) {
  const qty = node.raw?.stock_quantity ?? 0;
  const min = node.raw?.min_stock_level ?? 0;
  const isLow = qty < min;
  const expiry = node.raw?.expiry_date;
  const daysToExpiry = expiry ? Math.round((new Date(expiry) - new Date()) / 86400000) : null;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {node.raw.item_type && <Badge color="#f59e0b">{node.raw.item_type.replace(/_/g, " ")}</Badge>}
        {isLow && <Badge color="#dc2626">⚠ Low Stock</Badge>}
      </div>
      <div>
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-slate-500">Stock Level</span>
          <span className="font-bold" style={{ color: isLow ? "#dc2626" : "#16a34a" }}>{qty} / {min} min</span>
        </div>
        <ProgressBar value={qty} max={Math.max(min * 2, qty, 1)} color={isLow ? "#dc2626" : "#16a34a"} />
      </div>
      {expiry && (
        <div className="flex items-center gap-1.5 text-[11px]">
          {daysToExpiry !== null && daysToExpiry < 30 && <AlertTriangle className="w-3 h-3 text-amber-500" />}
          <span className="text-slate-500">Expires:</span>
          <span className="font-medium" style={{ color: daysToExpiry !== null && daysToExpiry < 30 ? "#f59e0b" : "#374151" }}>
            {expiry} {daysToExpiry !== null ? `(${daysToExpiry}d)` : ""}
          </span>
        </div>
      )}
      <DetailRow label="SKU" value={node.raw.sku} />
      <DetailRow label="Category" value={node.raw.category?.replace(/_/g, " ")} />
      <DetailRow label="Unit Price" value={node.raw.unit_price != null ? `$${node.raw.unit_price}` : null} />
      <DetailRow label="Supplier" value={node.raw.supplier} />
      {node.raw.item_type === "medication" && <DetailRow label="Dosage" value={node.raw.dosage_instructions} />}
      <Link to="/Products" className="flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-800 font-medium mt-1">
        Open in Products <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  );
}

function TaskDetail({ node }) {
  const isOverdue = node.raw?.due_date && new Date(node.raw.due_date) < new Date() && node.raw?.status !== "completed";
  const statusColors = { open: "#3b82f6", in_progress: "#f97316", completed: "#16a34a", cancelled: "#6b7280" };
  const priorityColors = { urgent: "#dc2626", high: "#f97316", normal: "#6366f1", low: "#6b7280" };
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge color={statusColors[node.raw?.status] || "#6b7280"}>{node.raw?.status || "unknown"}</Badge>
        <Badge color={priorityColors[node.raw?.priority] || "#6b7280"}>{node.raw?.priority || "normal"}</Badge>
        {isOverdue && <Badge color="#dc2626">OVERDUE</Badge>}
      </div>
      <DetailRow label="Type" value={node.raw?.task_type?.replace(/_/g, " ")} />
      <DetailRow label="Enterprise" value={node.raw?.enterprise} />
      <DetailRow label="Assigned to" value={node.raw?.assigned_to_name} />
      <DetailRow label="Due date" value={node.raw?.due_date} />
      <DetailRow label="Outcome" value={node.raw?.outcome} />
      <Link to="/Tasks" className="flex items-center gap-1 text-[11px] text-orange-500 hover:text-orange-700 font-medium mt-1">
        Open in Tasks <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  );
}

function TransactionDetail({ node }) {
  const payColors = { paid: "#16a34a", unpaid: "#dc2626", partial: "#f59e0b", na: "#6b7280" };
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge color="#dc2626">{node.raw?.transaction_type?.replace(/_/g, " ")}</Badge>
        {node.raw?.payment_status && <Badge color={payColors[node.raw.payment_status] || "#6b7280"}>{node.raw.payment_status}</Badge>}
      </div>
      <DetailRow label="Amount" value={node.raw?.amount != null ? `$${node.raw.amount.toLocaleString()}` : null} />
      <DetailRow label="Date" value={node.raw?.date} />
      <DetailRow label="Enterprise" value={node.raw?.enterprise} />
      <DetailRow label="Person" value={node.raw?.primary_person} />
      <DetailRow label="Method" value={node.raw?.payment_method} />
      <Link to="/Transactions" className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 font-medium mt-1">
        Open in Transactions <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  );
}

function GraphAnalyticsPanel({ nodes, links }) {
  const [open, setOpen] = useState(false);
  const { isolated, mostConnected, density, degreeMap } = computeGraphAnalytics(nodes, links);
  const enterprises = nodes.filter(n => n.type === "enterprise");
  const isolatedPeople = isolated.filter(n => n.type === "person");
  const isolatedProducts = isolated.filter(n => n.type === "product");

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Graph Analytics</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100">
          {mostConnected && (
            <div>
              <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">Most Connected</p>
              <p className="text-xs font-semibold text-slate-700">{mostConnected.label}</p>
              <p className="text-[10px] text-slate-400">{degreeMap[mostConnected.id]} connections</p>
            </div>
          )}
          <div>
            <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">Network Density</p>
            <p className="text-xs font-semibold text-slate-700">{density}%</p>
            <p className="text-[10px] text-slate-400">of possible connections</p>
          </div>
          {isolated.length > 0 && (
            <div>
              <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">Isolated Nodes</p>
              {isolatedPeople.length > 0 && <p className="text-[10px] text-amber-600">⚠ {isolatedPeople.length} people with no connections</p>}
              {isolatedProducts.length > 0 && <p className="text-[10px] text-amber-600">⚠ {isolatedProducts.length} products with no connections</p>}
              {isolated.filter(n => n.type !== "person" && n.type !== "product").length > 0 && (
                <p className="text-[10px] text-slate-400">{isolated.filter(n => n.type !== "person" && n.type !== "product").length} other isolated nodes</p>
              )}
            </div>
          )}
          <div>
            <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">Total Nodes / Links</p>
            <p className="text-xs font-semibold text-slate-700">{nodes.length} nodes · {links.length} links</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PathFinder({ nodes, links, allNodes: allNodesRaw, allLinks: allLinksRaw, onHighlightPath }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [path, setPath] = useState(null);
  const [noPath, setNoPath] = useState(false);

  // Use full unfiltered graph for path finding so hidden intermediary nodes (e.g. shared staff) are traversable
  const searchNodes = allNodesRaw && allNodesRaw.length > 0 ? allNodesRaw : nodes;
  const searchLinks = allLinksRaw && allLinksRaw.length > 0 ? allLinksRaw : links;

  const findPath = () => {
    if (!from || !to) return;
    const result = findShortestPath(searchNodes, searchLinks, from, to);
    if (result) {
      setPath(result);
      setNoPath(false);
      onHighlightPath(result);
    } else {
      setPath(null);
      setNoPath(true);
      onHighlightPath(null);
    }
  };

  // Dropdowns show enterprise nodes only (most common use case), but path traverses all node types
  const allNodes = [...nodes].filter(n => n.type === "enterprise").sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Find Path Between</p>
      <select className="w-full text-xs border border-slate-200 rounded-lg p-1.5 text-slate-700" value={from} onChange={e => { setFrom(e.target.value); setPath(null); }}>
        <option value="">From node…</option>
        {allNodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
      </select>
      <select className="w-full text-xs border border-slate-200 rounded-lg p-1.5 text-slate-700" value={to} onChange={e => { setTo(e.target.value); setPath(null); }}>
        <option value="">To node…</option>
        {allNodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
      </select>
      <button
        onClick={findPath}
        disabled={!from || !to || from === to}
        className="w-full py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Find Path
      </button>
      {noPath && <p className="text-[10px] text-rose-500">No path found between these nodes.</p>}
      {path && (
        <div>
          <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">Path ({path.length - 1} hop{path.length !== 2 ? "s" : ""})</p>
          <div className="flex flex-wrap gap-0.5 items-center text-[10px] text-slate-600">
            {path.map((id, i) => {
              const n = searchNodes.find(x => x.id === id);
              return (
                <React.Fragment key={id}>
                  <span className="bg-slate-100 px-1 rounded font-mono">{NODE_CONFIG[n?.type]?.icon} {n?.label || id}</span>
                  {i < path.length - 1 && <span className="text-slate-400">→</span>}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GraphSidePanel({ nodes, links, allNodes, allLinks, selected, enterprises, people, services, products, tasks, transactions, onHighlightPath }) {
  const selectedNode = selected ? nodes.find((n) => n.id === selected) : null;
  const connectedLinks = selected ? links.filter((l) => l.source === selected || l.target === selected) : [];

  const typeCounts = {
    Enterprise: enterprises?.length || 0,
    People: people?.length || 0,
    Services: services?.length || 0,
    Products: products?.length || 0,
    Tasks: tasks?.length || 0,
    Transactions: transactions?.filter(t => t.status === "posted").length || 0,
  };

  return (
    <div className="w-64 shrink-0 flex flex-col overflow-hidden border border-slate-200 rounded-2xl bg-white min-h-0">
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* Stats */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Graph Stats</p>
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(typeCounts).map(([label, value]) => {
            const type = label.toLowerCase().replace("people", "person").replace("services", "service").replace("products", "product").replace("tasks", "task").replace("transactions", "transaction").replace("enterprises", "enterprise");
            const cfg = NODE_CONFIG[type] || {};
            return (
              <div key={label} className="bg-slate-50 rounded-xl px-2 py-1.5 text-center">
                <p className="text-sm font-bold" style={{ color: cfg.hex || "#6b7280" }}>{value}</p>
                <p className="text-[9px] text-slate-400">{label}</p>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
          <span>Visible nodes: <span className="font-semibold text-slate-600">{nodes.length}</span></span>
          <span>Links: <span className="font-semibold text-slate-600">{links.length}</span></span>
        </div>
      </div>

      {/* Selected node detail */}
      {selectedNode ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100" style={{ backgroundColor: NODE_CONFIG[selectedNode.type]?.bg || "#f8fafc" }}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{NODE_CONFIG[selectedNode.type]?.icon}</span>
              <div>
                <p className="font-bold text-sm" style={{ color: NODE_CONFIG[selectedNode.type]?.hex }}>{selectedNode.label}</p>
                <p className="text-[11px] text-slate-400 capitalize">{selectedNode.type}</p>
              </div>
            </div>
          </div>
          <div className="px-4 py-3">
            {selectedNode.type === "enterprise"   && <EnterpriseDetail   node={selectedNode} nodes={nodes} links={connectedLinks} />}
            {selectedNode.type === "person"       && <PersonDetail       node={selectedNode} nodes={nodes} links={connectedLinks} />}
            {selectedNode.type === "product"      && <ProductDetail      node={selectedNode} />}
            {selectedNode.type === "task"         && <TaskDetail         node={selectedNode} />}
            {selectedNode.type === "transaction"  && <TransactionDetail  node={selectedNode} />}
            {selectedNode.type === "service" && (
              <div className="space-y-2">
                <DetailRow label="Category" value={selectedNode.raw?.category?.replace(/_/g, " ")} />
                <DetailRow label="Pricing" value={selectedNode.raw?.pricing_model?.replace(/_/g, " ")} />
                <DetailRow label="Price" value={selectedNode.raw?.price != null ? `$${selectedNode.raw.price}` : null} />
                <DetailRow label="Status" value={selectedNode.raw?.status} />
              </div>
            )}
            {selectedNode.type === "address" && (
              <div className="space-y-2">
                <DetailRow label="Line 1" value={selectedNode.raw?.address_line1} />
                <DetailRow label="City" value={selectedNode.raw?.city} />
                <DetailRow label="Country" value={selectedNode.raw?.country} />
                <DetailRow label="Postcode" value={selectedNode.raw?.postal_code} />
              </div>
            )}
          </div>
          {connectedLinks.length > 0 && (
            <div className="px-4 pb-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Connections ({connectedLinks.length})</p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {connectedLinks.map((l, i) => {
                  const otherId = l.source === selectedNode.id ? l.target : l.source;
                  const other = nodes.find((n) => n.id === otherId);
                  return (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <span className="text-slate-400">{l.source === selectedNode.id ? "→" : "←"}</span>
                      <span>{NODE_CONFIG[other?.type]?.icon}</span>
                      <span className="font-medium truncate flex-1">{other?.label}</span>
                      <span className="text-[9px] text-slate-300 shrink-0">{l.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
          <Info className="w-7 h-7 text-slate-200 mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">Click any node to inspect</p>
        </div>
      )}

      {/* Path finder */}
      <PathFinder nodes={nodes} links={links} allNodes={allNodes} allLinks={allLinks} onHighlightPath={onHighlightPath} />

      {/* Graph analytics */}
      <GraphAnalyticsPanel nodes={nodes} links={links} />

      {/* Legend */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Node Types</p>
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(NODE_CONFIG).map(([type, cfg]) => (
            <div key={type} className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.hex }} />
              <span>{cfg.icon}</span> <span className="truncate">{cfg.label}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 mt-2 pt-2 space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Edge Types</p>
          {[
            { label: "Employment", color: "#6366f1", style: "solid" },
            { label: "Service", color: "#10b981", style: "solid" },
            { label: "Ownership", color: "#f59e0b", style: "solid" },
            { label: "Task link", color: "#f97316", style: "dashed" },
            { label: "Financial", color: "#16a34a", style: "solid" },
            { label: "Location", color: "#8b5cf6", style: "dotted" },
          ].map(({ label, color, style }) => (
            <div key={label} className="flex items-center gap-2 text-[11px] text-slate-600">
              <svg width="20" height="4" className="shrink-0">
                <line x1="0" y1="2" x2="20" y2="2" stroke={color} strokeWidth="2"
                  strokeDasharray={style === "dashed" ? "4,3" : style === "dotted" ? "2,2" : "none"} />
              </svg>
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
}