import React, { useState } from "react";
import { format, isPast } from "date-fns";
import { User, AlertTriangle } from "lucide-react";
import ClientSwitcher from "./ClientSwitcher";
import MedCard from "./MedCard";
import AdministerModal from "./AdministerModal";
import QuickStats from "./QuickStats";
import FDARecallBanner from "./FDARecallBanner";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const FILTERS = ["All", "Due", "Overdue", "PRN", "Administered", "Missed"];

function groupByTime(tasks) {
  const today = format(new Date(), "yyyy-MM-dd");
  const relevant = tasks.filter((t) => t.task_type === "medication_admin" && t.scheduled_date === today);
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

export default function MedDashboard({ user, people, products = [], selectedClient, onSelectClient, tasks, allTasks = [], refetch, darkMode }) {
  const [filter, setFilter] = useState("All");
  const [clientSwitcherOpen, setClientSwitcherOpen] = useState(false);
  const [adminTarget, setAdminTarget] = useState(null);

  const today = format(new Date(), "yyyy-MM-dd");
  const todayTasks = tasks.filter((t) => t.scheduled_date === today);

  // Load medication profiles for FDA recall check
  const clientId = selectedClient?.id;
  const { data: medProfiles = [] } = useQuery({
    queryKey: ["med-profiles-dash", clientId],
    queryFn: () => base44.entities.MedicationProfile.filter({ client_id: clientId }),
    enabled: !!clientId,
  });

  const filteredTasks = todayTasks.filter((t) => {
    const status = getMedStatus(t);
    if (filter === "All") return true;
    if (filter === "Due") return status === "due";
    if (filter === "Overdue") return status === "overdue";
    if (filter === "PRN") return t.internal_notes?.includes("PRN");
    if (filter === "Administered") return status === "administered";
    if (filter === "Missed") return status === "missed" || status === "refused";
    return true;
  });

  const grouped = groupByTime(filteredTasks.length ? filteredTasks : filter === "All" ? todayTasks : []);
  const overdue = todayTasks.filter((t) => getMedStatus(t) === "overdue").length;
  const clientName = selectedClient ? `${selectedClient.first_name} ${selectedClient.last_name}` : "No client selected";
  const allergyWarning = selectedClient?.internal_notes?.toLowerCase().includes("allerg") ? selectedClient.internal_notes : null;

  const cardBg = darkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-100";
  const filterBg = darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-100";

  return (
    <div className="space-y-0">
      {/* Client selector */}
      <div className={`border-b px-4 py-3 ${filterBg}`}>
        {!selectedClient ? (
          <button onClick={() => setClientSwitcherOpen(true)} className="w-full flex flex-col items-center justify-center py-6 gap-2 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50">
            <User className="w-8 h-8 text-blue-400" />
            <p className="text-sm font-bold text-blue-600">Select a client to begin</p>
            <p className="text-xs text-blue-400">Tap to choose from your client list</p>
          </button>
        ) : (
          <button onClick={() => setClientSwitcherOpen(true)} className="flex items-center gap-3 w-full">
            <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center shrink-0 font-black text-blue-700">
              {selectedClient?.photo_url
                ? <img src={selectedClient.photo_url} className="w-11 h-11 rounded-full object-cover" alt="" />
                : `${selectedClient.first_name?.[0]}${selectedClient.last_name?.[0]}`}
            </div>
            <div className="flex-1 text-left">
              <p className="text-base font-black text-gray-900 leading-tight">{clientName}</p>
              <p className="text-xs text-gray-400">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
            </div>
            <div className="flex items-center gap-1.5 text-gray-400">
              <span className="text-xs font-semibold">Change</span>
              <User className="w-4 h-4" />
            </div>
          </button>
        )}

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

      {/* FDA Recall Banners */}
      {selectedClient && medProfiles.length > 0 && (
        <div className="px-4 pt-3">
          <FDARecallBanner profiles={medProfiles} darkMode={darkMode} />
        </div>
      )}

      {/* Quick stats */}
      {selectedClient && todayTasks.length > 0 && (
        <div className="px-4 py-3">
          <QuickStats tasks={todayTasks} activeFilter={filter} onFilterChange={setFilter} darkMode={darkMode} />
        </div>
      )}

      {/* Filters */}
      <div className={`border-b px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar ${filterBg}`}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all
              ${filter === f ? "bg-blue-600 text-white" : darkMode ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          >{f}</button>
        ))}
      </div>

      {/* Med cards */}
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
                <span className="text-sm font-black text-gray-700">{time}</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="space-y-3">
                {meds.map((med) => {
                  const profile = medProfiles.find((mp) => mp.medication_name?.toLowerCase() === med.title?.toLowerCase());
                  return (
                    <MedCard
                      key={med.id}
                      task={med}
                      status={getMedStatus(med)}
                      onAdminister={() => setAdminTarget({ ...med, medProfile: profile })}
                      product={products.find((p) => p.name?.toLowerCase() === med.title?.toLowerCase()?.replace(/^prn:\s*/i, ""))}
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {clientSwitcherOpen && (
        <ClientSwitcher
          people={people}
          allTasks={allTasks}
          current={selectedClient}
          onSelect={(p) => { onSelectClient(p); setClientSwitcherOpen(false); }}
          onClose={() => setClientSwitcherOpen(false)}
          darkMode={darkMode}
        />
      )}

      {adminTarget && (
        <AdministerModal
          task={adminTarget}
          user={user}
          products={products}
          darkMode={darkMode}
          onClose={() => setAdminTarget(null)}
          onSuccess={() => { setAdminTarget(null); refetch(); }}
        />
      )}
    </div>
  );
}