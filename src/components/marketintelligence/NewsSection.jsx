import React, { useState } from "react";
import { ExternalLink, Loader2, Bell, CheckCircle2, AlertCircle } from "lucide-react";
import { ncClient } from "@/api/ncClient";
import SectionSkeleton from "./SectionSkeleton";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, { method: "POST" }).catch(() => {});

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? "s" : ""} ago`;
}

export default function NewsSection({ data, location, businessType, loading, currentUser }) {
  const [showAll, setShowAll]   = useState(false);
  const [tracked, setTracked]   = useState(new Set());
  const [tracking, setTracking] = useState(null);  // index being saved
  const [failed, setFailed]     = useState(new Set()); // indexes where save failed

  if (loading && !data) return <SectionSkeleton title="📰 Recent News" />;
  if (!data) return null;

  const articles = data.filter(a => a.title);
  const visible  = showAll ? articles : articles.slice(0, 4);

  const handleTrack = async (article, index) => {
    if (!currentUser?.company_id || tracked.has(index)) return;
    setTracking(index);
    setFailed(prev => { const s = new Set(prev); s.delete(index); return s; });
    try {
      await ncClient.entities.Signal.create({
        name:            article.title.slice(0, 100),
        signal_type:     "automated",
        signal_subtype:  "market_news",
        value:           article.url || article.source || "news",
        description:     [article.title, article.source, article.url].filter(Boolean).join(" | "),
        source:          article.source || "Market Intelligence",
        unit_of_measure: "article",
        is_anomaly:      false,
        recorded_at:     article.published || new Date().toISOString(),
        status:          "active",
        company_id:      currentUser.company_id,
      });
      setTracked(prev => new Set([...prev, index]));
      triggerETL("signal");
    } catch (_) {
      setFailed(prev => new Set([...prev, index]));
      // reset failed badge after 3 s so user can retry
      setTimeout(() => setFailed(prev => { const s = new Set(prev); s.delete(index); return s; }), 3000);
    } finally {
      setTracking(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          📰 Recent News
        </h3>
        <span className="text-xs text-slate-400">Last 30 days</span>
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-slate-400 text-sm">No recent news found for {businessType} in {location}.</p>
          <p className="text-slate-300 text-xs mt-1">Try a broader search or different location.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-slate-100">
            {visible.map((a, i) => {
              const isTracked  = tracked.has(i);
              const isTracking = tracking === i;
              const hasFailed  = failed.has(i);
              return (
                <div key={i} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">{a.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400">{a.source}</span>
                        {a.published && (
                          <>
                            <span className="text-slate-200">·</span>
                            <span className="text-xs text-slate-400">{timeAgo(a.published)}</span>
                          </>
                        )}
                        {a.country && (
                          <>
                            <span className="text-slate-200">·</span>
                            <span className="text-xs text-slate-400">{a.country}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Track as Signal */}
                      {currentUser && (
                        <button
                          onClick={() => handleTrack(a, i)}
                          disabled={isTracking || isTracked}
                          title={isTracked ? "Tracked as Signal" : hasFailed ? "Save failed — click to retry" : "Track as market Signal"}
                          className={`p-1.5 rounded-lg transition-colors disabled:cursor-not-allowed
                            ${isTracked
                              ? "text-emerald-500 bg-emerald-50"
                              : hasFailed
                                ? "text-rose-500 bg-rose-50"
                                : "text-slate-400 hover:text-blue-500 hover:bg-blue-50"}`}
                        >
                          {isTracking
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : isTracked
                              ? <CheckCircle2 className="w-3.5 h-3.5" />
                              : hasFailed
                                ? <AlertCircle className="w-3.5 h-3.5" />
                                : <Bell className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      {a.url && (
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                          title="Read article"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {articles.length > 4 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              {showAll ? "Show less ↑" : `View all ${articles.length} articles →`}
            </button>
          )}

          {tracked.size > 0 && (
            <p className="mt-3 text-[11px] text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              {tracked.size} article{tracked.size > 1 ? "s" : ""} tracked as market Signals
            </p>
          )}
        </>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-slate-400 mt-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="text-xs">Loading news…</span>
        </div>
      )}
    </div>
  );
}
