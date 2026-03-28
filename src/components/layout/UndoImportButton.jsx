import React, { useState, useEffect } from "react";
import { Undo2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const ENTITY_MAP = {
  People:        "Person",
  Person:        "Person",
  Enterprises:   "Enterprise",
  Enterprise:    "Enterprise",
  Products:      "Product",
  Product:       "Product",
  Services:      "Service",
  Service:       "Service",
  Addresses:     "Address",
  Address:       "Address",
  Tasks:         "Task",
  Task:          "Task",
  Transactions:  "Transaction",
  Transaction:   "Transaction",
  Relationships: "Relationship",
  Relationship:  "Relationship",
};

export default function UndoImportButton() {
  const [lastImport, setLastImport] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const readFromStorage = () => {
    try {
      const raw = localStorage.getItem("lastBulkImport");
      if (!raw) { setLastImport(null); return; }
      const data = JSON.parse(raw);
      // Only show undo for imports within the last 24 hours
      const age = Date.now() - new Date(data.importedAt).getTime();
      if (age > 24 * 60 * 60 * 1000) { localStorage.removeItem("lastBulkImport"); setLastImport(null); return; }
      setLastImport(data);
    } catch {
      setLastImport(null);
    }
  };

  useEffect(() => {
    readFromStorage();
    window.addEventListener("lastBulkImportChanged", readFromStorage);
    return () => window.removeEventListener("lastBulkImportChanged", readFromStorage);
  }, []);

  if (!lastImport) return null;

  const entityKey = ENTITY_MAP[lastImport.entityName];
  const entity = entityKey && base44.entities[entityKey];

  const handleUndo = async () => {
    if (!confirm) { setConfirm(true); return; }
    if (!entity) { alert("Cannot undo: entity not found."); return; }
    setUndoing(true);
    try {
      for (const id of lastImport.ids) {
        await entity.delete(id);
        await new Promise(r => setTimeout(r, 150));
      }
      localStorage.removeItem("lastBulkImport");
      window.dispatchEvent(new Event("lastBulkImportChanged"));
      setConfirm(false);
    } catch (err) {
      alert("Undo failed: " + err.message);
    } finally {
      setUndoing(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {confirm && !undoing && (
        <span className="text-xs text-rose-600 font-medium hidden sm:block whitespace-nowrap">
          Delete {lastImport.ids.length} {lastImport.entityName}?
        </span>
      )}
      <button
        onClick={undoing ? undefined : handleUndo}
        title={confirm ? `Confirm: delete ${lastImport.ids.length} imported ${lastImport.entityName}` : `Undo last import (${lastImport.ids.length} ${lastImport.entityName})`}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
          confirm
            ? "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100"
            : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
        } ${undoing ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        {undoing
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Undo2 className="w-3.5 h-3.5" />
        }
        <span className="hidden sm:inline">
          {undoing ? "Undoing…" : confirm ? "Confirm Undo" : "Undo Import"}
        </span>
      </button>
      {confirm && !undoing && (
        <button
          onClick={() => setConfirm(false)}
          className="text-xs text-slate-400 hover:text-slate-600 px-1"
        >
          ✕
        </button>
      )}
    </div>
  );
}