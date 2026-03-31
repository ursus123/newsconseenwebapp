import React, { useState, useMemo } from "react";
import { TYPE_ALIASES } from "@/utils/typeAliases";
import { X, Search, User, ChevronDown } from "lucide-react";
import { format } from "date-fns";

function todayStr() { return format(new Date(), "yyyy-MM-dd"); }
function nowTime() { return format(new Date(), "HH:mm"); }

function getClientStats(tasks, clientName) {
  const today = todayStr();
  const now = nowTime();
  const todayTasks = tasks.filter((t) =>
    t.task_type === "medication_admin" &&
    t.scheduled_date === today &&
    (t.related_person === clientName || t.assigned_to_name === clientName)
  );

  const dueNow = todayTasks.filter((t) => {
    if (t.outcome && t.outcome !== "pending") return false;
    if (!t.scheduled_time) return false;
    const diff = Math.abs(
      parseInt(t.scheduled_time.replace(":", "")) - parseInt(now.replace(":", ""))
    );
    return diff <= 30; // within 30 min window
  }).length;

  const dueToday = todayTasks.filter((t) => !t.outcome || t.outcome === "pending").length;

  const lastAdmin = todayTasks
    .filter((t) => t.outcome === "completed")
    .sort((a, b) => (b.scheduled_time || "").localeCompare(a.scheduled_time || ""))[0];

  let lastAdminLabel = null;
  if (lastAdmin?.scheduled_time) {
    const [lh, lm] = lastAdmin.scheduled_time.split(":").map(Number);
    const [nh, nm] = now.split(":").map(Number);
    const diffMins = (nh * 60 + nm) - (lh * 60 + lm);
    if (diffMins >= 0) {
      lastAdminLabel = diffMins < 60 ? `${diffMins}m ago` : `${Math.floor(diffMins / 60)}h ago`;
    }
  }

  return { dueNow, dueToday, lastAdminLabel };
}

export default function ClientSwitcher({ people, allTasks = [], current, onSelect, onClose, darkMode }) {
  const [search, setSearch] = useState("");

  const clients = useMemo(() => {
    return people
      .filter((p) => TYPE_ALIASES.client.includes(p.person_type))
      .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  }, [people]);

  const filtered = clients.filter((p) =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    (p.preferred_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const bg = darkMode ? "bg-slate-800 text-slate-100" : "bg-white";
  const inputBg = darkMode ? "bg-slate-700 border-slate-600" : "bg-gray-50";

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className={`w-full max-w-lg mx-auto ${bg} rounded-t-3xl shadow-2xl`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <p className="text-base font-black">Select Client</p>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100">
          <div className={`flex items-center gap-2 ${inputBg} rounded-xl px-3 py-2`}>
            <Search className="w-4 h-4 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-y-auto max-h-80 px-4 py-3 space-y-2">
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No clients found</p>
          )}
          {filtered.map((p) => {
            const isActive = current?.id === p.id;
            const clientName = `${p.first_name} ${p.last_name}`;
            const { dueNow, dueToday, lastAdminLabel } = getClientStats(allTasks, clientName);
            const initials = `${p.first_name?.[0] || ""}${p.last_name?.[0] || ""}`.toUpperCase();
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-left
                  ${isActive ? "bg-blue-50 border-2 border-blue-300" : "bg-gray-50 border-2 border-transparent hover:bg-gray-100"}`}
              >
                <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center shrink-0 font-black text-blue-700 text-sm">
                  {p.photo_url
                    ? <img src={p.photo_url} className="w-11 h-11 rounded-full object-cover" alt="" />
                    : initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-gray-900 truncate">{clientName}</p>
                    {isActive && <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">Current</span>}
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {p.primary_role || "Client"}
                    {p.city && ` · ${p.city}`}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {dueNow > 0 && (
                      <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                        {dueNow} due now
                      </span>
                    )}
                    {dueToday > 0 && (
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                        {dueToday} today
                      </span>
                    )}
                    {lastAdminLabel && (
                      <span className="text-[10px] text-gray-400">Last: {lastAdminLabel}</span>
                    )}
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-300 -rotate-90" />
              </button>
            );
          })}
        </div>

        {clients.length === 0 && !search && (
          <div className="px-5 pb-4 text-center text-gray-400">
            <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">No clients/patients found</p>
            <p className="text-xs mt-1 opacity-60">Add people with person_type = client or patient</p>
          </div>
        )}

        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}