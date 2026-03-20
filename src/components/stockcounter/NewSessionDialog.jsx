import React, { useState } from "react";
import { X } from "lucide-react";

export default function NewSessionDialog({ enterprises, addresses, onStart, onClose, defaultEnterprise = "" }) {
  const [enterprise, setEnterprise] = useState(defaultEnterprise);
  const [location, setLocation] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">New Count Session</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Enterprise / Location</label>
            <select
              value={enterprise}
              onChange={e => setEnterprise(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              <option value="">All enterprises (no filter)</option>
              {enterprises.map(e => (
                <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">Select an enterprise to only count items assigned to it, or leave blank for all items.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Count Location (optional)</label>
            <input
              type="text"
              placeholder="e.g. Storeroom A, Kitchen, Ward 3..."
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              list="address-list"
            />
            <datalist id="address-list">
              {addresses.map(a => (
                <option key={a.id} value={a.label || a.address_line1} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onStart(enterprise, location)}
            className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors"
          >
            🚀 Start Counting
          </button>
        </div>
      </div>
    </div>
  );
}