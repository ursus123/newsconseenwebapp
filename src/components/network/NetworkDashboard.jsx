import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import CytoscapeNetworkGraph from "./CytoscapeNetworkGraph";
import { Globe, TrendingUp, TrendingDown, Users, Package,
         CheckCircle, AlertTriangle, BarChart2, MapPin,
         RefreshCw, ArrowUp, ArrowDown, Minus } from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

// ----------------------------------------------------------
// Health grade badge
// ----------------------------------------------------------
function HealthGrade({ grade, score }) {
  const config = {
    A: "bg-emerald-100 text-emerald-700 border-emerald-200",
    B: "bg-blue-100 text-blue-700 border-blue-200",
    C: "bg-amber-100 text-amber-700 border-amber-200",
    D: "bg-rose-100 text-rose-700 border-rose-200",
  }[grade] || "bg-slate-100 text-slate-600 border-slate-200";

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${config}`}>
      <span className="text-base leading-none">{grade}</span>
      {score !== undefined && (
        <span className="font-normal opacity-70">{score}</span>
      )}
    </div>
  );
}

// ----------------------------------------------------------
// Alert pill
// ----------------------------------------------------------
function AlertPill({ level, message }) {
  const config = {
    critical: "bg-rose-50 text-rose-700 border-rose-200",
    warning:  "bg-amber-50 text-amber-700 border-amber-200",
    info:     "bg-blue-50 text-blue-700 border-blue-200",
  }[level] || "bg-slate-50 text-slate-600";
  const emoji = { critical: "🔴", warning: "🟡", info: "🔵" }[level] || "⚪";

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${config}`}>
      <span className="shrink-0">{emoji}</span>
      <span>{message}</span>
    </div>
  );
}

// ----------------------------------------------------------
// Metric tile
// ----------------------------------------------------------
function MetricTile({ label, value, sub, icon: Icon, color = "slate" }) {
  const colors = {
    slate:   "text-slate-700",
    emerald: "text-emerald-600",
    rose:    "text-rose-600",
    amber:   "text-amber-600",
    blue:    "text-blue-600",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</span>
        {Icon && <Icon className={`w-4 h-4 ${colors[color]}`} />}
      </div>
      <p className={`text-2xl font-bold ${colors[color]}`}>
        {value ?? "—"}
      </p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// ----------------------------------------------------------
// Member row in the rankings table
// ----------------------------------------------------------
function MemberRow({ member, rank, showMetric }) {
  const signals = member.health_signals || [];
  const criticals = signals.filter(s => s.type === "critical");
  const warnings  = signals.filter(s => s.type === "warning");

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="py-3 px-4 text-sm font-medium text-slate-500 w-8">{rank}</td>
      <td className="py-3 px-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">{member.name}</p>
          {(criticals.length > 0 || warnings.length > 0) && (
            <div className="flex gap-1 mt-0.5">
              {criticals.map((s, i) => (
                <span key={i} className="text-[10px] text-rose-600">🔴 {s.message}</span>
              ))}
              {warnings.slice(0, 1).map((s, i) => (
                <span key={i} className="text-[10px] text-amber-600">🟡 {s.message}</span>
              ))}
            </div>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <HealthGrade grade={member.health_grade} score={member.health_score} />
      </td>
      <td className="py-3 px-4 text-sm text-slate-600 tabular-nums">
        {member.people_active?.toLocaleString() ?? "—"}
      </td>
      <td className="py-3 px-4">
        {member.task_completion != null ? (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden w-16">
              <div
                className={`h-full rounded-full ${
                  member.task_completion >= 80 ? "bg-emerald-500" :
                  member.task_completion >= 60 ? "bg-amber-400" : "bg-rose-500"
                }`}
                style={{ width: `${member.task_completion}%` }}
              />
            </div>
            <span className="text-xs text-slate-600 tabular-nums">
              {member.task_completion?.toFixed(0)}%
            </span>
          </div>
        ) : "—"}
      </td>
      <td className="py-3 px-4 text-sm text-slate-600 tabular-nums">
        {member.revenue_30d != null
          ? member.revenue_30d.toLocaleString(undefined, { maximumFractionDigits: 0 })
          : "—"}
      </td>
      <td className="py-3 px-4">
        {member.expiring_7d > 0 && (
          <span className="text-xs text-rose-600 font-medium">
            🔴 {member.expiring_7d} expiring
          </span>
        )}
        {member.low_stock > 0 && member.expiring_7d === 0 && (
          <span className="text-xs text-amber-600">
            🟡 {member.low_stock} low
          </span>
        )}
        {!member.expiring_7d && !member.low_stock && (
          <span className="text-xs text-emerald-600">✓ OK</span>
        )}
      </td>
    </tr>
  );
}

// ----------------------------------------------------------
// Main NetworkDashboard
// ----------------------------------------------------------
export default function NetworkDashboard({ networkId, currentUser }) {
  const [activeTab, setActiveTab] = useState("overview"); // overview | members | alerts | graph

  const nid = networkId || currentUser?.network_company_id;

  // Overview data
  const { data: overview, isLoading: ovLoading, refetch: refetchOv } = useQuery({
    queryKey: ["network-overview", nid],
    queryFn:  async () => {
      const r = await fetch(`${RAILWAY_URL}/network/overview?network_id=${nid}`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled:    !!nid,
    staleTime:  5 * 60 * 1000,
  });

  // Members with health scores (loaded for both members and graph tabs)
  const { data: membersData, isLoading: memLoading } = useQuery({
    queryKey: ["network-members", nid],
    queryFn:  async () => {
      const r = await fetch(`${RAILWAY_URL}/network/members?network_id=${nid}`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled:   !!nid && (activeTab === "members" || activeTab === "graph"),
    staleTime: 5 * 60 * 1000,
  });

  // Network alerts
  const { data: alertsData, isLoading: alLoading } = useQuery({
    queryKey: ["network-alerts", nid],
    queryFn:  async () => {
      const r = await fetch(`${RAILWAY_URL}/network/alerts?network_id=${nid}`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled:   !!nid && activeTab === "alerts",
    staleTime: 5 * 60 * 1000,
  });

  if (!nid) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No network ID configured. Set network_company_id in your profile or pass networkId prop.
      </div>
    );
  }

  const fin  = overview?.financials  || {};
  const ppl  = overview?.people      || {};
  const prod = overview?.products    || {};
  const tasks= overview?.tasks       || {};
  const networkAlerts = overview?.alerts || [];

  return (
    <div className="space-y-5 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-600" />
            Network Intelligence
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {overview?.member_count ?? "—"} member organisations ·
            {overview?.active_members ?? "—"} with live data
          </p>
        </div>
        <button
          onClick={() => refetchOv()}
          className="p-2 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${ovLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Network-level alerts */}
      {networkAlerts.length > 0 && (
        <div className="space-y-1.5">
          {networkAlerts.slice(0, 4).map((a, i) => (
            <AlertPill key={i} level={a.level} message={a.message} />
          ))}
        </div>
      )}

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile
          label="Total People"
          value={ppl.total_people?.toLocaleString()}
          sub={`${ppl.total_staff?.toLocaleString() ?? "—"} staff · ${ppl.total_clients?.toLocaleString() ?? "—"} clients`}
          icon={Users}
          color="blue"
        />
        <MetricTile
          label="Network Revenue (30d)"
          value={fin.total_revenue_30d != null
            ? fin.total_revenue_30d.toLocaleString(undefined, { maximumFractionDigits: 0 })
            : "—"}
          sub={`Net: ${fin.net_cashflow_30d != null
            ? fin.net_cashflow_30d.toLocaleString(undefined, { maximumFractionDigits: 0 })
            : "—"}`}
          icon={fin.net_cashflow_30d >= 0 ? TrendingUp : TrendingDown}
          color={fin.net_cashflow_30d >= 0 ? "emerald" : "rose"}
        />
        <MetricTile
          label="Task Completion"
          value={tasks.avg_completion_rate != null ? `${tasks.avg_completion_rate}%` : "—"}
          sub={`${tasks.overdue_tasks?.toLocaleString() ?? "—"} overdue`}
          icon={CheckCircle}
          color={tasks.avg_completion_rate >= 70 ? "emerald" : "amber"}
        />
        <MetricTile
          label="Stock Alerts"
          value={prod.expiring_7d_count + prod.out_of_stock_count || 0}
          sub={`${prod.low_stock_count ?? "—"} below reorder`}
          icon={Package}
          color={prod.expiring_7d_count > 0 || prod.out_of_stock_count > 0 ? "rose" : "emerald"}
        />
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { id: "overview", label: "Overview" },
          { id: "members",  label: `Members (${overview?.member_count ?? "—"})` },
          { id: "alerts",   label: `Alerts ${overview?.critical_count > 0 ? `(${overview.critical_count})` : ""}` },
          { id: "graph",    label: "Graph" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* People breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-500" /> People
            </h3>
            <div className="space-y-2">
              {[
                { label: "Total people",    value: ppl.total_people },
                { label: "Active",          value: ppl.active_people },
                { label: "Staff",           value: ppl.total_staff },
                { label: "Clients",         value: ppl.total_clients },
                { label: "New this week",   value: ppl.new_last_7d },
                { label: "Avg retention",   value: ppl.avg_retention != null ? `${ppl.avg_retention}%` : null },
                { label: "Lowest retention",value: ppl.min_retention != null ? `${ppl.min_retention}%` : null,
                  alert: ppl.min_retention < 70 },
              ].map(({ label, value, alert }) => (
                <div key={label} className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">{label}</span>
                  <span className={`font-semibold ${alert ? "text-rose-600" : "text-slate-700"}`}>
                    {value?.toLocaleString?.() ?? value ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Financial breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-500" /> Financials (30 days)
            </h3>
            <div className="space-y-2">
              {[
                { label: "Total revenue",  value: fin.total_revenue_30d,  positive: true },
                { label: "Total expenses", value: fin.total_expenses_30d },
                { label: "Net cash flow",  value: fin.net_cashflow_30d, alert: fin.net_cashflow_30d < 0 },
                { label: "Revenue (7d)",   value: fin.revenue_last_7d },
                { label: "Transactions",   value: fin.total_transactions },
                { label: "Outstanding",    value: fin.outstanding_amount },
              ].map(({ label, value, alert }) => (
                <div key={label} className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">{label}</span>
                  <span className={`font-semibold ${alert ? "text-rose-600" : "text-slate-700"}`}>
                    {value != null
                      ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "members" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {memLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading member data...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">#</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Member</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Health</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Active People</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Completion</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Revenue (30d)</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {(membersData?.members || []).map((member, i) => (
                    <MemberRow key={member.company_id} member={member} rank={i + 1} />
                  ))}
                  {!membersData?.members?.length && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                        No member data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "graph" && (
        memLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading member data...
          </div>
        ) : (
          <CytoscapeNetworkGraph members={membersData?.members || []} networkId={nid} />
        )
      )}

      {activeTab === "alerts" && (
        <div className="space-y-2">
          {alLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading network alerts...
            </div>
          ) : (
            <>
              {[
                ...(alertsData?.critical || []),
                ...(alertsData?.warning  || []),
                ...(alertsData?.info     || []),
              ].map((alert, i) => (
                <div
                  key={i}
                  className={`border rounded-xl p-3.5 ${
                    alert.severity === "critical" || alert.level === "critical"
                      ? "bg-rose-50 border-rose-200"
                      : alert.severity === "warning" || alert.level === "warning"
                      ? "bg-amber-50 border-amber-200"
                      : "bg-blue-50 border-blue-200"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm shrink-0">
                      {alert.severity === "critical" || alert.level === "critical" ? "🔴" :
                       alert.severity === "warning"  || alert.level === "warning"  ? "🟡" : "🔵"}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">{alert.title || alert.message}</p>
                      {alert.title && alert.message && (
                        <p className="text-xs text-slate-500 mt-0.5">{alert.message}</p>
                      )}
                      {alert.member_name && (
                        <p className="text-xs text-slate-400 mt-1">📍 {alert.member_name}{alert.enterprise_name ? ` · ${alert.enterprise_name}` : ""}</p>
                      )}
                      {alert.suggested_action && (
                        <p className="text-xs font-medium mt-1.5 text-slate-600">
                          💡 {alert.suggested_action}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!alertsData?.alert_count && (
                <div className="flex items-center justify-center gap-2 py-10 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-2xl">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">All clear — no active alerts across the network</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
