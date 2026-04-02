import React, { useState, useEffect } from "react";
import {
  Upload, Globe, Code2, ChevronDown, ChevronRight,
  Zap, Plus, CheckCircle, Trash2, MapPin,
  TrendingUp, Briefcase, Newspaper, Leaf, Database, Sparkles,
} from "lucide-react";
import UploadPanel from "./UploadPanel";
import NotebookModal from "./NotebookModal";
import { NotebookStore } from "./NotebookStore";

const ANALYTICS_TABLES_LIST = [
  { table: "analytics_people",        label: "People Summary",       desc: "Headcount by type/status — aggregated",        sample: "SELECT person_type, status, people_count, active_count\nFROM analytics_people\nORDER BY people_count DESC" },
  { table: "analytics_tasks",         label: "Task Summary",         desc: "Completion rates, overdue tasks — aggregated",  sample: "SELECT task_type, total_tasks, completed_tasks, completion_rate_pct, overdue_tasks\nFROM analytics_tasks\nORDER BY total_tasks DESC" },
  { table: "analytics_transactions",  label: "Transaction Summary",  desc: "Revenue, outstanding amounts — aggregated",     sample: "SELECT transaction_type, total_amount, outstanding_amount, revenue_last_30d\nFROM analytics_transactions\nWHERE is_revenue = true\nORDER BY total_amount DESC" },
  { table: "analytics_products",      label: "Product Summary",      desc: "Stock levels, expiry alerts — aggregated",      sample: "SELECT item_type, total_products, total_stock, low_stock_count, out_of_stock_count\nFROM analytics_products\nORDER BY total_products DESC" },
  { table: "analytics_enterprises",   label: "Enterprise Summary",   desc: "Branch structure, operating status — aggregated",sample: "SELECT name, enterprise_type, operating_status, is_active\nFROM analytics_enterprises\nORDER BY name" },
  { table: "analytics_services",      label: "Services Summary",     desc: "Service count, billable value — aggregated",    sample: "SELECT service_type, service_count, total_billable_value, avg_rate\nFROM analytics_services\nORDER BY service_count DESC" },
  { table: "analytics_relationships", label: "Relationships Summary",desc: "Active relationships by type — aggregated",     sample: "SELECT relationship_type, relationship_category, status, duration_days\nFROM analytics_relationships\nORDER BY duration_days DESC" },
  { table: "analytics_addresses",     label: "Address Summary",      desc: "Address types and geocoding status",            sample: "SELECT city, country, address_type, has_coordinates\nFROM analytics_addresses\nORDER BY city" },
];

const RAW_TABLES_LIST = [
  { table: "raw_people",        label: "People (raw)",        desc: "Individual person records from Base44",       sample: "SELECT id, full_name, person_type, status, enterprise_id\nFROM raw_people\nLIMIT 100" },
  { table: "raw_enterprises",   label: "Enterprises (raw)",   desc: "Individual enterprise records from Base44",   sample: "SELECT id, name, enterprise_type, status, operating_status\nFROM raw_enterprises\nLIMIT 100" },
  { table: "raw_products",      label: "Products (raw)",      desc: "Individual product records from Base44",      sample: "SELECT id, name, item_type, status, price, stock_quantity\nFROM raw_products\nLIMIT 100" },
  { table: "raw_tasks",         label: "Tasks (raw)",         desc: "Individual task records from Base44",         sample: "SELECT id, task_type, status, title, enterprise_id, due_date\nFROM raw_tasks\nLIMIT 100" },
  { table: "raw_transactions",  label: "Transactions (raw)",  desc: "Individual transaction records from Base44",  sample: "SELECT id, transaction_type, status, amount, currency, enterprise_id\nFROM raw_transactions\nLIMIT 100" },
  { table: "raw_services",      label: "Services (raw)",      desc: "Individual service records from Base44",      sample: "SELECT id, name, service_type, status, rate\nFROM raw_services\nLIMIT 100" },
  { table: "raw_relationships", label: "Relationships (raw)", desc: "Individual relationship records from Base44", sample: "SELECT id, relationship_type, person_id, enterprise_id, status\nFROM raw_relationships\nLIMIT 100" },
  { table: "raw_addresses",     label: "Addresses (raw)",     desc: "Individual address records from Base44",      sample: "SELECT id, label, street, city, country, address_type\nFROM raw_addresses\nLIMIT 100" },
  { table: "raw_ml_predictions",label: "ML Predictions",      desc: "Stored ML model results (retention, LTV…)",   sample: "SELECT model, computed_at, result_json\nFROM raw_ml_predictions\nORDER BY computed_at DESC\nLIMIT 10" },
];

const FINANCIAL_TABLES = [
  { table: "stock_quote",      label: "Stock Quote",       desc: "Real-time stock price & signals",      sample: "SELECT * FROM stock_quote WHERE symbol = 'JNJ'" },
  { table: "crypto_price",     label: "Crypto Price",      desc: "Live crypto prices (CoinGecko)",        sample: "SELECT * FROM crypto_price WHERE coin = 'bitcoin'" },
  { table: "fed_rates",        label: "Fed / FRED Data",   desc: "Federal Reserve economic series",       sample: "SELECT * FROM fed_rates WHERE series = 'FEDFUNDS' AND year_from = '2020'" },
  { table: "commodity_price",  label: "Commodity Prices",  desc: "Gold, oil, wheat, copper prices",       sample: "SELECT * FROM commodity_price WHERE commodity = 'gold'" },
];

const JOB_TABLES = [
  { table: "bls_wages",        label: "BLS Wages",         desc: "Wages by occupation & state (BLS)",     sample: "SELECT * FROM bls_wages WHERE occupation = 'registered_nurse' AND state = 'Iowa'" },
  { table: "salary_benchmark", label: "Salary Benchmark",  desc: "Compare labor costs across states",     sample: "SELECT * FROM salary_benchmark WHERE role = 'registered_nurse' AND states = 'Iowa,Minnesota,Maine,Indiana'" },
];

const NEWS_TABLES = [
  { table: "news_search",   label: "News Search",    desc: "Global news search via GDELT",        sample: "SELECT * FROM news_search WHERE query = 'home healthcare Iowa' AND limit = 10" },
  { table: "global_events", label: "Global Events",  desc: "World events by country/category",    sample: "SELECT * FROM global_events WHERE country = 'Nigeria' AND days_back = 7" },
];

const ENV_TABLES = [
  { table: "air_quality",     label: "Air Quality",     desc: "Real-time AQI any city (OpenAQ)",      sample: "SELECT * FROM air_quality WHERE city = 'Des Moines Iowa'" },
  { table: "earthquake_data", label: "Earthquake Data", desc: "USGS seismic history & risk",           sample: "SELECT * FROM earthquake_data WHERE city = 'San Francisco California' AND days_back = 30 AND min_magnitude = 3" },
  { table: "climate_risk",    label: "Climate Risk",    desc: "Full climate risk assessment",          sample: "SELECT * FROM climate_risk WHERE city = 'Miami Florida'" },
];

const GEO_TABLES = [
  { table: "geo_overview",       label: "Place Overview",       desc: "Quick summary of any location",         sample: "SELECT * FROM geo_overview WHERE place = 'Lagos Nigeria'" },
  { table: "geo_economy",        label: "Country Economy",      desc: "Economic indicators any country",        sample: "SELECT * FROM geo_economy WHERE country = 'Nigeria'" },
  { table: "geo_population",     label: "Population Data",      desc: "Population trends any country",          sample: "SELECT * FROM geo_population WHERE country = 'Kenya'" },
  { table: "geo_competitors",    label: "Business Density",     desc: "Competitors near any city",              sample: "SELECT * FROM geo_competitors WHERE city = 'Kigali Rwanda' AND business_type = 'pharmacy' AND radius_km = 10" },
  { table: "geo_infrastructure", label: "Infrastructure Scan",  desc: "Full facilities scan any city",          sample: "SELECT * FROM geo_infrastructure WHERE city = 'Nairobi Kenya' AND radius_km = 15" },
  { table: "geo_weather_profile",label: "Weather Profile",      desc: "16-day climate profile any city",        sample: "SELECT * FROM geo_weather_profile WHERE city = 'Cape Town South Africa'" },
  { table: "geo_cost_of_living", label: "Cost of Living",       desc: "Cost comparison any country",            sample: "SELECT * FROM geo_cost_of_living WHERE country = 'Rwanda'" },
  { table: "geo_market_size",    label: "Market Opportunity",   desc: "Market size estimation any city",        sample: "SELECT * FROM geo_market_size WHERE city = 'Des Moines Iowa' AND business_type = 'home_healthcare'" },
];

const US_TABLES = [
  { table: "us_state",        label: "State Demographics",    desc: "Census ACS data any US state",      sample: "SELECT * FROM us_state WHERE state = 'Iowa'" },
  { table: "us_county",       label: "County Breakdown",      desc: "County-level data any US state",    sample: "SELECT * FROM us_county WHERE state = 'Texas' ORDER BY population DESC LIMIT 20" },
  { table: "us_zipcode",      label: "Zip Code Demographics", desc: "Neighborhood demographics by zip",  sample: "SELECT * FROM us_zipcode WHERE zipcode = '50301'" },
  { table: "cms_healthcare",  label: "CMS Provider Ratings",  desc: "Medicare/Medicaid provider data",   sample: "SELECT * FROM cms_healthcare WHERE state = 'Iowa' AND provider_type = 'nursing_home'" },
  { table: "usda_food_access",label: "Food Access & Deserts", desc: "Food access and food desert data",  sample: "SELECT * FROM usda_food_access WHERE state = 'Iowa'" },
];

function Section({ title, icon: Icon, iconColor, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors"
      >
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="w-3 h-3 text-slate-600" /> : <ChevronRight className="w-3 h-3 text-slate-600" />}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

export default function DataSourcesPanel({ uploadedTables, onTablesChange, onUseInQuery, masterDataSnapshot }) {
  const [showUpload, setShowUpload] = useState(false);
  const [notebooks, setNotebooks] = useState(NotebookStore.getAll());
  const [notebookModal, setNotebookModal] = useState(null); // null | { type, edit }

  useEffect(() => {
    const unsub = NotebookStore.subscribe(setNotebooks);
    return unsub;
  }, []);

  const openNew = (type) => setNotebookModal({ type, edit: null });
  const openEdit = (nb) => setNotebookModal({ type: nb.type, edit: nb });

  const removeNotebook = (id) => {
    NotebookStore.remove(id);
    setNotebooks(NotebookStore.getAll());
  };

  const apiNotebooks = Object.values(notebooks).filter((n) => n.type === "api");
  const pythonNotebooks = Object.values(notebooks).filter((n) => n.type === "python");

  return (
    <>
      <div className="flex flex-col h-full overflow-y-auto text-sm">

        {/* Uploaded CSV/Excel */}
        <Section title="Uploaded Files" icon={Upload} iconColor="text-indigo-400">
          <div className="px-2 space-y-0.5">
            {Object.keys(uploadedTables).length === 0 && (
              <p className="text-[10px] text-slate-600 px-2 py-1 font-mono">No files uploaded yet</p>
            )}
            {Object.entries(uploadedTables).map(([key, tbl]) => (
              <div key={key} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-all">
                <Upload className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-xs text-slate-300 block truncate">{key}</span>
                  <span className="text-[9px] text-slate-600">{tbl.rows?.length ?? 0} rows</span>
                </div>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={() => onUseInQuery(`SELECT * FROM ${key}`)}
                    title="Use in Query"
                    className="p-1 rounded hover:bg-indigo-500/20 text-slate-500 hover:text-indigo-400 transition-colors"
                  >
                    <Zap className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 mt-1 rounded-lg border border-dashed border-white/10 text-[10px] text-slate-600 hover:text-slate-300 hover:border-white/20 transition-all"
            >
              <Plus className="w-3 h-3" /> Upload CSV / Excel
            </button>
            {showUpload && (
              <div className="mt-2">
                <UploadPanel uploadedTables={uploadedTables} onTablesChange={onTablesChange} />
              </div>
            )}
          </div>
        </Section>

        {/* Analytics — aggregated summaries from python_layer */}
        <Section title="Analytics (8 tables)" icon={Database} iconColor="text-indigo-400" defaultOpen={false}>
          <div className="px-2 space-y-0.5">
            <p className="text-[9px] text-slate-500 px-2 pb-1 font-mono uppercase tracking-widest">Pre-aggregated daily snapshots</p>
            {ANALYTICS_TABLES_LIST.map(({ table, label, desc, sample }) => (
              <div key={table} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-indigo-500/5 transition-all">
                <Database className="w-3 h-3 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[10px] text-slate-300 block truncate">{table}</span>
                  <span className="text-[9px] text-slate-600">{desc}</span>
                </div>
                <button onClick={() => onUseInQuery(sample)} title="Use sample query" className="hidden group-hover:flex p-1 rounded hover:bg-indigo-500/20 text-slate-500 hover:text-indigo-400 transition-colors">
                  <Zap className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* Raw data — individual records from python_layer */}
        <Section title="Raw Data (9 tables)" icon={Sparkles} iconColor="text-emerald-400" defaultOpen={false}>
          <div className="px-2 space-y-0.5">
            <p className="text-[9px] text-slate-500 px-2 pb-1 font-mono uppercase tracking-widest">Individual records — full feature set</p>
            {RAW_TABLES_LIST.map(({ table, label, desc, sample }) => (
              <div key={table} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-emerald-500/5 transition-all">
                <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[10px] text-slate-300 block truncate">{table}</span>
                  <span className="text-[9px] text-slate-600">{desc}</span>
                </div>
                <button onClick={() => onUseInQuery(sample)} title="Use sample query" className="hidden group-hover:flex p-1 rounded hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-400 transition-colors">
                  <Zap className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* External APIs */}
        <Section title="External APIs" icon={Globe} iconColor="text-sky-400" defaultOpen={false}>
          <div className="px-2 space-y-1">
            {apiNotebooks.length === 0 && (
              <p className="text-[10px] text-slate-600 px-2 py-1 font-mono">No API sources connected yet</p>
            )}
            {apiNotebooks.map((nb) => (
              <div key={nb.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg bg-sky-500/5 border border-sky-500/10 hover:bg-sky-500/10 transition-all">
                <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-sky-300 block truncate">{nb.name}</span>
                  {nb.connected && (
                    <span className="text-[9px] text-emerald-400 flex items-center gap-0.5">
                      <CheckCircle className="w-2.5 h-2.5" /> connected · {nb.outputSchema?.length || 0} cols
                    </span>
                  )}
                </div>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button onClick={() => onUseInQuery(`SELECT * FROM ${nb.id}`)} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-sky-400 transition-colors">
                    <Zap className="w-3 h-3" />
                  </button>
                  <button onClick={() => openEdit(nb)} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors">
                    <Code2 className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeNotebook(nb.id)} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => openNew("api")}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 mt-1 rounded-lg border border-dashed border-white/10 text-[10px] text-slate-600 hover:text-sky-400 hover:border-sky-500/30 transition-all"
            >
              <Plus className="w-3 h-3" /> Add API Source
            </button>
          </div>
        </Section>

        {/* Financial Markets */}
        <Section title="Financial Markets (4 tables)" icon={TrendingUp} iconColor="text-yellow-400" defaultOpen={false}>
          <div className="px-2 space-y-0.5">
            {FINANCIAL_TABLES.map(({ table, label, desc, sample }) => (
              <div key={table} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-yellow-500/5 transition-all">
                <TrendingUp className="w-3 h-3 text-yellow-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[10px] text-slate-300 block truncate">{table}</span>
                  <span className="text-[9px] text-slate-600">{desc}</span>
                </div>
                <button onClick={() => onUseInQuery(sample)} title="Use sample query" className="hidden group-hover:flex p-1 rounded hover:bg-yellow-500/20 text-slate-500 hover:text-yellow-400 transition-colors">
                  <Zap className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* Job Market */}
        <Section title="Job Market (2 tables)" icon={Briefcase} iconColor="text-violet-400" defaultOpen={false}>
          <div className="px-2 space-y-0.5">
            {JOB_TABLES.map(({ table, label, desc, sample }) => (
              <div key={table} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-violet-500/5 transition-all">
                <Briefcase className="w-3 h-3 text-violet-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[10px] text-slate-300 block truncate">{table}</span>
                  <span className="text-[9px] text-slate-600">{desc}</span>
                </div>
                <button onClick={() => onUseInQuery(sample)} title="Use sample query" className="hidden group-hover:flex p-1 rounded hover:bg-violet-500/20 text-slate-500 hover:text-violet-400 transition-colors">
                  <Zap className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* News & Sentiment */}
        <Section title="News & Sentiment (2 tables)" icon={Newspaper} iconColor="text-sky-400" defaultOpen={false}>
          <div className="px-2 space-y-0.5">
            {NEWS_TABLES.map(({ table, label, desc, sample }) => (
              <div key={table} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sky-500/5 transition-all">
                <Newspaper className="w-3 h-3 text-sky-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[10px] text-slate-300 block truncate">{table}</span>
                  <span className="text-[9px] text-slate-600">{desc}</span>
                </div>
                <button onClick={() => onUseInQuery(sample)} title="Use sample query" className="hidden group-hover:flex p-1 rounded hover:bg-sky-500/20 text-slate-500 hover:text-sky-400 transition-colors">
                  <Zap className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* Environment */}
        <Section title="Environment (3 tables)" icon={Leaf} iconColor="text-teal-400" defaultOpen={false}>
          <div className="px-2 space-y-0.5">
            {ENV_TABLES.map(({ table, label, desc, sample }) => (
              <div key={table} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-teal-500/5 transition-all">
                <Leaf className="w-3 h-3 text-teal-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[10px] text-slate-300 block truncate">{table}</span>
                  <span className="text-[9px] text-slate-600">{desc}</span>
                </div>
                <button onClick={() => onUseInQuery(sample)} title="Use sample query" className="hidden group-hover:flex p-1 rounded hover:bg-teal-500/20 text-slate-500 hover:text-teal-400 transition-colors">
                  <Zap className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* Geographic Research */}
        <Section title="Geographic Research (8 tables)" icon={MapPin} iconColor="text-emerald-400" defaultOpen={false}>
          <div className="px-2 space-y-0.5">
            <p className="text-[9px] text-slate-500 px-2 pb-1 font-mono uppercase tracking-widest">Universal — any location</p>
            {GEO_TABLES.map(({ table, label, desc, sample }) => (
              <div key={table} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-emerald-500/5 transition-all">
                <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[10px] text-slate-300 block truncate">{table}</span>
                  <span className="text-[9px] text-slate-600">{desc}</span>
                </div>
                <button
                  onClick={() => onUseInQuery(sample)}
                  title="Use sample query"
                  className="hidden group-hover:flex p-1 rounded hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-400 transition-colors"
                >
                  <Zap className="w-3 h-3" />
                </button>
              </div>
            ))}
            <p className="text-[9px] text-slate-500 px-2 pb-1 pt-2 font-mono uppercase tracking-widest">US Deep Research (5 tables)</p>
            {US_TABLES.map(({ table, label, desc, sample }) => (
              <div key={table} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-500/5 transition-all">
                <MapPin className="w-3 h-3 text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[10px] text-slate-300 block truncate">{table}</span>
                  <span className="text-[9px] text-slate-600">{desc}</span>
                </div>
                <button
                  onClick={() => onUseInQuery(sample)}
                  title="Use sample query"
                  className="hidden group-hover:flex p-1 rounded hover:bg-blue-500/20 text-slate-500 hover:text-blue-400 transition-colors"
                >
                  <Zap className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* Python Analytics */}
        <Section title="Python Scripts" icon={Code2} iconColor="text-amber-400" defaultOpen={false}>
          <div className="px-2 space-y-1">
            {pythonNotebooks.length === 0 && (
              <p className="text-[10px] text-slate-600 px-2 py-1 font-mono">No Python scripts yet</p>
            )}
            {pythonNotebooks.map((nb) => (
              <div key={nb.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-all">
                <Code2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-amber-300 block truncate">{nb.name}</span>
                  {nb.connected && (
                    <span className="text-[9px] text-emerald-400 flex items-center gap-0.5">
                      <CheckCircle className="w-2.5 h-2.5" /> connected · {nb.outputSchema?.length || 0} cols
                    </span>
                  )}
                </div>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button onClick={() => onUseInQuery(`SELECT * FROM ${nb.id}`)} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-amber-400 transition-colors">
                    <Zap className="w-3 h-3" />
                  </button>
                  <button onClick={() => openEdit(nb)} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors">
                    <Code2 className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeNotebook(nb.id)} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-rose-400 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => openNew("python")}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 mt-1 rounded-lg border border-dashed border-white/10 text-[10px] text-slate-600 hover:text-amber-400 hover:border-amber-500/30 transition-all"
            >
              <Plus className="w-3 h-3" /> New Python Script
            </button>
          </div>
        </Section>
      </div>

      {notebookModal && (
        <NotebookModal
          initialType={notebookModal.type}
          editNotebook={notebookModal.edit}
          uploadedTables={uploadedTables}
          masterDataSnapshot={masterDataSnapshot}
          onClose={() => setNotebookModal(null)}
          onSaved={() => {
            setNotebooks(NotebookStore.getAll());
            setNotebookModal(null);
          }}
        />
      )}
    </>
  );
}