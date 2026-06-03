import React, { useState } from "react";
import { Brain, CheckCircle2, Loader2, X } from "lucide-react";
import { saveIdjwiMemory } from "@/services/idjwiMemoryClient";

const MEMORY_TYPES = [
  "business_rule",
  "metric_definition",
  "terminology",
  "preference",
  "structure",
  "domain_context",
];

export default function TeachIdjwiButton({
  user,
  companyId,
  context = {},
  defaultKey = "",
  defaultValue = "",
  defaultType = "business_rule",
  label = "Teach Idjwi",
  compact = false,
  className = "",
  onSaved,
}) {
  const toText = (val) => {
    if (val == null) return "";
    if (typeof val === "string") return val;
    try { return JSON.stringify(val, null, 2); } catch { return String(val); }
  };
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(defaultKey);
  const [value, setValue] = useState(toText(defaultValue));
  const [memoryType, setMemoryType] = useState(defaultType);
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await saveIdjwiMemory({
        user,
        companyId,
        key,
        value: { value, context },
        memoryType,
        expiresAt: expiresAt || null,
        metadata: context,
      });
      setSaved(true);
      onSaved?.();
      setTimeout(() => {
        setOpen(false);
        setSaved(false);
      }, 900);
    } catch (e) {
      setError(e.message || "Could not save memory.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={`${compact ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"} inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 font-semibold text-violet-700 hover:bg-violet-100`}
      >
        <Brain className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-800">Teach Idjwi</p>
                <p className="text-xs text-slate-400">This saves confirmed operator knowledge for Autonomous Mode.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Memory type</label>
                <select
                  value={memoryType}
                  onChange={(e) => setMemoryType(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                >
                  {MEMORY_TYPES.map(type => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Key</label>
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="standard_revenue_query"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">What should Idjwi know?</label>
                <textarea
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  rows={4}
                  placeholder="In our business, this means..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Optional expiry</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>
            </div>

            {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || !key.trim() || !value.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Brain className="h-4 w-4" />}
                {saved ? "Saved" : "Save memory"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
