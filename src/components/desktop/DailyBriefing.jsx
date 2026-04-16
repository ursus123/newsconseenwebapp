import React, { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";

const RAILWAY_URL   = "https://newsconseenwebapp-production.up.railway.app";
const AUTO_REFRESH_MS = 90_000; // 90 seconds

function KpiCard({ label, value, sub, color, icon, isLight, loading }) {
  const bg      = isLight ? "rgba(255,255,255,0.55)" : "rgba(15,23,42,0.55)";
  const border  = isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.08)";
  const textMain = isLight ? "#1e293b" : "#f1f5f9";
  const textSub  = isLight ? "#64748b" : "#94a3b8";

  return (
    <div style={{
      background: bg, border, borderRadius: 16, backdropFilter: "blur(16px)",
      padding: "18px 20px", minWidth: 140, flex: "1 1 140px",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 12, color: textSub, fontWeight: 500 }}>{label}</span>
      </div>
      {loading ? (
        <div style={{ height: 32, borderRadius: 8, background: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)", animation: "pulse 1.5s infinite" }} />
      ) : (
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1.1 }}>{value ?? "—"}</div>
          {sub && <div style={{ fontSize: 11, color: textSub, marginTop: 2 }}>{sub}</div>}
        </div>
      )}
    </div>
  );
}

// Three-tier fallback: python_layer analytics → Base44 live
async function fetchBriefingData(companyId) {
  try {
    const [taskRes, peopleRes, txRes, entRes, prodRes] = await Promise.all([
      fetch(`${RAILWAY_URL}/task-summary?company_id=${companyId}`).catch(() => null),
      fetch(`${RAILWAY_URL}/people-summary?company_id=${companyId}`).catch(() => null),
      fetch(`${RAILWAY_URL}/transaction-summary?company_id=${companyId}`).catch(() => null),
      fetch(`${RAILWAY_URL}/enterprise-summary?company_id=${companyId}`).catch(() => null),
      fetch(`${RAILWAY_URL}/product-summary?company_id=${companyId}`).catch(() => null),
    ]);

    const taskRows  = taskRes?.ok   ? await taskRes.json()   : null;
    const peopleRows= peopleRes?.ok ? await peopleRes.json() : null;
    const txRows    = txRes?.ok     ? await txRes.json()     : null;
    const entRows   = entRes?.ok    ? await entRes.json()    : null;
    const prodRows  = prodRes?.ok   ? await prodRes.json()   : null;

    if (Array.isArray(taskRows) && taskRows.length > 0) {
      const overdueTasks      = (taskRows  || []).reduce((s, r) => s + (r.overdue_tasks  || 0), 0);
      const activePeople      = (peopleRows|| []).reduce((s, r) => s + (r.active_count   || 0), 0);
      const activeEnterprises = (entRows   || []).filter(r => r.status === "active").length;
      const activeProducts    = (prodRows  || []).reduce((s, r) => s + (r.total_products || r.active_count || 0), 0);
      const openTxRows        = (txRows    || []).filter(r => r.status === "draft" || r.status === "posted");
      const openTx            = openTxRows.reduce((s, r) => s + (r.total_transactions || 0), 0);
      const txAmount          = openTxRows.reduce((s, r) => s + (r.outstanding_amount  || 0), 0);
      return { overdueTasks, activePeople, activeEnterprises, activeProducts, openTx, txAmount, source: "analytics" };
    }
  } catch (_) {}

  // Fallback: Base44 live
  const today = new Date().toISOString().split("T")[0];
  const [tasks, people, enterprises, products, transactions] = await Promise.all([
    base44.entities.Task.filter({ company_id: companyId }, "-created_date", 500),
    base44.entities.Person.filter({ status: "active", company_id: companyId }),
    base44.entities.Enterprise.filter({ status: "active", company_id: companyId }),
    base44.entities.Product.filter({ status: "active", company_id: companyId }),
    base44.entities.Transaction.filter({ company_id: companyId }, "-created_date", 500),
  ]);
  const overdueTasks = tasks.filter(t =>
    t.due_date && t.due_date < today && t.status !== "completed" && t.status !== "cancelled"
  );
  const openTx   = transactions.filter(t => t.status === "draft" || t.status === "posted");
  const txAmount = openTx.reduce((s, t) => s + (t.amount || 0), 0);
  return {
    overdueTasks:     overdueTasks.length,
    activePeople:     people.length,
    activeEnterprises:enterprises.length,
    activeProducts:   products.length,
    openTx:           openTx.length,
    txAmount,
    source: "base44",
  };
}

export default function DailyBriefing({ isLight, currentUser }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (isManual = false) => {
    if (!currentUser?.company_id) return;
    if (isManual) setRefreshing(true);
    try {
      const d = await fetchBriefingData(currentUser.company_id);
      if (mountedRef.current) {
        setData(d);
        setLastRefreshed(new Date());
      }
    } catch {
      if (mountedRef.current) setData({ error: true });
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [currentUser]);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  // Auto-refresh every 90 seconds
  useEffect(() => {
    if (!currentUser?.company_id) return;
    const interval = setInterval(() => load(), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [load, currentUser]);

  const textMain = isLight ? "#1e293b" : "#f1f5f9";
  const textSub  = isLight ? "#64748b" : "#94a3b8";

  const fmt    = (n) => n?.toLocaleString() ?? "—";
  const fmtAmt = (n) => n != null
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : "—";

  const refreshedLabel = lastRefreshed
    ? `Updated ${lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : null;

  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 24, padding: "0 40px",
      pointerEvents: "none",
    }}>
      {/* Title + refresh */}
      <div style={{ textAlign: "center", pointerEvents: "all" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: textSub, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          Daily Briefing
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: textMain }}>
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
        {/* Refresh row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}>
          {refreshedLabel && (
            <span style={{ fontSize: 10, color: textSub, opacity: 0.7 }}>{refreshedLabel}</span>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            title="Refresh now"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "3px 10px", borderRadius: 20, border: "none",
              background: isLight ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.10)",
              color: textSub, fontSize: 11, cursor: "pointer",
              opacity: refreshing || loading ? 0.5 : 1,
            }}
          >
            <RefreshCw
              className={(refreshing || loading) ? "animate-spin" : ""}
              style={{ width: 11, height: 11 }}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI cards */}
      {data?.error ? (
        <div style={{ color: textSub, fontSize: 13, pointerEvents: "none" }}>
          Could not load data — check your connection.
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", maxWidth: 800, pointerEvents: "none" }}>
          <KpiCard label="Open Transactions" value={fmt(data?.openTx)} sub={data ? fmtAmt(data.txAmount) + " total" : null} color="#6366f1" icon="💳" isLight={isLight} loading={loading} />
          <KpiCard label="Overdue Tasks"     value={fmt(data?.overdueTasks)}      sub="past due date" color="#ef4444" icon="⚠️"  isLight={isLight} loading={loading} />
          <KpiCard label="Active People"     value={fmt(data?.activePeople)}      sub="in system"     color="#8b5cf6" icon="👥"  isLight={isLight} loading={loading} />
          <KpiCard label="Active Enterprises"value={fmt(data?.activeEnterprises)} sub="registered"    color="#0ea5e9" icon="🏢"  isLight={isLight} loading={loading} />
          <KpiCard label="Active Products"   value={fmt(data?.activeProducts)}    sub="items"         color="#f97316" icon="📦"  isLight={isLight} loading={loading} />
        </div>
      )}

      <div style={{ fontSize: 11, color: textSub, textAlign: "center", pointerEvents: "none" }}>
        Click an icon or press Ctrl+Space to launch an app · auto-refreshes every 90s
      </div>
    </div>
  );
}
