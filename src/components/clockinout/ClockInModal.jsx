import React, { useState } from "react";
import { X, MapPin, Clock } from "lucide-react";
import { getLocationCoords, getLocationString } from "./clockUtils";

export default function ClockInModal({ enterprises, onConfirm, onClose }) {
  const [enterprise, setEnterprise] = useState("");
  const [address, setAddress] = useState("");
  const [locLoading, setLocLoading] = useState(false);
  const [coords, setCoords] = useState(null);

  const detectLocation = async () => {
    setLocLoading(true);
    const c = await getLocationCoords();
    if (c) {
      setCoords(c);
      const str = await getLocationString(c);
      setAddress(str || "");
    }
    setLocLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">Where are you working today?</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Enterprise</label>
            <select
              value={enterprise}
              onChange={(e) => setEnterprise(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            >
              <option value="">— Select enterprise —</option>
              {enterprises.map((e) => (
                <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Location (optional)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter address or detect..."
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <button
                onClick={detectLocation}
                disabled={locLoading}
                className="px-3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600 disabled:opacity-50"
                title="Detect my location"
              >
                {locLoading ? <Clock className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={() => onConfirm(enterprise, address, coords)}
          disabled={!enterprise}
          className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40"
        >
          Clock In Here
        </button>
      </div>
    </div>
  );
}