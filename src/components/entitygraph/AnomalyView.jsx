import React, { useMemo } from "react";

export default function AnomalyView({ enterprises, people, products, services, tasks, transactions, addresses, relationships }) {
  const anomalies = useMemo(() => {
    const issues = [];

    enterprises.forEach(enterprise => {
      const entName = enterprise.enterprise_name;
      const staff = people.filter(p => p.enterprise === entName && p.person_type === "employee" && p.status === "active");
      const clients = people.filter(p => p.enterprise === entName && p.person_type === "client" && p.status === "active");
      const addrs = addresses.filter(a => a.enterprise === entName);
      const recentTasks = tasks.filter(t => {
        const d = new Date(t.scheduled_date || t.created_date);
        return t.enterprise === entName && (new Date() - d) / (1000 * 60 * 60 * 24) <= 30;
      });

      if (!staff.length) issues.push({ severity: "critical", enterprise: entName, type: "No active staff", detail: `${entName} has no active staff members`, action: "Add staff in People page" });
      if (!clients.length) issues.push({ severity: "warning", enterprise: entName, type: "No active clients", detail: `${entName} has no active clients`, action: "Add clients in People page" });
      if (!addrs.length) issues.push({ severity: "warning", enterprise: entName, type: "No locations", detail: `${entName} has no addresses defined`, action: "Add locations in Addresses page" });
      if (clients.length > 0 && !recentTasks.length) issues.push({ severity: "critical", enterprise: entName, type: "No recent activity", detail: `${entName} has no tasks in 30 days despite having ${clients.length} clients`, action: "Check Tasks page for issues" });

      const assignedClientNames = new Set(
        relationships.filter(r => r.enterprise === entName || r.enterprise_name === entName).map(r => r.related_person || r.person_name)
      );
      const unassigned = clients.filter(c => !assignedClientNames.has(`${c.first_name} ${c.last_name}`));
      if (unassigned.length > 0) issues.push({ severity: "critical", enterprise: entName, type: "Unassigned clients", detail: `${unassigned.length} clients have no assigned caregiver at ${entName}`, action: "Create relationships in Relationships page" });

      const expiring = staff.filter(s => {
        if (!s.certification_expiry) return false;
        const days = (new Date(s.certification_expiry) - new Date()) / (1000 * 60 * 60 * 24);
        return days > 0 && days <= 90;
      });
      if (expiring.length > 0) issues.push({ severity: "warning", enterprise: entName, type: "Expiring certifications", detail: `${expiring.length} staff at ${entName} have certifications expiring within 90 days`, action: "Review staff certifications" });
    });

    const lowStockItems = products.filter(p =>
      p.stock_quantity != null && p.min_stock_level != null &&
      p.stock_quantity <= p.min_stock_level && p.status === "active"
    );
    if (lowStockItems.length > 0) {
      issues.push({ severity: "critical", enterprise: "All", type: "Low stock items", detail: `${lowStockItems.length} products are at or below minimum stock: ${lowStockItems.slice(0, 3).map(p => p.name).join(", ")}`, action: "Reorder from Products page" });
    }

    const unpaid = transactions.filter(t => t.transaction_type === "sale_service" && t.payment_status === "unpaid" && t.amount > 0);
    if (unpaid.length > 0) {
      const total = unpaid.reduce((sum, t) => sum + (t.amount || 0), 0);
      issues.push({ severity: "warning", enterprise: "All", type: "Outstanding payments", detail: `${unpaid.length} unpaid invoices totaling $${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, action: "Review Transactions page" });
    }

    return issues;
  }, [enterprises, people, products, services, tasks, transactions, addresses, relationships]);

  const critical = anomalies.filter(a => a.severity === "critical");
  const warnings = anomalies.filter(a => a.severity === "warning");

  if (anomalies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">All Clear</h2>
        <p className="text-slate-400">No anomalies detected across your enterprise network.</p>
      </div>
    );
  }

  const IssueCard = ({ issue, borderColor, badgeBg, badgeText }) => (
    <div className={`bg-white border ${borderColor} rounded-xl p-4`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-800">{issue.type}</p>
          <p className="text-xs text-slate-500 mt-0.5">{issue.detail}</p>
          {issue.enterprise !== "All" && (
            <span className="inline-block mt-2 text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{issue.enterprise}</span>
          )}
        </div>
        <span className={`text-[10px] ${badgeBg} ${badgeText} border px-2 py-1 rounded-xl whitespace-nowrap shrink-0`}>{issue.action}</span>
      </div>
    </div>
  );

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-rose-600">{critical.length}</p>
          <p className="text-xs font-bold text-rose-400 uppercase mt-1">Critical</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-amber-600">{warnings.length}</p>
          <p className="text-xs font-bold text-amber-400 uppercase mt-1">Warnings</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-emerald-600">{enterprises.length}</p>
          <p className="text-xs font-bold text-emerald-400 uppercase mt-1">Enterprises</p>
        </div>
      </div>

      <div className="space-y-6">
        {critical.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-rose-600 mb-3">🔴 Critical Issues</h3>
            <div className="space-y-2">
              {critical.map((issue, i) => <IssueCard key={i} issue={issue} borderColor="border-rose-200" badgeBg="bg-rose-50" badgeText="text-rose-600 border-rose-100" />)}
            </div>
          </div>
        )}
        {warnings.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-amber-600 mb-3">🟡 Warnings</h3>
            <div className="space-y-2">
              {warnings.map((issue, i) => <IssueCard key={i} issue={issue} borderColor="border-amber-200" badgeBg="bg-amber-50" badgeText="text-amber-600 border-amber-100" />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}