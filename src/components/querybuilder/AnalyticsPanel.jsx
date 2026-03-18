import React, { useState, useEffect, useCallback } from "react";
import { Database, Globe, RefreshCw, Table2, ChevronDown, ChevronRight } from "lucide-react";
import { ANALYTICS_TABLES, EXTERNAL_TABLES, fetchAllAnalytics } from "./sqlEngine";

function timeAgo(ts) {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function SectionHeader({ label, color, icon: Icon, onRefresh, refreshing, lastSynced }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-2 border-b border-white/5`}>
      <Icon className={`w-3 h-3 ${color}`} />
      <span className={`text-[9px] font-bold uppercase tracking-widest ${color} flex-1`}>{label}</span>
      {onRefresh && (
        <button onClick={onRefresh} disabled={refreshing}
          className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
          title="Refresh">
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      )}
    </div>
  );
}

function AnalyticsTableItem({ name, schema, isActive, onSelect, onQueryClick }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs select-none
          ${isActive ? "bg-blue-500/15 text-blue-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
        onClick={() => { setOpen((v) => !v); onSelect(name); }}
      >
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        <Table2 className="w-3 h-3 shrink-0 text-blue-500" />
        <span className="font-mono truncate flex-1 text-[11px]">{name}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onQueryClick(name); }}
          className="opacity-0 group-hover:opacity-100 text-[9px] text-blue-400 font-bold px-1 rounded transition-opacity"
        >▶</button>
      </div>
      {open && schema.length > 0 && (
        <div className="ml-4 mt-0.5 border-l border-white/5 pl-2 space-y-0.5">
          {schema.map(({ col, type }) => (
            <div key={col} className="flex items-center gap-2 px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded cursor-default">
              <span className="font-mono flex-1 truncate">{col}</span>
              <span className="font-mono text-[9px] text-blue-600">{type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExternalTableItem({ name, cfg, isActive, onSelect, onQueryClick }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs select-none
          ${isActive ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
        onClick={() => { setOpen((v) => !v); onSelect(name); }}
      >
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        <Globe className="w-3 h-3 shrink-0 text-emerald-500" />
        <span className="font-mono truncate flex-1 text-[11px]">{name}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onQueryClick(name); }}
          className="opacity-0 group-hover:opacity-100 text-[9px] text-emerald-400 font-bold px-1 rounded transition-opacity"
        >▶</button>
      </div>
      {open && cfg.columns.length > 0 && (
        <div className="ml-4 mt-0.5 border-l border-white/5 pl-2 space-y-0.5">
          {cfg.columns.map(({ col, type }) => (
            <div key={col} className="flex items-center gap-2 px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded cursor-default">
              <span className="font-mono flex-1 truncate">{col}</span>
              <span className="font-mono text-[9px] text-emerald-600">{type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPanel({ activeTable, onSelect, onQueryClick }) {
  const [refreshing, setRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAllAnalytics();
    setLastSynced(Date.now());
    setRefreshing(false);
  }, []);

  useEffect(() => { doRefresh(); }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Analytics DB section */}
      <SectionHeader
        label="Analytics DB"
        color="text-blue-400"
        icon={Database}
        onRefresh={doRefresh}
        refreshing={refreshing}
        lastSynced={lastSynced}
      />
      {lastSynced && (
        <p className="px-3 py-1 text-[9px] text-slate-600 font-mono">
          Last synced: {timeAgo(lastSynced)}
        </p>
      )}
      <div className="px-2 py-1 space-y-0.5">
        {Object.entries(ANALYTICS_TABLES).map(([name, cfg]) => (
          <AnalyticsTableItem
            key={name}
            name={name}
            schema={cfg.columns}
            isActive={activeTable === name}
            onSelect={onSelect}
            onQueryClick={onQueryClick}
          />
        ))}
      </div>

      {/* External APIs section */}
      <SectionHeader
        label="External APIs"
        color="text-emerald-400"
        icon={Globe}
      />
      <div className="px-2 py-1 space-y-0.5">
        {Object.entries(EXTERNAL_TABLES).map(([name, cfg]) => (
          <ExternalTableItem
            key={name}
            name={name}
            cfg={cfg}
            isActive={activeTable === name}
            onSelect={onSelect}
            onQueryClick={onQueryClick}
          />
        ))}
      </div>
    </div>
  );
}