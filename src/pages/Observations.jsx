import React, { useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Activity, AlertTriangle } from "lucide-react";
import BulkImportDialog from "@/components/shared/BulkImportDialog";
import {
  OBSERVATION_FIELDS,
  OBSERVATION_MAPPING_RULES,
  OBSERVATION_TEMPLATE_EXAMPLE,
  validateObservation,
  transformObservation,
} from "@/components/shared/importConfigs";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const triggerETL = () =>
  fetch(`${RAILWAY_URL}/load/observation-summary`, { method: "POST" }).catch(() => {});

function listObservations(entity) {
  return entity.list("-observed_at", 500).catch(() => []);
}

export default function Observations() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn:  () => base44.auth.me(),
  });
  const [search, setSearch]         = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const { data: observations = [], isLoading } = useQuery({
    queryKey:       ["observations", currentUser?.company_id],
    queryFn:        () => listObservations(base44.entities.Observation),
    enabled:        !!currentUser,
    staleTime:      0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    const fn = () => {
      if (document.visibilityState === "visible")
        qc.refetchQueries({ queryKey: ["observations"] });
    };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const filtered = observations.filter(o =>
    !search ||
    o.observation_type?.toLowerCase().includes(search.toLowerCase()) ||
    o.subject_type?.toLowerCase().includes(search.toLowerCase()) ||
    o.notes?.toLowerCase().includes(search.toLowerCase())
  );

  const anomalyCount = observations.filter(o => o.is_anomaly).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Observations</h1>
          <p className="text-slate-500 text-sm mt-1">
            {observations.length} readings
            {anomalyCount > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                · {anomalyCount} anomaly{anomalyCount !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              await base44.entities.Observation.create({ company_id: currentUser?.company_id });
              qc.invalidateQueries({ queryKey: ["observations"] });
              triggerETL();
            }}
          >
            <Plus className="w-4 h-4 mr-1" /> Add Observation
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search observations..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="text-slate-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No observations found</p>
          <p className="text-xs mt-1">Record field readings, sensor data, or vet exam results</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                {["Type", "Subject", "Value", "Unit", "Observed At", "Anomaly", "Notes"].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(o => (
                <tr key={o.id} className={`hover:bg-slate-50 ${o.is_anomaly ? "bg-amber-50" : ""}`}>
                  <td className="px-4 py-3 font-medium">{o.observation_type || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{o.subject_type || "—"}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">
                    {o.numeric_value != null ? o.numeric_value : o.text_value || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{o.unit_of_measure || "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {o.observed_at ? new Date(o.observed_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {o.is_anomaly ? (
                      <Badge className="bg-amber-100 text-amber-700 gap-1">
                        <AlertTriangle className="w-3 h-3" /> Anomaly
                      </Badge>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{o.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkImportDialog
        open={importOpen}
        entityName="Observations"
        fields={OBSERVATION_FIELDS}
        mappingRules={OBSERVATION_MAPPING_RULES}
        validateRow={validateObservation}
        transformRow={transformObservation}
        entityFetchFn={() => listObservations(base44.entities.Observation)}
        onImport={async row =>
          base44.entities.Observation.create({ ...row, company_id: currentUser?.company_id })
        }
        onClose={() => {
          setImportOpen(false);
          qc.invalidateQueries({ queryKey: ["observations"] });
          qc.refetchQueries({ queryKey: ["observations"] });
          triggerETL();
        }}
        currentUser={currentUser}
      />
    </div>
  );
}
