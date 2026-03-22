import React from "react";

export default function AnomalyView({ anomalies, enterprises, people, products, services, tasks, transactions, addresses, relationships }) {

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