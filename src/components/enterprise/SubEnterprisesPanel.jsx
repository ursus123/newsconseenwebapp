import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Building2, Plus, ChevronRight } from "lucide-react";
import { getTermsFromEnterpriseType } from "@/config/enterpriseTerminology";

const TYPE_EMOJI = {
  healthcare: "🏥", education: "🏫", community: "⛪", agriculture: "🌾",
  retail: "💼", technology: "💻", government: "🏛️", nonprofit: "🤝",
  food_beverage: "🍽️", construction: "🏗️", manufacturing: "🏭",
  logistics: "🚚", hospitality: "🏨", finance: "💰", other: "🏢",
};

export default function SubEnterprisesPanel({ enterprise, currentUser, onAddChild }) {
  const { data: children = [] } = useQuery({
    queryKey: ["sub_enterprises", enterprise.id],
    queryFn: () => base44.entities.Enterprise.filter({ parent_enterprise_id: enterprise.id }),
    enabled: !!enterprise.id,
  });

  const terms = getTermsFromEnterpriseType(enterprise.enterprise_type || "other");

  if (children.length === 0 && !onAddChild) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-slate-800 text-sm">
            Sub-enterprises ({children.length})
          </span>
        </div>
        {onAddChild && (
          <button
            onClick={onAddChild}
            className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add {terms.enterprise_child}
          </button>
        )}
      </div>

      {children.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-slate-400">No sub-enterprises yet.</p>
          {onAddChild && (
            <button onClick={onAddChild} className="mt-2 text-sm text-emerald-600 hover:underline font-medium">
              + Add your first {terms.enterprise_child}
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {children.map((child) => (
            <div key={child.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-xl">{TYPE_EMOJI[child.enterprise_type] || "🏢"}</span>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{child.enterprise_name}</p>
                  <p className="text-xs text-slate-400">{[child.city, child.region, child.country].filter(Boolean).join(", ")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {child.status && (
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    child.status === "active" ? "bg-emerald-50 text-emerald-600" :
                    child.status === "inactive" ? "bg-slate-100 text-slate-500" :
                    "bg-amber-50 text-amber-600"
                  }`}>{child.status}</span>
                )}
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}