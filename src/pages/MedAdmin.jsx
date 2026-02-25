import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isPast, parseISO, addHours } from "date-fns";
import { ChevronLeft, Pill, Plus, Clock, AlertTriangle, CheckCircle2, XCircle, FileText, User, Home, History, Settings, Search, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import MedDashboard from "@/components/medadmin/MedDashboard";
import MedHistory from "@/components/medadmin/MedHistory";
import PRNFlow from "@/components/medadmin/PRNFlow";
import MARMonthlyView from "@/components/medadmin/MARMonthlyView";
import ScheduleMonthModal from "@/components/medadmin/ScheduleMonthModal";
import MedProfileTab from "@/components/medadmin/MedProfileTab";
import NotificationCenter from "@/components/medadmin/NotificationCenter";
import { useMedNotifications } from "@/components/medadmin/useMedNotifications";

export default function MedAdmin() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("home");
  const [selectedClient, setSelectedClient] = useState(null);
  const [prnOpen, setPrnOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [marMonth, setMarMonth] = useState(new Date());

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const { notifications, dismiss, dismissAll } = useMedNotifications(user, !!user);

  const { data: people = [] } = useQuery({
    queryKey: ["med-people"],
    queryFn: () => base44.entities.Person.filter({ status: "active" }),
    enabled: !!user,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["med-products"],
    queryFn: () => base44.entities.Product.filter({ status: "active" }),
    enabled: !!user,
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["med-enterprises"],
    queryFn: () => base44.entities.Enterprise.filter({ status: "active" }),
    enabled: !!user,
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ["med-addresses"],
    queryFn: () => base44.entities.Address.filter({ status: "active" }),
    enabled: !!user,
  });

  // Auto-select first client
  useEffect(() => {
    if (people.length > 0 && !selectedClient) setSelectedClient(people[0]);
  }, [people]);

  const { data: allTasks = [], refetch } = useQuery({
    queryKey: ["med-tasks", selectedClient?.id],
    queryFn: () => base44.entities.Task.filter({
      related_person: selectedClient ? `${selectedClient.first_name} ${selectedClient.last_name}` : undefined,
      task_type: "medication_admin",
    }, "-scheduled_date", 500),
    enabled: !!selectedClient,
  });

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const tabs = [
    { id: "home",     label: "Daily",    icon: Home },
    { id: "mar",      label: "MAR",      icon: FileText },
    { id: "medlist",  label: "Meds",     icon: Pill },
    { id: "history",  label: "History",  icon: History },
    { id: "profile",  label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto relative">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-gray-400 hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Medication Administration</p>
          <p className="text-sm font-bold text-gray-800 leading-tight">{user?.full_name || user?.email || "Staff"}</p>
        </div>
        <NotificationCenter notifications={notifications} dismiss={dismiss} dismissAll={dismissAll} />
        <button onClick={() => refetch()} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {activeTab === "home" && (
          <MedDashboard
            user={user}
            people={people}
            products={products}
            selectedClient={selectedClient}
            onSelectClient={setSelectedClient}
            tasks={allTasks}
            refetch={refetch}
          />
        )}
        {activeTab === "mar" && (
          <div className="p-4 space-y-3">
            {/* Month nav + Schedule button */}
            <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
              <button
                onClick={() => setMarMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; })}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 font-bold text-lg leading-none"
              >‹</button>
              <span className="text-sm font-black text-gray-800">
                {marMonth.toLocaleString("default", { month: "long", year: "numeric" })}
              </span>
              <button
                onClick={() => setMarMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; })}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 font-bold text-lg leading-none"
              >›</button>
            </div>
            {isAdmin && (
              <button
                onClick={() => setScheduleOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 active:scale-95 transition-all shadow"
              >
                <Plus className="w-4 h-4" />
                Schedule Medications for Month
              </button>
            )}
            <MARMonthlyView tasks={allTasks} selectedClient={selectedClient} selectedMonth={marMonth} />
          </div>
        )}

        {activeTab === "history" && (
          <MedHistory tasks={allTasks} selectedClient={selectedClient} people={people} products={products} />
        )}
        {activeTab === "profile" && (
          <div className="p-6 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Logged in as</p>
              <p className="text-lg font-bold text-gray-800">{user?.full_name || "—"}</p>
              <p className="text-sm text-gray-400">{user?.email}</p>
              <p className="text-sm text-gray-400">Role: <span className="font-semibold text-gray-600">{user?.role}</span></p>
            </div>
          </div>
        )}
      </div>

      {/* PRN FAB */}
      <button
        onClick={() => setPrnOpen(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 rounded-full shadow-lg flex items-center justify-center z-40 active:scale-95 transition-all hover:bg-blue-700"
        aria-label="Administer PRN medication"
      >
        <Plus className="w-7 h-7 text-white" />
      </button>

      {/* Bottom tabs */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-gray-200 flex z-30">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-[11px] font-semibold transition-colors
                ${active ? "text-blue-600" : "text-gray-400"}`}
            >
              <Icon className={`w-5 h-5 ${active ? "text-blue-600" : "text-gray-400"}`} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Schedule Month Modal */}
      {scheduleOpen && (
        <ScheduleMonthModal
          client={selectedClient}
          products={products}
          user={user}
          onClose={() => setScheduleOpen(false)}
          onSuccess={() => { setScheduleOpen(false); refetch(); }}
        />
      )}

      {/* PRN Modal */}
      {prnOpen && (
        <PRNFlow
          user={user}
          selectedClient={selectedClient}
          people={people}
          products={products}
          enterprises={enterprises}
          addresses={addresses}
          onClose={() => setPrnOpen(false)}
          onSuccess={() => { setPrnOpen(false); refetch(); }}
        />
      )}
    </div>
  );
}