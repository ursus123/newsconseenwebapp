import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, User, Package } from "lucide-react";
import { isPast, parseISO } from "date-fns";

export default function RelationshipHealthAlerts({ relationships, people, products, onEdit, onOpenNew }) {
  // Expired but still active
  const expired = relationships.filter((r) =>
    r.end_date && isPast(parseISO(r.end_date)) && (r.status === "active" || !r.status)
  );

  // Assigned people names
  const assignedNames = new Set(
    relationships.filter((r) => r.relationship_type === "person_enterprise" && (r.status === "active" || !r.status)).map((r) => r.person_name).filter(Boolean)
  );
  const unassignedPeople = people.filter((p) => {
    const name = p.preferred_name || `${p.first_name} ${p.last_name}`.trim();
    return !assignedNames.has(name) && p.status !== "inactive";
  });

  // Unassigned items
  const assignedItems = new Set(
    relationships.filter((r) => ["item_enterprise", "item_person"].includes(r.relationship_type) && (r.status === "active" || !r.status)).map((r) => r.item_name).filter(Boolean)
  );
  const unassignedItems = products.filter((p) => !assignedItems.has(p.name) && p.status !== "discontinued" && p.status !== "archived");

  if (!expired.length && !unassignedPeople.length && !unassignedItems.length) return null;

  return (
    <div className="space-y-3 mb-6">
      {expired.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-amber-100/60 border-b border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            <span className="text-sm font-semibold text-amber-700">
              ⚠️ {expired.length} relationship{expired.length !== 1 ? "s" : ""} passed end date but still active
            </span>
          </div>
          <div className="divide-y divide-amber-100">
            {expired.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="flex-1 text-sm text-slate-700">
                  {r.person_name || r.item_name || "—"} → {r.enterprise_name || r.person_name || "—"}
                  <span className="text-xs text-amber-600 ml-2">ended {r.end_date}</span>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={() => onEdit(r)}>Update</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {unassignedPeople.length > 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/30 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-blue-100/60 border-b border-blue-200">
            <User className="w-4 h-4 text-blue-700" />
            <span className="text-sm font-semibold text-blue-700">
              👤 {unassignedPeople.length} people have no enterprise assignment
            </span>
          </div>
          <div className="divide-y divide-blue-100">
            {unassignedPeople.slice(0, 5).map((p) => {
              const name = p.preferred_name || `${p.first_name} ${p.last_name}`.trim();
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="flex-1 text-sm text-slate-700">{name}
                    {p.primary_role && <span className="text-xs text-slate-400 ml-2">· {p.primary_role}</span>}
                  </div>
                  <Button size="sm" className="h-7 text-xs rounded-lg bg-blue-600 hover:bg-blue-700"
                    onClick={() => onOpenNew("person_enterprise", { person_name: name })}>
                    Assign Now
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {unassignedItems.length > 0 && (
        <div className="rounded-2xl border border-purple-200 bg-purple-50/30 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-purple-100/60 border-b border-purple-200">
            <Package className="w-4 h-4 text-purple-700" />
            <span className="text-sm font-semibold text-purple-700">
              📦 {unassignedItems.length} item{unassignedItems.length !== 1 ? "s" : ""} have no assignment
            </span>
          </div>
          <div className="divide-y divide-purple-100">
            {unassignedItems.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="flex-1 text-sm text-slate-700">{p.name}
                  {p.item_type && <span className="text-xs text-slate-400 ml-2">· {p.item_type.replace(/_/g, " ")}</span>}
                </div>
                <Button size="sm" className="h-7 text-xs rounded-lg bg-purple-600 hover:bg-purple-700"
                  onClick={() => onOpenNew("item_enterprise", { item_name: p.name })}>
                  Assign Now
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}