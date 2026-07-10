import React, { useState, useEffect, useRef } from "react";
import { ncClient } from "@/api/ncClient";
import { useQuery } from "@tanstack/react-query";
import { createRecord } from "@/services/dataService";
import { format } from "date-fns";
import { X, Save, Plus, Trash2, Loader2, Search, Zap } from "lucide-react";

// Fetch drug suggestions from OpenFDA
async function fetchFdaDrugs(query) {
  if (!query || query.length < 2) return [];
  const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${encodeURIComponent(query)}"&limit=5`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.results || []).map((r) => {
    const openfda = r.openfda || {};
    const brandName = openfda.brand_name?.[0] || "";
    const genericName = openfda.generic_name?.[0] || "";
    const strength = openfda.strength?.[0] || r.dosage_and_administration_table?.[0] || "";
    const route = openfda.route?.[0]?.toLowerCase() || "";
    const dosageInstructions = r.dosage_and_administration?.[0] || "";
    const indication = r.indications_and_usage?.[0] || "";
    const warnings = r.warnings?.[0] || "";
    return { brandName, genericName, strength, route, dosageInstructions, indication, warnings, _source: "fda" };
  }).filter((d) => d.brandName);
}

function MedSearchInput({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || "");
  const [fdaResults, setFdaResults] = useState([]);
  const [fdaLoading, setFdaLoading] = useState(false);
  const debounceRef = useRef(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products-med"],
    queryFn: () => ncClient.entities.Product.list(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const filteredProducts = products.filter((p) => p.name?.toLowerCase().includes(q.toLowerCase()));

  // Debounced FDA search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setFdaResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setFdaLoading(true);
      const results = await fetchFdaDrugs(q);
      setFdaResults(results);
      setFdaLoading(false);
    }, 400);
  }, [q]);

  const handleSelectProduct = (p) => {
    setQ(p.name);
    onChange(p.name, p);
    setOpen(false);
  };

  const handleSelectFda = (drug) => {
    const name = drug.brandName;
    setQ(name);
    // Build autofill payload similar to a product record
    const autofill = {
      _fdaAutofill: true,
      strength: drug.strength,
      route: drug.route,
      dosage_instructions: drug.dosageInstructions,
      indication: drug.indication,
      side_effects: drug.warnings,
    };
    onChange(name, autofill);
    setOpen(false);
  };

  const showDropdown = open && (filteredProducts.length > 0 || fdaResults.length > 0 || fdaLoading);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); onChange(e.target.value, null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search inventory or drug database…"
          className={INPUT + " pl-8"}
        />
        {fdaLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400 animate-spin" />}
      </div>
      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
          {/* Inventory results */}
          {filteredProducts.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">Your Inventory</div>
              {filteredProducts.slice(0, 5).map((p) => (
                <button key={p.id} type="button" onMouseDown={() => handleSelectProduct(p)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 text-gray-800 border-b border-gray-50 last:border-0">
                  <span className="font-medium">{p.name}</span>
                  {p.sku && <span className="text-xs text-gray-400 ml-2">SKU: {p.sku}</span>}
                </button>
              ))}
            </>
          )}
          {/* FDA results */}
          {fdaResults.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-bold text-blue-500 uppercase tracking-wider bg-blue-50 border-b border-blue-100 flex items-center gap-1">
                <Zap className="w-3 h-3" /> OpenFDA Drug Database
              </div>
              {fdaResults.map((drug, i) => (
                <button key={i} type="button" onMouseDown={() => handleSelectFda(drug)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 text-gray-800 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-blue-700">{drug.brandName}</span>
                    <span className="text-[10px] bg-blue-100 text-blue-600 rounded px-1.5 py-0.5 font-bold">FDA</span>
                  </div>
                  {drug.genericName && <p className="text-xs text-gray-400 mt-0.5">{drug.genericName}{drug.strength ? ` · ${drug.strength}` : ""}{drug.route ? ` · ${drug.route}` : ""}</p>}
                </button>
              ))}
            </>
          )}
          {fdaLoading && (
            <div className="px-3 py-3 text-xs text-gray-400 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Searching drug database…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ROUTES = ["oral", "sublingual", "topical", "inhalation", "injection", "rectal", "ophthalmic", "otic", "nasal", "IV", "other"];
const STATUSES = [
  { value: "active", label: "Active" },
  { value: "prn", label: "PRN (As Needed)" },
  { value: "on_hold", label: "On Hold" },
  { value: "discontinued", label: "Discontinued" },
];

const EMPTY = {
  medication_name: "", strength: "", dose_amount: "", route: "oral",
  frequency: "", schedule_times: ["08:00"], prescriber: "", indication: "",
  instructions: "", start_date: "", end_date: "", status: "active",
  discontinue_reason: "", pharmacy: "", rx_number: "", refills_remaining: "", notes: "",
};

export default function MedProfileForm({ client, existing, onClose, onSuccess }) {
  const [form, setForm] = useState(existing ? {
    ...EMPTY,
    ...existing,
    schedule_times: existing.schedule_times?.length ? existing.schedule_times : ["08:00"],
  } : {
    ...EMPTY,
    start_date: format(new Date(), "yyyy-MM-dd"),
  });
  const [loading, setLoading] = useState(false);
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => ncClient.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const addTime = () => set("schedule_times", [...(form.schedule_times || []), "08:00"]);
  const removeTime = (i) => set("schedule_times", form.schedule_times.filter((_, idx) => idx !== i));
  const updateTime = (i, v) => set("schedule_times", form.schedule_times.map((t, idx) => idx === i ? v : t));

  const handleSave = async () => {
    setLoading(true);
    const clientFullName = `${client.first_name} ${client.last_name}`;
    const payload = {
      ...form,
      client_id: client.id,
      client_name: clientFullName,
      refills_remaining: form.refills_remaining !== "" ? Number(form.refills_remaining) : undefined,
    };

    if (existing) {
      await ncClient.entities.MedicationProfile.update(existing.id, payload);
    } else {
      // 1. Save MedicationProfile
      await ncClient.entities.MedicationProfile.create(payload);

      // 2. Upsert into Products table (only if not already there)
      const existingProducts = await ncClient.entities.Product.filter({ name: form.medication_name });
      let productRecord = existingProducts[0];
      if (!productRecord) {
        productRecord = await createRecord("product", {
          name: form.medication_name,
          item_type: "consumable",
          category: "health_beauty",
          status: "active",
          ...(form.strength && { sku: form.strength }),
          ...(form.instructions && { dosage_instructions: form.instructions }),
          ...(form.notes && { side_effects: form.notes }),
          ...(form.rx_number && { batch_number: form.rx_number }),
        }, currentUser);
      }

      // 3. Create Relationship: item_person (medication ↔ client/patient)
      await createRecord("relationship", {
        relationship_type: "item_person",
        status: "active",
        item_name: form.medication_name,
        person_name: clientFullName,
        role: "patient",
        start_date: form.start_date || new Date().toISOString().split("T")[0],
        notes: `Medication assigned via MedAdmin. Rx: ${form.rx_number || "N/A"}`,
      }, currentUser);
    }

    setLoading(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex-1">
            <h2 className="text-base font-black text-gray-900">{existing ? "Edit Medication" : "Add Medication"}</h2>
            <p className="text-xs text-gray-400">{client.first_name} {client.last_name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Medication name — searchable from Products */}
          <Field label="Medication Name *">
            <MedSearchInput
              value={form.medication_name}
              onChange={(name, product) => {
                set("medication_name", name);
                if (product?._fdaAutofill) {
                  // Autofill from OpenFDA
                  if (product.strength) set("strength", product.strength);
                  if (product.route) set("route", product.route);
                  if (product.dosage_instructions) set("instructions", product.dosage_instructions.slice(0, 500));
                  if (product.indication) set("indication", product.indication.slice(0, 300));
                  if (product.side_effects) set("notes", `Side effects: ${product.side_effects.slice(0, 300)}`);
                } else if (product) {
                  // Autofill from local inventory
                  if (product.dosage_instructions && !form.instructions) set("instructions", product.dosage_instructions);
                  if (product.side_effects && !form.notes) set("notes", `Side effects: ${product.side_effects}`);
                  if (product.batch_number && !form.rx_number) set("rx_number", product.batch_number);
                }
              }}
            />
          </Field>

          {/* Strength + Dose */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Strength">
              <input value={form.strength} onChange={(e) => set("strength", e.target.value)}
                placeholder="e.g. 0.5mg" className={INPUT} />
            </Field>
            <Field label="Give Amount / Dose">
              <input value={form.dose_amount} onChange={(e) => set("dose_amount", e.target.value)}
                placeholder="e.g. 1 Capsule" className={INPUT} />
            </Field>
          </div>

          {/* Route + Frequency */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Route">
              <select value={form.route} onChange={(e) => set("route", e.target.value)} className={INPUT}>
                {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Frequency">
              <input value={form.frequency} onChange={(e) => set("frequency", e.target.value)}
                placeholder="e.g. 1 X DAILY" className={INPUT} />
            </Field>
          </div>

          {/* Schedule Times */}
          <Field label="Schedule Time(s)">
            <div className="space-y-2">
              {(form.schedule_times || []).map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="time" value={t} onChange={(e) => updateTime(i, e.target.value)}
                    className={INPUT + " flex-1"} />
                  {form.schedule_times.length > 1 && (
                    <button onClick={() => removeTime(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addTime} className="flex items-center gap-1.5 text-xs text-blue-600 font-bold hover:underline">
                <Plus className="w-3.5 h-3.5" /> Add time slot
              </button>
            </div>
          </Field>

          {/* Prescriber */}
          <Field label="Prescriber">
            <input value={form.prescriber} onChange={(e) => set("prescriber", e.target.value)}
              placeholder="e.g. Dr. Jane Smith / FNPC" className={INPUT} />
          </Field>

          {/* Indication */}
          <Field label="Indication / Purpose">
            <input value={form.indication} onChange={(e) => set("indication", e.target.value)}
              placeholder="e.g. Digestive disorder" className={INPUT} />
          </Field>

          {/* Instructions */}
          <Field label="Instructions / Comments">
            <textarea value={form.instructions} onChange={(e) => set("instructions", e.target.value)}
              rows={2} placeholder="e.g. TAKE 1 CAPSULE BY MOUTH EVERY MORNING"
              className={INPUT + " resize-none"} />
          </Field>

          {/* Start / End dates */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={INPUT} />
            </Field>
            <Field label="End Date">
              <input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} className={INPUT} />
            </Field>
          </div>

          {/* Status */}
          <Field label="Status">
            <select value={form.status} onChange={(e) => set("status", e.target.value)} className={INPUT}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>

          {form.status === "discontinued" && (
            <Field label="Discontinuation Reason">
              <textarea value={form.discontinue_reason} onChange={(e) => set("discontinue_reason", e.target.value)}
                rows={2} placeholder="Reason…" className={INPUT + " resize-none"} />
            </Field>
          )}

          {/* Pharmacy / Rx */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pharmacy">
              <input value={form.pharmacy} onChange={(e) => set("pharmacy", e.target.value)}
                placeholder="Pharmacy name" className={INPUT} />
            </Field>
            <Field label="Rx #">
              <input value={form.rx_number} onChange={(e) => set("rx_number", e.target.value)}
                placeholder="Rx number" className={INPUT} />
            </Field>
          </div>

          <Field label="Refills Remaining">
            <input type="number" min="0" value={form.refills_remaining}
              onChange={(e) => set("refills_remaining", e.target.value)}
              placeholder="0" className={INPUT} />
          </Field>

          {/* Notes */}
          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
              rows={2} placeholder="Internal notes…" className={INPUT + " resize-none"} />
          </Field>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !form.medication_name}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-blue-700"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {loading ? "Saving…" : existing ? "Save Changes" : "Add Medication"}
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">{label}</label>
      {children}
    </div>
  );
}