import React from "react";

export default function ServiceCoverageView({ enterprises, services, people, tasks, selectedEnterprise }) {
  const visibleEnterprises = selectedEnterprise === "all"
    ? enterprises
    : enterprises.filter(e => e.id === selectedEnterprise);

  const coverageMap = {};
  services.forEach(s => {
    coverageMap[s.id] = new Set();
    visibleEnterprises.forEach(e => {
      const hasTasks = tasks.some(t =>
        t.enterprise === e.enterprise_name &&
        (t.service_id === s.id || t.related_service === (s.name || s.service_name))
      );
      const isAssigned = s.enterprise === e.enterprise_name || !s.enterprise;
      if (hasTasks || isAssigned) coverageMap[s.id].add(e.id);
    });
  });

  const gaps = [];
  services.forEach(s => {
    visibleEnterprises.forEach(e => {
      if (!coverageMap[s.id].has(e.id)) {
        gaps.push({ service: s.name || s.service_name, enterprise: e.enterprise_name });
      }
    });
  });

  const limitedServices = services.filter(s => coverageMap[s.id].size === 1 && visibleEnterprises.length > 1);

  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-5xl mb-3">⚙️</div>
        <p className="text-slate-400 text-sm">No services defined yet.</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      {gaps.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-6">
          <p className="text-sm font-bold text-rose-700 mb-2">⚠️ {gaps.length} service coverage gaps</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {gaps.slice(0, 6).map((g, i) => (
              <div key={i} className="text-xs bg-white border border-rose-100 rounded-xl p-2 text-rose-600">
                <strong>{g.service}</strong><br />not available at {g.enterprise}
              </div>
            ))}
          </div>
        </div>
      )}

      {limitedServices.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <p className="text-sm font-bold text-amber-700 mb-2">🔶 {limitedServices.length} services only available at 1 enterprise</p>
          <div className="flex flex-wrap gap-2">
            {limitedServices.map(s => (
              <span key={s.id} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-1 rounded-xl">{s.name || s.service_name}</span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 min-w-48">Service</th>
                {visibleEnterprises.map(e => (
                  <th key={e.id} className="px-4 py-3 text-xs font-bold text-slate-600 text-center min-w-32">
                    <div className="truncate max-w-28">{e.enterprise_name}</div>
                  </th>
                ))}
                <th className="px-4 py-3 text-xs font-bold text-slate-500 text-center">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service, i) => {
                const covered = coverageMap[service.id];
                const coveragePct = Math.round(covered.size / Math.max(visibleEnterprises.length, 1) * 100);
                return (
                  <tr key={service.id} className={`border-t border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-700">{service.name || service.service_name}</div>
                      {service.service_type && <div className="text-[10px] text-slate-400">{service.service_type}</div>}
                    </td>
                    {visibleEnterprises.map(e => (
                      <td key={e.id} className="px-4 py-3 text-center">
                        {covered.has(e.id) ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-100 rounded-full text-emerald-600 text-xs font-bold">✓</span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-rose-50 rounded-full text-rose-300 text-xs">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <div className={`text-xs font-bold ${coveragePct === 100 ? "text-emerald-600" : coveragePct >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                        {coveragePct}%
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}