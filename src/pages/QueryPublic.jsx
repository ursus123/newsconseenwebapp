import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DemoShell from "@/components/demo/DemoShell";
import DemoChartCard, { PALETTE } from "@/components/demo/DemoChartCard";
import {
  Database, Search, ChevronDown, ChevronRight, Loader2,
  AlertCircle, X, BarChart2, TrendingUp, Globe, Check,
} from "lucide-react";

const RAILWAY_URL = import.meta.env.VITE_RAILWAY_URL
  || "https://newsconseenwebapp-production.up.railway.app";

// ── World Bank indicator catalogue ───────────────────────────────────────────
const INDICATORS = [
  { id: "NY.GDP.MKTP.CD",      name: "GDP (current US$)",              unit: "$", category: "Economy" },
  { id: "NY.GDP.PCAP.CD",      name: "GDP per Capita (US$)",           unit: "$", category: "Economy" },
  { id: "FP.CPI.TOTL.ZG",      name: "Inflation Rate (%)",             unit: "%", category: "Economy" },
  { id: "SL.UEM.TOTL.ZS",      name: "Unemployment Rate (%)",          unit: "%", category: "Economy" },
  { id: "NE.EXP.GNFS.ZS",      name: "Exports (% of GDP)",             unit: "%", category: "Economy" },
  { id: "SP.POP.TOTL",         name: "Total Population",               unit: "",  category: "Demographics" },
  { id: "SP.POP.GROW",         name: "Population Growth Rate (%)",     unit: "%", category: "Demographics" },
  { id: "SP.URB.TOTL.IN.ZS",   name: "Urban Population (%)",           unit: "%", category: "Demographics" },
  { id: "SP.DYN.LE00.IN",      name: "Life Expectancy (years)",        unit: "yrs", category: "Health" },
  { id: "SH.XPD.CHEX.GD.ZS",  name: "Health Expenditure (% of GDP)",  unit: "%", category: "Health" },
  { id: "SH.DYN.MORT",         name: "Child Mortality (per 1,000)",    unit: "",  category: "Health" },
  { id: "SE.ADT.LITR.ZS",      name: "Adult Literacy Rate (%)",        unit: "%", category: "Education" },
  { id: "SE.PRM.NENR",         name: "Primary School Enrolment (%)",   unit: "%", category: "Education" },
  { id: "SE.XPD.TOTL.GD.ZS",   name: "Education Spending (% of GDP)", unit: "%", category: "Education" },
  { id: "EN.ATM.CO2E.PC",      name: "CO2 Emissions per Capita (t)",   unit: "t", category: "Environment" },
  { id: "EG.USE.ELEC.KH.PC",   name: "Electric Power Consumption",     unit: "kWh", category: "Environment" },
  { id: "AG.LND.FRST.ZS",      name: "Forest Area (% of land)",        unit: "%", category: "Environment" },
  { id: "IC.BUS.EASE.XQ",      name: "Ease of Doing Business Score",   unit: "",  category: "Business" },
  { id: "IC.TAX.TOTL.CP.ZS",   name: "Tax Rate (% of commercial profit)", unit: "%", category: "Business" },
  { id: "GB.XPD.RSDV.GD.ZS",   name: "R&D Spending (% of GDP)",        unit: "%", category: "Business" },
];

const COUNTRIES = [
  { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },       { code: "FR", name: "France" },
  { code: "CN", name: "China" },         { code: "JP", name: "Japan" },
  { code: "IN", name: "India" },         { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },        { code: "AU", name: "Australia" },
  { code: "KR", name: "South Korea" },   { code: "MX", name: "Mexico" },
  { code: "ZA", name: "South Africa" },  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },         { code: "RW", name: "Rwanda" },
  { code: "EG", name: "Egypt" },         { code: "GH", name: "Ghana" },
  { code: "ET", name: "Ethiopia" },      { code: "TZ", name: "Tanzania" },
];

const SAMPLE_QUERIES = [
  {
    category: "Economy",
    queries: [
      { label: "G7 GDP — 2023 comparison",          indicator: "NY.GDP.MKTP.CD",    countries: ["US","GB","DE","FR","JP","CA","IT"], yearStart: 2023, yearEnd: 2023 },
      { label: "GDP per capita trend — top 5",       indicator: "NY.GDP.PCAP.CD",    countries: ["US","DE","JP","GB","CA"],           yearStart: 2010, yearEnd: 2023 },
      { label: "Inflation — BRICS countries",        indicator: "FP.CPI.TOTL.ZG",    countries: ["BR","IN","CN","ZA"],                yearStart: 2015, yearEnd: 2023 },
      { label: "Unemployment — Europe (2020–2023)",  indicator: "SL.UEM.TOTL.ZS",    countries: ["GB","DE","FR","IT","ES"],           yearStart: 2020, yearEnd: 2023 },
    ],
  },
  {
    category: "Health",
    queries: [
      { label: "Life expectancy — Africa (2023)",     indicator: "SP.DYN.LE00.IN",    countries: ["NG","KE","ZA","EG","RW","GH","ET","TZ"], yearStart: 2023, yearEnd: 2023 },
      { label: "Health spending — G7 vs Africa",      indicator: "SH.XPD.CHEX.GD.ZS", countries: ["US","GB","DE","NG","KE","ZA"],           yearStart: 2020, yearEnd: 2020 },
      { label: "Life expectancy trend — major blocs", indicator: "SP.DYN.LE00.IN",    countries: ["US","CN","IN","NG"],                     yearStart: 2000, yearEnd: 2023 },
    ],
  },
  {
    category: "Education",
    queries: [
      { label: "Literacy rate — East Africa",         indicator: "SE.ADT.LITR.ZS",    countries: ["KE","RW","NG","EG","GH","TZ"],      yearStart: 2015, yearEnd: 2023 },
      { label: "Education spending — global (2023)",  indicator: "SE.XPD.TOTL.GD.ZS", countries: ["US","IN","NG","BR","CN","ZA"],       yearStart: 2023, yearEnd: 2023 },
      { label: "Primary enrolment — major regions",   indicator: "SE.PRM.NENR",        countries: ["US","IN","NG","BR","CN"],            yearStart: 2010, yearEnd: 2023 },
    ],
  },
  {
    category: "Demographics",
    queries: [
      { label: "Population — largest economies (2023)", indicator: "SP.POP.TOTL",    countries: ["CN","IN","US","ID","BR","NG","DE","JP"], yearStart: 2023, yearEnd: 2023 },
      { label: "Urban population growth — Africa",      indicator: "SP.URB.TOTL.IN.ZS", countries: ["NG","KE","ZA","EG","GH"],            yearStart: 2000, yearEnd: 2023 },
      { label: "Population growth — BRICS",             indicator: "SP.POP.GROW",     countries: ["BR","IN","CN","ZA"],                  yearStart: 2010, yearEnd: 2023 },
    ],
  },
  {
    category: "Environment",
    queries: [
      { label: "CO2 per capita — top emitters",         indicator: "EN.ATM.CO2E.PC",  countries: ["US","CN","AU","CA","DE","JP"],        yearStart: 2010, yearEnd: 2020 },
      { label: "Forest coverage — global (2022)",       indicator: "AG.LND.FRST.ZS",  countries: ["BR","CA","RU","AU","US","CN","NG"],   yearStart: 2022, yearEnd: 2022 },
    ],
  },
  {
    category: "Business",
    queries: [
      { label: "Ease of doing business — Africa",       indicator: "IC.BUS.EASE.XQ",  countries: ["ZA","KE","RW","NG","GH","EG"],        yearStart: 2023, yearEnd: 2023 },
      { label: "R&D spending — innovation leaders",     indicator: "GB.XPD.RSDV.GD.ZS", countries: ["US","DE","JP","KR","CN","GB"],      yearStart: 2015, yearEnd: 2023 },
    ],
  },
];

// ── Parse World Bank response → DemoChartCard config ─────────────────────────
function parseWorldBank(raw, indicator, countries, yearStart, yearEnd, title) {
  if (!raw || !Array.isArray(raw) || !raw[1]) return null;
  const records = raw[1].filter(r => r && r.value !== null);
  if (!records.length) return null;

  const isTimeSeries   = yearStart !== yearEnd;
  const isMultiCountry = countries.length > 1;
  const unit = INDICATORS.find(i => i.id === indicator)?.unit || "";

  if (isTimeSeries && isMultiCountry) {
    const years = [...new Set(records.map(r => r.date))].sort();
    const countryNames = {};
    records.forEach(r => { if (r.country?.id) countryNames[r.country.id] = r.country.value || r.country.id; });

    const data = years.map(year => {
      const row = { name: year };
      countries.forEach(code => {
        const rec = records.find(r => r.date === year && r.country?.id === code);
        const label = countryNames[code] || code;
        row[label] = rec ? rec.value : null;
      });
      return row;
    });

    const keys = countries
      .map((code, i) => ({ key: countryNames[code] || code, color: PALETTE[i % PALETTE.length] }));

    return { type: "line", title, data, keys, unit, _indicator: indicator, _countries: countries.join(","), _source: "World Bank" };
  }

  if (isTimeSeries && !isMultiCountry) {
    const data = records
      .filter(r => r.country?.id === countries[0])
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(r => ({ name: r.date, value: r.value }));
    return { type: "area", title, data, keys: [{ key: "value", color: PALETTE[0] }], unit, _indicator: indicator, _countries: countries[0], _source: "World Bank" };
  }

  // Single year, multi-country → bar
  const data = countries
    .map(code => {
      const rec = records.find(r => r.country?.id === code);
      return rec ? { name: rec.country?.value || code, value: rec.value } : null;
    })
    .filter(Boolean)
    .filter(r => r.value !== null)
    .sort((a, b) => b.value - a.value);

  return { type: "bar", title, data, keys: [{ key: "value", color: PALETTE[0] }], unit, _indicator: indicator, _countries: countries.join(","), _source: "World Bank" };
}

// ── Fetch World Bank data via python_layer proxy ──────────────────────────────
async function fetchWorldBank(indicator, countries, yearStart, yearEnd) {
  const countryStr = countries.join(";");
  const url = `${RAILWAY_URL}/proxy/worldbank/${encodeURIComponent(countryStr)}/indicator/${indicator}?format=json&date=${yearStart}:${yearEnd}&per_page=300`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status}`);
  return resp.json();
}

// ── Raw data table ────────────────────────────────────────────────────────────
function DataTable({ config }) {
  if (!config?.data?.length) return null;
  const cols = Object.keys(config.data[0]);
  return (
    <div className="mt-4 rounded-xl border border-slate-700 overflow-hidden">
      <div className="overflow-x-auto max-h-64">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-800 border-b border-slate-700 sticky top-0">
            <tr>{cols.map(c => <th key={c} className="px-3 py-2 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{c}</th>)}</tr>
          </thead>
          <tbody>
            {config.data.map((row, i) => (
              <tr key={i} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                {cols.map(c => (
                  <td key={c} className="px-3 py-1.5 text-slate-300 whitespace-nowrap">
                    {typeof row[c] === "number" ? row[c].toLocaleString() : (row[c] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function QueryPublic() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Form state — pre-populated from URL params
  const [indicator, setIndicator]   = useState(searchParams.get("indicator") || "NY.GDP.MKTP.CD");
  const [countries, setCountries]   = useState(
    searchParams.get("countries") ? searchParams.get("countries").split(",") : ["US","GB","DE","FR","JP"]
  );
  const [yearStart, setYearStart]   = useState(2015);
  const [yearEnd, setYearEnd]       = useState(2023);
  const [mode, setMode]             = useState("params"); // "params" | "natural"
  const [nlQuery, setNlQuery]       = useState("");
  const [openCategory, setOpenCategory] = useState("Economy");

  // Results
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [chartConfig, setChartConfig] = useState(null);
  const [showTable, setShowTable]     = useState(false);

  const selectedIndicator = INDICATORS.find(i => i.id === indicator);

  // Core fetch — accepts explicit params so sample-query clicks don't use stale state
  const fetchData = useCallback(async (ind, cnts, ys, ye, titleOverride) => {
    if (!ind || !cnts.length) return;
    setLoading(true);
    setError(null);
    setChartConfig(null);
    setShowTable(false);
    try {
      const indMeta = INDICATORS.find(i => i.id === ind);
      const title = titleOverride || `${indMeta?.name || ind} — ${
        cnts.length === 1 ? cnts[0] : `${cnts.length} countries`
      }${ys === ye ? ` (${ys})` : ` (${ys}–${ye})`}`;
      const raw = await fetchWorldBank(ind, cnts, ys, ye);
      const config = parseWorldBank(raw, ind, cnts, ys, ye, title);
      if (!config || !config.data?.length) {
        setError("No data returned for this selection. Try different countries or years.");
      } else {
        setChartConfig(config);
      }
    } catch (e) {
      setError(`Could not fetch data: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const runQuery = () => fetchData(indicator, countries, yearStart, yearEnd);

  // Auto-run if URL params are present
  useEffect(() => {
    if (searchParams.get("indicator")) {
      fetchData(indicator, countries, yearStart, yearEnd, searchParams.get("title") || undefined);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runNLQuery = async () => {
    if (!nlQuery.trim()) return;
    setLoading(true);
    setError(null);
    setChartConfig(null);

    try {
      const resp = await fetch(`${RAILWAY_URL}/copilot/demo-ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nlQuery, history: [] }),
      });
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      if (data.charts?.length) {
        setChartConfig(data.charts[0]);
      } else {
        setError(data.answer || "No chart generated. Try a more specific query like 'Show me GDP for US and UK from 2015 to 2023 as a line chart'.");
      }
    } catch (e) {
      setError(`Query failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleCountry = (code) =>
    setCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );

  return (
    <DemoShell>
      <div className="flex h-[calc(100vh-56px)] overflow-hidden bg-[#050b18]">

        {/* ── Left: sample query library ─────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-slate-800/60 bg-slate-950/60 overflow-y-auto">
          <div className="px-4 pt-5 pb-3">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">Sample Queries</p>
            <div className="space-y-0.5">
              {SAMPLE_QUERIES.map(cat => (
                <div key={cat.category}>
                  <button
                    onClick={() => setOpenCategory(o => o === cat.category ? null : cat.category)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">
                    {openCategory === cat.category
                      ? <ChevronDown className="w-3 h-3 shrink-0" />
                      : <ChevronRight className="w-3 h-3 shrink-0" />}
                    {cat.category}
                  </button>
                  {openCategory === cat.category && (
                    <div className="ml-5 space-y-0.5 mb-1">
                      {cat.queries.map((q, i) => (
                        <button key={i}
                          onClick={() => {
                            setIndicator(q.indicator);
                            setCountries(q.countries);
                            setYearStart(q.yearStart);
                            setYearEnd(q.yearEnd);
                            setMode("params");
                            fetchData(q.indicator, q.countries, q.yearStart, q.yearEnd);
                          }}
                          className="w-full text-left text-[11px] text-slate-500 hover:text-emerald-400 px-2 py-1.5 rounded-lg hover:bg-emerald-500/5 transition-colors leading-snug">
                          {q.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Right: query builder + results ─────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

            {/* Header */}
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <Database className="w-5 h-5 text-blue-400" />
                <h1 className="text-lg font-bold text-white">Query Builder</h1>
                <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-2.5 py-0.5">Live public data</span>
              </div>
              <p className="text-sm text-slate-500">Query 20+ World Bank indicators across 150+ countries. Select parameters or describe what you need.</p>
            </div>

            {/* Mode toggle */}
            <div className="flex rounded-xl border border-slate-700 overflow-hidden w-fit">
              {[{ id: "params", label: "Parameters" }, { id: "natural", label: "Natural Language" }].map(m => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className={`px-4 py-2 text-xs font-semibold transition-colors ${
                    mode === m.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* ── Parameter mode ──────────────────────────────────────────── */}
            {mode === "params" && (
              <div className="space-y-5">
                {/* Indicator */}
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wide">Indicator</label>
                  <div className="grid grid-cols-1 gap-1">
                    {Object.entries(
                      INDICATORS.reduce((acc, ind) => {
                        (acc[ind.category] = acc[ind.category] || []).push(ind);
                        return acc;
                      }, {})
                    ).map(([cat, inds]) => (
                      <div key={cat} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">{cat}</p>
                        <div className="space-y-1">
                          {inds.map(ind => (
                            <label key={ind.id} className="flex items-center gap-2.5 cursor-pointer group">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                indicator === ind.id ? "bg-blue-600 border-blue-600" : "border-slate-600 group-hover:border-blue-500"
                              }`} onClick={() => setIndicator(ind.id)}>
                                {indicator === ind.id && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                              <span
                                onClick={() => setIndicator(ind.id)}
                                className={`text-xs transition-colors ${
                                  indicator === ind.id ? "text-white font-medium" : "text-slate-400 group-hover:text-slate-300"
                                }`}>
                                {ind.name}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Countries */}
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wide">
                    Countries <span className="text-slate-600 normal-case font-normal">({countries.length} selected)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {COUNTRIES.map(c => (
                      <button key={c.code} onClick={() => toggleCountry(c.code)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition-all font-medium ${
                          countries.includes(c.code)
                            ? "bg-blue-600/20 border-blue-500/60 text-blue-300"
                            : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"
                        }`}>
                        {c.code} · {c.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Year range */}
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wide">
                    Year Range — {yearStart === yearEnd ? yearStart : `${yearStart}–${yearEnd}`}
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">From</span>
                      <select value={yearStart} onChange={e => setYearStart(+e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500">
                        {Array.from({ length: 34 }, (_, i) => 1990 + i).map(y => <option key={y}>{y}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">To</span>
                      <select value={yearEnd} onChange={e => setYearEnd(+e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500">
                        {Array.from({ length: 34 }, (_, i) => 1990 + i).map(y => <option key={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <button onClick={runQuery} disabled={loading || !countries.length}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-lg shadow-blue-500/20">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Run Query
                </button>
              </div>
            )}

            {/* ── Natural language mode ───────────────────────────────────── */}
            {mode === "natural" && (
              <div className="space-y-4">
                <div className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
                  <textarea
                    value={nlQuery}
                    onChange={e => setNlQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) runNLQuery(); }}
                    rows={3}
                    placeholder="e.g. Show me GDP growth for the US, China, and India from 2010 to 2023 as a line chart"
                    className="w-full bg-transparent px-4 pt-4 pb-2 text-sm text-slate-200 placeholder-slate-500 resize-none outline-none"
                  />
                  <div className="flex items-center justify-between px-4 pb-3">
                    <span className="text-[10px] text-slate-600">Ctrl+Enter to run</span>
                    <button onClick={runNLQuery} disabled={loading || !nlQuery.trim()}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      Ask Idjwi
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "GDP for G7 nations as a bar chart",
                    "Life expectancy trends in Africa, 2000 to 2023",
                    "CO2 emissions per capita — top polluters",
                    "Unemployment rate — Europe line chart",
                  ].map(s => (
                    <button key={s} onClick={() => { setNlQuery(s); }}
                      className="text-[11px] text-slate-500 border border-slate-700 hover:border-blue-500/50 hover:text-blue-400 rounded-full px-2.5 py-1 transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Results ────────────────────────────────────────────────── */}
            {loading && (
              <div className="flex items-center gap-3 text-sm text-slate-400 bg-slate-900/60 border border-slate-700 rounded-xl px-5 py-4">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400 shrink-0" />
                Fetching data from World Bank…
              </div>
            )}

            {error && (
              <div className="flex items-start gap-3 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {chartConfig && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Result</p>
                  <button onClick={() => setShowTable(v => !v)}
                    className="text-[11px] text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg px-2.5 py-1 transition-colors">
                    {showTable ? "Hide" : "Show"} data table
                  </button>
                </div>
                <DemoChartCard config={chartConfig} height={260} />
                {showTable && <DataTable config={chartConfig} />}
                <div className="flex gap-2">
                  <button onClick={() => navigate("/explore")}
                    className="text-xs text-slate-500 hover:text-violet-400 border border-slate-700 hover:border-violet-500/50 rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1.5">
                    <BarChart2 className="w-3 h-3" /> View in Reports →
                  </button>
                  <button onClick={() => navigate("/onboarding")}
                    className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-1.5 transition-colors">
                    Use with your data →
                  </button>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </DemoShell>
  );
}
