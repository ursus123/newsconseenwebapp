import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ChevronLeft, Pill, Plus, FileText, User, Home, History,
  Settings, RefreshCw, Trash2
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import MedDashboard from "@/components/medadmin/MedDashboard";
import AdministerModal from "@/components/medadmin/AdministerModal";
import MedHistory from "@/components/medadmin/MedHistory";
import PRNFlow from "@/components/medadmin/PRNFlow";
import MARMonthlyView from "@/components/medadmin/MARMonthlyView";
import MARExportButton from "@/components/medadmin/MARExportButton";
import ScheduleMonthModal from "@/components/medadmin/ScheduleMonthModal";
import MedProfileTab from "@/components/medadmin/MedProfileTab";
import NotificationCenter from "@/components/medadmin/NotificationCenter";
import MedAlertModal from "@/components/medadmin/MedAlertModal";
import WasteLogTab from "@/components/medadmin/WasteLogTab";
import SettingsTab from "@/components/medadmin/SettingsTab";
import CriticalMissedBanner from "@/components/medadmin/CriticalMissedBanner";
import { useMedNotifications } from "@/components/medadmin/useMedNotifications";
import { queryPatients, queryProducts, queryEnterprises, queryAddresses } from "@/components/shared/masterDataQuery";

const DARK_KEY = (email) => `medadmin_dark_mode_${email}`;

export default function MedAdmin() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("home");
  const [selectedClient, setSelectedClient] = useState(null);
  const [prnOpen, setPrnOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [marMonth, setMarMonth] = useState(new Date());
  const [alertNotification, setAlertNotification] = useState(null);
  const [administerTarget, setAdministerTarget] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const qc = useQueryClient();

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      const saved = localStorage.getItem(DARK_KEY(u.email));
      if (saved === "1") setDarkMode(true);
    }).catch(() => {});
  }, []);

  const handleDarkModeChange = (val) => {
    setDarkMode(val);
    if (user?.email) localStorage.setItem(DARK_KEY(user.email), val ? "1" : "0");
  };

  const { notifications, criticalMissed, dismiss, dismissAll, snooze } = useMedNotifications(user, !!user);

  useEffect(() => {
    if (notifications.length > 0 && !alertNotification) setAlertNotification(notifications[0]);
  }, [notifications, alertNotification]);

  const { data: people = [] } = useQuery({
    queryKey: ["med-people"],
    queryFn: () => queryPatients(),
    enabled: !!user,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["med-products"],
    queryFn: () => queryProducts({ tier: 2 }),
    enabled: !!user,
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["med-enterprises"],
    queryFn: () => queryEnterprises({ status: "active" }),
    enabled: !!user,
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ["med-addresses"],
    queryFn: () => queryAddresses(),
    enabled: !!user,
  });

  // Do NOT auto-select first client — require explicit selection for safety
  // (remove previous auto-select logic)

  const { data: allTasks = [], refetch } = useQuery({
    queryKey: ["med-tasks", selectedClient?.id],
    queryFn: () => base44.entities.Task.filter({
      related_person: selectedClient ? `${selectedClient.first_name} ${selectedClient.last_name}` : undefined,
      task_type: "medication_admin",
    }, "-scheduled_date", 500),
    enabled: !!selectedClient,
  });

  // All tasks for client switcher stats (broader query)
  const { data: allClientTasks = [] } = useQuery({
    queryKey: ["med-tasks-all-clients"],
    queryFn: () => base44.entities.Task.filter({ task_type: "medication_admin", scheduled_date: format(new Date(), "yyyy-MM-dd") }, "-created_date", 200),
    enabled: !!user,
  });

  const handleRefresh = () => {
    refetch();
    setLastSync(new Date());
  };

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const enterprise = enterprises[0]?.enterprise_name || null;

  const tabs = [
    { id: "home",    label: "Daily",    icon: Home },
    { id: "mar",     label: "MAR",      icon: FileText },
    { id: "medlist", label: "Meds",     icon: Pill },
    { id: "history", label: "History",  icon: History },
    { id: "waste",   label: "Waste",    icon: Trash2 },
    { id: "profile", label: "Settings", icon: Settings },
  ];

  // Dark mode styles
  const rootBg   = darkMode ? "bg-slate-900 text-slate-100" : "bg-gray-50";
  const topBarBg = darkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-200";
  const navBg    = darkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-200";

  return (
    <div className={`min-h-screen flex flex-col max-w-lg mx-auto relative ${rootBg}`}>
      {/* Critical missed banner — undismissable */}
      <CriticalMissedBanner criticals={criticalMissed} />

      {/* Top bar */}
      <div className={`border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-30 ${topBarBg}`}>
        <Link to={createPageUrl("Applications")} className={`p-2 -ml-2 rounded-lg transition-colors ${darkMode ? "text-slate-400 hover:bg-slate-800" : "text-gray-400 hover:bg-gray-100"}`}>
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <p className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? "text-slate-500" : "text-gray-400"}`}>Medication Administration</p>
          <p className={`text-sm font-bold leading-tight ${darkMode ? "text-slate-100" : "text-gray-800"}`}>{user?.full_name || user?.email || "Staff"}</p>
        </div>
        <NotificationCenter notifications={notifications} dismiss={dismiss} dismissAll={dismissAll} />
        <button onClick={handleRefresh} className={`p-2 rounded-lg ${darkMode ? "text-slate-400 hover:bg-slate-800" : "text-gray-400 hover:bg-gray-100"}`}>
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
            allTasks={allClientTasks}
            refetch={refetch}
            darkMode={darkMode}
          />
        )}

        {activeTab === "mar" && (
          <div className="p-4 space-y-3">
            {/* Month nav + buttons */}
            <div className={`flex items-center justify-between rounded-xl border px-4 py-3 shadow-sm ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-gray-100"}`}>
              <button
                onClick={() => setMarMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; })}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 font-bold text-lg leading-none"
              >‹</button>
              <span className={`text-sm font-black ${darkMode ? "text-slate-100" : "text-gray-800"}`}>
                {marMonth.toLocaleString("default", { month: "long", year: "numeric" })}
              </span>
              <button
                onClick={() => setMarMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; })}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 font-bold text-lg leading-none"
              >›</button>
            </div>
            <div className="flex gap-2">
              {isAdmin && (
                <button
                  onClick={() => setScheduleOpen(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 active:scale-95 transition-all shadow"
                >
                  <Plus className="w-4 h-4" /> Schedule for Month
                </button>
              )}
              <MARExportButton
                tasks={allTasks}
                selectedClient={selectedClient}
                selectedMonth={marMonth}
                enterprise={enterprise}
                user={user}
              />
            </div>
            <MARMonthlyView tasks={allTasks} selectedClient={selectedClient} selectedMonth={marMonth} />
          </div>
        )}

        {activeTab === "medlist" && (
          <MedProfileTab selectedClient={selectedClient} isAdmin={isAdmin} />
        )}

        {activeTab === "history" && (
          <MedHistory tasks={allTasks} selectedClient={selectedClient} people={people} products={products} />
        )}

        {activeTab === "waste" && (
          <WasteLogTab
            products={products}
            user={user}
            selectedClient={selectedClient}
            enterprise={enterprise}
            darkMode={darkMode}
          />
        )}

        {activeTab === "profile" && (
          <SettingsTab
            user={user}
            darkMode={darkMode}
            onDarkModeChange={handleDarkModeChange}
            onRefresh={handleRefresh}
            lastSync={lastSync}
          />
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
      <nav className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg border-t flex z-30 ${navBg}`}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors
                ${active ? "text-blue-600" : darkMode ? "text-slate-500" : "text-gray-400"}`}
            >
              <Icon className={`w-5 h-5 ${active ? "text-blue-600" : darkMode ? "text-slate-500" : "text-gray-400"}`} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Modals */}
      {scheduleOpen && (
        <ScheduleMonthModal
          client={selectedClient}
          products={products}
          user={user}
          onClose={() => setScheduleOpen(false)}
          onSuccess={() => { setScheduleOpen(false); refetch(); }}
        />
      )}

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

      {alertNotification && (
        <MedAlertModal
          notification={alertNotification}
          onSnooze={(minutes) => { snooze(alertNotification.taskId, minutes); setAlertNotification(null); }}
          onAdminister={() => {
            const task = allTasks.find((t) => t.id === alertNotification.taskId);
            if (task) { setAdministerTarget(task); setAlertNotification(null); dismiss(alertNotification.taskId); }
          }}
          onDismiss={() => { dismiss(alertNotification.taskId); setAlertNotification(null); }}
        />
      )}

      {administerTarget && (
        <div className="relative z-[95]">
          <AdministerModal
            task={administerTarget}
            user={user}
            products={products}
            darkMode={darkMode}
            onClose={() => setAdministerTarget(null)}
            onSuccess={() => { setAdministerTarget(null); refetch(); }}
          />
        </div>
      )}
    </div>
  );
}