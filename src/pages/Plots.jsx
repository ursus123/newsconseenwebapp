import React, { useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Tractor } from "lucide-react";
import BulkImportDialog from "@/components/shared/BulkImportDialog";
import {
  PLOT_FIELDS,
  PLOT_MAPPING_RULES,
  PLOT_TEMPLATE_EXAMPLE,
  validatePlot,
  transformPlot,
} from "@/components/shared/importConfigs";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const triggerETL = () =>
  fetch(`${RAILWAY_URL}/load/plot-summary`, { method: "POST" }).catch(() => {});

const statusColors = {
  active:       "bg-green-100 text-green-700",
  cultivated:   "bg-emerald-100 text-emerald-700",
  fallow:       "bg-amber-100 text-amber-700",
  in_use:       "bg-blue-100 text-blue-700",
  inactive:     "bg-slate-100 text-slate-600",
  abandoned:    "bg-red-100 text-red-700",
};

function listPlots(entity) {
  return entity.list("-created_date", 200).catch(() => []);
}

export default function Plots() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn:  () => base44.auth.me(),
  });
  const [search, setSearch]         = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const { data: plots = [], isLoading } = useQuery({
    queryKey:       ["plots", currentUser?.company_id],
    queryFn:        () => listPlots(base44.entities.Plot),
    enabled:        !!currentUser,
    staleTime:      0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    const fn = () => {
      if (document.visibilityState === "visible")
        qc.refetchQueries({ queryKey: ["plots"] });
    };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const filtered = plots.filter(p =>
    !search ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.plot_type?.toLowerCase().includes(search.toLowerCase()) ||
    p.land_use?.toLowerCase().includes(search.toLowerCase()) ||
    p.crop_type?.toLowerCase().includes(search.toLowerCase())
  );

  const totalHa = plots.reduce((sum, p) => sum + (parseFloat(p.area_ha) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Plots</h1>
          <p className="text-slate-500 text-sm mt-1">
            {plots.length} plots · {totalHa.toFixed(1)} ha total
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              await base44.entities.Plot.create({ company_id: currentUser?.company_id });
              qc.invalidateQueries({ queryKey: ["plots"] });
              triggerETL();
            }}
          >
            <Plus className="w-4 h-4 mr-1" /> Add Plot
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search plots..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="text-slate-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Tractor className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No plots found</p>
          <p className="text-xs mt-1">Add your first plot or import a list</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                {["Name", "Type", "Land Use", "Crop", "Area (ha)", "Status", "Coordinates"].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{p.name || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{p.plot_type || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{p.land_use || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{p.crop_type || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{p.area_ha ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge className={statusColors[p.status?.toLowerCase()] || "bg-slate-100 text-slate-600"}>
                      {p.status || "unknown"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {p.latitude && p.longitude
                      ? `${parseFloat(p.latitude).toFixed(4)}, ${parseFloat(p.longitude).toFixed(4)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkImportDialog
        open={importOpen}
        entityName="Plots"
        fields={PLOT_FIELDS}
        mappingRules={PLOT_MAPPING_RULES}
        validateRow={validatePlot}
        transformRow={transformPlot}
        entityFetchFn={() => listPlots(base44.entities.Plot)}
        onImport={async row =>
          base44.entities.Plot.create({ ...row, company_id: currentUser?.company_id })
        }
        onClose={() => {
          setImportOpen(false);
          qc.invalidateQueries({ queryKey: ["plots"] });
          qc.refetchQueries({ queryKey: ["plots"] });
          triggerETL();
        }}
        currentUser={currentUser}
      />
    </div>
  );
}
