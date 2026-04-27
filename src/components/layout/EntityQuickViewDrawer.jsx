import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createPageUrl } from "@/utils";
import {
  X, ExternalLink, Edit2, Check, Loader2, AlertTriangle, ChevronRight,
} from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

// ── Entity → Base44 class name ───────────────────────────────────────────────
const ENTITY_CLASS_MAP = {
  person: "Person", enterprise: "Enterprise", product: "Product",
  service: "Service", task: "Task", transaction: "Transaction",
  address: "Address", relationship: "Relationship",
  document: "Document", schedule: "Schedule", signal: "Signal",
  channel: "Channel", territory: "Territory",
  animal: "Animal", plot: "Plot", observation: "Observation",
};

const ETL_SLUG = {
  person: "people", enterprise: "enterprise", product: "product",
  service: "service", task: "task", transaction: "transaction",
  address: "address", relationship: "relationship",
  document: "document", schedule: "schedule", signal: "signal",
  channel: "channel", territory: "territory",
  animal: "animal", plot: "plot", observation: "observation",
};

const QUERY_KEY = {
  person: "people", enterprise: "enterprises", product: "products",
  service: "services", task: "tasks", transaction: "transactions",
  address: "addresses", relationship: "relationships",
  document: "documents", schedule: "schedules", signal: "signals",
  channel: "channels", territory: "territories",
  animal: "animals", plot: "plots", observation: "observations",
};

// ── Editable fields per entity type ─────────────────────────────────────────
const ENTITY_EDIT_FIELDS = {
  person: [
    { key: "first_name",   label: "First Name",   type: "text" },
    { key: "last_name",    label: "Last Name",    type: "text" },
    { key: "email",        label: "Email",        type: "email" },
    { key: "phone",        label: "Phone",        type: "text" },
    { key: "person_type",  label: "Person Type",  type: "select", options: ["staff","client","contact","volunteer"] },
    { key: "status",       label: "Status",       type: "select", options: ["active","inactive","on_leave"] },
    { key: "primary_role", label: "Primary Role", type: "text" },
    { key: "city",         label: "City",         type: "text" },
    { key: "country",      label: "Country",      type: "text" },
    { key: "start_date",   label: "Start Date",   type: "date" },
    { key: "end_date",     label: "End Date",     type: "date" },
  ],
  enterprise: [
    { key: "enterprise_name",   label: "Name",             type: "text" },
    { key: "short_name",        label: "Short Name",       type: "text" },
    { key: "enterprise_type",   label: "Type",             type: "select", options: ["commercial","nonprofit","government","household","cooperative","trust"] },
    { key: "operating_status",  label: "Operating Status", type: "select", options: ["open","closed","temporarily_closed","seasonal"] },
    { key: "status",            label: "Status",           type: "select", options: ["active","inactive","prospect","archived"] },
    { key: "email",             label: "Email",            type: "email" },
    { key: "phone",             label: "Phone",            type: "text" },
    { key: "city",              label: "City",             type: "text" },
    { key: "country",           label: "Country",          type: "text" },
  ],
  product: [
    { key: "name",           label: "Name",       type: "text" },
    { key: "sku",            label: "SKU",        type: "text" },
    { key: "item_type",      label: "Item Type",  type: "select", options: ["physical","living","digital","service_package","financial_instrument"] },
    { key: "status",         label: "Status",     type: "select", options: ["active","inactive","discontinued"] },
    { key: "unit_price",     label: "Unit Price", type: "number" },
    { key: "stock_quantity", label: "Stock Qty",  type: "number" },
    { key: "brand",          label: "Brand",      type: "text" },
  ],
  service: [
    { key: "name",         label: "Name",        type: "text" },
    { key: "service_type", label: "Type",        type: "text" },
    { key: "status",       label: "Status",      type: "text" },
    { key: "description",  label: "Description", type: "text", wide: true },
  ],
  task: [
    { key: "title",       label: "Title",       type: "text", wide: true },
    { key: "task_type",   label: "Task Type",   type: "text" },
    { key: "status",      label: "Status",      type: "select", options: ["pending","in_progress","completed","cancelled"] },
    { key: "priority",    label: "Priority",    type: "select", options: ["low","medium","high","urgent"] },
    { key: "due_date",    label: "Due Date",    type: "date" },
    { key: "assigned_to", label: "Assigned To", type: "text" },
    { key: "description", label: "Description", type: "text", wide: true },
  ],
  transaction: [
    { key: "description",       label: "Description", type: "text", wide: true },
    { key: "transaction_type",  label: "Type",        type: "text" },
    { key: "amount",            label: "Amount",      type: "number" },
    { key: "currency",          label: "Currency",    type: "text" },
    { key: "status",            label: "Status",      type: "select", options: ["pending","paid","overdue","cancelled","draft"] },
    { key: "invoice_number",    label: "Invoice #",   type: "text" },
    { key: "transaction_date",  label: "Date",        type: "date" },
  ],
  address: [
    { key: "label",    label: "Label",   type: "text", wide: true },
    { key: "street",   label: "Street",  type: "text", wide: true },
    { key: "city",     label: "City",    type: "text" },
    { key: "region",   label: "Region",  type: "text" },
    { key: "country",  label: "Country", type: "text" },
    { key: "zip_code", label: "ZIP",     type: "text" },
  ],
  relationship: [
    { key: "relationship_type", label: "Type",       type: "text" },
    { key: "status",            label: "Status",     type: "text" },
    { key: "role",              label: "Role",       type: "text" },
    { key: "start_date",        label: "Start Date", type: "date" },
    { key: "notes",             label: "Notes",      type: "text", wide: true },
  ],
  document: [
    { key: "title",         label: "Title",       type: "text", wide: true },
    { key: "document_type", label: "Type",        type: "text" },
    { key: "status",        label: "Status",      type: "select", options: ["draft","active","expired","signed","archived"] },
    { key: "expiry_date",   label: "Expiry Date", type: "date" },
    { key: "description",   label: "Description", type: "text", wide: true },
  ],
  schedule: [
    { key: "title",         label: "Title",      type: "text", wide: true },
    { key: "schedule_type", label: "Type",       type: "text" },
    { key: "frequency",     label: "Frequency",  type: "select", options: ["daily","weekly","biweekly","monthly","quarterly","annual"] },
    { key: "status",        label: "Status",     type: "select", options: ["active","paused","ended"] },
    { key: "start_date",    label: "Start Date", type: "date" },
    { key: "end_date",      label: "End Date",   type: "date" },
    { key: "time_of_day",   label: "Time",       type: "text" },
  ],
  signal: [
    { key: "name",            label: "Name",   type: "text", wide: true },
    { key: "signal_type",     label: "Type",   type: "text" },
    { key: "status",          label: "Status", type: "select", options: ["active","inactive","archived"] },
    { key: "value",           label: "Value",  type: "number" },
    { key: "unit_of_measure", label: "Unit",   type: "text" },
    { key: "source",          label: "Source", type: "text" },
  ],
  channel: [
    { key: "name",          label: "Name",      type: "text", wide: true },
    { key: "channel_type",  label: "Type",      type: "text" },
    { key: "purpose",       label: "Purpose",   type: "text" },
    { key: "status",        label: "Status",    type: "select", options: ["active","inactive","archived"] },
    { key: "sentiment",     label: "Sentiment", type: "select", options: ["positive","neutral","negative"] },
    { key: "message_count", label: "Messages",  type: "number" },
  ],
  territory: [
    { key: "name",                 label: "Name",        type: "text", wide: true },
    { key: "territory_type",       label: "Type",        type: "text" },
    { key: "status",               label: "Status",      type: "select", options: ["active","inactive","archived"] },
    { key: "country",              label: "Country",     type: "text" },
    { key: "region",               label: "Region",      type: "text" },
    { key: "area_km2",             label: "Area (km²)",  type: "number" },
    { key: "population_estimate",  label: "Population",  type: "number" },
  ],
  animal: [
    { key: "name",          label: "Name",         type: "text" },
    { key: "animal_type",   label: "Type",         type: "text" },
    { key: "species",       label: "Species",      type: "text" },
    { key: "breed",         label: "Breed",        type: "text" },
    { key: "sex",           label: "Sex",          type: "select", options: ["male","female","unknown"] },
    { key: "status",        label: "Status",       type: "select", options: ["active","healthy","inactive","sold","deceased","quarantine","discharged"] },
    { key: "weight_kg",     label: "Weight (kg)",  type: "number" },
    { key: "date_of_birth", label: "Date of Birth",type: "date" },
    { key: "tag_id",        label: "Tag ID",       type: "text" },
    { key: "notes",         label: "Notes",        type: "text", wide: true },
  ],
  plot: [
    { key: "name",        label: "Name",       type: "text" },
    { key: "plot_type",   label: "Type",       type: "text" },
    { key: "land_use",    label: "Land Use",   type: "text" },
    { key: "crop_type",   label: "Crop",       type: "text" },
    { key: "area_ha",     label: "Area (ha)",  type: "number" },
    { key: "status",      label: "Status",     type: "select", options: ["active","cultivated","fallow","in_use","inactive","abandoned"] },
    { key: "latitude",    label: "Latitude",   type: "number" },
    { key: "longitude",   label: "Longitude",  type: "number" },
    { key: "description", label: "Description",type: "text", wide: true },
  ],
  observation: [
    { key: "observation_type", label: "Type",         type: "text" },
    { key: "subject_type",     label: "Subject",      type: "text" },
    { key: "numeric_value",    label: "Numeric Value",type: "number" },
    { key: "unit_of_measure",  label: "Unit",         type: "text" },
    { key: "text_value",       label: "Text Value",   type: "text" },
    { key: "observed_at",      label: "Observed At",  type: "datetime-local" },
    { key: "notes",            label: "Notes",        type: "text", wide: true },
  ],
};

const STATUS_COLORS = {
  active: "bg-emerald-100 text-emerald-700", healthy: "bg-emerald-100 text-emerald-700",
  open: "bg-emerald-100 text-emerald-700", paid: "bg-emerald-100 text-emerald-700",
  completed: "bg-emerald-100 text-emerald-700", signed: "bg-emerald-100 text-emerald-700",
  cultivated: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-100 text-slate-500", closed: "bg-slate-100 text-slate-500",
  archived: "bg-slate-100 text-slate-500", deceased: "bg-slate-100 text-slate-500",
  sold: "bg-slate-100 text-slate-500", discontinued: "bg-slate-100 text-slate-500",
  fallow: "bg-amber-100 text-amber-700", paused: "bg-amber-100 text-amber-700",
  pending: "bg-amber-100 text-amber-700", on_leave: "bg-amber-100 text-amber-700",
  draft: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700", in_use: "bg-blue-100 text-blue-700",
  overdue: "bg-rose-100 text-rose-700", expired: "bg-rose-100 text-rose-700",
  quarantine: "bg-rose-100 text-rose-700", abandoned: "bg-rose-100 text-rose-700",
  cancelled: "bg-rose-100 text-rose-700",
  positive: "bg-emerald-100 text-emerald-700", negative: "bg-rose-100 text-rose-700",
  neutral: "bg-slate-100 text-slate-500",
};

const PRIORITY_COLORS = {
  low: "bg-slate-100 text-slate-500", medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700", urgent: "bg-rose-100 text-rose-700",
};

// ── helpers ──────────────────────────────────────────────────────────────────
function triggerETL(slug) {
  fetch(`${RAILWAY_URL}/load/${slug}-summary`, {
    method: "POST",
    headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
  }).catch(() => {});
}

function logAudit(companyId, entityType, result, userEmail) {
  fetch(`${RAILWAY_URL}/audit/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({
      company_id: companyId, entity_type: entityType,
      entity_id: result?.id, entity_name: result?.title || result?.id,
      action: "updated", changed_by: userEmail,
    }),
  }).catch(() => {});
}

function FieldValue({ fieldDef, value }) {
  if (value == null || value === "") return <span className="text-slate-300 text-sm">—</span>;
  if (fieldDef.key === "status" || fieldDef.key === "operating_status") {
    const cls = STATUS_COLORS[String(value).toLowerCase()] || "bg-slate-100 text-slate-600";
    return <Badge className={`${cls} text-[11px] font-medium`}>{String(value).replace(/_/g, " ")}</Badge>;
  }
  if (fieldDef.key === "priority") {
    const cls = PRIORITY_COLORS[String(value).toLowerCase()] || "bg-slate-100 text-slate-600";
    return <Badge className={`${cls} text-[11px] font-medium capitalize`}>{String(value)}</Badge>;
  }
  if (fieldDef.key === "sentiment") {
    const cls = STATUS_COLORS[String(value).toLowerCase()] || "bg-slate-100 text-slate-600";
    return <Badge className={`${cls} text-[11px] font-medium capitalize`}>{String(value)}</Badge>;
  }
  if (fieldDef.type === "date" && value) {
    try { return <span className="text-sm text-slate-700">{new Date(value).toLocaleDateString()}</span>; } catch {}
  }
  if (fieldDef.type === "datetime-local" && value) {
    try { return <span className="text-sm text-slate-700">{new Date(value).toLocaleString()}</span>; } catch {}
  }
  if (fieldDef.type === "number") {
    return <span className="font-mono text-sm text-slate-700">{value}</span>;
  }
  if (fieldDef.type === "email") {
    return <a href={`mailto:${value}`} className="text-sm text-emerald-600 hover:underline">{String(value)}</a>;
  }
  return <span className="text-sm text-slate-700">{String(value).replace(/_/g, " ")}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EntityQuickViewDrawer({ result, onClose, currentUser }) {
  const [record, setRecord]       = useState(null);
  const [fetching, setFetching]   = useState(false);
  const [editing, setEditing]     = useState(false);
  const [form, setForm]           = useState({});
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved]         = useState(false);

  const navigate = useNavigate();
  const qc = useQueryClient();

  // Fetch full record when result changes
  useEffect(() => {
    setEditing(false);
    setSaveError(null);
    setSaved(false);
    if (!result) { setRecord(null); return; }

    const className = ENTITY_CLASS_MAP[result.type];
    if (!className || !base44.entities[className]) return;

    setFetching(true);
    base44.entities[className]
      .filter({ id: result.id }, undefined, 1)
      .then(res => {
        const rec = res[0] || null;
        setRecord(rec);
        setForm(rec || {});
      })
      .catch(() => {
        // Fallback: show whatever the normalised result has
        setRecord(null);
      })
      .finally(() => setFetching(false));
  }, [result?.id, result?.type]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    setSaveError(null);
    const className = ENTITY_CLASS_MAP[result.type];
    try {
      await base44.entities[className].update(result.id, form);
      const slug = ETL_SLUG[result.type];
      const qKey = QUERY_KEY[result.type];
      if (slug) triggerETL(slug);
      if (qKey) { qc.invalidateQueries({ queryKey: [qKey] }); qc.refetchQueries({ queryKey: [qKey] }); }
      logAudit(currentUser?.company_id, result.type, result, currentUser?.email);
      setRecord(f => ({ ...f, ...form }));
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError("Save failed — please try again.");
    }
    setSaving(false);
  };

  const handleNavigate = () => {
    navigate(`${createPageUrl(result.page)}?id=${encodeURIComponent(result.id)}`);
    onClose();
  };

  const editFields = result ? (ENTITY_EDIT_FIELDS[result.type] || []) : [];
  const Icon = result?.icon;
  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const drawer = (
    <AnimatePresence>
      {result && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[199] bg-black/20 backdrop-blur-[1px]"
            onClick={onClose}
          />

          {/* Drawer panel */}
          <motion.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="fixed right-0 top-0 h-full z-[200] bg-white shadow-2xl flex flex-col border-l border-slate-200"
            style={{ width: "min(500px, 100vw)" }}
          >
            {/* ── Header ── */}
            <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0`}>
                    {Icon && <Icon className={`w-5 h-5 ${result.color}`} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{result.entityLabel}</p>
                    <h2 className="text-[15px] font-bold text-slate-800 leading-snug truncate max-w-[280px]">{result.title || "—"}</h2>
                    <p className="text-xs text-slate-400 truncate">{result.subtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                  {saved && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium mr-1">
                      <Check className="w-3 h-3" /> Saved
                    </span>
                  )}
                  {!editing && (
                    <button
                      onClick={() => { setEditing(true); setForm(record || {}); setSaved(false); }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {fetching ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                  <p className="text-xs text-slate-400">Loading record…</p>
                </div>
              ) : editing ? (
                /* ── Edit mode ── */
                <div className="space-y-3">
                  {saveError && (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      {saveError}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {editFields.map(f => (
                      <div key={f.key} className={f.wide ? "col-span-2" : ""}>
                        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1 block">
                          {f.label}
                        </label>
                        {f.type === "select" ? (
                          <select
                            value={form[f.key] ?? ""}
                            onChange={e => setField(f.key, e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                          >
                            <option value="">—</option>
                            {f.options.map(o => (
                              <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            type={f.type}
                            value={form[f.key] ?? ""}
                            onChange={e => setField(f.key, e.target.value)}
                            className="text-sm"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                editFields.length > 0 ? (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                    {editFields.map(f => {
                      const value = record?.[f.key];
                      return (
                        <div key={f.key} className={f.wide ? "col-span-2" : ""}>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">
                            {f.label}
                          </p>
                          <FieldValue fieldDef={f} value={value} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-8">
                    No fields configured for this entity type.
                  </p>
                )
              )}
            </div>

            {/* ── Footer ── */}
            <div className="flex-shrink-0 px-5 py-3.5 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50/60">
              {editing ? (
                <div className="flex items-center gap-2 w-full justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setEditing(false); setSaveError(null); }}
                    className="rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {saving
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      : <Check className="w-3.5 h-3.5 mr-1" />}
                    {saving ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-[10px] text-slate-300 font-mono select-all">
                    {result.id?.slice(0, 16)}…
                  </p>
                  <button
                    onClick={handleNavigate}
                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors group"
                  >
                    Open in {result.entityLabel}
                    <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return ReactDOM.createPortal(drawer, document.body);
}
