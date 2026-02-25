import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isPast, isToday, parseISO } from "date-fns";
import { User, ChevronDown, AlertTriangle } from "lucide-react";
import ClientSwitcher from "./ClientSwitcher";
import MedCard from "./MedCard";
import AdministerModal from "./AdministerModal";

const FILTERS = ["All", "Due", "Overdue", "PRN", "Administered", "Missed"];

// Generate today's scheduled meds from tasks
function groupByTime(tasks) {
  const today = format(new Date(), "yyyy-MM-dd");
  const relevant = tasks.filter((t) =>
    t.task_type === "medication_admin" && t.scheduled_date === today
  );

  const groups = {};
  relevant.forEach((t) => {
    const slot = t.scheduled_time || "Unscheduled";
    if (!groups[slot]) groups[slot] = [];
    groups[slot].push(t);
  });

  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

function getMedStatus(task) {
  if (task.outcome === "completed") return "administered";
  if (task.outcome === "refused") return "refused";
  if (task.outcome === "missed") return "missed";
  const now = new Date();
  if (task.scheduled_date && task.scheduled_time) {
    const scheduled = new Date(`${task.scheduled_date}T${task.scheduled_time}`);
    if (isPast(scheduled)) return "overdue";
  }
  return "due";
}

export default function MedDashboard({ user, people, products = [], selectedClient, onSelectClient, tasks, refetch }) {
  const [filter, setFilter] = useState("All");
  const [clientSwitcherOpen, setClientSwitcherOpen] = useState(false);
  const [adminTarget, setAdminTarget] = useState(null);

  const today = format(new Date(), "yyyy-MM-dd");
  const todayTasks = tasks.filter((t) => t.scheduled_date === today);

  const filteredTasks = todayTasks.filter((t) => {
    const status = getMedStatus(t);
    if (filter === "All") return true;
    if (filter === "Due") return status === "due";
    if (filter === "Overdue") return status === "overdue";
    if (filter === "PRN") return t.task_type === "medication_admin" && t.internal_notes?.includes("PRN");
    if (filter === "Administered") return status === "administered";
    if (filter === "Missed") return status === "missed" || status === "refused";
    return true;
  });

  const grouped = groupByTime(filteredTasks.length ? filteredTasks : todayTasks.filter(() => filter === "All"));
  const overdue = todayTasks.filter((t) => getMedStatus(t) === "overdue").length;

  const clientName = selectedClient ? `${selectedClient.first_name} ${selectedClient.last_name}` : "No client selected";

  // Allergy warning (stored in internal_notes on person)
  const allergyWarning = selectedClient?.internal_notes?.toLowerCase().includes("allerg")
    ? selectedClient.internal_notes
    : null;

  return (
    <div className="space-y-0">
      {/* Client selector */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <button
          onClick={() => setClientSwitcherOpen(true)}
          className="flex items-center gap-3 w-full"
        >
          <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            {selectedClient?.photo_url
              ? <img src={selectedClient.photo_url} className="w-11 h-11 rounded-full object-cover" alt="" />
              : <User className="w-5 h-5 text-blue-600" />}
          </div>
          <div className="flex-1 text-left">
            <p className="text-base font-black text-gray-900 leading-tight">{clientName}</p>
            <p className="text-xs text-gray-400">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>

        {allergyWarning && (
          <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-red-700">{allergyWarning}</p>
          </div>
        )}

        {overdue > 0 && (
          <div className="mt-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <p className="text-xs font-bold text-red-700">{overdue} overdue medication{overdue > 1 ? "s" : ""}</p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all
              ${filter === f
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Med cards grouped by time */}
      <div className="px-4 py-4 space-y-6">
        {!selectedClient ? (
          <div className="text-center py-16 text-gray-400">
            <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">Select a client to view medications</p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm font-semibold">No medications scheduled for today</p>
            <p className="text-xs mt-1 opacity-60">Use the + button to add a PRN medication</p>
          </div>
        ) : (
          grouped.map(([time, meds]) => (
            <div key={time}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-black text-gray-700">{time === "Unscheduled" ? time : time}</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="space-y-3">
                {meds.map((med) => (
                  <MedCard
                    key={med.id}
                    task={med}
                    status={getMedStatus(med)}
                    onAdminister={() => setAdminTarget(med)}
                    product={products.find((p) => p.name?.toLowerCase() === med.title?.toLowerCase()?.replace(/^prn:\s*/i, ""))}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {clientSwitcherOpen && (
        <ClientSwitcher
          people={people}
          current={selectedClient}
          onSelect={(p) => { onSelectClient(p); setClientSwitcherOpen(false); }}
          onClose={() => setClientSwitcherOpen(false)}
        />
      )}

      {adminTarget && (
        <AdministerModal
          task={adminTarget}
          user={user}
          onClose={() => setAdminTarget(null)}
          onSuccess={() => { setAdminTarget(null); refetch(); }}
        />
      )}
    </div>
  );
}