import React, { useState, useRef, useEffect } from "react";
import { useTaxonomy } from "@/hooks/useTaxonomy";
import { ChevronDown, Plus } from "lucide-react";

export default function TaxonomySelect({
  entityType,
  fieldName,
  parentValue,
  companyId,
  value,
  onChange,
  placeholder,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const { systemOptions, customOptions, addCustomOption } = useTaxonomy(
    entityType, fieldName, parentValue, companyId
  );

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = {
    system: systemOptions.filter(o => o.toLowerCase().includes(search.toLowerCase())),
    custom: customOptions.filter(o => o.toLowerCase().includes(search.toLowerCase())),
  };

  const allOptions = [...systemOptions, ...customOptions];
  const isNew = search && !allOptions.some(o => o.toLowerCase() === search.toLowerCase());

  const handleSelect = (val) => { onChange(val); setSearch(""); setOpen(false); };

  const handleAddNew = async () => {
    if (!search.trim()) return;
    await addCustomOption(search.trim());
    handleSelect(search.trim());
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled || !parentValue}
        onClick={() => { setOpen(v => !v); setSearch(""); }}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={value ? "text-slate-800" : "text-slate-400"}>
          {value || placeholder || `Select ${fieldName.replace(/_/g, " ")}...`}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
          style={{ maxHeight: 280 }}>
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && isNew) handleAddNew(); }}
              placeholder="Search or type new..."
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400"
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
            {filtered.system.length > 0 && (
              <>
                <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50">
                  Standard
                </div>
                {filtered.system.map(opt => (
                  <button key={opt} type="button" onClick={() => handleSelect(opt)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 hover:text-emerald-700 transition-colors ${value === opt ? "bg-emerald-50 text-emerald-700 font-medium" : "text-slate-700"}`}>
                    {opt}
                  </button>
                ))}
              </>
            )}
            {filtered.custom.length > 0 && (
              <>
                <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 flex items-center gap-1">
                  Custom
                  <span className="text-[9px] px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded-full font-bold">Your org</span>
                </div>
                {filtered.custom.map(opt => (
                  <button key={opt} type="button" onClick={() => handleSelect(opt)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 hover:text-emerald-700 transition-colors ${value === opt ? "bg-emerald-50 text-emerald-700 font-medium" : "text-slate-700"}`}>
                    {opt}
                  </button>
                ))}
              </>
            )}
            {filtered.system.length === 0 && filtered.custom.length === 0 && !isNew && (
              <div className="px-3 py-6 text-center text-sm text-slate-400">
                No options found
              </div>
            )}
            {isNew && (
              <button type="button" onClick={handleAddNew}
                className="w-full text-left px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center gap-2 border-t border-slate-100">
                <Plus className="w-4 h-4" />
                Add "{search}" as custom option
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}