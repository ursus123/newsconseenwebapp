import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Users, Building2, Package, Link2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const statusColor = (s) => ({
  active: "bg-emerald-50 text-emerald-700",
  ended: "bg-rose-50 text-rose-600",
  archived: "bg-slate-100 text-slate-400",
}[s] || "bg-slate-100 text-slate-600");

function RelCard({ rel, entityType }) {
  const isActive = rel.status === "active";

  let title = "";
  let subtitle = "";
  let icon = null;

  if (entityType === "enterprise") {
    if (rel.relationship_type === "person_enterprise") {
      title = rel.person_name;
      subtitle = rel.role || "No role specified";
      icon = <Users className="w-4 h-4 text-blue-500" />;
    } else {
      title = rel.item_name;
      subtitle = rel.responsibility_type ? rel.responsibility_type.replace(/_/g, " ") : (rel.location || "No details");
      icon = <Package className="w-4 h-4 text-purple-500" />;
    }
  } else if (entityType === "person") {
    if (rel.relationship_type === "person_enterprise") {
      title = rel.enterprise_name;
      subtitle = rel.role || "No role specified";
      icon = <Building2 className="w-4 h-4 text-blue-500" />;
    } else {
      title = rel.item_name;
      subtitle = rel.role || "Custody";
      icon = <Package className="w-4 h-4 text-purple-500" />;
    }
  } else if (entityType === "product") {
    if (rel.relationship_type === "item_enterprise") {
      title = rel.enterprise_name;
      subtitle = rel.responsibility_type ? rel.responsibility_type.replace(/_/g, " ") : (rel.location || "No details");
      icon = <Building2 className="w-4 h-4 text-blue-500" />;
    } else {
      title = rel.person_name;
      subtitle = rel.role || "Custody";
      icon = <Users className="w-4 h-4 text-purple-500" />;
    }
  }

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${isActive ? "bg-white border-slate-200" : "bg-slate-50 border-slate-100 opacity-60"}`}>
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{title || "—"}</p>
        <p className="text-xs text-slate-400 capitalize">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {rel.start_date && <span className="text-xs text-slate-400">{rel.start_date}</span>}
        <Badge className={`${statusColor(rel.status)} text-xs`}>{rel.status || "active"}</Badge>
      </div>
    </div>
  );
}

export default function RelatedEntitiesPanel({ entityType, entityName }) {
  const { data: relationships = [], isLoading } = useQuery({
    queryKey: ["relationships"],
    queryFn: () => base44.entities.Relationship.list(),
    enabled: !!entityName,
  });

  if (!entityName) {
    return (
      <div className="text-center py-10 text-slate-400">
        <Link2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Save this record first to manage relationships</p>
      </div>
    );
  }

  let related = [];
  if (entityType === "enterprise") {
    related = relationships.filter(r => r.enterprise_name === entityName);
  } else if (entityType === "person") {
    related = relationships.filter(r => r.person_name === entityName);
  } else if (entityType === "product") {
    related = relationships.filter(r => r.item_name === entityName);
  }

  const active = related.filter(r => r.status === "active");
  const inactive = related.filter(r => r.status !== "active");

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-slate-400">Loading relationships...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex gap-3">
        <div className="flex-1 bg-emerald-50 rounded-xl px-4 py-3 text-center">
          <p className="text-2xl font-bold text-emerald-700">{active.length}</p>
          <p className="text-xs text-emerald-600 mt-0.5">Active</p>
        </div>
        <div className="flex-1 bg-slate-50 rounded-xl px-4 py-3 text-center">
          <p className="text-2xl font-bold text-slate-500">{inactive.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">Ended / Archived</p>
        </div>
      </div>

      {related.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Link2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No relationships found</p>
          <p className="text-xs mt-1 opacity-70">Go to the Relationships page to create one</p>
          <Link
            to={createPageUrl("Relationships")}
            className="inline-flex items-center gap-1.5 mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open Relationships
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Active</p>
              <div className="space-y-2">
                {active.map(rel => <RelCard key={rel.id} rel={rel} entityType={entityType} />)}
              </div>
            </div>
          )}
          {inactive.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ended / Archived</p>
              <div className="space-y-2">
                {inactive.map(rel => <RelCard key={rel.id} rel={rel} entityType={entityType} />)}
              </div>
            </div>
          )}
          <div className="pt-2 border-t border-slate-100">
            <Link
              to={createPageUrl("Relationships")}
              className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Manage in Relationships page
            </Link>
          </div>
        </>
      )}
    </div>
  );
}