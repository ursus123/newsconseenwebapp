import React from "react";
import { TYPE_ALIASES } from "@/utils/typeAliases";

export default function SharedResourcesView({ enterprises, people, products, services }) {
  const staffByName = {};
  people.filter(p => TYPE_ALIASES.staff.includes(p.person_type)).forEach(p => {
    const key = `${p.first_name} ${p.last_name}`;
    if (!staffByName[key]) staffByName[key] = [];
    if (p.enterprise && !staffByName[key].includes(p.enterprise)) staffByName[key].push(p.enterprise);
  });
  const sharedStaff = Object.entries(staffByName).filter(([, ents]) => ents.length > 1);

  const globalProducts = products.filter(p => !p.enterprise || p.enterprise === "");

  const servicesByName = {};
  services.forEach(s => {
    const key = s.name || s.service_name;
    if (!servicesByName[key]) servicesByName[key] = [];
    if (s.enterprise && !servicesByName[key].includes(s.enterprise)) servicesByName[key].push(s.enterprise);
  });
  const sharedServices = Object.entries(servicesByName).filter(([, ents]) => ents.length > 1);

  const hasAny = sharedStaff.length > 0 || globalProducts.length > 0 || sharedServices.length > 0;

  if (!hasAny && enterprises.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-8">
        <div className="text-5xl mb-4">🔄</div>
        <h3 className="text-base font-bold text-slate-700 mb-2">No shared resources detected</h3>
        <p className="text-sm text-slate-400 max-w-xs">When staff or services appear across multiple enterprises they will show here.</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Shared Staff */}
        <div className="bg-white border border-blue-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
            <h3 className="font-bold text-blue-700 text-sm">🔄 Shared Staff ({sharedStaff.length})</h3>
            <p className="text-[10px] text-blue-400 mt-1">People working across multiple enterprises</p>
          </div>
          <div className="divide-y divide-slate-100">
            {sharedStaff.length === 0 ? (
              <p className="px-4 py-8 text-xs text-slate-400 text-center">No shared staff detected</p>
            ) : sharedStaff.map(([name, ents], i) => (
              <div key={i} className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-700">{name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ents.map((e, j) => (
                    <span key={j} className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">{e}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Global Products */}
        <div className="bg-white border border-emerald-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
            <h3 className="font-bold text-emerald-700 text-sm">📦 Global Products ({globalProducts.length})</h3>
            <p className="text-[10px] text-emerald-400 mt-1">Products available to all enterprises</p>
          </div>
          <div className="divide-y divide-slate-100">
            {globalProducts.length === 0 ? (
              <p className="px-4 py-8 text-xs text-slate-400 text-center">No global products</p>
            ) : globalProducts.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">{p.name}</p>
                  <p className="text-[10px] text-slate-400">{p.item_type}</p>
                </div>
                <span className={`text-xs font-bold ${(p.stock_quantity || 0) <= (p.min_stock_level || 0) ? "text-rose-500" : "text-emerald-600"}`}>
                  {p.stock_quantity ?? "—"} units
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Shared Services */}
        <div className="bg-white border border-purple-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
            <h3 className="font-bold text-purple-700 text-sm">⚙️ Shared Services ({sharedServices.length})</h3>
            <p className="text-[10px] text-purple-400 mt-1">Services offered at multiple enterprises</p>
          </div>
          <div className="divide-y divide-slate-100">
            {sharedServices.length === 0 ? (
              <p className="px-4 py-8 text-xs text-slate-400 text-center">No shared services detected</p>
            ) : sharedServices.map(([name, ents], i) => (
              <div key={i} className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-700">{name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ents.map((e, j) => (
                    <span key={j} className="text-[10px] bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded-full">{e}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}