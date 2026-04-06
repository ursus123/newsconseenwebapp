import { useState, useRef, useEffect } from "react";
import { useTaxonomy } from "@/hooks/useTaxonomy";
import { ChevronDown, ChevronRight, Plus, Zap } from "lucide-react";

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
  const [open, setOpen]           = useState(false);
  const [search, setSearch]       = useState("");
  const [showMore, setShowMore]   = useState(false);
  const ref = useRef(null);

  const {
    systemOptions,
    customOptions,
    frequentCustom,
    customObjects,
    addCustomOption,
    incrementUsage,
    COMMON_COUNT,
  } = useTaxonomy(entityType, fieldName, parentValue, companyId);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Derived filtered lists ───────────────────────────────────────────────────
  const q = search.toLowerCase();

  const filteredFrequent = frequentCustom.filter(o => o.toLowerCase().includes(q));

  const commonSystem = systemOptions.slice(0, COMMON_COUNT);
  const moreSystem   = systemOptions.slice(COMMON_COUNT);

  const filteredCommon = commonSystem.filter(o => o.toLowerCase().includes(q));
  const filteredMore   = moreSystem.filter(o => o.toLowerCase().includes(q));

  // Non-frequent custom (frequent ones already shown in their section)
  const regularCustom  = customOptions.filter(o => !frequentCustom.includes(o));
  const filteredCustom = regularCustom.filter(o => o.toLowerCase().includes(q));

  const allOptions = [...systemOptions, ...customOptions];
  const isNew = search.trim() && !allOptions.some(o => o.toLowerCase() === search.trim().toLowerCase());

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getUsageCount = (val) => {
    const obj = customObjects.find(o => o.value === val);
    return obj?.usage_count || 0;
  };

  const handleSelect = (val) => {
    onChange(val);
    incrementUsage(val);
    setSearch("");
    setOpen(false);
  };

  const handleAddNew = async () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    await addCustomOption(trimmed);
    handleSelect(trimmed);
  };

  const hasAnyResults =
    filteredFrequent.length > 0 ||
    filteredCommon.length > 0 ||
    filteredMore.length > 0 ||
    filteredCustom.length > 0;

  // ── Option button ────────────────────────────────────────────────────────────
  const OptionBtn = ({ opt, badge }) => (
    <button
      key={opt}
      type="button"
      onClick={() => handleSelect(opt)}
      className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center justify-between gap-2 ${
        value === opt ? "bg-emerald-50 text-emerald-700 font-medium" : "text-slate-700"
      }`}
    >
      <span>{opt}</span>
      {badge}
    </button>
  );

  // ── Section header ───────────────────────────────────────────────────────────
  const SectionHeader = ({ label, chip }) => (
    <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 flex items-center gap-1.5">
      {label}
      {chip}
    </div>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled || !parentValue}
        onClick={() => { setOpen(v => !v); setSearch(""); setShowMore(false); }}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={value ? "text-slate-800" : "text-slate-400"}>
          {value || placeholder || `Select ${fieldName.replace(/_/g, " ")}...`}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
          style={{ maxHeight: 320 }}
        >
          {/* Search input */}
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

          <div className="overflow-y-auto" style={{ maxHeight: 258 }}>

            {/* ── Frequently Used ── */}
            {filteredFrequent.length > 0 && (
              <>
                <SectionHeader
                  label="Frequently Used"
                  chip={<Zap className="w-3 h-3 text-amber-500" />}
                />
                {filteredFrequent.map(opt => (
                  <OptionBtn
                    key={opt}
                    opt={opt}
                    badge={
                      <span className="text-[9px] px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full font-semibold whitespace-nowrap">
                        {getUsageCount(opt)}×
                      </span>
                    }
                  />
                ))}
              </>
            )}

            {/* ── Standard — Common ── */}
            {filteredCommon.length > 0 && (
              <>
                <SectionHeader
                  label={filteredFrequent.length > 0 ? "Standard — Common" : "Common"}
                />
                {filteredCommon.map(opt => (
                  <OptionBtn key={opt} opt={opt} />
                ))}
              </>
            )}

            {/* ── Standard — More ── */}
            {filteredMore.length > 0 && (
              <>
                {!showMore ? (
                  <button
                    type="button"
                    onClick={() => setShowMore(true)}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:text-emerald-600 hover:bg-slate-50 flex items-center gap-1 transition-colors"
                  >
                    <ChevronRight className="w-3 h-3" />
                    Show {filteredMore.length} more standard options
                  </button>
                ) : (
                  <>
                    <SectionHeader label="More Standards" />
                    {filteredMore.map(opt => (
                      <OptionBtn key={opt} opt={opt} />
                    ))}
                  </>
                )}
              </>
            )}

            {/* ── Custom — Your Org ── */}
            {filteredCustom.length > 0 && (
              <>
                <SectionHeader
                  label="Custom"
                  chip={
                    <span className="text-[9px] px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded-full font-bold">
                      Your org
                    </span>
                  }
                />
                {filteredCustom.map(opt => (
                  <OptionBtn key={opt} opt={opt} />
                ))}
              </>
            )}

            {/* Empty state */}
            {!hasAnyResults && !isNew && (
              <div className="px-3 py-6 text-center text-sm text-slate-400">
                No options found
              </div>
            )}

            {/* Add new */}
            {isNew && (
              <button
                type="button"
                onClick={handleAddNew}
                className="w-full text-left px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center gap-2 border-t border-slate-100"
              >
                <Plus className="w-4 h-4" />
                Add "{search.trim()}" as custom option
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
