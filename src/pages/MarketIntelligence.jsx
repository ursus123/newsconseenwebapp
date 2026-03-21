import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import ResearchInputBar from "@/components/marketintelligence/ResearchInputBar";
import ResearchHistory from "@/components/marketintelligence/ResearchHistory";
import LocationOverviewSection from "@/components/marketintelligence/LocationOverviewSection";
import EconomicProfileSection from "@/components/marketintelligence/EconomicProfileSection";
import InfrastructureSection from "@/components/marketintelligence/InfrastructureSection";
import CompetitorSection from "@/components/marketintelligence/CompetitorSection";
import OpportunityScoreSection from "@/components/marketintelligence/OpportunityScoreSection";
import CompareLocations from "@/components/marketintelligence/CompareLocations";
import { executeSQL } from "@/components/querybuilder/sqlEngine";
import { Button } from "@/components/ui/button";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const HISTORY_KEY_PREFIX = "mi_history_";

export default function MarketIntelligence() {
  const [currentUser, setCurrentUser] = useState(null);
  const [params, setParams] = useState({ location: "", businessType: "home_healthcare", radiusKm: 30 });
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState(null);
  const [compareLocations, setCompareLocations] = useState([]);
  const [history, setHistory] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    base44.auth.me().then(u => {
      setCurrentUser(u);
      const saved = localStorage.getItem(`${HISTORY_KEY_PREFIX}${u?.email}`);
      if (saved) setHistory(JSON.parse(saved));
    }).catch(() => {});
  }, []);

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
    setCompareLocations([]);

    const loc = p.location.trim();
    const biz = p.businessType;
    const radius = p.radiusKm;

    const newResults = { location: loc, businessType: biz, radiusKm: radius };

    // Run all sections in parallel where possible, populating results progressively
    const runSection = async (key, sql) => {
      try {
        const res = await executeSQL(sql, {});
        setResults(prev => ({ ...(prev || newResults), [key]: res.rows || [] }));
        return res.rows || [];
      } catch (e) {
        setResults(prev => ({ ...(prev || newResults), [key]: [], [`${key}_error`]: e.message }));
        return [];
      }
    };

    // Initialize so sections start rendering
    setResults({ ...newResults, loading: true });

    // Section 1: overview
    await runSection("overview", `SELECT * FROM geo_overview WHERE place = '${loc}'`);

    // Section 2: economy (parallel)
    const isUS = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|usa|united states)\b/i.test(loc);

    if (isUS) {
      const stateMatch = loc.match(/\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i);
      const stateName = stateMatch ? stateMatch[0] : loc;
      await runSection("economy_us", `SELECT * FROM us_state WHERE state = '${stateName}'`);
    } else {
      const countryMatch = loc.split(",").slice(-1)[0].trim() || loc;
      await runSection("economy_intl", `SELECT * FROM geo_economy WHERE country = '${countryMatch}'`);
    }

    // Section 3 & 4: infrastructure + competitors in parallel
    await Promise.all([
      runSection("infrastructure", `SELECT * FROM geo_infrastructure WHERE city = '${loc}' AND radius_km = ${radius}`),
      runSection("competitors", `SELECT * FROM geo_competitors WHERE city = '${loc}' AND business_type = '${biz}' AND radius_km = ${radius}`),
    ]);

    // Section 5: market size
    const marketRows = await runSection("market", `SELECT * FROM geo_market_size WHERE city = '${loc}' AND business_type = '${biz}' AND radius_km = ${radius}`);

    setResults(prev => ({ ...prev, loading: false, isUS }));

    const score = marketRows?.[0]?.opportunity_score;
    if (score !== undefined) saveToHistory(loc, biz, score);

    setRunning(false);
  }, [params, saveToHistory, toast]);

  const handleSaveReport = async () => {
    if (!results || !currentUser) return;
    setSaving(true);
    try {
      // Find or create "Market Research" folder
      let folders = await base44.entities.ChartFolder.filter({ name: "Market Research" });
      let folderId;
      if (folders.length === 0) {
        const f = await base44.entities.ChartFolder.create({
          name: "Market Research",
          icon: "🌍",
          color: "#10b981",
          company_id: currentUser.company_id,
        });
        folderId = f.id;
      } else {
        folderId = folders[0].id;
      }
      await base44.entities.Report.create({
        title: `Market Analysis: ${results.businessType} in ${results.location}`,
        description: `Market intelligence report for ${results.businessType} in ${results.location}. Opportunity score: ${results.market?.[0]?.opportunity_score ?? "N/A"}/100`,
        status: "published",
        folder_id: folderId,
        company_id: currentUser.company_id,
        sections: [
          { type: "heading", content: `Market Analysis: ${results.businessType} in ${results.location}` },
          { type: "text", content: `Location Overview: ${JSON.stringify(results.overview?.[0] || {})}` },
          { type: "text", content: `Market Data: ${JSON.stringify(results.market?.[0] || {})}` },
          { type: "text", content: `Competitors found: ${(results.competitors?.length || 1) - 1}` },
        ],
        is_public: false,
      });
      toast({ title: "Report saved", description: "View it in the Reports page under Market Research folder." });
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-0 min-h-full">
      {/* Sticky input bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-100 pb-4 pt-2 -mx-4 lg:-mx-8 px-4 lg:px-8 shadow-sm">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <ResearchInputBar
              params={params}
              onChange={setParams}
              onRun={runAnalysis}
              running={running}
            />
          </div>
          {results && !results.loading && (
            <Button
              onClick={handleSaveReport}
              disabled={saving}
              variant="outline"
              className="mt-6 shrink-0"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BookmarkPlus className="w-4 h-4 mr-2" />}
              Save Report
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-6 pt-6 flex-col xl:flex-row">
        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          {!results && !running && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="text-6xl mb-4">🌍</div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Market Intelligence</h2>
              <p className="text-slate-500 max-w-md">
                Enter a location and business type above to generate a complete market analysis — demographics, competitors, infrastructure, and opportunity score.
              </p>
            </div>
          )}

          {(results || running) && (
            <>
              <LocationOverviewSection data={results?.overview} loading={running && !results?.overview} />
              <EconomicProfileSection
                usData={results?.economy_us}
                intlData={results?.economy_intl}
                isUS={results?.isUS}
                loading={running && !results?.economy_us && !results?.economy_intl}
              />
              <InfrastructureSection
                data={results?.infrastructure}
                location={results?.location}
                loading={running && !results?.infrastructure}
              />
              <CompetitorSection
                data={results?.competitors}
                businessType={results?.businessType}
                location={results?.location}
                radiusKm={results?.radiusKm}
                loading={running && !results?.competitors}
              />
              <OpportunityScoreSection
                data={results?.market}
                infrastructure={results?.infrastructure}
                economy={results?.economy_us || results?.economy_intl}
                isUS={results?.isUS}
                loading={running && !results?.market}
              />

              {results && !results.loading && (
                <CompareLocations
                  primaryLocation={results.location}
                  businessType={results.businessType}
                  radiusKm={results.radiusKm}
                  primaryScore={results.market?.[0]?.opportunity_score}
                  primaryEconomy={results.economy_us?.[0] || results.economy_intl?.[0]}
                  primaryCompetitors={results.competitors}
                  compareLocations={compareLocations}
                  onAddLocation={(loc) => setCompareLocations(prev => [...prev, loc])}
                  onRemoveLocation={(i) => setCompareLocations(prev => prev.filter((_, idx) => idx !== i))}
                />
              )}
            </>
          )}
        </div>

        {/* History sidebar */}
        <div className="xl:w-64 shrink-0">
          <ResearchHistory
            history={history}
            onSelect={(entry) => {
              const p = { location: entry.location, businessType: entry.businessType, radiusKm: 30 };
              setParams(p);
              runAnalysis(p);
            }}
          />
        </div>
      </div>
    </div>
  );
}