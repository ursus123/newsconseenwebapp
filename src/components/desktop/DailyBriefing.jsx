import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

function KpiCard({ label, value, sub, color, icon, isLight, loading }) {
  const bg = isLight ? "rgba(255,255,255,0.55)" : "rgba(15,23,42,0.55)";
  const border = isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.08)";
  const textMain = isLight ? "#1e293b" : "#f1f5f9";
  const textSub = isLight ? "#64748b" : "#94a3b8";

  return (
    <div style={{
      background: bg,
      border,
      borderRadius: 16,
      backdropFilter: "blur(16px)",
      padding: "18px 20px",
      minWidth: 140,
      flex: "1 1 140px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
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

export default function DailyBriefing({ isLight }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetch() {
      try {
        const [tasks, people, enterprises, products, transactions] = await Promise.all([
          base44.entities.Task.list("-created_date", 500),
          base44.entities.Person.filter({ status: "active" }),
          base44.entities.Enterprise.filter({ status: "active" }),
          base44.entities.Product.filter({ status: "active" }),
          base44.entities.Transaction.list("-created_date", 500),
        ]);

        const today = new Date().toISOString().split("T")[0];
        const overdueTasks = tasks.filter(t =>
          t.due_date && t.due_date < today && t.status !== "completed" && t.status !== "cancelled"
        );
        const openTx = transactions.filter(t => t.status === "draft" || t.status === "posted");
        const totalAmount = openTx.reduce((s, t) => s + (t.amount || 0), 0);

        if (mounted) {
          setData({
            openTx: openTx.length,
            txAmount: totalAmount,
            overdueTasks: overdueTasks.length,
            activePeople: people.length,
            activeEnterprises: enterprises.length,
            activeProducts: products.length,
          });
        }
      } catch {
        if (mounted) setData({ error: true });
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetch();
    return () => { mounted = false; };
  }, []);

  const textMain = isLight ? "#1e293b" : "#f1f5f9";
  const textSub = isLight ? "#64748b" : "#94a3b8";

  const fmt = (n) => n?.toLocaleString() ?? "—";
  const fmtAmt = (n) => n != null ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—";

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
      padding: "0 40px",
      pointerEvents: "none",
    }}>
      {/* Title */}
      <div style={{ textAlign: "center", pointerEvents: "none" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: textSub, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          Daily Briefing
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: textMain }}>
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
      </div>

      {/* KPI cards */}
      {data?.error ? (
        <div style={{ color: textSub, fontSize: 13 }}>Could not load data — check your connection.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", maxWidth: 800, pointerEvents: "none" }}>
          <KpiCard label="Open Transactions" value={fmt(data?.openTx)} sub={data ? fmtAmt(data.txAmount) + " total" : null} color="#6366f1" icon="💳" isLight={isLight} loading={loading} />
          <KpiCard label="Overdue Tasks" value={fmt(data?.overdueTasks)} sub="past due date" color="#ef4444" icon="⚠️" isLight={isLight} loading={loading} />
          <KpiCard label="Active People" value={fmt(data?.activePeople)} sub="in system" color="#8b5cf6" icon="👥" isLight={isLight} loading={loading} />
          <KpiCard label="Active Enterprises" value={fmt(data?.activeEnterprises)} sub="registered" color="#0ea5e9" icon="🏢" isLight={isLight} loading={loading} />
          <KpiCard label="Active Products" value={fmt(data?.activeProducts)} sub="items" color="#f97316" icon="📦" isLight={isLight} loading={loading} />
        </div>
      )}

      <div style={{ fontSize: 11, color: textSub, textAlign: "center", pointerEvents: "none" }}>
        Click an icon or press Ctrl+Space to launch an app
      </div>
    </div>
  );
}