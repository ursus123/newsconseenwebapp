import React, { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown, Search, X, User, Building2, Package, MapPin } from "lucide-react";

// ── Shared dropdown shell (not exported) ───────────────────────────────────────

function PickerShell({ icon: Icon, triggerLabel, placeholder, open, setOpen, search, setSearch, onClear, children, disabled }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-colors
          ${open ? "border-slate-400 ring-2 ring-slate-100" : "border-slate-200 hover:border-slate-300"}
          ${disabled ? "bg-slate-50 cursor-not-allowed" : "bg-white cursor-pointer"}`}
      >
        <Icon className="w-4 h-4 text-slate-400 shrink-0" />
        <span className={`flex-1 truncate ${triggerLabel ? "text-slate-800" : "text-slate-400"}`}>
          {triggerLabel || placeholder}
        </span>
        {triggerLabel && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-lg">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">{children}</div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return <p className="text-xs text-slate-400 text-center py-5">No results</p>;
}

// ── PersonPicker ───────────────────────────────────────────────────────────────

/**
 * PersonPicker — stores person_id, displays name.
 *
 * Props:
 *   value        string | null   — person ID
 *   onChange     (person | null) => void
 *   currentUser  object
 *   placeholder  string
 *   personType   "staff" | "client" | "contact" | "volunteer" | undefined  — optional filter
 *   className    string
 */
export function PersonPicker({ value, onChange, currentUser, placeholder = "Select person", personType, className = "" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: persons = [] } = useQuery({
    queryKey: ["picker_persons", currentUser?.company_id],
    queryFn: () => base44.entities.Person.filter({ company_id: currentUser.company_id }),
    enabled: !!currentUser?.company_id,
    staleTime: 60000,
  });

  const selected = persons.find((p) => p.id === value) || null;

  const filtered = persons.filter((p) => {
    const name = `${p.first_name || ""} ${p.last_name || ""}`.toLowerCase();
    const matchType = !personType || p.person_type === personType;
    const matchSearch =
      !search ||
      name.includes(search.toLowerCase()) ||
      (p.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.preferred_name || "").toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const displayName = (p) =>
    `${p.preferred_name || p.first_name || ""} ${p.last_name || ""}`.trim();

  return (
    <div className={className}>
      <PickerShell
        icon={User}
        triggerLabel={selected ? displayName(selected) : ""}
        placeholder={placeholder}
        open={open}
        setOpen={setOpen}
        search={search}
        setSearch={setSearch}
        onClear={() => onChange(null)}
      >
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onChange(p); setOpen(false); setSearch(""); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors
                ${p.id === value ? "bg-slate-50" : ""}`}
            >
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                {(p.preferred_name || p.first_name || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{displayName(p)}</p>
                {p.email && <p className="text-xs text-slate-400 truncate">{p.email}</p>}
              </div>
              {p.person_type && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                  {p.person_type}
                </span>
              )}
            </button>
          ))
        )}
      </PickerShell>
    </div>
  );
}

// ── EnterprisePicker ───────────────────────────────────────────────────────────

/**
 * EnterprisePicker — stores enterprise_id, displays enterprise_name.
 *
 * Props:
 *   value        string | null
 *   onChange     (enterprise | null) => void
 *   currentUser  object
 *   placeholder  string
 *   className    string
 */
export function EnterprisePicker({ value, onChange, currentUser, placeholder = "Select enterprise", className = "" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: enterprises = [] } = useQuery({
    queryKey: ["picker_enterprises", currentUser?.company_id],
    queryFn: () => base44.entities.Enterprise.filter({ company_id: currentUser.company_id, status: "active" }),
    enabled: !!currentUser?.company_id,
    staleTime: 60000,
  });

  const selected = enterprises.find((e) => e.id === value) || null;

  const filtered = enterprises.filter((e) => {
    const name = (e.enterprise_name || "").toLowerCase();
    return (
      !search ||
      name.includes(search.toLowerCase()) ||
      (e.enterprise_type || "").toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className={className}>
      <PickerShell
        icon={Building2}
        triggerLabel={selected?.enterprise_name || ""}
        placeholder={placeholder}
        open={open}
        setOpen={setOpen}
        search={search}
        setSearch={setSearch}
        onClear={() => onChange(null)}
      >
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          filtered.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => { onChange(e); setOpen(false); setSearch(""); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors
                ${e.id === value ? "bg-slate-50" : ""}`}
            >
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{e.enterprise_name}</p>
                {e.enterprise_type && (
                  <p className="text-xs text-slate-400 capitalize">{e.enterprise_type}</p>
                )}
              </div>
              {e.enterprise_tier && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                  {e.enterprise_tier}
                </span>
              )}
            </button>
          ))
        )}
      </PickerShell>
    </div>
  );
}

// ── ProductPicker ──────────────────────────────────────────────────────────────

/**
 * ProductPicker — stores product_id, displays name + stock info.
 *
 * Props:
 *   value        string | null
 *   onChange     (product | null) => void
 *   currentUser  object
 *   placeholder  string
 *   className    string
 */
export function ProductPicker({ value, onChange, currentUser, placeholder = "Select product", className = "" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["picker_products", currentUser?.company_id],
    queryFn: () => base44.entities.Product.filter({ company_id: currentUser.company_id, status: "active" }),
    enabled: !!currentUser?.company_id,
    staleTime: 60000,
  });

  const selected = products.find((p) => p.id === value) || null;

  const filtered = products.filter((p) => {
    const name = (p.name || "").toLowerCase();
    return (
      !search ||
      name.includes(search.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.category || "").toLowerCase().includes(search.toLowerCase())
    );
  });

  const meta = (p) =>
    [p.category, p.sku && `SKU: ${p.sku}`, p.stock_quantity != null && `Stock: ${p.stock_quantity}`]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className={className}>
      <PickerShell
        icon={Package}
        triggerLabel={selected?.name || ""}
        placeholder={placeholder}
        open={open}
        setOpen={setOpen}
        search={search}
        setSearch={setSearch}
        onClear={() => onChange(null)}
      >
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onChange(p); setOpen(false); setSearch(""); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors
                ${p.id === value ? "bg-slate-50" : ""}`}
            >
              <Package className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                {meta(p) && <p className="text-xs text-slate-400 truncate">{meta(p)}</p>}
              </div>
              {p.stock_quantity != null && p.stock_quantity <= (p.min_stock_level || 0) && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 shrink-0">
                  Low stock
                </span>
              )}
            </button>
          ))
        )}
      </PickerShell>
    </div>
  );
}

// ── AddressPicker ──────────────────────────────────────────────────────────────

/**
 * AddressPicker — stores address_id, displays street + city.
 *
 * Props:
 *   value        string | null
 *   onChange     (address | null) => void
 *   currentUser  object
 *   placeholder  string
 *   className    string
 */
export function AddressPicker({ value, onChange, currentUser, placeholder = "Select address", className = "" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: addresses = [] } = useQuery({
    queryKey: ["picker_addresses", currentUser?.company_id],
    queryFn: () => base44.entities.Address.filter({ company_id: currentUser.company_id }),
    enabled: !!currentUser?.company_id,
    staleTime: 60000,
  });

  const selected = addresses.find((a) => a.id === value) || null;

  const filtered = addresses.filter((a) => {
    const street = (a.street_address || a.address_line_1 || "").toLowerCase();
    const city = (a.city || "").toLowerCase();
    const label = (a.label || a.address_name || "").toLowerCase();
    return (
      !search ||
      street.includes(search.toLowerCase()) ||
      city.includes(search.toLowerCase()) ||
      label.includes(search.toLowerCase())
    );
  });

  const line1 = (a) => a.street_address || a.address_line_1 || a.label || a.address_name || "Address";
  const line2 = (a) => [a.city, a.state, a.country].filter(Boolean).join(", ");
  const triggerLabel = selected ? [line1(selected), selected.city].filter(Boolean).join(", ") : "";

  return (
    <div className={className}>
      <PickerShell
        icon={MapPin}
        triggerLabel={triggerLabel}
        placeholder={placeholder}
        open={open}
        setOpen={setOpen}
        search={search}
        setSearch={setSearch}
        onClear={() => onChange(null)}
      >
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { onChange(a); setOpen(false); setSearch(""); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors
                ${a.id === value ? "bg-slate-50" : ""}`}
            >
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{line1(a)}</p>
                {line2(a) && <p className="text-xs text-slate-400 truncate">{line2(a)}</p>}
              </div>
            </button>
          ))
        )}
      </PickerShell>
    </div>
  );
}
