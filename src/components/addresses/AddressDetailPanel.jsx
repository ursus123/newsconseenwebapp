import React, { useEffect, useState } from "react";
import { X, Building2, User, Navigation, ExternalLink, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ncClient } from "@/api/ncClient";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = (import.meta["env"] || {})["VITE_RAILWAY_API_KEY"] || "";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
  }).catch(() => {});

const statusColor = (s) => ({
  active: "bg-emerald-50 text-emerald-700",
  archived: "bg-slate-100 text-slate-400",
}[s] || "bg-slate-100 text-slate-600");

async function geocodeAddress(address) {
  const query = [address.address_line1, address.city, address.state_region, address.postal_code, address.country]
    .filter(Boolean).join(", ");
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
    { headers: { "User-Agent": "newsconseen-app/1.0" } }
  );
  const data = await res.json();
  if (data.length > 0) return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
  return null;
}

export default function AddressDetailPanel({ address, currentUser, onClose, onGeocoded }) {
  const [enterprises, setEnterprises] = useState([]);
  const [people, setPeople] = useState([]);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    if (!address || !currentUser) return;
    const scope = currentUser.role === "super_admin" ? {} : { company_id: currentUser.company_id };
    const addressLabel = address.label || address.address_line1 || "";

    // Query Relationship entity for enterprise_address and person_address links
    ncClient.entities.Relationship.filter({ relationship_type: "enterprise_address" })
      .then((rels) => {
        const linked = rels.filter((r) => r.location === addressLabel || r.location === address.id);
        const enterpriseNames = linked.map((r) => r.enterprise_name).filter(Boolean);
        if (enterpriseNames.length > 0) {
          ncClient.entities.Enterprise.filter(scope).then((all) => {
            const fromRels = all.filter((e) => enterpriseNames.includes(e.enterprise_name));
            const fromLegacy = all.filter((e) =>
              (e.primary_address && address.address_line1 && e.primary_address.includes(address.address_line1)) ||
              (e.linked_addresses || []).includes(address.id)
            );
            const merged = [...new Map([...fromRels, ...fromLegacy].map(e => [e.id, e])).values()];
            setEnterprises(merged);
          }).catch(() => {});
        } else {
          ncClient.entities.Enterprise.filter(scope).then((all) => {
            setEnterprises(all.filter((e) =>
              (e.primary_address && address.address_line1 && e.primary_address.includes(address.address_line1)) ||
              (e.linked_addresses || []).includes(address.id)
            ));
          }).catch(() => {});
        }
      }).catch(() => {});

    ncClient.entities.Relationship.filter({ relationship_type: "person_address" })
      .then((rels) => {
        const linked = rels.filter((r) => r.location === addressLabel || r.location === address.id);
        const personNames = linked.map((r) => r.person_name).filter(Boolean);
        if (personNames.length > 0) {
          ncClient.entities.Person.filter(scope).then((all) => {
            const fromRels = all.filter((p) => {
              const name = p.preferred_name || `${p.first_name} ${p.last_name}`.trim();
              return personNames.includes(name);
            });
            const fromLegacy = all.filter((p) =>
              (p.address && address.address_line1 && p.address.includes(address.address_line1)) ||
              (p.linked_addresses || []).includes(address.id)
            );
            const merged = [...new Map([...fromRels, ...fromLegacy].map(p => [p.id, p])).values()];
            setPeople(merged);
          }).catch(() => {});
        } else {
          ncClient.entities.Person.filter(scope).then((all) => {
            setPeople(all.filter((p) =>
              (p.address && address.address_line1 && p.address.includes(address.address_line1)) ||
              (p.linked_addresses || []).includes(address.id)
            ));
          }).catch(() => {});
        }
      }).catch(() => {});
  }, [address?.id, currentUser]);

  const handleGeocode = async () => {
    setGeocoding(true);
    const coords = await geocodeAddress(address);
    if (coords) {
      await ncClient.entities.Address.update(address.id, { ...address, ...coords });
      triggerETL("address");
      onGeocoded?.({ ...address, ...coords });
    }
    setGeocoding(false);
  };

  const osmUrl = address?.latitude && address?.longitude
    ? `https://www.openstreetmap.org/?mlat=${address.latitude}&mlon=${address.longitude}&zoom=16`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent([address?.address_line1, address?.city, address?.country].filter(Boolean).join(", "))}`;

  if (!address) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/10 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-80 bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800 text-base truncate">{address.label || "Address"}</p>
              <p className="text-xs text-slate-500 mt-0.5">{[address.city, address.country].filter(Boolean).join(", ") || "—"}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Full address */}
          <div className="px-4 py-4 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Full Address</p>
            <div className="space-y-0.5 text-sm text-slate-700">
              {address.address_line1 && <p>{address.address_line1}</p>}
              {address.address_line2 && <p>{address.address_line2}</p>}
              {(address.city || address.postal_code) && (
                <p>{[address.city, address.postal_code].filter(Boolean).join(", ")}</p>
              )}
              {address.state_region && <p>{address.state_region}</p>}
              {address.country && <p className="font-medium">{address.country}</p>}
            </div>
          </div>

          {/* Coordinates */}
          <div className="px-4 py-4 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">GPS Coordinates</p>
            {address.latitude && address.longitude ? (
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-mono text-slate-700">{Number(address.latitude).toFixed(6)}, {Number(address.longitude).toFixed(6)}</p>
                  <a href={osmUrl} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline flex items-center gap-1 mt-1">
                    <ExternalLink className="w-3 h-3" /> Open in OpenStreetMap
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-amber-700 mb-2">No GPS coordinates saved</p>
                  <Button type="button" size="sm" variant="outline" onClick={handleGeocode} disabled={geocoding}
                    className="h-7 text-xs rounded-lg border-amber-300 text-amber-700 hover:bg-amber-50">
                    {geocoding ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Geocoding...</> : <><Navigation className="w-3 h-3 mr-1" /> Get Coordinates</>}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Map preview */}
          {address.latitude && address.longitude && (
            <div className="px-4 py-4 border-b border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Map Preview</p>
              <a href={osmUrl} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 hover:border-emerald-400 transition-colors">
                <img
                  src={`https://staticmap.openstreetmap.de/staticmap.php?center=${address.latitude},${address.longitude}&zoom=15&size=400x160&markers=${address.latitude},${address.longitude},red-pushpin`}
                  alt="Map preview"
                  className="w-full h-28 object-cover"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              </a>
              <a href={osmUrl} target="_blank" rel="noreferrer"
                className="text-xs text-emerald-600 hover:underline flex items-center gap-1 mt-2">
                <ExternalLink className="w-3 h-3" /> Open in OpenStreetMap →
              </a>
            </div>
          )}

          {/* Linked Enterprises */}
          <div className="px-4 py-4 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Linked Enterprises</p>
            {enterprises.length === 0 ? (
              <p className="text-xs text-slate-400">None found</p>
            ) : (
              <div className="space-y-1.5">
                {enterprises.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-700 truncate">{e.enterprise_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Linked People */}
          <div className="px-4 py-4 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Linked People</p>
            {people.length === 0 ? (
              <p className="text-xs text-slate-400">None found</p>
            ) : (
              <div className="space-y-1.5">
                {people.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-700 truncate">{[p.first_name, p.last_name].filter(Boolean).join(" ")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status */}
          <div className="px-4 py-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Status</p>
            <Badge className={statusColor(address.status)}>{address.status || "active"}</Badge>
          </div>
        </div>
      </div>
    </>
  );
}