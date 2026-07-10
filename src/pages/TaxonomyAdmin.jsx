import { useState, useEffect } from "react";
import { ncClient } from "@/api/ncClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Tags, Trash2, Merge, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronRight, RefreshCw, Search,
} from "lucide-react";

// ── Entity + field combos that have taxonomy options ─────────────────────────
const TAXONOMY_FIELDS = [
  { entityType: "person",     fieldName: "person_subtype",     label: "Person Subtype" },
  { entityType: "enterprise", fieldName: "enterprise_subtype", label: "Enterprise Subtype" },
  { entityType: "product",    fieldName: "item_subtype",       label: "Item Subtype" },
  { entityType: "task",       fieldName: "task_type",          label: "Task Type" },
  { entityType: "task",       fieldName: "task_subtype",       label: "Task Subtype" },
];

// ── Fetch all MasterDataOption rows for a company ────────────────────────────
async function fetchAllOptions(companyId) {
  if (!companyId) return [];
  return ncClient.entities.MasterDataOption.filter({
    company_id:        companyId,
    is_system_default: false,
  });
}

// ── Usage count badge colour ─────────────────────────────────────────────────
function UsageBadge({ count }) {
  const cls =
    count === 0 ? "bg-rose-50 text-rose-500" :
    count < 3   ? "bg-slate-100 text-slate-500" :
                  "bg-amber-50 text-amber-600";
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>
      {count}×
    </span>
  );
}

// ── Confirmation modal (minimal) ─────────────────────────────────────────────
function Confirm({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700">{message}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-lg bg-rose-500 text-white hover:bg-rose-600">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Option row ───────────────────────────────────────────────────────────────
function OptionRow({ opt, selectedForMerge, onToggleMerge, onDeactivate, onDelete }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors ${
      opt.is_active === false ? "opacity-40" : ""
    }`}>
      <input
        type="checkbox"
        checked={selectedForMerge}
        onChange={() => onToggleMerge(opt.id)}
        className="rounded border-slate-300 text-emerald-500"
        title="Select for merge"
      />
      <span className="flex-1 text-sm text-slate-700 truncate" title={opt.value}>
        {opt.value}
      </span>
      <UsageBadge count={opt.usage_count || 0} />

      {opt.is_active === false && (
        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded">inactive</span>
      )}

      {/* Deactivate / reactivate */}
      <button
        onClick={() => onDeactivate(opt)}
        title={opt.is_active === false ? "Reactivate" : "Deactivate"}
        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
      >
        {opt.is_active === false
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          : <Trash2 className="w-4 h-4" />
        }
      </button>
    </div>
  );
}

// ── Field section ────────────────────────────────────────────────────────────
function FieldSection({ fieldLabel, options, onDeactivate, onMerge }) {
  const [expanded, setExpanded]         = useState(true);
  const [search, setSearch]             = useState("");
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [mergeTarget, setMergeTarget]   = useState("");
  const [showMergePanel, setShowMergePanel] = useState(false);

  const filtered = options.filter(o => o.value.toLowerCase().includes(search.toLowerCase()));

  const unused   = options.filter(o => (o.usage_count || 0) === 0);
  const frequent = options.filter(o => (o.usage_count || 0) >= 3);

  const toggleMerge = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleMergeSubmit = () => {
    if (!mergeTarget.trim() || selectedIds.size === 0) return;
    onMerge(Array.from(selectedIds), mergeTarget.trim());
    setSelectedIds(new Set());
    setMergeTarget("");
    setShowMergePanel(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          <span className="font-semibold text-slate-800 text-sm">{fieldLabel}</span>
          <span className="text-xs text-slate-400">{options.length} options</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {unused.length > 0 && (
            <span className="px-2 py-0.5 bg-rose-50 text-rose-500 rounded-full font-medium">
              {unused.length} unused
            </span>
          )}
          {frequent.length > 0 && (
            <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full font-medium">
              {frequent.length} frequent
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center gap-1.5 flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter options..."
                className="text-xs outline-none w-full text-slate-700"
              />
            </div>

            {selectedIds.size > 0 && (
              <button
                onClick={() => setShowMergePanel(v => !v)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 transition-colors font-medium"
              >
                <Merge className="w-3.5 h-3.5" />
                Merge {selectedIds.size} selected
              </button>
            )}

            {unused.length > 0 && (
              <button
                onClick={() => {
                  unused.forEach(o => onDeactivate(o));
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-100 transition-colors font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove {unused.length} unused
              </button>
            )}
          </div>

          {/* Merge panel */}
          {showMergePanel && (
            <div className="px-4 py-3 bg-violet-50 border-b border-violet-100 flex items-center gap-2">
              <Merge className="w-4 h-4 text-violet-500 shrink-0" />
              <span className="text-xs text-violet-700 shrink-0">Merge into:</span>
              <input
                value={mergeTarget}
                onChange={e => setMergeTarget(e.target.value)}
                placeholder="Type the canonical value to keep..."
                className="flex-1 text-xs px-2 py-1.5 border border-violet-200 rounded-lg outline-none focus:border-violet-400 bg-white"
              />
              <button
                onClick={handleMergeSubmit}
                disabled={!mergeTarget.trim()}
                className="px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 font-medium"
              >
                Apply
              </button>
              <button onClick={() => setShowMergePanel(false)}
                className="px-3 py-1.5 text-xs text-violet-600 hover:bg-violet-100 rounded-lg">
                Cancel
              </button>
            </div>
          )}

          {/* Options list */}
          <div className="px-2 py-2 max-h-64 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="text-center py-6 text-xs text-slate-400">No options match</div>
            )}
            {filtered.map(opt => (
              <OptionRow
                key={opt.id}
                opt={opt}
                selectedForMerge={selectedIds.has(opt.id)}
                onToggleMerge={toggleMerge}
                onDeactivate={onDeactivate}
                onDelete={onDeactivate}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function TaxonomyAdmin({ currentUser }) {
  const qc         = useQueryClient();
  const companyId  = currentUser?.company_id;
  const [confirm, setConfirm] = useState(null); // { message, onConfirm }
  const [toast, setToast]     = useState(null);

  const showToast = (msg, color = "emerald") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Load all custom options ─────────────────────────────────────────────────
  const { data: allOptions = [], isLoading, refetch } = useQuery({
    queryKey:       ["taxonomy-admin", companyId],
    queryFn:        () => fetchAllOptions(companyId),
    enabled:        !!companyId,
    staleTime:      0,
    refetchOnMount: "always",
  });

  // ── Deactivate / reactivate mutation ───────────────────────────────────────
  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }) =>
      ncClient.entities.MasterDataOption.update(id, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["taxonomy-admin", companyId] });
      showToast("Option updated");
    },
    onError: () => showToast("Failed to update option", "rose"),
  });

  // ── Bulk merge mutation ────────────────────────────────────────────────────
  // For each selected option:
  //   - update its value to the mergeTarget
  //   - if mergeTarget doesn't exist yet, the first one becomes it; the rest are deactivated
  const mergeMutation = useMutation({
    mutationFn: async ({ ids, targetValue, options }) => {
      // Check if target already exists
      const existing = options.find(
        o => o.value.toLowerCase() === targetValue.toLowerCase() && !ids.includes(o.id)
      );

      // Deactivate all selected (they are superseded by target)
      await Promise.all(
        ids.map(id => ncClient.entities.MasterDataOption.update(id, {
          is_active: false,
          value:     targetValue,   // rename so future increments go to canonical
        }))
      );

      // If target doesn't exist, create it
      if (!existing) {
        const firstOpt = options.find(o => ids.includes(o.id));
        if (firstOpt) {
          await ncClient.entities.MasterDataOption.create({
            entity_type:       firstOpt.entity_type,
            field_name:        firstOpt.field_name,
            parent_value:      firstOpt.parent_value,
            company_id:        companyId,
            value:             targetValue,
            is_system_default: false,
            usage_count:       ids.length,
            is_active:         true,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["taxonomy-admin", companyId] });
      showToast("Options merged successfully");
    },
    onError: () => showToast("Merge failed", "rose"),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleDeactivate = (opt) => {
    const isActive = opt.is_active !== false;
    setConfirm({
      message: isActive
        ? `Deactivate "${opt.value}"? It will be hidden from dropdowns but its history is preserved.`
        : `Reactivate "${opt.value}"?`,
      onConfirm: () => {
        toggleActive.mutate({ id: opt.id, is_active: !isActive });
        setConfirm(null);
      },
    });
  };

  const handleMerge = (ids, targetValue) => {
    setConfirm({
      message: `Merge ${ids.length} option(s) into "${targetValue}"? The selected values will be replaced by the canonical value.`,
      onConfirm: () => {
        mergeMutation.mutate({ ids, targetValue, options: allOptions });
        setConfirm(null);
      },
    });
  };

  // ── Group by (entityType, fieldName) ───────────────────────────────────────
  const grouped = {};
  for (const tf of TAXONOMY_FIELDS) {
    const key = `${tf.entityType}:${tf.fieldName}`;
    grouped[key] = { ...tf, options: [] };
  }
  for (const opt of allOptions) {
    const key = `${opt.entity_type}:${opt.field_name}`;
    if (!grouped[key]) {
      grouped[key] = {
        entityType: opt.entity_type,
        fieldName:  opt.field_name,
        label:      `${opt.entity_type} / ${opt.field_name}`,
        options:    [],
      };
    }
    grouped[key].options.push(opt);
  }

  const sections = Object.values(grouped).filter(g => g.options.length > 0);
  const totalUnused = allOptions.filter(o => (o.usage_count || 0) === 0).length;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium
          ${toast.color === "rose" ? "bg-rose-500" : "bg-emerald-500"}`}>
          <CheckCircle2 className="w-4 h-4" />
          {toast.msg}
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <Confirm
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-100 rounded-xl">
            <Tags className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Taxonomy Admin</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Review, clean up, and merge your organisation's custom taxonomy values
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-white transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary strip */}
      {allOptions.length > 0 && (
        <div className="flex gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-center min-w-[100px]">
            <div className="text-2xl font-bold text-slate-800">{allOptions.length}</div>
            <div className="text-xs text-slate-400 mt-0.5">Total custom</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-center min-w-[100px]">
            <div className="text-2xl font-bold text-amber-600">
              {allOptions.filter(o => (o.usage_count || 0) >= 3).length}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">Frequent (≥3×)</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-center min-w-[100px]">
            <div className={`text-2xl font-bold ${totalUnused > 0 ? "text-rose-500" : "text-slate-800"}`}>
              {totalUnused}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">Unused (0×)</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-center min-w-[100px]">
            <div className="text-2xl font-bold text-slate-400">
              {allOptions.filter(o => o.is_active === false).length}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">Inactive</div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-16 text-sm text-slate-400">Loading taxonomy options…</div>
      )}

      {/* Empty */}
      {!isLoading && allOptions.length === 0 && (
        <div className="text-center py-16">
          <Tags className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No custom taxonomy options yet.</p>
          <p className="text-xs text-slate-300 mt-1">
            They are created automatically when users type new values in TaxonomySelect fields.
          </p>
        </div>
      )}

      {/* Sections */}
      <div className="flex flex-col gap-4">
        {sections.map(sec => (
          <FieldSection
            key={`${sec.entityType}:${sec.fieldName}`}
            fieldLabel={sec.label}
            options={sec.options}
            onDeactivate={handleDeactivate}
            onMerge={handleMerge}
          />
        ))}
      </div>
    </div>
  );
}
