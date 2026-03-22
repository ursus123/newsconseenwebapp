import React, { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import SectionSkeleton from "./SectionSkeleton";

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

export default function NewsSection({ data, location, businessType, loading }) {
  const [showAll, setShowAll] = useState(false);

  if (loading && !data) return <SectionSkeleton title="📰 Recent News" />;
  if (!data) return null;

  const articles = data.filter(a => a.title);
  const visible  = showAll ? articles : articles.slice(0, 4);

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
            {visible.map((a, i) => (
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
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Read article"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {articles.length > 4 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              {showAll ? "Show less ↑" : `View all ${articles.length} articles →`}
            </button>
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