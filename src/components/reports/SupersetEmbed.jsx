// ==============================================================
// SupersetEmbed — Reports page Superset Dashboards tab
// ==============================================================
// Embeds Superset dashboards inside the Reports page using the
// @superset-ui/embedded-sdk guest token flow.
//
// Requires env vars (set in Railway frontend service):
//   VITE_SUPERSET_URL              — Superset Railway domain
//   VITE_SUPERSET_DASHBOARD_1/2/3  — dashboard embedded UUIDs
//
// Guest token is fetched from python_layer POST /superset/guest-token
// which scopes the token to the user's company_id via RLS.
// ==============================================================

import React, { useState, useEffect, useRef } from "react";
import { BarChart2, ExternalLink, Loader2, AlertCircle, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const SUPERSET_URL = (typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPERSET_URL : "") || "";
const DASHBOARD_IDS = [
  (typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPERSET_DASHBOARD_1 : "") || "",
  (typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPERSET_DASHBOARD_2 : "") || "",
  (typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPERSET_DASHBOARD_3 : "") || "",
].filter(Boolean);

const DASHBOARD_LABELS = ["Dashboard 1", "Dashboard 2", "Dashboard 3"];

// ── Guest token fetch ─────────────────────────────────────────────────────────
async function fetchGuestToken(dashboardId, companyId) {
  const res = await fetch(`${RAILWAY_URL}/superset/guest-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dashboard_id: dashboardId, company_id: companyId }),
  });
  if (!res.ok) throw new Error(`Guest token error: ${res.status}`);
  const data = await res.json();
  return data.token;
}

// ── Single embedded dashboard ─────────────────────────────────────────────────
function EmbeddedDashboard({ dashboardId, companyId, expanded }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!dashboardId || !companyId || !SUPERSET_URL) return;
    setStatus("loading");
    setError("");

    async function mount() {
      try {
        // Lazy-load the SDK to avoid build-time issues
        const { embedDashboard } = await import("@superset-ui/embedded-sdk");
        if (!mountedRef.current) return;

        if (!mountedRef.current) return;

        await embedDashboard({
          id: dashboardId,
          supersetDomain: SUPERSET_URL,
          mountPoint: containerRef.current,
          fetchGuestToken: () => fetchGuestToken(dashboardId, companyId),
          dashboardUiConfig: {
            hideTitle: true,
            hideChartControls: false,
            filters: { visible: true, expanded: false },
          },
        });

        if (mountedRef.current) setStatus("ready");
      } catch (e) {
        if (mountedRef.current) {
          setError(e.message || "Failed to load dashboard");
          setStatus("error");
        }
      }
    }

    mount();
    return () => { mountedRef.current = false; };
  }, [dashboardId, companyId]);

  if (!SUPERSET_URL) return null;

  return (
    <div className="relative w-full" style={{ height: expanded ? "80vh" : "520px" }}>
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-xl border border-slate-200 z-10">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <p className="text-sm text-slate-500">Loading dashboard…</p>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-rose-50 rounded-xl border border-rose-200 z-10 p-6">
          <AlertCircle className="w-6 h-6 text-rose-500" />
          <p className="text-sm font-semibold text-rose-700">Failed to load dashboard</p>
          <p className="text-xs text-rose-500 text-center">{error}</p>
          <p className="text-[10px] text-rose-400 text-center">
            Check that SUPERSET_URL, SUPERSET_USERNAME, SUPERSET_PASSWORD are set in python_layer Railway variables.
          </p>
          <Button size="sm" variant="outline" className="border-rose-200 text-rose-600" onClick={() => setStatus("idle")}>
            <RefreshCw className="w-3 h-3 mr-1.5" /> Retry
          </Button>
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full h-full rounded-xl overflow-hidden border border-slate-200"
        style={{ display: status === "error" || status === "loading" ? "none" : "block" }}
      />
    </div>
  );
}

// ── Not configured fallback ───────────────────────────────────────────────────
function NotConfigured() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
        <BarChart2 className="w-6 h-6 text-indigo-400" />
      </div>
      <div>
        <p className="text-sm font-bold text-slate-700 mb-1">Superset not configured</p>
        <p className="text-xs text-slate-500 max-w-xs">
          Set <code className="bg-slate-100 px-1 rounded">VITE_SUPERSET_URL</code> and{" "}
          <code className="bg-slate-100 px-1 rounded">VITE_SUPERSET_DASHBOARD_1</code> in your
          Railway frontend service variables, then redeploy.
        </p>
      </div>
      {SUPERSET_URL && (
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white mt-2"
          onClick={() => window.open(SUPERSET_URL, "_blank")}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
          Open Superset to build dashboards
        </Button>
      )}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs text-slate-600 max-w-sm w-full space-y-2 mt-2">
        <p className="font-semibold text-slate-700">Setup steps:</p>
        <ol className="list-decimal list-inside space-y-1 text-slate-500">
          <li>Open Superset → build a dashboard</li>
          <li>Dashboard → ··· → <strong>Embed Dashboard</strong> → copy UUID</li>
          <li>Railway → frontend service → Variables → set <code className="bg-slate-100 px-0.5 rounded">VITE_SUPERSET_DASHBOARD_1</code></li>
          <li>Redeploy frontend</li>
        </ol>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function SupersetEmbed({ companyId }) {
  const [activeTab, setActiveTab] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const configured = SUPERSET_URL && DASHBOARD_IDS.length > 0;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Superset Dashboards</h2>
            <p className="text-xs text-slate-500">Advanced BI dashboards powered by Apache Superset</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {configured && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg"
            >
              {expanded
                ? <><Minimize2 className="w-3.5 h-3.5" /> Collapse</>
                : <><Maximize2 className="w-3.5 h-3.5" /> Expand</>
              }
            </button>
          )}
          {SUPERSET_URL && (
            <button
              onClick={() => window.open(SUPERSET_URL, "_blank")}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open Superset
            </button>
          )}
        </div>
      </div>

      {!configured ? (
        <NotConfigured />
      ) : (
        <>
          {/* Dashboard tab bar */}
          {DASHBOARD_IDS.length > 1 && (
            <div className="flex items-center gap-1 border-b border-slate-100 pb-0">
              {DASHBOARD_IDS.map((id, i) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(i)}
                  className={`text-xs font-semibold px-4 py-2 rounded-t-lg border-b-2 transition-colors ${
                    activeTab === i
                      ? "border-indigo-500 text-indigo-700 bg-indigo-50"
                      : "border-transparent text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                  }`}
                >
                  {DASHBOARD_LABELS[i] || `Dashboard ${i + 1}`}
                </button>
              ))}
            </div>
          )}

          {/* Active dashboard */}
          <EmbeddedDashboard
            key={DASHBOARD_IDS[activeTab]}
            dashboardId={DASHBOARD_IDS[activeTab]}
            companyId={companyId}
            expanded={expanded}
          />
        </>
      )}
    </div>
  );
}
