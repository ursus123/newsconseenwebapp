import React, { useState, useEffect, useCallback } from "react";
import { Database, Globe, RefreshCw, Table2, ChevronDown, ChevronRight, Info } from "lucide-react";
import { ANALYTICS_TABLES, EXTERNAL_TABLES, fetchAllAnalytics } from "./sqlEngine";
import { OPEN_DATA_TABLES, OPEN_DATA_PROVIDERS, pingApiStatus } from "./openDataAPIs";

function timeAgo(ts) {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function SectionHeader({ label, color, icon: Icon, onRefresh, refreshing }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-2 border-b border-white/5">
      <Icon className={`w-3 h-3 ${color}`} />
      <span className={`text-[9px] font-bold uppercase tracking-widest ${color} flex-1`}>{label}</span>
      {onRefresh && (
        <button onClick={onRefresh} disabled={refreshing}
          className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors" title="Refresh">
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
        <button onClick={(e) => { e.stopPropagation(); onQueryClick(name); }}
          className="opacity-0 group-hover:opacity-100 text-[9px] text-blue-400 font-bold px-1 rounded transition-opacity">▶</button>
      </div>
      {open && schema.length > 0 && (
        <div className="ml-4 mt-0.5 border-l border-white/5 pl-2 space-y-0.5">
          {schema.map(({ col, type }) => (
            <div key={col} className="flex items-center gap-2 px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300 rounded cursor-default">
              <span className="font-mono flex-1 truncate">{col}</span>
              <span className="font-mono text-[9px] text-blue-600">{type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }) {
  if (status === null) return <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" title="Checking…" />;
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status ? "bg-emerald-400" : "bg-rose-500"}`} title={status ? "Reachable" : "Unreachable"} />;
}

function OpenDataTableItem({ name, cfg, isActive, onSelect, onQueryClick, apiStatus }) {
  const [open, setOpen] = useState(false);
  const [showTip, setShowTip] = useState(false);

  const exampleSql = {
    osm_places:              "SELECT * FROM osm_places WHERE query = 'hospital' AND city = 'Bangor'",
    osm_nearby:              "SELECT * FROM osm_nearby WHERE lat = 44.8 AND lon = -68.7 AND type = 'pharmacy' AND radius_km = 5",
    weather_current:         "SELECT * FROM weather_current WHERE city = 'Bangor'",
    weather_forecast:        "SELECT * FROM weather_forecast WHERE city = 'Kigali' AND days = 7",
    medications_api:         "SELECT * FROM medications_api WHERE name = 'metformin'",
    medications_recalls:     "SELECT * FROM medications_recalls WHERE name = 'metformin'",
    medications_interactions:"SELECT * FROM medications_interactions WHERE drug1 = 'metformin' AND drug2 = 'ibuprofen'",
    medications_label:       "SELECT * FROM medications_label WHERE name = 'metformin'",
    fda_devices:             "SELECT * FROM fda_devices WHERE product = 'wheelchair'",
    fda_food_recalls:        "SELECT * FROM fda_food_recalls WHERE product = 'peanut butter'",
    worldbank_indicators:    "SELECT * FROM worldbank_indicators WHERE country = 'RW' AND indicator = 'SP.POP.TOTL'",
    exchange_rates:          "SELECT * FROM exchange_rates WHERE base = 'USD'",
    countries:               "SELECT * FROM countries WHERE region = 'Africa'",
  }[name];

  return (
    <div className="relative">
      <div
        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs select-none
          ${isActive ? "bg-orange-500/15 text-orange-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
        onClick={() => { setOpen((v) => !v); onSelect(name); }}
      >
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        <span className="text-sm leading-none shrink-0">{cfg.icon}</span>
        <span className="font-mono truncate flex-1 text-[11px]">{name}</span>
        <StatusDot status={apiStatus} />
        {exampleSql && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowTip((v) => !v); }}
            className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white transition-opacity"
            title="Show example"
          >
            <Info className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onQueryClick(name); }}
          className="opacity-0 group-hover:opacity-100 text-[9px] text-orange-400 font-bold px-1 rounded transition-opacity"
        >▶</button>
      </div>
      {showTip && exampleSql && (
        <div className="mx-2 mb-1 p-2 bg-slate-700 rounded-lg border border-white/10">
          <p className="text-[9px] text-slate-400 mb-1">{cfg.label} · {cfg.provider}</p>
          <pre className="text-[9px] font-mono text-emerald-300 whitespace-pre-wrap leading-3">{exampleSql}</pre>
          <button
            onClick={() => { onQueryClick(name, exampleSql); setShowTip(false); }}
            className="mt-1 text-[9px] text-orange-400 hover:text-orange-300"
          >load example →</button>
        </div>
      )}
      {open && cfg.columns.length > 0 && (
        <div className="ml-4 mt-0.5 border-l border-white/5 pl-2 space-y-0.5">
          {cfg.columns.map((col) => (
            <div key={col} className="flex items-center gap-2 px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300 rounded cursor-default">
              <span className="font-mono flex-1 truncate">{col}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OpenDataProviderGroup({ provider, activeTable, onSelect, onQueryClick, apiStatuses }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[9px] font-bold text-orange-400 uppercase tracking-widest hover:text-orange-300 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="flex-1 text-left">{provider.label}</span>
      </button>
      {open && provider.tables.map((name) => {
        const cfg = OPEN_DATA_TABLES[name];
        if (!cfg) return null;
        return (
          <div key={name} className="ml-1">
            <OpenDataTableItem
              name={name}
              cfg={cfg}
              isActive={activeTable === name}
              onSelect={onSelect}
              onQueryClick={(n, customSql) => onQueryClick(n, customSql)}
              apiStatus={apiStatuses[cfg.pingUrl] ?? null}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsPanel({ activeTable, onSelect, onQueryClick }) {
  const [refreshing, setRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [apiStatuses, setApiStatuses] = useState({});

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAllAnalytics();
    setLastSynced(Date.now());
    setRefreshing(false);
  }, []);

  // Ping all unique API base URLs
  useEffect(() => {
    const uniqueUrls = [...new Set(Object.values(OPEN_DATA_TABLES).map((t) => t.pingUrl))];
    uniqueUrls.forEach(async (url) => {
      // Use no-cors HEAD — if it throws it's unreachable, otherwise assume reachable
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        await fetch(url, { method: "HEAD", signal: ctrl.signal, mode: "no-cors" });
        clearTimeout(timer);
        setApiStatuses((prev) => ({ ...prev, [url]: true }));
      } catch {
        setApiStatuses((prev) => ({ ...prev, [url]: false }));
      }
    });
  }, []);

  useEffect(() => { doRefresh(); }, []);

  const handleQueryClick = (name, customSql) => {
    if (customSql) {
      onQueryClick(name, customSql);
    } else {
      onQueryClick(name);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Analytics DB */}
      <SectionHeader label="Analytics DB" color="text-blue-400" icon={Database} onRefresh={doRefresh} refreshing={refreshing} />
      {lastSynced && <p className="px-3 py-1 text-[9px] text-slate-600 font-mono">Last synced: {timeAgo(lastSynced)}</p>}
      <div className="px-2 py-1 space-y-0.5">
        {Object.entries(ANALYTICS_TABLES).map(([name, cfg]) => (
          <AnalyticsTableItem key={name} name={name} schema={cfg.columns}
            isActive={activeTable === name} onSelect={onSelect} onQueryClick={onQueryClick} />
        ))}
      </div>

      {/* Open Data APIs */}
      <SectionHeader label="Open Data APIs" color="text-orange-400" icon={Globe} />
      <div className="px-1 py-1">
        {OPEN_DATA_PROVIDERS.map((provider) => (
          <OpenDataProviderGroup
            key={provider.key}
            provider={provider}
            activeTable={activeTable}
            onSelect={onSelect}
            onQueryClick={handleQueryClick}
            apiStatuses={apiStatuses}
          />
        ))}
      </div>
    </div>
  );
}