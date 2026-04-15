import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2, BookmarkPlus, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useToast } from "@/components/ui/use-toast";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell
} from "recharts";

function ScoreBadge(score) {
  if (score >= 70) return { label: "STRONG OPPORTUNITY", color: "#10b981", bg: "#ecfdf5" };
  if (score >= 50) return { label: "UNDERSERVED MARKET", color: "#d97706", bg: "#fffbeb" };
  if (score >= 30) return { label: "COMPETITIVE MARKET", color: "#ea580c", bg: "#fff7ed" };
  return { label: "SATURATED MARKET", color: "#e11d48", bg: "#fff1f2" };
}

function SectionBlock({ title, children }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-px flex-1 bg-slate-200" />
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">{title}</h3>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      {children}
    </div>
  );
}

function MetricGrid({ items }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {items.filter(Boolean).map((item, i) => (
        <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{item.label}</p>
          <p className="font-bold text-slate-800 text-sm mt-0.5">{item.value || "—"}</p>
        </div>
      ))}
    </div>
  );
}

export default function MarketIntelligencePDF() {
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [selectedReport, setSelectedReport] = useState(null);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const reportRef = useRef(null);
  const { toast } = useToast();

  const { data: folders = [] } = useQuery({
    queryKey: ["mi_pdf_folders", currentUser?.company_id],
    queryFn: () => base44.entities.ChartFolder.filter({ company_id: currentUser.company_id }),
    enabled: !!currentUser?.company_id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const marketFolder = folders.find(f => f.name === "Market Research");

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["mi_pdf_reports", marketFolder?.id],
    queryFn: () => base44.entities.Report.filter({ folder_id: marketFolder.id }),
    enabled: !!marketFolder?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Parse section text into structured data
  const parseReport = (report) => {
    const sections = report.sections || [];
    const result = { title: report.title, description: report.description };

    sections.forEach(s => {
      if (s.type !== "text" || !s.content) return;
      const lines = s.content.split("\n").map(l => l.trim()).filter(Boolean);
      const heading = lines[0];

      if (heading.includes("Economic Profile")) {
        result.economy = {};
        lines.slice(1).forEach(l => {
          const [k, v] = l.split(":").map(x => x.trim());
          if (k && v) result.economy[k] = v;
        });
      } else if (heading.includes("Market Opportunity")) {
        result.market = {};
        lines.slice(1).forEach(l => {
          const [k, v] = l.split(":").map(x => x.trim());
          if (k && v) result.market[k] = v;
        });
      } else if (heading.includes("Labor Market")) {
        result.labor = {};
        lines.slice(1).forEach(l => {
          const [k, v] = l.split(":").map(x => x.trim());
          if (k && v) result.labor[k] = v;
        });
      } else if (heading.includes("Environmental")) {
        result.environment = {};
        lines.slice(1).forEach(l => {
          const [k, v] = l.split(":").map(x => x.trim());
          if (k && v) result.environment[k] = v;
        });
      } else if (heading.includes("Competitors Found")) {
        result.competitors = lines.slice(1).filter(l => l.startsWith("-")).map(l => l.replace(/^-\s*/, ""));
        result.competitorCount = parseInt(heading.match(/\d+/)?.[0]) || 0;
      } else if (heading.startsWith("Location:")) {
        result.locationInfo = {};
        lines.forEach(l => {
          const [k, v] = l.split(":").map(x => x.trim());
          if (k && v) result.locationInfo[k] = v;
        });
      }
    });

    return result;
  };

  const handlePrint = async () => {
    setPrinting(true);
    await new Promise(r => setTimeout(r, 300));
    window.print();
    setPrinting(false);
  };

  const handleSaveToReports = async () => {
    if (!selectedReport || !currentUser) return;
    setSaving(true);
    try {
      // Update the existing report status to ensure it's published
      await base44.entities.Report.update(selectedReport.id, { status: "published" });
      toast({ title: "Report confirmed in Reports page", description: "View it under Market Research folder in Reports." });
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const parsed = selectedReport ? parseReport(selectedReport) : null;
  const score = parseInt(parsed?.market?.["Opportunity Score"]) || 0;
  const badge = ScoreBadge(score);

  // Build radar data from parsed market info
  const radarData = parsed ? [
    { metric: "Market Size",        value: parsed.market?.["Estimated Annual Market"] ? Math.min(100, parseFloat(parsed.market["Estimated Annual Market"].replace(/[^0-9.]/g, "")) * 10) : 50 },
    { metric: "Low Competition",     value: parsed.competitorCount != null ? Math.max(0, 100 - parsed.competitorCount * 5) : 50 },
    { metric: "Economic Strength",   value: parsed.economy?.["Median Income"] ? Math.min(100, (parseInt(parsed.economy["Median Income"].replace(/[^0-9]/g, "")) / 100000) * 100) : 50 },
    { metric: "Demographic Fit",     value: 60 },
    { metric: "Infrastructure",      value: 65 },
  ] : [];

  const barData = parsed?.economy ? [
    parsed.economy["Unemployment"] && { name: "Unemployment", value: parseFloat(parsed.economy["Unemployment"]), color: "#f59e0b" },
    parsed.economy["Poverty Rate"] && { name: "Poverty Rate", value: parseFloat(parsed.economy["Poverty Rate"]), color: "#ef4444" },
  ].filter(Boolean) : [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header - hidden on print */}
      <div className="print:hidden bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl("MarketIntelligence")} className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <FileText className="w-5 h-5 text-indigo-500" />
          <h1 className="text-lg font-bold text-slate-800">Executive PDF Summary</h1>
        </div>
        <div className="flex gap-2">
          {selectedReport && (
            <>
              <Button variant="outline" onClick={handleSaveToReports} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
                Confirm in Reports
              </Button>
              <Button onClick={handlePrint} disabled={printing} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PDF
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 print:p-0 print:max-w-none">
        {/* Report selector - hidden on print */}
        <div className="print:hidden mb-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading market reports...
            </div>
          ) : reports.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <div className="text-5xl mb-3">🌍</div>
              <h2 className="text-lg font-bold text-slate-800 mb-2">No Market Reports Yet</h2>
              <p className="text-slate-500 text-sm mb-4">Run a market analysis and save a report first.</p>
              <Link to={createPageUrl("MarketIntelligence")}>
                <Button className="gap-2">Go to Market Intelligence</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {reports.map(r => {
                const s = parseInt(r.description?.match(/\d+/)?.[0]) || 0;
                const b = ScoreBadge(s);
                const active = selectedReport?.id === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedReport(r)}
                    className={`text-left rounded-2xl border-2 p-4 transition-all hover:shadow-md ${active ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold text-slate-800 leading-tight">{r.title}</p>
                      {active && <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />}
                    </div>
                    {s > 0 && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: b.color, backgroundColor: b.bg }}>
                        Score: {s}/100 · {b.label}
                      </span>
                    )}
                    <p className="text-[10px] text-slate-400 mt-2">{new Date(r.created_date).toLocaleDateString()}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* PDF Document */}
        {parsed && (
          <div ref={reportRef} className="bg-white rounded-2xl border border-slate-200 shadow-sm print:shadow-none print:rounded-none print:border-0 overflow-hidden">
            {/* Cover */}
            <div className="p-8 border-b border-slate-100" style={{ background: `linear-gradient(135deg, ${badge.bg}, white)` }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-2">Executive Market Summary</p>
                  <h1 className="text-3xl font-black text-slate-900 leading-tight mb-2">{parsed.title}</h1>
                  <p className="text-slate-500 text-sm">{parsed.description}</p>
                  <p className="text-xs text-slate-400 mt-3">Generated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
                </div>
                <div className="text-center shrink-0">
                  <div className="text-5xl font-black" style={{ color: badge.color }}>{score}</div>
                  <div className="text-slate-400 text-xs">/100</div>
                  <div className="text-xs font-bold mt-1 px-2 py-0.5 rounded-full" style={{ color: badge.color, backgroundColor: badge.bg }}>
                    {badge.label}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 space-y-0">
              {/* Location */}
              {parsed.locationInfo && (
                <SectionBlock title="Location Overview">
                  <MetricGrid items={Object.entries(parsed.locationInfo).map(([k, v]) => ({ label: k, value: v }))} />
                </SectionBlock>
              )}

              {/* Market Opportunity */}
              {parsed.market && (
                <SectionBlock title="Market Opportunity">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <MetricGrid items={Object.entries(parsed.market).map(([k, v]) => ({ label: k, value: v }))} />
                    {radarData.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 text-center mb-2">Market Fit Radar</p>
                        <ResponsiveContainer width="100%" height={200}>
                          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                            <Radar dataKey="value" stroke={badge.color} fill={badge.color} fillOpacity={0.2} strokeWidth={2} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </SectionBlock>
              )}

              {/* Economic Profile */}
              {parsed.economy && (
                <SectionBlock title="Economic Profile">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <MetricGrid items={Object.entries(parsed.economy).map(([k, v]) => ({ label: k, value: v }))} />
                    {barData.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 mb-2">Key Rate Indicators</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={barData} layout="vertical" barCategoryGap="25%">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => `${v}%`} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} width={90} />
                            <Tooltip formatter={v => `${v}%`} />
                            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                              {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </SectionBlock>
              )}

              {/* Competitors */}
              {parsed.competitors?.length > 0 && (
                <SectionBlock title={`Competitive Landscape (${parsed.competitorCount} found)`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {parsed.competitors.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                        <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center text-[10px] font-bold text-rose-600 shrink-0">{i + 1}</div>
                        <p className="text-xs text-slate-700 truncate">{c}</p>
                      </div>
                    ))}
                  </div>
                </SectionBlock>
              )}

              {/* Labor Market */}
              {parsed.labor && (
                <SectionBlock title="Labor Market">
                  <MetricGrid items={Object.entries(parsed.labor).map(([k, v]) => ({ label: k, value: v }))} />
                </SectionBlock>
              )}

              {/* Environment */}
              {parsed.environment && (
                <SectionBlock title="Environmental Factors">
                  <MetricGrid items={Object.entries(parsed.environment).map(([k, v]) => ({ label: k, value: v }))} />
                </SectionBlock>
              )}

              {/* Footer */}
              <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>Confidential — Generated by Newsconseen Market Intelligence</span>
                <span>{new Date().getFullYear()}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}