import React from "react";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, ArrowLeftRight, Building2, Users, ClipboardList, XCircle } from "lucide-react";

function getActivityItems(tasks, transactions, enterprises, people) {
  const items = [];

  tasks.slice(0, 5).forEach((t) => {
    if (t.status === "completed") {
      items.push({ id: `t-done-${t.id}`, icon: CheckCircle, iconColor: "text-emerald-500", label: `Task completed: ${t.title}`, time: t.updated_date || t.created_date });
    } else {
      items.push({ id: `t-${t.id}`, icon: ClipboardList, iconColor: "text-blue-500", label: `Task created: ${t.title}`, time: t.created_date });
    }
  });

  transactions.slice(0, 5).forEach((tx) => {
    if (tx.status === "posted") {
      items.push({ id: `tx-post-${tx.id}`, icon: ArrowLeftRight, iconColor: "text-emerald-600", label: `Transaction posted: ${(tx.transaction_type || "").replace(/_/g, " ")}${tx.enterprise ? ` · ${tx.enterprise}` : ""}`, time: tx.updated_date || tx.created_date });
    } else if (tx.status === "voided") {
      items.push({ id: `tx-void-${tx.id}`, icon: XCircle, iconColor: "text-slate-400", label: `Transaction voided: ${(tx.transaction_type || "").replace(/_/g, " ")}`, time: tx.updated_date || tx.created_date });
    } else {
      items.push({ id: `tx-${tx.id}`, icon: ArrowLeftRight, iconColor: "text-amber-500", label: `Draft transaction: ${(tx.transaction_type || "").replace(/_/g, " ")}`, time: tx.created_date });
    }
  });

  enterprises.slice(0, 3).forEach((e) => {
    items.push({ id: `e-${e.id}`, icon: Building2, iconColor: "text-purple-500", label: `Enterprise added: ${e.enterprise_name}`, time: e.created_date });
  });

  people.slice(0, 3).forEach((p) => {
    items.push({ id: `p-${p.id}`, icon: Users, iconColor: "text-blue-500", label: `Person added: ${p.first_name} ${p.last_name}`, time: p.created_date });
  });

  return items
    .filter((i) => !!i.time)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 10);
}

function timeAgo(t) {
  try { return formatDistanceToNow(new Date(t), { addSuffix: true }); } catch { return ""; }
}

export default function RecentActivityFeed({ tasks = [], transactions = [], enterprises = [], people = [] }) {
  const items = getActivityItems(tasks, transactions, enterprises, people);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5">
      <h3 className="text-sm font-bold text-slate-700 mb-4">Recent Activity</h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">No recent activity</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className={`w-3.5 h-3.5 ${item.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 leading-snug">{item.label}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(item.time)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}