// ==============================================================
// SupersetEmbed — embed Superset dashboards inside Newsconseen
// Uses the official @superset-ui/embedded-sdk (lazy-loaded).
//
// Setup required:
//   1. Set VITE_SUPERSET_URL in .env (your Superset Railway URL)
//   2. In Superset: enable FEATURE_FLAGS["EMBEDDED_SUPERSET"] = True
//   3. In Superset: add your domain to CORS whitelist
//   4. Add POST /superset/guest-token to python_layer (see below)
//   5. Get your dashboard UUID from Superset URL: /superset/dashboard/<uuid>/
//
// python_layer endpoint needed (add to app.py):
//   POST /superset/guest-token
//   Body: { "dashboard_id": "uuid", "company_id": "..." }
//   Returns: { "token": "..." }
// ==============================================================

import { useState, useEffect, useRef } from "react";
import { ExternalLink, Loader2, AlertCircle, ChevronDown } from "lucide-react";
import { RAILWAY_URL } from "@/utils/fetchWithFallback";

const SUPERSET_URL = import.meta.env.VITE_SUPERSET_URL || "";

// Fetch a guest token from python_layer (scoped to company_id via RLS)
async function fetchGuestToken(dashboardId, companyId) {
  const res = await fetch(`${RAILWAY_URL}/superset/guest-token`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ dashboard_id: dashboardId, company_id: companyId }),
  });
  if (!res.ok) throw new Error(`Guest token failed: ${res.status}`);
  const { token } = await res.json();
  return token;
}

// ── Individual embedded dashboard ─────────────────────────────────────────────

function EmbeddedDashboard({ dashboardId, companyId, height = 500 }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error | unconfigured
  const [error, setError]   = useState(null);

  useEffect(() => {
    if (!SUPERSET_URL) {
      setStatus("unconfigured");
      return;
    }
    if (!dashboardId || !companyId || !containerRef.current) return;

    let cancelled = false;
    setStatus("loading");

    (async () => {
      try {
        // Lazy-load the SDK — only downloaded when this component renders
        const { embedDashboard } = await import("@superset-ui/embedded-sdk");

        const token = await fetchGuestToken(dashboardId, companyId);
        if (cancelled) return;

        await embedDashboard({
          id:              dashboardId,
          supersetDomain:  SUPERSET_URL,
          mountPoint:      containerRef.current,
          fetchGuestToken: () => Promise.resolve(token),
          dashboardUiConfig: {
            hideTitle:         true,  // Newsconseen shows its own title
            hideChartControls: false,
            hideTab:           false,
            filters: {
              expanded: false,  // collapsed by default — cleaner look
            },
          },
        });

        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e.message);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [dashboardId, companyId]);

  if (status === "unconfigured") {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400 gap-2">
        <AlertCircle className="w-6 h-6 text-amber-400" />
        <p className="text-sm font-medium text-slate-600">Superset not configured</p>
        <p className="text-xs text-center max-w-xs">
          Set <code className="bg-slate-100 px-1 rounded">VITE_SUPERSET_URL</code> in your{" "}
          <code className="bg-slate-100 px-1 rounded">.env</code> file to your Superset instance URL.
        </p>
        <a
          href="https://superset.apache.org/docs/embedding-superset/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-emerald-600 hover:underline flex items-center gap-1 mt-1"
        >
          Setup guide <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-rose-50 rounded-xl border border-rose-200 text-rose-400 gap-2">
        <AlertCircle className="w-5 h-5" />
        <p className="text-sm font-medium text-rose-600">Superset connection failed</p>
        <p className="text-xs text-center max-w-xs text-rose-400">{error}</p>
        <p className="text-xs text-slate-400 mt-1">
          Check Superset is running and FEATURE_FLAGS["EMBEDDED_SUPERSET"] = True
        </p>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-100" style={{ height }}>
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400 mr-2" />
          <span className="text-sm text-slate-400">Loading dashboard…</span>
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

// ── Dashboard tab bar ─────────────────────────────────────────────────────────

// Operators configure their dashboards here — or this list can be fetched
// from python_layer / Base44 Enterprise record in the future.
const DEFAULT_DASHBOARDS = [
  {
    id:    import.meta.env.VITE_SUPERSET_DASHBOARD_1 || "",
    label: "Operations Overview",
  },
  {
    id:    import.meta.env.VITE_SUPERSET_DASHBOARD_2 || "",
    label: "Financial Summary",
  },
  {
    id:    import.meta.env.VITE_SUPERSET_DASHBOARD_3 || "",
    label: "People Analytics",
  },
].filter(d => d.id);  // hide tabs with no UUID configured

// ── Main export ───────────────────────────────────────────────────────────────

export default function SupersetEmbed({ companyId, dashboards }) {
  const tabs = dashboards?.length ? dashboards : DEFAULT_DASHBOARDS;
  const [activeIdx, setActiveIdx] = useState(0);
  const [expanded,  setExpanded]  = useState(false);

  // Nothing to show if no dashboards configured
  if (!SUPERSET_URL && !tabs.length) return null;

  const activeTab = tabs[activeIdx];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-700">Advanced Analytics</h3>
          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            Powered by Superset
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors"
          >
            {expanded ? "Collapse" : "Expand"}
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {SUPERSET_URL && (
            <a
              href={`${SUPERSET_URL}/superset/dashboard/${activeTab?.id}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-emerald-600 hover:underline"
            >
              Open full <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Tab bar — only shown when multiple dashboards */}
      {tabs.length > 1 && (
        <div className="flex gap-1 px-5 pt-3">
          {tabs.map((tab, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                i === activeIdx
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Embedded dashboard */}
      <div className={`p-4 transition-all ${expanded ? "" : "max-h-[520px] overflow-hidden"}`}>
        {activeTab ? (
          <EmbeddedDashboard
            key={activeTab.id}
            dashboardId={activeTab.id}
            companyId={companyId}
            height={expanded ? 700 : 460}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-slate-300 gap-2">
            <AlertCircle className="w-6 h-6 text-amber-400" />
            <p className="text-sm text-slate-500 font-medium">No dashboards configured</p>
            <p className="text-xs text-slate-400 text-center max-w-xs">
              Set <code className="bg-slate-100 px-1 rounded">VITE_SUPERSET_DASHBOARD_1</code> in your{" "}
              <code className="bg-slate-100 px-1 rounded">.env</code> file to your dashboard UUID.
              <br />Get the UUID from the Superset dashboard URL.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
