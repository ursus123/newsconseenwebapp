import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ChevronLeft, ChevronRight, User, Building2, Users, CheckCircle2, Search,
  MapPin, Plus, ArrowRight, Loader2
} from "lucide-react";

// ── tiny helpers ────────────────────────────────────────────────────────────
const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
    {children}
  </div>
);
const Input = (props) => (
  <input {...props} className={`w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white ${props.className || ""}`} />
);
const Select = ({ children, ...props }) => (
  <select {...props} className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
    {children}
  </select>
);
const StepBtn = ({ onClick, disabled, children, variant = "primary" }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed
      ${variant === "primary" ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
  >
    {children}
  </button>
);

const STEPS = ["Client Type", "Details", "Address", "Relationships", "Confirm"];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => (
        <React.Fragment key={s}>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all
            ${i === current ? "bg-emerald-600 text-white" : i < current ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
            {i < current ? <CheckCircle2 className="w-3 h-3" /> : null}
            {s}
          </div>
          {i < STEPS.length - 1 && <div className={`h-0.5 w-4 rounded ${i < current ? "bg-emerald-400" : "bg-slate-200"}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

// Fuzzy search helper with scoring
function fuzzySearch(items, query, searchFields) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase().trim();
  
  const scored = items.map((item) => {
    let score = 0;
    let matchedField = "";
    let matchedValue = "";
    
    for (const field of searchFields) {
      const value = String(item[field] || "").toLowerCase();
      if (!value) continue;
      
      // Exact match (highest score)
      if (value === q) {
        score = Math.max(score, 100);
        matchedField = field;
        matchedValue = item[field];
      }
      // Starts with query (high score)
      else if (value.startsWith(q)) {
        score = Math.max(score, 80);
        if (!matchedField) {
          matchedField = field;
          matchedValue = item[field];
        }
      }
      // Contains query (medium score)
      else if (value.includes(q)) {
        score = Math.max(score, 60);
        if (!matchedField) {
          matchedField = field;
          matchedValue = item[field];
        }
      }
      // Fuzzy match: check if all query chars appear in order
      else {
        let qIdx = 0;
        for (let i = 0; i < value.length && qIdx < q.length; i++) {
          if (value[i] === q[qIdx]) qIdx++;
        }
        if (qIdx === q.length) {
          score = Math.max(score, 40);
          if (!matchedField) {
            matchedField = field;
            matchedValue = item[field];
          }
        }
      }
    }
    
    return { item, score, matchedField, matchedValue };
  });
  
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => ({ ...s.item, _matchInfo: { field: s.matchedField, value: s.matchedValue } }));
}

// Search + select or create new
function ExistingPicker({ items, labelKey, type, onSelect, selected }) {
  const [q, setQ] = useState("");
  
  // Define search fields based on type
  const searchFields = type === "person" 
    ? ["first_name", "last_name", "preferred_name", "email", "phone"]
    : type === "enterprise"
    ? ["enterprise_name", "short_name", "email", "phone"]
    : ["label", "address_line1", "city", "state_region", "country"];
  
  const filtered = fuzzySearch(items, q, searchFields);
  
  const placeholder = type === "person"
    ? "Search by name, email, or phone…"
    : type === "enterprise"
    ? "Search by name, email, or phone…"
    : "Search by address, city, or region…";
  
  const getDisplayText = (item) => {
    if (type === "person") {
      const name = `${item.first_name} ${item.last_name}`;
      const extra = item.email || item.phone;
      return extra ? `${name} • ${extra}` : name;
    }
    if (type === "enterprise") {
      const name = item.enterprise_name;
      const extra = item.short_name || item.email;
      return extra ? `${name} • ${extra}` : name;
    }
    return item[labelKey];
  };
  
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>
      {q.length >= 2 && filtered.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
          {filtered.slice(0, 10).map((item) => (
            <button
              key={item.id}
              onClick={() => { onSelect(item); setQ(""); }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-50 transition-colors border-b border-slate-50 last:border-0
                ${selected?.id === item.id ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-slate-700"}`}
            >
              <div className="font-medium">{getDisplayText(item)}</div>
              {item._matchInfo?.field && item._matchInfo.field !== labelKey && (
                <div className="text-xs text-slate-400 mt-0.5">
                  Match: {item._matchInfo.field.replace("_", " ")}
                </div>
              )}
              {selected?.id === item.id && <CheckCircle2 className="inline ml-2 w-3.5 h-3.5 text-emerald-500" />}
            </button>
          ))}
        </div>
      )}
      {q.length >= 2 && filtered.length === 0 && (
        <div className="px-4 py-3 text-xs text-slate-400 text-center border border-slate-100 rounded-xl">
          No matches found
        </div>
      )}
      {selected && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-semibold">
          <CheckCircle2 className="w-4 h-4" /> Using: {getDisplayText(selected)}
          <button onClick={() => onSelect(null)} className="ml-auto text-slate-400 hover:text-rose-500 font-normal text-xs">× Clear</button>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function AddClient() {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);

  // Step 0
  const [clientType, setClientType] = useState(null); // "individual" | "business" | "both"

  // Step 1 — Person
  const [personData, setPersonData] = useState({ first_name: "", last_name: "", email: "", phone: "", person_type: "client", primary_role: "" });
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [createPerson, setCreatePerson] = useState(true);

  // Step 1 — Enterprise
  const [enterpriseData, setEnterpriseData] = useState({ enterprise_name: "", enterprise_type: "other", relationshipRole: "Client" });
  const [selectedEnterprise, setSelectedEnterprise] = useState(null);
  const [createEnterprise, setCreateEnterprise] = useState(true);

  // Step 2 — Address
  const [addressData, setAddressData] = useState({ label: "Billing", address_line1: "", city: "", state_region: "", country: "", postal_code: "" });
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [skipAddress, setSkipAddress] = useState(false);

  // Step 3 — Relationships: auto-generated from context
  const [relationships, setRelationships] = useState([]);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const { data: people = [] } = useQuery({ queryKey: ["people"], queryFn: () => base44.entities.Person.list() });
  const { data: enterprises = [] } = useQuery({ queryKey: ["enterprises"], queryFn: () => base44.entities.Enterprise.list() });
  const { data: addresses = [] } = useQuery({ queryKey: ["addresses"], queryFn: () => base44.entities.Address.list() });

  const needsPerson = clientType === "individual" || clientType === "both";
  const needsEnterprise = clientType === "business" || clientType === "both";

  // ── Step nav ────────────────────────────────────────────────────────────
  const goNext = () => setStep((s) => Math.min(s + 1, 4));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const canAdvanceStep0 = !!clientType;
  const canAdvanceStep1 = (
    (!needsPerson || selectedPerson || (personData.first_name && personData.last_name)) &&
    (!needsEnterprise || selectedEnterprise || enterpriseData.enterprise_name)
  );
  const canAdvanceStep2 = skipAddress || selectedAddress || addressData.address_line1;

  // Build relationships when entering step 3
  const buildRelationships = () => {
    const rels = [];
    const today = new Date().toISOString().slice(0, 10);
    const personName = selectedPerson
      ? `${selectedPerson.first_name} ${selectedPerson.last_name}`
      : needsPerson ? `${personData.first_name} ${personData.last_name}` : null;
    const entName = selectedEnterprise?.enterprise_name || (needsEnterprise ? enterpriseData.enterprise_name : null);
    const addrLine = selectedAddress?.address_line1 || (skipAddress ? null : addressData.address_line1);

    if (personName && entName) {
      rels.push({ relationship_type: "person_enterprise", person_name: personName, enterprise_name: entName, role: personData.primary_role || "Client", start_date: today });
    }
    if (personName && addrLine) {
      rels.push({ relationship_type: "item_person", person_name: personName, item_name: addrLine, role: "Billing Address", start_date: today });
    }
    if (entName && addrLine) {
      rels.push({ relationship_type: "item_enterprise", enterprise_name: entName, item_name: addrLine, role: "Billing", start_date: today });
    }
    setRelationships(rels);
  };

  const handleNext = () => {
    if (step === 2) buildRelationships();
    goNext();
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);

    let finalPerson = selectedPerson;
    let finalEnterprise = selectedEnterprise;
    let finalAddress = selectedAddress;

    if (needsPerson && !selectedPerson && personData.first_name) {
      finalPerson = await base44.entities.Person.create({ ...personData, status: "active" });
    }
    if (needsEnterprise && !selectedEnterprise && enterpriseData.enterprise_name) {
      finalEnterprise = await base44.entities.Enterprise.create({ ...enterpriseData, status: "active" });
    }
    if (!skipAddress && !selectedAddress && addressData.address_line1) {
      finalAddress = await base44.entities.Address.create({ ...addressData, status: "active" });
    }

    const personName = finalPerson ? `${finalPerson.first_name} ${finalPerson.last_name}` : null;
    const entName = finalEnterprise?.enterprise_name || null;
    const addrLine1 = finalAddress?.address_line1 || null;

    const relPromises = [];
    if (personName && entName) {
      relPromises.push(base44.entities.Relationship.create({ relationship_type: "person_enterprise", person_name: personName, enterprise_name: entName, role: personData.primary_role || "Client", start_date: today, status: "active" }));
    }
    if (personName && addrLine1) {
      relPromises.push(base44.entities.Relationship.create({ relationship_type: "item_person", person_name: personName, item_name: addrLine1, role: "Billing Address", start_date: today, status: "active" }));
    }
    if (entName && addrLine1) {
      relPromises.push(base44.entities.Relationship.create({ relationship_type: "item_enterprise", enterprise_name: entName, item_name: addrLine1, role: "Billing", start_date: today, status: "active" }));
    }
    await Promise.all(relPromises);

    qc.invalidateQueries();
    setSaving(false);
    setDone(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-6">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-black text-slate-800">Client Added!</h2>
          <p className="text-slate-400 mt-1 text-sm">All records and relationships have been saved.</p>
        </div>
        <div className="flex gap-3">
          <Link to={createPageUrl("People")} className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-colors">View People</Link>
          <button onClick={() => { setStep(0); setClientType(null); setSelectedPerson(null); setSelectedEnterprise(null); setSelectedAddress(null); setPersonData({ first_name: "", last_name: "", email: "", phone: "", role: "Customer" }); setEnterpriseData({ enterprise_name: "", enterprise_type: "other" }); setAddressData({ label: "Billing", address_line1: "", city: "", state_region: "", country: "", postal_code: "" }); setDone(false); setRelationships([]); }} className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors">Add Another Client</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Add Client</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">Guided client intake</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Step indicator */}
        <div className="overflow-x-auto pb-1">
          <StepIndicator current={step} />
        </div>

        {/* ── Step 0: Client Type ── */}
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-black text-slate-800">Who is the client?</h2>
              <p className="text-sm text-slate-400 mt-1">Select the type to determine which records will be created.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { key: "individual", icon: User, label: "Individual", desc: "A person as the client" },
                { key: "business", icon: Building2, label: "Business", desc: "A company or enterprise" },
                { key: "both", icon: Users, label: "Individual + Business", desc: "A person representing a business" },
              ].map(({ key, icon: Icon, label, desc }) => (
                <button
                  key={key}
                  onClick={() => setClientType(key)}
                  className={`flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all text-center
                    ${clientType === key ? "border-emerald-500 bg-emerald-50 shadow-md" : "border-slate-200 bg-white hover:border-slate-300"}`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${clientType === key ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-800">{label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 1: Person + Enterprise details ── */}
        {step === 1 && (
          <div className="space-y-8">
            {needsPerson && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-slate-400" />
                  <h3 className="font-bold text-slate-800">Person</h3>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-slate-400 font-medium">Search for an existing person first:</p>
                  <ExistingPicker items={people} labelKey="first_name" type="person" onSelect={setSelectedPerson} selected={selectedPerson} />
                </div>
                {!selectedPerson && (
                  <div className="space-y-4 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Plus className="w-3 h-3" /> Or create new</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="First Name"><Input value={personData.first_name} onChange={(e) => setPersonData({ ...personData, first_name: e.target.value })} placeholder="Jane" /></Field>
                      <Field label="Last Name"><Input value={personData.last_name} onChange={(e) => setPersonData({ ...personData, last_name: e.target.value })} placeholder="Smith" /></Field>
                    </div>
                    <Field label="Email"><Input type="email" value={personData.email} onChange={(e) => setPersonData({ ...personData, email: e.target.value })} placeholder="jane@example.com" /></Field>
                    <Field label="Phone"><Input value={personData.phone} onChange={(e) => setPersonData({ ...personData, phone: e.target.value })} placeholder="+1 555 000 0000" /></Field>
                    <Field label="Person Type">
                      <Select value={personData.person_type} onChange={(e) => setPersonData({ ...personData, person_type: e.target.value })}>
                        {["employee","contractor","freelancer","vendor","client","patient","external_partner"].map((t) => (
                          <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Role (in Relationship)">
                      <Select value={personData.primary_role} onChange={(e) => setPersonData({ ...personData, primary_role: e.target.value })}>
                        <option value="">Select role…</option>
                        {["Owner","Manager","Employee","Contractor","Consultant","Director","Supervisor","Coordinator","Assistant","Analyst","Developer","Designer","Sales Rep","Customer","Client","Vendor","Partner","Representative","Other"].map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}
              </div>
            )}

            {needsEnterprise && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-slate-400" />
                  <h3 className="font-bold text-slate-800">Enterprise</h3>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-slate-400 font-medium">Search for an existing enterprise first:</p>
                  <ExistingPicker items={enterprises} labelKey="enterprise_name" type="enterprise" onSelect={setSelectedEnterprise} selected={selectedEnterprise} />
                </div>
                {!selectedEnterprise && (
                  <div className="space-y-4 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Plus className="w-3 h-3" /> Or create new</p>
                    <Field label="Business Name"><Input value={enterpriseData.enterprise_name} onChange={(e) => setEnterpriseData({ ...enterpriseData, enterprise_name: e.target.value })} placeholder="Acme Corp" /></Field>
                    <Field label="Enterprise Type">
                      <Select value={enterpriseData.enterprise_type} onChange={(e) => setEnterpriseData({ ...enterpriseData, enterprise_type: e.target.value })}>
                        {["retail","food_beverage","healthcare","technology","construction","education","finance","manufacturing","logistics","hospitality","agriculture","media","other"].map((t) => (
                          <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Role (in Relationship)">
                      <Select value={enterpriseData.relationshipRole} onChange={(e) => setEnterpriseData({ ...enterpriseData, relationshipRole: e.target.value })}>
                        {["Client","Customer","Supplier","Partner","Vendor","Contractor","Sub-contractor","Franchisor","Franchisee","Distributor","Agent","Other"].map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Address ── */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-slate-400" />
              <h3 className="font-bold text-slate-800">Address</h3>
            </div>
            <ExistingPicker items={addresses} labelKey="address_line1" type="address" onSelect={setSelectedAddress} selected={selectedAddress} />
            {!selectedAddress && !skipAddress && (
              <div className="space-y-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Plus className="w-3 h-3" /> New address</p>
                <Field label="Label"><Input value={addressData.label} onChange={(e) => setAddressData({ ...addressData, label: e.target.value })} placeholder="Billing, HQ, Home…" /></Field>
                <Field label="Address Line 1"><Input value={addressData.address_line1} onChange={(e) => setAddressData({ ...addressData, address_line1: e.target.value })} placeholder="123 Main St" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City"><Input value={addressData.city} onChange={(e) => setAddressData({ ...addressData, city: e.target.value })} placeholder="New York" /></Field>
                  <Field label="Postal Code"><Input value={addressData.postal_code} onChange={(e) => setAddressData({ ...addressData, postal_code: e.target.value })} placeholder="10001" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="State / Region"><Input value={addressData.state_region} onChange={(e) => setAddressData({ ...addressData, state_region: e.target.value })} /></Field>
                  <Field label="Country"><Input value={addressData.country} onChange={(e) => setAddressData({ ...addressData, country: e.target.value })} /></Field>
                </div>
              </div>
            )}
            <button onClick={() => setSkipAddress((v) => !v)} className="text-xs text-slate-400 hover:text-slate-600 underline">
              {skipAddress ? "Add address" : "Skip — no address for now"}
            </button>
          </div>
        )}

        {/* ── Step 3: Relationships preview ── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-black text-slate-800">Relationships to create</h2>
              <p className="text-sm text-slate-400 mt-1">These links define the client role in the system.</p>
            </div>
            {relationships.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No automatic relationships detected (e.g. individual with no enterprise).</p>
            ) : (
              <div className="space-y-3">
                {relationships.map((r, i) => (
                  <div key={i} className="bg-white border border-slate-100 rounded-2xl px-5 py-4 flex items-center gap-3 shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <div className="text-sm text-slate-700 flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{r.person_name || r.enterprise_name}</span>
                      <ArrowRight className="w-3 h-3 text-slate-300" />
                      <span className="font-semibold">{r.enterprise_name || r.item_name}</span>
                      <span className="text-slate-400 text-xs">as {r.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Confirm ── */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-black text-slate-800">Ready to save</h2>
              <p className="text-sm text-slate-400 mt-1">Review what will be created, then confirm.</p>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-3 shadow-sm text-sm">
              {needsPerson && <p className="text-slate-700"><span className="font-bold">Person:</span> {selectedPerson ? `${selectedPerson.first_name} ${selectedPerson.last_name} (existing)` : `${personData.first_name} ${personData.last_name} (new)`}</p>}
              {needsEnterprise && <p className="text-slate-700"><span className="font-bold">Enterprise:</span> {selectedEnterprise ? `${selectedEnterprise.enterprise_name} (existing)` : `${enterpriseData.enterprise_name} (new)`}</p>}
              {!skipAddress && <p className="text-slate-700"><span className="font-bold">Address:</span> {selectedAddress ? `${selectedAddress.address_line1} (existing)` : addressData.address_line1 ? `${addressData.address_line1} (new)` : "—"}</p>}
              <p className="text-slate-700"><span className="font-bold">Relationships:</span> {relationships.length}</p>
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex items-center justify-between pt-2">
          {step > 0
            ? <StepBtn variant="secondary" onClick={goBack}><ChevronLeft className="w-4 h-4" /> Back</StepBtn>
            : <div />}
          {step < 4 ? (
            <StepBtn
              onClick={handleNext}
              disabled={step === 0 ? !canAdvanceStep0 : step === 1 ? !canAdvanceStep1 : step === 2 ? !canAdvanceStep2 : false}
            >
              Next <ChevronRight className="w-4 h-4" />
            </StepBtn>
          ) : (
            <StepBtn onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-4 h-4" /> Save Client</>}
            </StepBtn>
          )}
        </div>
      </div>
    </div>
  );
}