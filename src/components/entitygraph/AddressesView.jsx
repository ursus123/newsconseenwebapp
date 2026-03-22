import React, { useMemo } from "react";

export default function AddressesView({ enterprises, addresses, relationships, selectedEnterprise }) {
  const visibleEnterprises = selectedEnterprise === "all"
    ? enterprises
    : enterprises.filter(e => e.id === selectedEnterprise);

  // Build enterprise → address set from Relationship entity (enterprise_address type)
  // Also check Address.linked_enterprises array
  const enterpriseAddressMap = useMemo(() => {
    const map = {};

    // From Relationship records
    relationships
      .filter(r => r.relationship_type === "enterprise_address" && r.status !== "ended" && r.enterprise_name)
      .forEach(r => {
        if (!map[r.enterprise_name]) map[r.enterprise_name] = new Set();
        if (r.location) map[r.enterprise_name].add(r.location);
      });

    // From Address.linked_enterprises embedded array
    addresses.forEach(a => {
      (a.linked_enterprises || []).forEach(le => {
        if (!le.enterprise_name || le.active === false) return;
        if (!map[le.enterprise_name]) map[le.enterprise_name] = new Set();
        map[le.enterprise_name].add(a.id);
      });
    });

    return map;
  }, [relationships, addresses]);

  // Build address id → address record for fast lookup
  const addressById = useMemo(() => {
    const map = {};
    addresses.forEach(a => { map[a.id] = a; });
    return map;
  }, [addresses]);

  const getAddressesForEnterprise = (enterpriseName) => {
    const ids = enterpriseAddressMap[enterpriseName] || new Set();
    const result = new Map();
    ids.forEach(idOrLabel => {
      const byId = addressById[idOrLabel];
      if (byId) result.set(byId.id, byId);
      else {
        // Might be a label/text stored in Relationship.location
        const byLabel = addresses.find(a => a.label === idOrLabel || a.address_line1 === idOrLabel);
        if (byLabel) result.set(byLabel.id, byLabel);
      }
    });
    return [...result.values()];
  };

  // Unlinked addresses (not associated with any enterprise)
  const linkedAddressIds = useMemo(() => {
    const s = new Set();
    addresses.forEach(a => {
      (a.linked_enterprises || []).forEach(le => { if (le.active !== false) s.add(a.id); });
    });
    relationships.filter(r => r.relationship_type === "enterprise_address").forEach(r => {
      const a = addresses.find(x => x.label === r.location || x.id === r.location);
      if (a) s.add(a.id);
    });
    return s;
  }, [addresses, relationships]);

  const unlinkedAddresses = addresses.filter(a => !linkedAddressIds.has(a.id));

  if (addresses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-8">
        <div className="text-5xl mb-4">📍</div>
        <h3 className="text-base font-bold text-slate-700 mb-2">No addresses added yet</h3>
        <p className="text-sm text-slate-400 max-w-xs mb-4">Add addresses and link them to enterprises to see location coverage here.</p>
        <p className="text-xs text-indigo-500 font-medium">Go to Addresses page to get started</p>
      </div>
    );
  }

  const typeColors = {
    main: "bg-blue-100 text-blue-700",
    branch: "bg-purple-100 text-purple-700",
    warehouse: "bg-amber-100 text-amber-700",
    residential: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div className="p-6 overflow-auto h-full">
      {unlinkedAddresses.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <p className="text-sm font-bold text-amber-700 mb-1">📍 {unlinkedAddresses.length} address{unlinkedAddresses.length !== 1 ? "es" : ""} not linked to any enterprise</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {unlinkedAddresses.slice(0, 8).map(a => (
              <span key={a.id} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-1 rounded-xl">
                {a.label || a.address_line1}{a.city ? `, ${a.city}` : ""}
              </span>
            ))}
            {unlinkedAddresses.length > 8 && <span className="text-xs text-amber-500">+{unlinkedAddresses.length - 8} more</span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleEnterprises.map(enterprise => {
          const entAddresses = getAddressesForEnterprise(enterprise.enterprise_name);
          const active = entAddresses.filter(a => a.status !== "archived");
          const archived = entAddresses.filter(a => a.status === "archived");

          return (
            <div key={enterprise.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm">{enterprise.enterprise_name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{active.length} location{active.length !== 1 ? "s" : ""}{archived.length > 0 ? ` · ${archived.length} archived` : ""}</p>
              </div>

              <div className="divide-y divide-slate-100">
                {active.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-xs text-slate-300 italic">No locations linked</p>
                  </div>
                ) : (
                  active.map(addr => {
                    const typeKey = (addr.label || "").toLowerCase();
                    const colorClass = typeColors[typeKey] || "bg-slate-100 text-slate-600";
                    return (
                      <div key={addr.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-semibold text-slate-700">{addr.label || "Address"}</p>
                              {addr.label && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${colorClass}`}>{addr.label}</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">{addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ""}</p>
                            {(addr.city || addr.state_region || addr.country) && (
                              <p className="text-[10px] text-slate-400">{[addr.city, addr.state_region, addr.country].filter(Boolean).join(", ")}</p>
                            )}
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${addr.status === "active" ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                            {addr.status || "active"}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* All addresses summary table */}
      <div className="mt-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-700">All Addresses ({addresses.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-2 font-semibold text-slate-500">Label</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-500">Address</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-500">City</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-500">Linked Enterprises</th>
                <th className="text-left px-4 py-2 font-semibold text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {addresses.map((a, i) => {
                const linked = (a.linked_enterprises || []).filter(le => le.active !== false);
                return (
                  <tr key={a.id} className={`border-t border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                    <td className="px-4 py-2 font-medium text-slate-700">{a.label || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{a.address_line1 || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{a.city || "—"}</td>
                    <td className="px-4 py-2">
                      {linked.length === 0 ? (
                        <span className="text-amber-400 italic">Unlinked</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {linked.slice(0, 3).map((le, j) => (
                            <span key={j} className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded-full text-[9px]">{le.enterprise_name}</span>
                          ))}
                          {linked.length > 3 && <span className="text-slate-400 text-[9px]">+{linked.length - 3}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`font-bold ${a.status === "active" ? "text-emerald-600" : "text-slate-400"}`}>{a.status || "active"}</span>
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