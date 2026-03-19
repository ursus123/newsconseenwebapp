import React, { useState, useEffect } from "react";
import { AlertTriangle, X, ExternalLink, CheckCircle2 } from "lucide-react";

const RECALL_CACHE_KEY = "medadmin_recall_cache";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCache() {
  try { return JSON.parse(localStorage.getItem(RECALL_CACHE_KEY) || "{}"); } catch { return {}; }
}
function setCache(data) {
  try { localStorage.setItem(RECALL_CACHE_KEY, JSON.stringify(data)); } catch {}
}

async function checkRecall(medName) {
  const cache = getCache();
  const entry = cache[medName];
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;

  try {
    const res = await fetch(
      `https://newsconseenwebapp-production.up.railway.app/medications/recalls?name=${encodeURIComponent(medName)}`
    );
    const data = await res.json();
    const updated = { ...getCache(), [medName]: { ts: Date.now(), data } };
    setCache(updated);
    return data;
  } catch {
    return null;
  }
}

export default function FDARecallBanner({ profiles, darkMode }) {
  const [recalls, setRecalls] = useState([]); // [{medName, reason, details}]
  const [dismissed, setDismissed] = useState(new Set()); // session-dismissed names
  const [detailsFor, setDetailsFor] = useState(null);

  useEffect(() => {
    if (!profiles || profiles.length === 0) return;
    const active = profiles.filter((p) => p.status === "active" || p.status === "prn");
    let cancelled = false;
    (async () => {
      const found = [];
      for (const p of active) {
        const data = await checkRecall(p.medication_name);
        if (data?.has_active_recall) {
          found.push({
            medName: p.medication_name,
            reason: data.reason_for_recall || "Active FDA recall",
            details: data,
          });
        }
      }
      if (!cancelled) setRecalls(found);
    })();
    return () => { cancelled = true; };
  }, [profiles?.map((p) => p.id).join(",")]);

  const visible = recalls.filter((r) => !dismissed.has(r.medName));
  if (visible.length === 0) return null;

  const dm = darkMode ? "bg-red-950 border-red-800 text-red-200" : "bg-red-50 border-red-400 text-red-900";

  return (
    <>
      {visible.map((recall) => (
        <div key={recall.medName} className={`border-2 rounded-xl px-4 py-3 mb-2 ${dm}`}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black">⚠️ ACTIVE FDA RECALL: {recall.medName}</p>
              <p className="text-xs mt-0.5 opacity-80">{recall.reason}</p>
              <p className="text-xs font-bold mt-1 text-red-700">Do NOT administer. Contact prescriber immediately.</p>
            </div>
            <button onClick={() => setDismissed((s) => new Set([...s, recall.medName]))} className="p-1 rounded text-red-400 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setDetailsFor(recall)}
              className="flex items-center gap-1 text-xs font-bold text-red-700 underline hover:no-underline"
            >
              <ExternalLink className="w-3 h-3" /> View Recall Details →
            </button>
            <button
              onClick={() => setDismissed((s) => new Set([...s, recall.medName]))}
              className="flex items-center gap-1 text-xs font-bold text-red-500 ml-4"
            >
              <CheckCircle2 className="w-3 h-3" /> Mark as Reviewed
            </button>
          </div>
        </div>
      ))}

      {/* Details modal */}
      {detailsFor && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-black text-red-700 text-base">FDA Recall Details</p>
              <button onClick={() => setDetailsFor(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-2 text-sm">
              <div><span className="font-bold text-gray-600">Medication:</span> <span className="text-gray-800">{detailsFor.medName}</span></div>
              <div><span className="font-bold text-gray-600">Reason:</span> <span className="text-gray-800">{detailsFor.reason}</span></div>
              {detailsFor.details?.recall_number && (
                <div><span className="font-bold text-gray-600">Recall #:</span> <span className="text-gray-800">{detailsFor.details.recall_number}</span></div>
              )}
              {detailsFor.details?.recall_date && (
                <div><span className="font-bold text-gray-600">Date:</span> <span className="text-gray-800">{detailsFor.details.recall_date}</span></div>
              )}
            </div>
            <p className="text-xs text-red-700 font-bold bg-red-50 rounded-xl p-3">Do NOT administer. Contact the prescriber immediately and document this interaction.</p>
            <button onClick={() => setDetailsFor(null)} className="w-full py-3 rounded-xl bg-red-600 text-white font-bold text-sm">Close</button>
          </div>
        </div>
      )}
    </>
  );
}