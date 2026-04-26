import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DemoShell from "@/components/demo/DemoShell";
import DemoChartCard, { PALETTE } from "@/components/demo/DemoChartCard";
import {
  BarChart2, TrendingUp, Globe, Leaf, Briefcase, Users,
  Loader2, ChevronRight, ArrowRight,
} from "lucide-react";

const RAILWAY_URL = import.meta.env.VITE_RAILWAY_URL
  || "https://newsconseenwebapp-production.up.railway.app";

// ── Shared data helpers ───────────────────────────────────────────────────────
async function worldBank(indicator, countries, yearStart, yearEnd) {
  const url = `${RAILWAY_URL}/proxy/worldbank/${countries.join(";")}/indicator/${indicator}?format=json&date=${yearStart}:${yearEnd}&per_page=300`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status}`);
  return resp.json();
}

function parseWB(raw, indicator, countries, yearStart, yearEnd, title, unit = "") {
  if (!raw?.[1]) return null;
  const records = raw[1].filter(r => r?.value !== null);
  if (!records.length) return null;

  const isTimeSeries   = yearStart !== yearEnd;
  const isMultiCountry = countries.length > 1;

  if (isTimeSeries && isMultiCountry) {
    const years = [...new Set(records.map(r => r.date))].sort();
    const names = {};
    records.forEach(r => { if (r.country?.id) names[r.country.id] = r.country.value || r.country.id; });
    const data = years.map(year => {
      const row = { name: year };
      countries.forEach(code => {
        const rec = records.find(r => r.date === year && r.country?.id === code);
        row[names[code] || code] = rec ? rec.value : null;
      });
      return row;
    });
    const keys = countries.map((code, i) => ({ key: names[code] || code, color: PALETTE[i % PALETTE.length] }));
    return { type: "line", title, data, keys, unit, _indicator: indicator, _countries: countries.join(","), _source: "World Bank" };
  }

  if (isTimeSeries && !isMultiCountry) {
    const data = records
      .filter(r => r.country?.id === countries[0])
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(r => ({ name: r.date, value: r.value }));
    return { type: "area", title, data, keys: [{ key: "value", color: PALETTE[0] }], unit, _indicator: indicator, _countries: countries[0], _source: "World Bank" };
  }

  const data = countries
    .map(code => {
      const rec = records.find(r => r.country?.id === code);
      return rec ? { name: rec.country?.value || code, value: rec.value } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.value - a.value);
  return { type: "bar", title, data, keys: [{ key: "value", color: PALETTE[0] }], unit, _indicator: indicator, _countries: countries.join(","), _source: "World Bank" };
}

// ── Report definitions ────────────────────────────────────────────────────────
const REPORTS = [
  {
    id:   "global-economy",
    icon: TrendingUp,
    color: "emerald",
    title: "Global Economy Snapshot",
    desc: "GDP, per-capita income, and inflation across major economies",
    period: "2010 – 2023",
    tags: ["Economy", "G7", "Growth"],
    charts: async () => {
      const [gdp, pcap, infl] = await Promise.all([
        worldBank("NY.GDP.MKTP.CD",   ["US","CN","DE","JP","IN","BR","CA"],  2023, 2023),
        worldBank("NY.GDP.PCAP.CD",   ["US","DE","JP","GB","CA"],            2010, 2023),
        worldBank("FP.CPI.TOTL.ZG",   ["US","DE","JP","IN","BR","NG"],       2015, 2023),
      ]);
      return [
        parseWB(gdp,  "NY.GDP.MKTP.CD", ["US","CN","DE","JP","IN","BR","CA"], 2023, 2023, "GDP — Major Economies (2023)", "$"),
        parseWB(pcap, "NY.GDP.PCAP.CD", ["US","DE","JP","GB","CA"],           2010, 2023, "GDP per Capita Trend (2010–2023)", "$"),
        parseWB(infl, "FP.CPI.TOTL.ZG", ["US","DE","JP","IN","BR","NG"],      2015, 2023, "Inflation Rate (2015–2023)", "%"),
      ].filter(Boolean);
    },
  },
  {
    id:   "african-development",
    icon: Globe,
    color: "blue",
    title: "African Development Overview",
    desc: "Population, life expectancy, and school enrolment across Africa",
    period: "2000 – 2023",
    tags: ["Africa", "Development", "Health"],
    charts: async () => {
      const [le, school, pop] = await Promise.all([
        worldBank("SP.DYN.LE00.IN",  ["NG","KE","ZA","EG","RW","GH","ET","TZ"], 2023, 2023),
        worldBank("SE.PRM.NENR",     ["NG","KE","ZA","RW","GH"],                2010, 2023),
        worldBank("SP.POP.TOTL",     ["NG","EG","ET","ZA","TZ","KE","GH","RW"], 2023, 2023),
      ]);
      return [
        parseWB(le,     "SP.DYN.LE00.IN", ["NG","KE","ZA","EG","RW","GH","ET","TZ"], 2023, 2023, "Life Expectancy — Africa (2023)", "yrs"),
        parseWB(school, "SE.PRM.NENR",    ["NG","KE","ZA","RW","GH"],                2010, 2023, "Primary Enrolment Trend (2010–2023)", "%"),
        parseWB(pop,    "SP.POP.TOTL",    ["NG","EG","ET","ZA","TZ","KE","GH","RW"], 2023, 2023, "Population — Africa (2023)"),
      ].filter(Boolean);
    },
  },
  {
    id:   "climate-energy",
    icon: Leaf,
    color: "teal",
    title: "Climate & Energy",
    desc: "CO2 emissions, renewable energy, and forest coverage globally",
    period: "2010 – 2022",
    tags: ["Environment", "Climate", "Energy"],
    charts: async () => {
      const [co2, forest] = await Promise.all([
        worldBank("EN.ATM.CO2E.PC", ["US","CN","AU","CA","DE","JP","IN","BR"],  2010, 2020),
        worldBank("AG.LND.FRST.ZS", ["BR","CA","RU","AU","US","CN","NG","ID"], 2000, 2020),
      ]);
      return [
        parseWB(co2,    "EN.ATM.CO2E.PC", ["US","CN","AU","CA","DE","JP","IN","BR"], 2010, 2020, "CO2 Emissions per Capita — Trend (2010–2020)", "t"),
        parseWB(forest, "AG.LND.FRST.ZS", ["BR","CA","RU","AU","US","CN","NG"],      2000, 2020, "Forest Coverage — Major Countries (% of land area)", "%"),
      ].filter(Boolean);
    },
  },
  {
    id:   "business-investment",
    icon: Briefcase,
    color: "violet",
    title: "Market Entry Brief",
    desc: "Business environment, R&D investment, and education spending",
    period: "2018 – 2023",
    tags: ["Business", "Investment", "Market"],
    charts: async () => {
      const [ease, rd, edu] = await Promise.all([
        worldBank("IC.BUS.EASE.XQ",  ["ZA","KE","RW","NG","GH","EG","US","DE"],  2023, 2023),
        worldBank("GB.XPD.RSDV.GD.ZS",["US","DE","JP","KR","CN","GB"],           2015, 2023),
        worldBank("SE.XPD.TOTL.GD.ZS",["US","DE","GB","IN","ZA","BR"],           2018, 2023),
      ]);
      return [
        parseWB(ease, "IC.BUS.EASE.XQ",    ["ZA","KE","RW","NG","GH","EG","US","DE"], 2023, 2023, "Ease of Doing Business (2023)"),
        parseWB(rd,   "GB.XPD.RSDV.GD.ZS", ["US","DE","JP","KR","CN","GB"],           2015, 2023, "R&D Spending as % of GDP (2015–2023)", "%"),
        parseWB(edu,  "SE.XPD.TOTL.GD.ZS", ["US","DE","GB","IN","ZA","BR"],           2018, 2023, "Education Spending as % of GDP (2018–2023)", "%"),
      ].filter(Boolean);
    },
  },
  {
    id:   "health-systems",
    icon: Users,
    color: "rose",
    title: "Health Systems Comparison",
    desc: "Life expectancy, health spending, and child mortality across income groups",
    period: "2000 – 2023",
    tags: ["Health", "Demographics", "Spending"],
    charts: async () => {
      const [le, spend, mort] = await Promise.all([
        worldBank("SP.DYN.LE00.IN",    ["US","GB","DE","JP","IN","BR","NG","CN"],  2000, 2023),
        worldBank("SH.XPD.CHEX.GD.ZS", ["US","GB","DE","JP","IN","BR","NG"],      2018, 2023),
        worldBank("SH.DYN.MORT",        ["US","IN","NG","CN","BR","ZA","KE"],      2023, 2023),
      ]);
      return [
        parseWB(le,    "SP.DYN.LE00.IN",    ["US","GB","DE","JP","IN","BR","NG","CN"], 2000, 2023, "Life Expectancy Trend (2000–2023)", "yrs"),
        parseWB(spend, "SH.XPD.CHEX.GD.ZS", ["US","GB","DE","JP","IN","BR","NG"],      2018, 2023, "Health Spending — % of GDP (2018–2023)", "%"),
        parseWB(mort,  "SH.DYN.MORT",        ["US","IN","NG","CN","BR","ZA","KE"],      2023, 2023, "Child Mortality per 1,000 (2023)"),
      ].filter(Boolean);
    },
  },
];

const COLOR_MAP = {
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", dot: "bg-emerald-400" },
  blue:    { bg: "bg-blue-500/10",    border: "border-blue-500/20",    text: "text-blue-400",    dot: "bg-blue-400" },
  teal:    { bg: "bg-teal-500/10",    border: "border-teal-500/20",    text: "text-teal-400",    dot: "bg-teal-400" },
  violet:  { bg: "bg-violet-500/10",  border: "border-violet-500/20",  text: "text-violet-400",  dot: "bg-violet-400" },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/20",    text: "text-rose-400",    dot: "bg-rose-400" },
};

// ── Report card ───────────────────────────────────────────────────────────────
function ReportCard({ report }) {
  const navigate = useNavigate();
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [charts, setCharts]   = useState([]);
  const [error, setError]     = useState(null);

  const c = COLOR_MAP[report.color];
  const Icon = report.icon;

  const run = useCallback(async () => {
    if (open) { setOpen(false); return; }
    if (charts.length) { setOpen(true); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await report.charts();
      setCharts(result);
      setOpen(true);
    } catch (e) {
      setError("Failed to load data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [open, charts, report]);

  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} overflow-hidden transition-all`}>
      {/* Card header */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center shrink-0`}>
            <Icon className={`w-5 h-5 ${c.text}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-sm font-bold text-white">{report.title}</h3>
              <span className={`text-[10px] font-semibold ${c.text} ${c.bg} border ${c.border} rounded-full px-2 py-0.5`}>{report.period}</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">{report.desc}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {report.tags.map(tag => (
                <span key={tag} className="text-[10px] text-slate-500 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">{tag}</span>
              ))}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button onClick={run} disabled={loading}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl transition-all disabled:opacity-40 ${
                open ? `${c.text} ${c.bg} border ${c.border}` : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              }`}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : open ? "Close" : "Run Report"}
              {!loading && !open && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded charts */}
      {error && (
        <div className="px-5 pb-5 text-xs text-amber-400">{error}</div>
      )}
      {open && charts.length > 0 && (
        <div className="px-5 pb-5 space-y-4 border-t border-slate-700/40 pt-5">
          {charts.map((cfg, i) => (
            <DemoChartCard key={i} config={cfg} height={220} />
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={() => navigate("/onboarding")}
              className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-500/20 flex items-center gap-1.5">
              Use with your data <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => navigate("/query")}
              className="text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-4 py-2 rounded-xl transition-colors">
              Customise in Query Builder →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ExplorePublic() {
  return (
    <DemoShell>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <BarChart2 className="w-5 h-5 text-violet-400" />
            <h1 className="text-lg font-bold text-white">Reports</h1>
            <span className="text-[10px] font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-2.5 py-0.5">Sample dashboards</span>
          </div>
          <p className="text-sm text-slate-500">
            Pre-built report templates powered by live World Bank data. Click <strong className="text-slate-400">Run Report</strong> to load charts instantly — no login required.
          </p>
        </div>

        {/* Explainer banner */}
        <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-300 mb-1">This is the demo. Imagine it on your data.</p>
            <p className="text-[11px] text-slate-500">
              When connected to your organisation, Newsconseen replaces these global indicators with your actual clients, revenue, staff, and inventory — and Idjwi monitors it all autonomously.
            </p>
          </div>
          <a href="/onboarding"
            className="shrink-0 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-500/20 whitespace-nowrap flex items-center gap-1.5">
            Start free <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Report cards */}
        <div className="space-y-4">
          {REPORTS.map(report => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>

        {/* Footer nudge */}
        <div className="text-center py-8">
          <p className="text-sm text-slate-400 mb-4">
            Every report above is built from the same data platform your organisation would use.
          </p>
          <a href="/onboarding"
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-xl shadow-emerald-500/20">
            Set up your organisation <ArrowRight className="w-4 h-4" />
          </a>
          <p className="text-xs text-slate-600 mt-3">Free to start · No credit card needed</p>
        </div>

      </div>
    </DemoShell>
  );
}
