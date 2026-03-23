import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import ResearchInputBar from "@/components/marketintelligence/ResearchInputBar";
import ResearchHistory from "@/components/marketintelligence/ResearchHistory";
import LocationOverviewSection from "@/components/marketintelligence/LocationOverviewSection";
import EconomicProfileSection from "@/components/marketintelligence/EconomicProfileSection";
import InfrastructureSection from "@/components/marketintelligence/InfrastructureSection";
import CompetitorSection from "@/components/marketintelligence/CompetitorSection";
import OpportunityScoreSection from "@/components/marketintelligence/OpportunityScoreSection";
import CompareLocations from "@/components/marketintelligence/CompareLocations";
import FinancialContextSection from "@/components/marketintelligence/FinancialContextSection";
import NewsSection from "@/components/marketintelligence/NewsSection";
import EnvironmentSection from "@/components/marketintelligence/EnvironmentSection";
import LaborMarketSection from "@/components/marketintelligence/LaborMarketSection";
import ForecastingModule from "@/components/marketintelligence/ForecastingModule";
import { executeSQL } from "@/components/querybuilder/sqlEngine";
import { Button } from "@/components/ui/button";
import { BookmarkPlus, Loader2, Download, Building2, ExternalLink, Code2, ChevronDown, X, FileText } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import * as XLSX from "xlsx";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const HISTORY_KEY_PREFIX = "mi_history_";

// ── US detection helpers ────────────────────────────────────────────────────
const US_STATES = [
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
  "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
  "minnesota","mississippi","missouri","montana","nebraska","nevada",
  "new hampshire","new jersey","new mexico","new york","north carolina",
  "north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island",
  "south carolina","south dakota","tennessee","texas","utah","vermont",
  "virginia","washington","west virginia","wisconsin","wyoming",
];
const US_ABBREVS = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","USA","US",
];

function detectUS(loc) {
  const lower = loc.toLowerCase();
  const upper = loc.toUpperCase();
  if (/^\d{5}$/.test(loc.trim())) return true;
  if (US_STATES.some(s => lower.includes(s))) return true;
  if (US_ABBREVS.some(a => upper.includes(a))) return true;
  if (lower.includes("united states") || lower.includes("usa")) return true;
  return false;
}

function extractState(loc) {
  const lower = loc.toLowerCase();
  const found = US_STATES.find(s => lower.includes(s));
  return found ? found.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : null;
}

function extractCountry(loc) {
  const parts = loc.split(",");
  return parts[parts.length - 1].trim() || loc;
}

// ── Business type mappings ──────────────────────────────────────────────────
const BIZ_TO_OCCUPATION = {
  // Healthcare
  home_healthcare:  "registered_nurse",
  clinic:           "registered_nurse",
  pharmacy:         "pharmacist",
  nursing_home:     "nursing_assistant",
  hospital:         "registered_nurse",
  dental:           "dentist",
  physiotherapy:    "physical_therapist",
  mental_health:    "social_worker",
  veterinary:       "veterinarian",
  // Education
  school:           "teacher",
  university:       "teacher",
  tutoring:         "teacher",
  training_center:  "teacher",
  childcare:        "childcare_worker",
  // Community / Faith
  church:           "social_worker",
  mosque:           "social_worker",
  temple:           "social_worker",
  ngo_program:      "social_worker",
  community_center: "social_worker",
  charity:          "social_worker",
  // Agriculture
  livestock_farm:   "farm_worker",
  crop_farm:        "farm_worker",
  animal_barn:      "farm_worker",
  aquaculture:      "farm_worker",
  // Business
  restaurant:       "restaurant_cook",
  hotel:            "hotel_worker",
  gym:              "fitness_trainer",
  retail:           "retail_worker",
  coworking:        "office_manager",
  other:            "general_worker",
};

const BIZ_TO_STOCK = {
  home_healthcare: "AMED",
  clinic:          "UNH",
  pharmacy:        "CVS",
  school:          "STRA",
  restaurant:      "MCD",
  hotel:           "MAR",
  gym:             "PLNT",
  nursing_home:    "ENSG",
  hospital:        "HCA",
  livestock_farm:  "TSN",
  crop_farm:       "ADM",
  church:          null,
  ngo_program:     null,
  childcare:       null,
  other:           null,
};

const REVENUE_TYPES = [
  "service_fee", "tuition", "donation", "tithe", "grant",
  "livestock_sale", "crop_sale", "product_sale", "income",
  "event_income", "membership_fee", "sale_service",
];

const AGRICULTURAL_TYPES = ["livestock_farm", "crop_farm", "animal_barn", "aquaculture"];

const COMMODITY_MAP = {
  livestock_farm: "cattle",
  crop_farm:      "wheat",
  animal_barn:    "cattle",
  aquaculture:    "fish",
};

const BIZ_NEWS_TERMS = {
  home_healthcare:  "home health care services",
  clinic:           "medical clinic healthcare",
  pharmacy:         "pharmacy medicine drugs",
  nursing_home:     "nursing home elderly care",
  hospital:         "hospital healthcare medical",
  dental:           "dental practice clinic",
  physiotherapy:    "physical therapy rehabilitation",
  mental_health:    "mental health counseling services",
  veterinary:       "veterinary animal health",
  school:           "school education students",
  university:       "university college education",
  childcare:        "childcare daycare children",
  tutoring:         "tutoring education learning",
  training_center:  "vocational training skills",
  church:           "church community faith",
  mosque:           "mosque community islamic",
  temple:           "temple worship community",
  community_center: "community center social services",
  ngo_program:      "nonprofit charity development",
  charity:          "charity nonprofit fundraising",
  livestock_farm:   "livestock farming agriculture",
  crop_farm:        "agriculture farming crops",
  animal_barn:      "farm animals livestock",
  aquaculture:      "aquaculture fish farming",
  restaurant:       "restaurant food service",
  hotel:            "hotel hospitality tourism",
  gym:              "fitness gym health wellness",
  retail:           "retail store shopping",
  coworking:        "coworking office workspace",
  other:            "business services",
};

function buildNewsQuery(bizType, location) {
  const term = BIZ_NEWS_TERMS[bizType] || bizType.replace(/_/g, " ");
  const country = location.split(",").slice(-1)[0].trim();
  return `${term} ${country}`;
}

export function getBizCategory(bizType) {
  if (["home_healthcare","clinic","pharmacy","nursing_home","hospital","dental","physiotherapy","mental_health","veterinary"].includes(bizType)) return "healthcare";
  if (["school","university","childcare","tutoring","training_center"].includes(bizType)) return "education";
  if (["church","mosque","temple","community_center","ngo_program","charity"].includes(bizType)) return "community";
  if (AGRICULTURAL_TYPES.includes(bizType)) return "agriculture";
  return "business";
}

// ── Section status config ───────────────────────────────────────────────────
const SECTION_STATUS = [
  { key: "overview",       label: "Location" },
  { key: "economy_us",     label: "Economy", altKey: "economy_intl" },
  { key: "fed",            label: "Financial" },
  { key: "wages",          label: "Labor" },
  { key: "infrastructure", label: "Infrastructure" },
  { key: "competitors",    label: "Competitors" },
  { key: "environment",    label: "Climate" },
  { key: "air_quality",    label: "Air" },
  { key: "news",           label: "News" },
  { key: "market",         label: "Market Size" },
  { key: "commodity",      label: "Commodities", agriculturalOnly: true },
  { key: "sector_stock",   label: "Sector Stock" },
];

// ── Report sections builder ─────────────────────────────────────────────────
function buildReportSections(results) {
  const sections = [];
  const ov    = results.overview?.[0]    || {};
  const mkt   = results.market?.[0]      || {};
  const eco   = results.economy_us?.[0]  || results.economy_intl?.[0] || {};
  const env   = results.environment?.[0] || {};
  const wages = results.wages?.[0]       || {};
  const competitors = (results.competitors || []).filter(c => c.distance_km > 0);

  sections.push({ type: "heading", content: `Market Analysis: ${results.businessType} in ${results.location}` });
  sections.push({ type: "text", content: `Location: ${ov.city || results.location}, ${ov.country || ""}\nCoordinates: ${ov.lat}, ${ov.lon}\nCurrency: ${ov.currency || "USD"}\nLanguage: ${ov.language || ""}` });

  if (Object.keys(eco).length > 0) {
    sections.push({ type: "text", content: `Economic Profile:\nPopulation: ${(eco.total_population || eco.population)?.toLocaleString() || "N/A"}\nMedian Income: $${eco.median_household_income?.toLocaleString() || "N/A"}\nMedian Age: ${eco.median_age || "N/A"} years\nPoverty Rate: ${eco.poverty_rate_pct || "N/A"}%\nUnemployment: ${eco.unemployment_rate_pct || "N/A"}%` });
  }

  sections.push({ type: "text", content: `Market Opportunity:\nOpportunity Score: ${mkt.opportunity_score || "N/A"}/100\nMarket Status: ${mkt.market_status || "N/A"}\nEstimated Annual Market: $${mkt.annual_market_usd?.toLocaleString() || "N/A"}\nExisting Competitors: ${mkt.existing_competitors || "N/A"}\nSupply Gap: ${mkt.supply_gap || "N/A"} providers needed\nRecommendation: ${mkt.recommendation || "N/A"}` });

  if (competitors.length > 0) {
    sections.push({ type: "text", content: `Competitors Found: ${competitors.length}\n${competitors.slice(0, 5).map(c => `- ${c.name} (${c.distance_km}km away)`).join("\n")}` });
  }

  if (env.overall_risk_level) {
    sections.push({ type: "text", content: `Environmental Factors:\nClimate Risk: ${env.overall_risk_level}\nSuitable for Elderly: ${env.suitable_for_elderly}\nBusiness Climate: ${env.business_climate_rating}` });
  }

  if (wages.occupation) {
    sections.push({ type: "text", content: `Labor Market (${wages.state || "National"}):\nRole: ${wages.occupation}\nMedian Salary: $${(wages.state_estimated_median || wages.national_median_salary)?.toLocaleString()}/year\nDemand: ${wages.demand_signal}\nHiring: ${wages.hiring_difficulty}` });
  }

  return sections;
}

export default function MarketIntelligence() {
  const [currentUser, setCurrentUser] = useState(null);
  const [params, setParams] = useState({ location: "", businessType: "home_healthcare", radiusKm: 30 });
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState(null);
  const [compareResults, setCompareResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [queryLog, setQueryLog] = useState([]);
  const [showQueries, setShowQueries] = useState(false);
  const [editingQuery, setEditingQuery] = useState(null);
  const [showQueryEditor, setShowQueryEditor] = useState(false);
  const [operationalContext, setOperationalContext] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    base44.auth.me().then(u => {
      setCurrentUser(u);
      const saved = localStorage.getItem(`${HISTORY_KEY_PREFIX}${u?.email}`);
      if (saved) setHistory(JSON.parse(saved));
    }).catch(() => {});
  }, []);

  const { data: myEnterprises = [] } = useQuery({
    queryKey: ["mi_enterprises", currentUser?.company_id],
    queryFn: () => base44.entities.Enterprise.filter({ company_id: currentUser.company_id }),
    enabled: !!currentUser?.company_id,
  });

  const saveToHistory = useCallback((location, businessType, score) => {
    if (!currentUser?.email) return;
    const entry = { location, businessType, score, ts: Date.now() };
    const key = `${HISTORY_KEY_PREFIX}${currentUser.email}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    const updated = [entry, ...existing.filter(e => !(e.location === location && e.businessType === businessType))].slice(0, 5);
    localStorage.setItem(key, JSON.stringify(updated));
    setHistory(updated);
  }, [currentUser]);

  const runAnalysis = useCallback(async (overrideParams) => {
    const p = overrideParams || params;
    if (!p.location.trim()) {
      toast({ title: "Enter a location", description: "Type a city, state, or country to analyze.", variant: "destructive" });
      return;
    }
    setRunning(true);
    setResults(null);
    setCompareResults([]);
    setQueryLog([]);
    setOperationalContext(null);

    const loc    = p.location.trim();
    const biz    = p.businessType;
    const radius = p.radiusKm;
    const isUS   = detectUS(loc);
    const stateName   = extractState(loc);
    const countryName = extractCountry(loc);

    // Initialize so sections start rendering immediately
    setResults({ location: loc, businessType: biz, radiusKm: radius, isUS, stateName, loading: true });

    const runSection = async (key, sql) => {
      setQueryLog(prev => [...prev, { section: key, sql, status: "running", rows: null, error: null, ts: Date.now() }]);
      try {
        const res = await executeSQL(sql, {});
        const rows = res.rows || [];
        setQueryLog(prev => prev.map(q => q.section === key ? { ...q, status: "done", rows: rows.length } : q));
        setResults(prev => ({ ...(prev || {}), [key]: rows }));
        return rows;
      } catch (e) {
        setQueryLog(prev => prev.map(q => q.section === key ? { ...q, status: "error", error: e.message } : q));
        setResults(prev => ({ ...(prev || {}), [key]: [], [`${key}_error`]: e.message }));
        return [];
      }
    };

    const isAgricultural = AGRICULTURAL_TYPES.includes(biz);
    const newsQuery = buildNewsQuery(biz, loc);

    // Run ALL sections simultaneously
    const allSettledResults = await Promise.allSettled([
      runSection("overview",      `SELECT * FROM geo_overview WHERE place = '${loc}'`),
      runSection("infrastructure",`SELECT * FROM geo_infrastructure WHERE city = '${loc}' AND radius_km = ${radius}`),
      runSection("competitors",   `SELECT * FROM geo_competitors WHERE city = '${loc}' AND business_type = '${biz}' AND radius_km = ${radius}`),
      isUS && stateName
        ? runSection("economy_us",  `SELECT * FROM us_state WHERE state = '${stateName}'`)
        : runSection("economy_intl",`SELECT * FROM geo_economy WHERE country = '${countryName}'`),
      runSection("environment",   `SELECT * FROM climate_risk WHERE city = '${loc}'`),
      runSection("air_quality",   `SELECT * FROM air_quality WHERE city = '${loc}'`),
      runSection("news",          `SELECT * FROM news_search WHERE query = '${newsQuery}' AND limit = 5`),
      isUS
        ? runSection("wages", `SELECT * FROM bls_wages WHERE occupation = '${BIZ_TO_OCCUPATION[biz] || "registered_nurse"}'${stateName ? ` AND state = '${stateName}'` : ""}`)
        : Promise.resolve([]),
      runSection("market",        `SELECT * FROM geo_market_size WHERE city = '${loc}' AND business_type = '${biz}' AND radius_km = ${radius}`),
      runSection("fed",           `SELECT * FROM fed_rates WHERE series = 'FEDFUNDS' AND year_from = '2023'`),
      BIZ_TO_STOCK[biz]
        ? runSection("sector_stock", `SELECT * FROM stock_quote WHERE symbol = '${BIZ_TO_STOCK[biz]}'`)
        : Promise.resolve([]),
      isAgricultural
        ? runSection("commodity",   `SELECT * FROM commodity_price WHERE commodity = '${COMMODITY_MAP[biz] || "all"}'`)
        : Promise.resolve([]),
      isAgricultural
        ? runSection("farm_weather", `SELECT * FROM geo_weather_profile WHERE city = '${loc}'`)
        : Promise.resolve([]),
    ]);
    const marketResult = allSettledResults[8];

    setResults(prev => ({ ...prev, loading: false, isUS, stateName, isAgricultural }));

    const marketRows = marketResult?.value;
    const score = Array.isArray(marketRows) ? marketRows[0]?.opportunity_score : undefined;
    if (score !== undefined) saveToHistory(loc, biz, score);

    setRunning(false);
  }, [params, saveToHistory, toast]);

  // Comparison location analysis
  const runComparisonAnalysis = async (loc) => {
    const biz    = params.businessType || results?.businessType;
    const radius = params.radiusKm     || results?.radiusKm || 30;
    const isUSLoc = detectUS(loc);
    const stateN  = extractState(loc);
    const countryN = extractCountry(loc);

    const [overviewRes, marketRes, economyRes, competitorsRes, climateRes, wagesRes] = await Promise.all([
      executeSQL(`SELECT * FROM geo_overview WHERE place = '${loc}'`, {}).then(r => r.rows?.[0] || null).catch(() => null),
      executeSQL(`SELECT * FROM geo_market_size WHERE city = '${loc}' AND business_type = '${biz}' AND radius_km = ${radius}`, {}).then(r => r.rows?.[0] || null).catch(() => null),
      isUSLoc && stateN
        ? executeSQL(`SELECT * FROM us_state WHERE state = '${stateN}'`, {}).then(r => r.rows?.[0] || null).catch(() => null)
        : executeSQL(`SELECT * FROM geo_economy WHERE country = '${countryN}'`, {}).then(r => r.rows?.[0] || null).catch(() => null),
      executeSQL(`SELECT * FROM geo_competitors WHERE city = '${loc}' AND business_type = '${biz}' AND radius_km = ${radius}`, {}).then(r => r.rows || []).catch(() => []),
      executeSQL(`SELECT * FROM climate_risk WHERE city = '${loc}'`, {}).then(r => r.rows?.[0] || null).catch(() => null),
      isUSLoc && stateN
        ? executeSQL(`SELECT * FROM bls_wages WHERE occupation = '${BIZ_TO_OCCUPATION[biz] || "registered_nurse"}' AND state = '${stateN}'`, {}).then(r => r.rows?.[0] || null).catch(() => null)
        : Promise.resolve(null),
    ]);

    return {
      location: loc,
      loading: false,
      overview: overviewRes,
      market: marketRes,
      economy: economyRes,
      competitors: competitorsRes,
      climate: climateRes,
      wages: wagesRes,
      opportunity_score:  marketRes?.opportunity_score,
      annual_market_usd:  marketRes?.annual_market_usd,
      competitor_count:   competitorsRes.filter(c => c.distance_km > 0).length,
      population:         economyRes?.total_population || economyRes?.population,
      median_income:      economyRes?.median_household_income || economyRes?.gdp_per_capita_usd,
      climate_risk:       climateRes?.overall_risk_level,
      labor_cost:         wagesRes?.state_estimated_median || wagesRes?.national_median_salary,
    };
  };

  const handleSaveReport = async () => {
    if (!results || !currentUser) return;
    setSaving(true);
    try {
      let folders = await base44.entities.ChartFolder.filter({
        name: "Market Research",
        company_id: currentUser.company_id,
      });
      let folderId;
      if (folders.length === 0) {
        const f = await base44.entities.ChartFolder.create({ name: "Market Research", icon: "🌍", color: "#10b981", company_id: currentUser.company_id });
        folderId = f.id;
      } else {
        folderId = folders[0].id;
      }
      await base44.entities.Report.create({
        title: `Market Analysis: ${results.businessType} in ${results.location}`,
        description: `Market intelligence report. Opportunity score: ${results.market?.[0]?.opportunity_score ?? "N/A"}/100`,
        status: "published",
        folder_id: folderId,
        company_id: currentUser.company_id,
        sections: buildReportSections(results),
        is_public: false,
      });
      toast({ title: "Report saved", description: "View it in the Reports page under Market Research folder." });
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleExportExcel = () => {
    if (!results) return;
    const wb = XLSX.utils.book_new();
    const sheets = [
      ["Overview",          results.overview],
      ["Economy",           results.economy_us || results.economy_intl],
      ["Infrastructure",    results.infrastructure],
      ["Competitors",       results.competitors],
      ["Market Opportunity",results.market],
      ["Labor Market",      results.wages],
      ["Environment",       results.environment],
      ["News",              results.news],
    ];
    sheets.forEach(([name, data]) => {
      if (data?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), name);
    });
    const safeLoc = results.location.replace(/[^a-zA-Z0-9]/g, "_");
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `market_analysis_${safeLoc}_${date}.xlsx`);
  };

  // Nearby enterprises
  const nearbyEnterprises = results?.location
    ? myEnterprises.filter(e =>
        results.location.toLowerCase().includes(e.city?.toLowerCase() || "XXXXXXX") ||
        results.location.toLowerCase().includes(e.region?.toLowerCase() || "XXXXXXX")
      )
    : [];

  // Operational context for nearby enterprises
  useEffect(() => {
    if (!nearbyEnterprises?.length || !currentUser) return;
    setOperationalContext(null);
    const enterpriseNames = nearbyEnterprises.map(e => e.enterprise_name);
    const loadCtx = async () => {
      try {
        const [allTasks, allTxns, allPeople] = await Promise.all([
          base44.entities.Task.filter({ company_id: currentUser.company_id }),
          base44.entities.Transaction.filter({ company_id: currentUser.company_id }),
          base44.entities.Person.filter({ company_id: currentUser.company_id }),
        ]);
        const tasks = allTasks.filter(t => enterpriseNames.includes(t.enterprise));
        const txns  = allTxns.filter(t => enterpriseNames.includes(t.enterprise) && REVENUE_TYPES.includes(t.transaction_type) && t.payment_status === "paid");
        const people = allPeople.filter(p => enterpriseNames.includes(p.enterprise));
        const totalRevenue = txns.reduce((s, t) => s + (t.amount || 0), 0);
        const completionRate = tasks.length > 0 ? Math.round(tasks.filter(t => t.status === "completed").length / tasks.length * 100) : null;
        setOperationalContext({ enterprises: nearbyEnterprises.length, total_staff: people.filter(p => p.person_type === "employee").length, total_clients: people.filter(p => p.person_type === "client").length, total_revenue: totalRevenue, task_completion: completionRate, total_tasks: tasks.length });
      } catch {}
    };
    loadCtx();
  }, [nearbyEnterprises?.length, currentUser?.company_id]);

  const sectionDone = (key, altKey) =>
    !!(results?.[key] || (altKey && results?.[altKey]));

  return (
    <div className="flex flex-col gap-0 min-h-full">
      {/* Sticky input bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-100 pb-3 pt-2 shadow-sm no-print">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <ResearchInputBar params={params} onChange={setParams} onRun={runAnalysis} running={running} />
          </div>
          {results && !results.loading && (
            <>
              <Button onClick={handleSaveReport} disabled={saving} variant="outline" className="mt-6 shrink-0">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BookmarkPlus className="w-4 h-4 mr-2" />}
                Save Report
              </Button>
              <Button onClick={handleExportExcel} variant="outline" className="mt-6 shrink-0">
                <Download className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
              <Button
                onClick={() => window.print()}
                variant="outline"
                className="mt-6 shrink-0 no-print"
              >
                <FileText className="w-4 h-4 mr-2" />
                Print Report
              </Button>
            </>
          )}
        </div>

        {/* Progress status pills */}
        {running && (
          <div className="flex gap-2 flex-wrap pt-2">
            {SECTION_STATUS
              .filter(s => !s.agriculturalOnly || results?.isAgricultural)
              .map(s => {
                const done = sectionDone(s.key, s.altKey);
                return (
                  <span key={s.key} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${done ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-400"}`}>
                    {done ? "✅" : <Loader2 className="w-3 h-3 animate-spin" />}
                    {s.label}
                  </span>
                );
              })}
          </div>
        )}
      </div>

      <div className="flex gap-6 pt-6 flex-col xl:flex-row">
        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          {!results && !running && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="text-6xl mb-4">🌍</div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Market Intelligence</h2>
              <p className="text-slate-500 max-w-md">
                Enter a location and business type above to generate a complete market analysis — demographics, competitors, infrastructure, financial context, and opportunity score.
              </p>
            </div>
          )}

          {(results || running) && (
            <>
              {/* 1. Location Overview */}
              <LocationOverviewSection data={results?.overview} loading={running && !results?.overview} />

              {/* 2. Financial Context */}
              <FinancialContextSection
                fedData={results?.fed}
                stockData={results?.sector_stock}
                businessType={results?.businessType}
                isUS={results?.isUS}
                loading={running && !results?.fed}
              />

              {/* 3. Economic Profile */}
              <EconomicProfileSection
                usData={results?.economy_us}
                intlData={results?.economy_intl}
                isUS={results?.isUS}
                loading={running && !results?.economy_us && !results?.economy_intl}
              />

              {/* 4. Labor Market (US only) */}
              {(results?.isUS || running) && (
                <LaborMarketSection
                  data={results?.wages}
                  businessType={results?.businessType}
                  stateName={results?.stateName}
                  loading={running && !results?.wages}
                />
              )}

              {/* 5. Infrastructure */}
              <InfrastructureSection data={results?.infrastructure} location={results?.location} loading={running && !results?.infrastructure} />

              {/* 6. Competitors */}
              <CompetitorSection data={results?.competitors} businessType={results?.businessType} location={results?.location} radiusKm={results?.radiusKm} loading={running && !results?.competitors} />

              {/* 7. Environment */}
              <EnvironmentSection climateData={results?.environment} airData={results?.air_quality} loading={running && !results?.environment} />

              {/* 8. News */}
              <NewsSection data={results?.news} location={results?.location} businessType={results?.businessType} loading={running && !results?.news} />

              {/* 9. Market Opportunity Score */}
              <OpportunityScoreSection data={results?.market} infrastructure={results?.infrastructure} economy={results?.economy_us || results?.economy_intl} isUS={results?.isUS} businessType={results?.businessType} loading={running && !results?.market} />

              {/* Agricultural Commodity Context */}
              {results?.isAgricultural && results?.commodity?.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h3 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    🌾 Commodity Market Context
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {results.commodity.map((c, i) => (
                      <div key={i} className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                        <p className="text-xs font-bold text-amber-700 capitalize">{c.commodity}</p>
                        <p className="text-lg font-black text-amber-800">${c.price_usd}</p>
                        <p className="text-[10px] text-amber-500">{c.unit}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 10. Growth Factor Forecasting */}
              {results?.market?.[0]?.opportunity_score != null && (() => {
                const bizCategory = getBizCategory(results.businessType);
                const ecoData = results.economy_us?.[0] || results.economy_intl?.[0];
                const incomeScore = (() => { const inc = ecoData?.median_household_income || ecoData?.gdp_per_capita_usd || 0; return inc > 70000 ? 85 : inc > 40000 ? 65 : inc > 20000 ? 45 : 30; })();
                const infraScore = parseInt(results.infrastructure?.find(r => r.infrastructure_type === "OVERALL SCORE")?.availability) || 50;
                const mktSize = Math.min(100, (results.market[0].annual_market_usd || 0) / 1000000);
                const lowComp = Math.max(0, 100 - ((results.market[0].existing_competitors || 0) / Math.max(results.market[0].ideal_market_units || 5, 1)) * 100);
                const elderlyPct = ecoData?.population_over65_pct || 10;
                const youthPct   = ecoData?.population_under18_pct || 25;
                const popScore   = Math.min(100, ((ecoData?.total_population || ecoData?.population || 50000) / 500000) * 100);
                const radarByCategory = {
                  healthcare:  [{ metric: "Market Size", value: mktSize }, { metric: "Low Competition", value: lowComp }, { metric: "Elderly Pop %", value: Math.min(100,(elderlyPct/20)*100) }, { metric: "Income Level", value: incomeScore }, { metric: "Infrastructure", value: infraScore }],
                  education:   [{ metric: "Market Size", value: mktSize }, { metric: "Low Competition", value: lowComp }, { metric: "Youth Pop %",   value: Math.min(100,(youthPct/35)*100) }, { metric: "Income Level", value: incomeScore }, { metric: "Infrastructure", value: infraScore }],
                  community:   [{ metric: "Market Size", value: mktSize }, { metric: "Low Competition", value: lowComp }, { metric: "Population",     value: popScore }, { metric: "Economic Need", value: 100 - incomeScore }, { metric: "Infrastructure", value: infraScore }],
                  agriculture: [{ metric: "Market Size", value: mktSize }, { metric: "Low Competition", value: lowComp }, { metric: "Rural Score",    value: Math.max(0, 100 - popScore) }, { metric: "Income Level", value: incomeScore }, { metric: "Infrastructure", value: infraScore }],
                  business:    [{ metric: "Market Size", value: mktSize }, { metric: "Low Competition", value: lowComp }, { metric: "Income Level",   value: incomeScore }, { metric: "Population", value: popScore }, { metric: "Infrastructure", value: infraScore }],
                };
                return (
                  <ForecastingModule
                    baseScore={results.market[0].opportunity_score}
                    baseRadarData={radarByCategory[bizCategory] || radarByCategory.business}
                  />
                );
              })()}

              {/* 10. Your Operations Nearby */}
              {nearbyEnterprises.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-500" />
                    Your Operations in This Area
                  </h3>
                  <div className="flex flex-col gap-3">
                    {nearbyEnterprises.map(e => (
                      <div key={e.id} className="flex items-start justify-between gap-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{e.enterprise_name}</p>
                          <p className="text-xs text-slate-500">{[e.city, e.region, e.country].filter(Boolean).join(", ")}</p>
                          {e.status && <p className="text-xs text-emerald-600 font-medium mt-0.5">{e.status}</p>}
                        </div>
                        <Link to={createPageUrl("Enterprises")} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 whitespace-nowrap shrink-0">
                          View <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    ))}

                  {operationalContext && (
                    <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100">
                      {[
                        { label: "Clients", value: operationalContext.total_clients, color: "text-slate-800" },
                        { label: "Staff", value: operationalContext.total_staff, color: "text-slate-800" },
                        { label: "Revenue", value: operationalContext.total_revenue > 0 ? `$${operationalContext.total_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—", color: "text-emerald-600" },
                        { label: "Task Done", value: operationalContext.task_completion != null ? `${operationalContext.task_completion}%` : "—", color: "text-blue-600" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="text-center">
                          <p className={`text-lg font-black ${color}`}>{value}</p>
                          <p className="text-xs text-slate-400">{label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {operationalContext && results?.market?.[0] && (
                    <div className="mt-3 pt-3 border-t border-slate-100 bg-blue-50 rounded-xl p-3">
                      <p className="text-xs font-bold text-blue-700 mb-1">📊 Market vs Your Performance</p>
                      <p className="text-xs text-blue-600">Market score: <strong>{results.market[0].opportunity_score}/100</strong></p>
                      <p className="text-xs text-blue-600 mt-1">You serve <strong>{operationalContext.total_clients} clients</strong> — addressable market: <strong>${(results.market[0].annual_market_usd || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr</strong></p>
                    </div>
                  )}
                  </div>
                </div>
              )}

              {/* 11. Compare Locations */}
              {results && !results.loading && (
                <CompareLocations
                  primaryLocation={results.location}
                  businessType={results.businessType}
                  radiusKm={results.radiusKm}
                  primaryScore={results.market?.[0]?.opportunity_score}
                  primaryEconomy={results.economy_us?.[0] || results.economy_intl?.[0]}
                  primaryCompetitors={results.competitors}
                  compareResults={compareResults}
                  onAddLocation={async (loc) => {
                    const r = await runComparisonAnalysis(loc);
                    setCompareResults(prev => [...prev, r]);
                  }}
                  onRemoveLocation={(i) => setCompareResults(prev => prev.filter((_, idx) => idx !== i))}
                />
              )}
            </>
          )}
        </div>

        {/* History + Query Log sidebar */}
        <div className="xl:w-64 shrink-0 space-y-4">
          <ResearchHistory
            history={history}
            onSelect={(entry) => {
              const p = { location: entry.location, businessType: entry.businessType, radiusKm: 30 };
              setParams(p);
              runAnalysis(p);
            }}
          />

          {/* Queries Used Panel */}
          {queryLog.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowQueries(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-slate-400" />
                  Queries Used ({queryLog.length})
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showQueries ? "rotate-180" : ""}`} />
              </button>
              {showQueries && (
                <div className="border-t border-slate-100 divide-y divide-slate-50 max-h-96 overflow-y-auto">
                  {queryLog.map((q, i) => (
                    <div key={i} className="px-3 py-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">{q.section.replace(/_/g, " ")}</span>
                        <div className="flex items-center gap-1.5">
                          {q.status === "running" && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                          {q.status === "done" && <span className="text-[10px] text-emerald-500">{q.rows} rows</span>}
                          {q.status === "error" && <span className="text-[10px] text-rose-500">error</span>}
                          <button
                            onClick={() => { setEditingQuery({ ...q, index: i }); setShowQueryEditor(true); }}
                            className="text-[10px] text-slate-400 hover:text-emerald-500 transition-colors"
                            title="Edit and rerun"
                          >✏️</button>
                        </div>
                      </div>
                      <pre className="text-[10px] font-mono text-slate-400 whitespace-pre-wrap line-clamp-2 leading-4">{q.sql}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    {/* Query Editor Modal */}
    {showQueryEditor && editingQuery && (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-800">Edit Query — {editingQuery.section.replace(/_/g, " ")}</h3>
            <button onClick={() => setShowQueryEditor(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5">
            <textarea
              value={editingQuery.sql}
              onChange={e => setEditingQuery(prev => ({ ...prev, sql: e.target.value }))}
              className="w-full h-40 font-mono text-sm bg-slate-900 text-emerald-300 rounded-xl p-4 outline-none resize-none border border-slate-700"
            />
            {editingQuery.error && <p className="text-xs text-rose-500 mt-2">Error: {editingQuery.error}</p>}
          </div>
          <div className="flex gap-3 px-5 pb-5">
            <button
              onClick={async () => {
                const newSql = editingQuery.sql;
                const key = editingQuery.section;
                const idx = editingQuery.index;
                setShowQueryEditor(false);
                try {
                  const res = await executeSQL(newSql, {});
                  const rows = res.rows || [];
                  setResults(prev => ({ ...(prev || {}), [key]: rows }));
                  setQueryLog(prev => prev.map((q, i) => i === idx ? { ...q, sql: newSql, status: "done", rows: rows.length, error: null } : q));
                } catch (e) {
                  setQueryLog(prev => prev.map((q, i) => i === idx ? { ...q, sql: newSql, status: "error", error: e.message } : q));
                }
              }}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 font-semibold text-sm"
            >
              ▶ Run Updated Query
            </button>
            <button onClick={() => setShowQueryEditor(false)} className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm">
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}