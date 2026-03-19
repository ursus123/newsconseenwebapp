import React, { useState } from "react";
import { Plus, X } from "lucide-react";

export default function StepInvite({ invites, onChange }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [err, setErr] = useState("");

  const add = () => {
    if (!email.trim() || !email.includes("@")) { setErr("Enter a valid email"); return; }
    if (invites.find((i) => i.email === email.trim())) { setErr("Already in list"); return; }
    onChange([...invites, { email: email.trim(), role, id: Date.now() }]);
    setEmail("");
    setErr("");
  };

  const remove = (id) => onChange(invites.filter((i) => i.id !== id));

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">✉️</div>
        <h2 className="text-xl font-bold text-slate-800">Invite your team</h2>
        <p className="text-slate-500 text-sm mt-1">Send invitations to collaborate on Newsconseen</p>
      </div>

      <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Email Address</label>
          <input
            type="email"
            className={`w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors ${err ? "border-red-400 bg-red-50" : "border-slate-200 focus:border-emerald-400 bg-white"}`}
            placeholder="colleague@company.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Role</label>
          <select
            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-400 bg-white text-sm outline-none"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="admin">Admin</option>
            <option value="user">Staff</option>
          </select>
        </div>
        <button
          onClick={add}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-emerald-300 text-emerald-600 text-sm font-semibold hover:bg-emerald-50 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add to Invite List
        </button>
      </div>

      {invites.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500">{invites.length} invitation{invites.length !== 1 ? "s" : ""} queued</p>
          <div className="flex flex-wrap gap-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5">
                <span className="text-xs font-medium text-emerald-700">{inv.email}</span>
                <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded-full">{inv.role === "admin" ? "Admin" : "Staff"}</span>
                <button onClick={() => remove(inv.id)} className="text-emerald-400 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {invites.length === 0 && (
        <p className="text-center text-xs text-slate-400">No invitations added yet</p>
      )}
    </div>
  );
}