import React, { useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, PawPrint } from "lucide-react";
import BulkImportDialog from "@/components/shared/BulkImportDialog";
import {
  ANIMAL_FIELDS,
  ANIMAL_MAPPING_RULES,
  ANIMAL_TEMPLATE_EXAMPLE,
  validateAnimal,
  transformAnimal,
} from "@/components/shared/importConfigs";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const triggerETL = () =>
  fetch(`${RAILWAY_URL}/load/animal-summary`, { method: "POST" }).catch(() => {});

const statusColors = {
  active:     "bg-green-100 text-green-700",
  healthy:    "bg-green-100 text-green-700",
  inactive:   "bg-slate-100 text-slate-600",
  deceased:   "bg-red-100 text-red-700",
  discharged: "bg-blue-100 text-blue-700",
  sold:       "bg-amber-100 text-amber-700",
};

function listAnimals(entity) {
  return entity.list("-created_date", 200).catch(() => []);
}

export default function Animals() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn:  () => base44.auth.me(),
  });
  const [search, setSearch]         = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const { data: animals = [], isLoading } = useQuery({
    queryKey:       ["animals", currentUser?.company_id],
    queryFn:        () => listAnimals(base44.entities.Animal),
    enabled:        !!currentUser,
    staleTime:      0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    const fn = () => {
      if (document.visibilityState === "visible")
        qc.refetchQueries({ queryKey: ["animals"] });
    };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const filtered = animals.filter(a =>
    !search ||
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.species?.toLowerCase().includes(search.toLowerCase()) ||
    a.animal_type?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Animals</h1>
          <p className="text-slate-500 text-sm mt-1">{animals.length} total animals</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              await base44.entities.Animal.create({ company_id: currentUser?.company_id });
              qc.invalidateQueries({ queryKey: ["animals"] });
              triggerETL();
            }}
          >
            <Plus className="w-4 h-4 mr-1" /> Add Animal
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search animals..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="text-slate-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <PawPrint className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No animals found</p>
          <p className="text-xs mt-1">Add your first animal or import a list</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                {["Name", "Type", "Species", "Sex", "Status", "Date of Birth", "Weight (kg)"].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(a => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{a.name || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{a.animal_type || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{a.species || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{a.sex || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge className={statusColors[a.status?.toLowerCase()] || "bg-slate-100 text-slate-600"}>
                      {a.status || "unknown"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.date_of_birth || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{a.weight_kg ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkImportDialog
        open={importOpen}
        entityName="Animals"
        fields={ANIMAL_FIELDS}
        mappingRules={ANIMAL_MAPPING_RULES}
        validateRow={validateAnimal}
        transformRow={transformAnimal}
        entityFetchFn={() => listAnimals(base44.entities.Animal)}
        onImport={async row =>
          base44.entities.Animal.create({ ...row, company_id: currentUser?.company_id })
        }
        onClose={() => {
          setImportOpen(false);
          qc.invalidateQueries({ queryKey: ["animals"] });
          qc.refetchQueries({ queryKey: ["animals"] });
          triggerETL();
        }}
        currentUser={currentUser}
      />
    </div>
  );
}
