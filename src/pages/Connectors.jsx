import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plug, CheckCircle2, AlertCircle, XCircle, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

export default function Connectors() {
  const [currentUser, setCurrentUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  // ─── Available Connectors ───────────────────────────────────────────────
  const { data: catalogData = { connectors: [] }, isLoading: catalogLoading } = useQuery({
    queryKey: ["connector-catalog"],
    queryFn: async () => {
      try {
        const res = await fetch(`${RAILWAY_URL}/connectors/catalog`);
        return res.json();
      } catch {
        return { connectors: [] };
      }
    },
  });

  const connectorsByCategory = catalogData.connectors.reduce((acc, conn) => {
    const cat = conn.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(conn);
    return acc;
  }, {});

  const CATEGORY_ORDER = [
    "File Import",
    "Mobile Money",
    "Accounting",
    "HR & Payroll",
    "Health",
    "Education",
    "Point of Sale",
    "Government",
  ];

  const sortedCategories = CATEGORY_ORDER.filter((cat) => connectorsByCategory[cat]).concat(
    Object.keys(connectorsByCategory).filter((cat) => !CATEGORY_ORDER.includes(cat))
  );

  // ─── Connector Runs ────────────────────────────────────────────────────
  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ["connector-runs", currentUser?.company_id],
    queryFn: async () => {
      if (!currentUser?.company_id) return [];
      return base44.entities.ConnectorRun.filter({ company_id: currentUser.company_id });
    },
    enabled: !!currentUser?.company_id,
  });

  // ─── Unmapped Values ───────────────────────────────────────────────────
  const needsReviewRuns = runs.filter((r) => r.status === "needs_review");

  const { data: masterData = [] } = useQuery({
    queryKey: ["master-data-options"],
    queryFn: () => base44.entities.MasterDataOption.list(),
  });

  // Mutation to save connector mapping
  const saveMappingMutation = useMutation({
    mutationFn: async ({
      companyId,
      connectorId,
      fieldName,
      sourceValue,
      taxonomyValue,
      parentValue,
    }) => {
      // Check if mapping already exists
      const existing = await base44.entities.ConnectorMapping.filter({
        company_id: companyId,
        connector_id: connectorId,
        field_name: fieldName,
        source_value: sourceValue,
      });

      if (existing.length > 0) {
        return base44.entities.ConnectorMapping.update(existing[0].id, {
          taxonomy_value: taxonomyValue,
          is_confirmed: true,
          confirmed_by: currentUser.email,
        });
      } else {
        return base44.entities.ConnectorMapping.create({
          company_id: companyId,
          connector_id: connectorId,
          field_name: fieldName,
          source_value: sourceValue,
          taxonomy_value: taxonomyValue,
          parent_value: parentValue,
          is_confirmed: true,
          confirmed_by: currentUser.email,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connector-runs"] });
    },
  });

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Section 1: Available Connectors */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Available Connectors</h2>

        {catalogLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-10">
            {sortedCategories.map((category) => (
              <div key={category}>
                <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-4">
                  {category}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {connectorsByCategory[category].map((conn) => (
                    <div
                      key={conn.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-lg transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-slate-800 text-sm">{conn.name}</h4>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {conn.description || "Data integration connector"}
                          </p>
                        </div>
                        {conn.sprint && (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 whitespace-nowrap ml-2">
                            {conn.sprint}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mb-4">
                        {conn.status === "available" ? (
                          <>
                            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                            <span className="text-xs font-medium text-emerald-700">Available</span>
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 bg-slate-400 rounded-full" />
                            <span className="text-xs font-medium text-slate-600">Coming Soon</span>
                          </>
                        )}
                      </div>

                      <Button
                        disabled={conn.status !== "available"}
                        className="w-full text-xs"
                        variant={conn.status === "available" ? "default" : "outline"}
                      >
                        Connect
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Run History */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Run History</h2>

        {runsLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Plug className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No connector runs yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Connector</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700">Extracted</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700">Created</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700">Updated</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700">Skipped</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700">Failed</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Started</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Duration</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const startTime = new Date(run.started_at);
                  const endTime = run.completed_at ? new Date(run.completed_at) : new Date();
                  const durationMs = endTime - startTime;
                  const durationMin = Math.floor(durationMs / 60000);

                  let statusColor = "slate";
                  let StatusIcon = null;

                  if (run.status === "completed") {
                    statusColor = "emerald";
                    StatusIcon = CheckCircle2;
                  } else if (run.status === "needs_review") {
                    statusColor = "amber";
                    StatusIcon = AlertCircle;
                  } else if (run.status === "failed") {
                    statusColor = "red";
                    StatusIcon = XCircle;
                  } else if (run.status === "running") {
                    statusColor = "blue";
                    StatusIcon = Loader2;
                  }

                  return (
                    <tr
                      key={run.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3 text-slate-800 font-medium">{run.connector_id}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {StatusIcon && (
                            <StatusIcon
                              className={`w-4 h-4 text-${statusColor}-600 ${
                                run.status === "running" ? "animate-spin" : ""
                              }`}
                            />
                          )}
                          <span className={`text-${statusColor}-700 font-medium capitalize`}>
                            {run.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {run.records_extracted || 0}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {run.records_created || 0}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {run.records_updated || 0}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {run.records_skipped || 0}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {run.records_failed || 0}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {startTime.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{durationMin}m</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 3: Unmapped Values Review */}
      {needsReviewRuns.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Unmapped Values Review</h2>

          <div className="space-y-6">
            {needsReviewRuns.map((run) => {
              let unmappedValues = [];
              try {
                unmappedValues = JSON.parse(run.unmapped_values || "[]");
              } catch {
                unmappedValues = [];
              }

              return (
                <div key={run.id} className="bg-white border border-slate-200 rounded-xl p-6">
                  <h3 className="font-semibold text-slate-800 mb-4">
                    {run.connector_id} — {new Date(run.started_at).toLocaleDateString()}
                  </h3>

                  {unmappedValues.length === 0 ? (
                    <p className="text-sm text-slate-500">No unmapped values.</p>
                  ) : (
                    <div className="space-y-3">
                      {unmappedValues.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col md:flex-row items-start md:items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
                        >
                          <div className="flex-1">
                            <p className="text-xs font-mono text-slate-600">
                              {item.field_name} = "{item.source_value}"
                            </p>
                          </div>

                          <select
                            className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white text-slate-700 flex-1 md:flex-none"
                            onChange={(e) => {
                              if (e.target.value) {
                                saveMappingMutation.mutate({
                                  companyId: currentUser.company_id,
                                  connectorId: run.connector_id,
                                  fieldName: item.field_name,
                                  sourceValue: item.source_value,
                                  taxonomyValue: e.target.value,
                                  parentValue: item.parent_value || null,
                                });
                              }
                            }}
                            defaultValue=""
                          >
                            <option value="">Select taxonomy value...</option>
                            {masterData
                              .filter((opt) => opt.field_name === item.field_name)
                              .map((opt) => (
                                <option key={opt.id} value={opt.value}>
                                  {opt.label || opt.value}
                                </option>
                              ))}
                          </select>

                          {saveMappingMutation.isPending && (
                            <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}