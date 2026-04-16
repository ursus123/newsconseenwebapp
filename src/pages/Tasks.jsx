import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import PageHeader from "../components/shared/PageHeader";
import { usePermissions } from "@/components/shared/usePermissions";
import { useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";
import { triggerTaskTransaction } from "../components/shared/triggerTaskTransaction";
import TaskForm, { taskTypeLabel } from "../components/tasks/TaskForm";
import DeleteDialog from "../components/shared/DeleteDialog";
import BulkImportDialog from "../components/shared/BulkImportDialog";
import {
  TASK_FIELDS, TASK_MAPPING_RULES, TASK_TEMPLATE_EXAMPLE,
  TASK_TEMPLATE_INSTRUCTIONS, validateTask, transformTask,
} from "@/components/shared/importConfigs";
import TaskSummaryCards from "../components/tasks/TaskSummaryCards";
import TaskPerformanceMetrics from "../components/tasks/TaskPerformanceMetrics";
import TaskDetailPanel from "../components/tasks/TaskDetailPanel";
import OutcomeDialog from "../components/tasks/OutcomeDialog";
import TaskTimelineView from "../components/tasks/TaskTimelineView";
import TaskCalendarView from "../components/tasks/TaskCalendarView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2, Calendar, User, Building2, CheckCircle, AlertCircle, Clock, ShieldCheck, Filter, LayoutGrid, List, CalendarDays, X, Upload, Search, Tag, BarChart2 } from "lucide-react";
import TasksAnalytics from "@/components/tasks/TasksAnalytics";
import { tagColor } from "@/components/shared/TagInput";
import SearchFilterBar from "../components/shared/SearchFilterBar";
import SpreadsheetToolbar from "@/components/shared/SpreadsheetToolbar";
import DeleteAllDialog from "@/components/shared/DeleteAllDialog";
import { fuzzyFilter } from "@/components/shared/fuzzySearch";
import { format, isToday, isPast, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, { method: "POST" }).catch(() => {});
function triggerWorkflows(companyId, triggerType, entityData) {
  fetch(`${RAILWAY_URL}/workflows/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({ company_id: companyId, trigger_type: triggerType, entity_type: "task", entity_data: entityData }),
  }).catch(() => {});
}
function logAudit(companyId, action, record, userEmail) {
  fetch(`${RAILWAY_URL}/audit/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({ company_id: companyId, entity_type: "task", entity_id: record?.id, entity_name: record?.title || record?.id, action, changed_by: userEmail }),
  }).catch(() => {});
}

const PRIORITY_COLOR = {
  low: "bg-slate-100 text-slate-500",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-rose-50 text-rose-600",
};
const STATUS_BORDER = {
  open: "border-l-slate-300",
  in_progress: "border-l-blue-400",
  completed: "border-l-emerald-400",
  cancelled: "border-l-rose-300",
};
const APP_SOURCE_BADGE = {
  med_admin: { label: "Med Admin", cls: "bg-purple-50 text-purple-700" },
  clock: { label: "Attendance", cls: "bg-blue-50 text-blue-700" },
  delivery: { label: "Delivery", cls: "bg-amber-50 text-amber-700" },
  maintenance: { label: "Maintenance", cls: "bg-orange-50 text-orange-700" },
};
const STATUS_GROUPS = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];
const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due Today" },
  { key: "completed", label: "Completed" },
];
const COLUMN_STYLES = {
  open: { header: "bg-slate-50 border-slate-200", dot: "bg-slate-400", count: "bg-slate-100 text-slate-500" },
  in_progress: { header: "bg-blue-50 border-blue-200", dot: "bg-blue-400", count: "bg-blue-100 text-blue-600" },
  completed: { header: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-400", count: "bg-emerald-100 text-emerald-600" },
  cancelled: { header: "bg-rose-50 border-rose-200", dot: "bg-rose-400", count: "bg-rose-100 text-rose-600" },
};
const KANBAN_COLUMNS = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

function isDuePast(task) {
  if (!task.due_date) return false;
  try { return isPast(parseISO(task.due_date)) && task.status !== "completed" && task.status !== "cancelled"; }
  catch { return false; }
}

function TaskCard({ task, onEdit, onDelete, isAdmin, selectable, selected, onSelect, onOpen }) {
  const overdue = isDuePast(task);
  const srcBadge = task.app_source ? APP_SOURCE_BADGE[task.app_source] : null;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={`p-4 border-l-4 ${STATUS_BORDER[task.status] || "border-l-slate-300"} hover:shadow-md transition-shadow`}>
        <div className="flex items-start gap-2">
          {selectable && (
            <Checkbox
              checked={!!selected}
              onCheckedChange={() => onSelect(task.id)}
              className="mt-0.5 shrink-0"
            />
          )}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen && onOpen(task)}>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
              {taskTypeLabel(task.task_type)}
            </p>
            <h4 className={`font-medium text-sm ${task.status === "completed" ? "line-through text-slate-400" : "text-slate-800"}`}>
              {task.title}
            </h4>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <Badge className={PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.normal}>{task.priority || "normal"}</Badge>
              {task.assigned_to_name && (
                <Badge variant="outline" className="text-xs gap-1"><User className="w-3 h-3" />{task.assigned_to_name}</Badge>
              )}
              {task.enterprise && (
                <Badge variant="outline" className="text-xs gap-1"><Building2 className="w-3 h-3" />{task.enterprise}</Badge>
              )}
              {task.due_date && (() => { try { const d = parseISO(task.due_date); return (
                <Badge variant="outline" className={`text-xs gap-1 ${overdue ? "border-rose-300 text-rose-600 bg-rose-50" : ""}`}>
                  {overdue ? <AlertCircle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                  {isToday(d) ? "Today" : format(d, "MMM d")}
                  {task.due_time && ` ${task.due_time}`}
                </Badge>
              ); } catch { return null; } })()}
              {task.trigger_transaction && (
                <Badge className="bg-violet-50 text-violet-700 text-xs">→ Transaction</Badge>
              )}
              {srcBadge && <Badge className={`${srcBadge.cls} text-xs`}>{srcBadge.label}</Badge>}
              {(task.tags || []).map((tag) => (
                <span key={tag} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${tagColor(tag)}`}>#{tag}</span>
              ))}
            </div>
            {task.outcome_notes && (
              <p className="text-xs text-slate-400 mt-2 line-clamp-1 italic">{task.outcome_notes}</p>
            )}
          </div>
          {isAdmin && (
            <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-emerald-600" onClick={() => onEdit(task)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              {onDelete && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-rose-600" onClick={() => onDelete(task)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function MyTasksList({ tasks }) {
  const [filter, setFilter] = useState("open");
  const filtered = tasks.filter((t) => {
    if (filter === "open") return t.status === "open" || t.status === "in_progress";
    if (filter === "completed") return t.status === "completed";
    if (filter === "overdue") return isDuePast(t);
    return true;
  });
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
          <User className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">My Tasks</h2>
          <p className="text-xs text-slate-400">Tasks assigned to you</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        {[{ key: "open", label: "Open" }, { key: "overdue", label: "Overdue" }, { key: "completed", label: "Done" }, { key: "all", label: "All" }].map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${filter === f.key ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
            <CheckCircle className="w-8 h-8 text-emerald-200 mb-2" />
            <p className="text-sm text-slate-400 font-medium">All clear! No tasks here.</p>
          </div>
        ) : filtered.map((task) => <TaskCard key={task.id} task={task} isAdmin={false} />)}
      </div>
    </div>
  );
}

const TASK_PREVIEW_COLS = [
  { label: "Title", render: (r) => r.title || <span className="text-rose-500">MISSING</span> },
  { label: "Type", render: (r) => r.task_type || "—" },
  { label: "Status", render: (r) => r.status || "open" },
  { label: "Priority", render: (r) => r.priority || "normal" },
  { label: "Assigned To", render: (r) => r.assigned_to_name || r.assigned_to_email || "—" },
];

function AdminTasksView({ tasks, appUsers, enterprises, products, services, people, addresses, companyId, isSuperAdmin, currentUser, listFn }) {
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [detailTask, setDetailTask] = useState(null);
  const [outcomeTask, setOutcomeTask] = useState(null);
  const [filter, setFilter] = useState("all");
  const [viewMode, setViewMode] = useState("kanban");
  const [filterPerson, setFilterPerson] = useState("");
  const [filterEnterprise, setFilterEnterprise] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const qc = useQueryClient();
  const perms = usePermissions(currentUser);
  const withScope = useWithScope(currentUser);
  const { toast } = useToast();

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.refetchQueries({ queryKey: ["tasks"] }); };

  const completeTask = async (task, outcomeData) => {
    const updated = await base44.entities.Task.update(task.id, {
      ...task,
      status: "completed",
      outcome: outcomeData.outcome,
      outcome_notes: outcomeData.outcome_notes,
      scheduled_time: outcomeData.completed_time || task.scheduled_time,
    });
    if (task.trigger_transaction) {
      const tx = await triggerTaskTransaction(updated, currentUser);
      if (tx) {
        toast({
          title: "Task completed — draft transaction created",
          description: (
            <span>
              <Link to={createPageUrl("Transactions")} className="underline font-medium">View Transaction →</Link>
            </span>
          ),
        });
      }
    }
    invalidate();
  };

  const createMut = useMutation({
    mutationFn: async (d) => base44.entities.Task.create(withScope({ ...d, app_source: d.app_source || "manual" })),
    onSuccess: () => { setFormOpen(false); invalidate(); triggerETL("task"); logAudit(companyId, "created", editing, currentUser?.email); triggerWorkflows(companyId, "entity_created", editing); },
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, data }) => {
      const task = await base44.entities.Task.update(id, data);
      if (task.status === "completed" && task.trigger_transaction) {
        const tx = await triggerTaskTransaction(task, currentUser);
        if (tx) {
          toast({
            title: "Task completed — draft transaction created",
            description: <Link to={createPageUrl("Transactions")} className="underline font-medium text-sm">View Transaction →</Link>,
          });
        }
      }
      return task;
    },
    onSuccess: () => { setFormOpen(false); setEditing(null); invalidate(); triggerETL("task"); logAudit(companyId, "updated", editing, currentUser?.email); triggerWorkflows(companyId, "entity_updated", editing); },
  });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Task.delete(id), onSuccess: () => { invalidate(); logAudit(companyId, "deleted", deleting, currentUser?.email); setDeleting(null); triggerETL("task"); } });

  const filtered = (() => {
    let list = search ? fuzzyFilter(tasks, search, ["title", "enterprise", "assigned_to_name", "related_person", "outcome_notes"]) : [...tasks];
    list = list.filter((t) => {
      if (filter === "open" && t.status !== "open" && t.status !== "in_progress") return false;
      if (filter === "overdue" && !isDuePast(t)) return false;
      if (filter === "today" && !(t.due_date && (() => { try { return isToday(parseISO(t.due_date)); } catch { return false; } })())) return false;
      if (filter === "completed" && t.status !== "completed") return false;
      if (filterPerson && t.assigned_to_name !== filterPerson && t.assigned_to_email !== filterPerson) return false;
      if (filterEnterprise && t.enterprise !== filterEnterprise) return false;
      if (filterTag && !(t.tags || []).includes(filterTag)) return false;
      return true;
    });
    return list;
  })();

  const grouped = KANBAN_COLUMNS.map((s) => ({ ...s, items: filtered.filter((t) => t.status === s.key) }));
  const overdueCount = tasks.filter(isDuePast).length;

  const onDragOver = (e) => e.preventDefault();
  const onDrop = (e, newStatus) => {
    const taskId = e.dataTransfer.getData("taskId");
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    if (newStatus === "completed") {
      setOutcomeTask({ ...task, _pendingStatus: "completed" });
    } else {
      updateMut.mutate({ id: taskId, data: { ...task, status: newStatus } });
    }
  };

  const toggleSelect = (id) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const clearSelection = () => setSelectedIds([]);

  const bulkComplete = async () => {
    const selected = tasks.filter((t) => selectedIds.includes(t.id));
    setOutcomeTask({ _bulk: selected });
  };

  const handleOutcomeConfirm = async (outcomeData) => {
    if (outcomeTask._bulk) {
      for (const task of outcomeTask._bulk) {
        await completeTask(task, outcomeData);
      }
    } else {
      await completeTask(outcomeTask, outcomeData);
    }
    setOutcomeTask(null);
    clearSelection();
  };

  const bulkReassign = async () => {
    if (!bulkAssignee) return;
    const user = appUsers.find((u) => u.email === bulkAssignee);
    for (const id of selectedIds) {
      const task = tasks.find((t) => t.id === id);
      if (task) {
        await base44.entities.Task.update(id, {
          ...task,
          assigned_to_email: bulkAssignee,
          assigned_to_name: user ? (user.full_name || user.email) : bulkAssignee,
        });
      }
    }
    invalidate();
    clearSelection();
    setBulkAssignee("");
    toast({ title: `${selectedIds.length} tasks reassigned` });
  };

  const bulkDelete = async () => {
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        await base44.entities.Task.delete(id);
        deleted++;
      } catch (e) {
        // Task may have already been deleted or not found — skip it
      }
    }
    invalidate();
    clearSelection();
    toast({ title: `${deleted} task${deleted !== 1 ? "s" : ""} deleted` });
  };

  const handleDeleteAll = async () => {
    for (const t of tasks) { try { await base44.entities.Task.delete(t.id); } catch (e) { /* 404 = already gone */ } }
    invalidate();
    triggerETL("task");
    toast({ title: `All ${tasks.length} tasks deleted` });
  };

  const renderCard = (task, selectable = false) => (
    <TaskCard
      key={task.id}
      task={task}
      onEdit={perms.l3_create ? (t) => { setEditing(t); setFormOpen(true); } : undefined}
      onDelete={perms.can_delete ? (t) => setDeleting(t) : undefined}
      isAdmin={perms.l3_create}
      selectable={selectable}
      selected={selectedIds.includes(task.id)}
      onSelect={toggleSelect}
      onOpen={(t) => setDetailTask(t)}
    />
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Admin View — All Tasks</span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <PageHeader
          title="Tasks"
          subtitle="Assign and manage tasks for app users"
          onAdd={perms.l3_create ? () => { setEditing(null); setFormOpen(true); } : undefined}
          addLabel="Assign Task"
        >
          {perms.l3_create && (
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4 mr-2" /> Import
            </Button>
          )}
          {perms.can_delete && tasks.length > 0 && (
            <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>
              🗑️ Delete All
            </Button>
          )}
        </PageHeader>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {[{ key: "kanban", icon: LayoutGrid, label: "Kanban" }, { key: "list", icon: List, label: "List" }, { key: "timeline", icon: CalendarDays, label: "Timeline" }, { key: "calendar", icon: Calendar, label: "Calendar" }].map(({ key, icon: Icon, label }) => (
              <button key={key} onClick={() => setViewMode(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === key ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          <button onClick={() => setAnalyticsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-all shadow-sm">
            <BarChart2 className="w-3.5 h-3.5" /> Analytics
          </button>
        </div>
      </div>

      <TaskSummaryCards tasks={tasks} />
      <TaskPerformanceMetrics tasks={tasks} />

      <SpreadsheetToolbar
        data={filtered}
        numericFields={[]}
        selectedIds={selectedIds}
        onSelectAll={() => setSelectedIds(filtered.map((t) => t.id))}
        onClearSelect={clearSelection}
      />

      <div className="flex flex-wrap gap-2 mb-3">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${filter === f.key ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
            {f.label}
            {f.key === "overdue" && overdueCount > 0 && (
              <span className="ml-1.5 bg-rose-100 text-rose-600 text-[10px] font-semibold rounded-full px-1.5 py-0.5">{overdueCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6 items-center">
        {/* Fuzzy search */}
        <div className="relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="pl-9 pr-3 h-9 w-full text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
          />
        </div>
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400 h-9">
          <option value="">All People</option>
          {people.map((p) => <option key={p.id} value={`${p.first_name} ${p.last_name}`}>{p.first_name} {p.last_name}</option>)}
        </select>
        <select value={filterEnterprise} onChange={(e) => setFilterEnterprise(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400 h-9">
          <option value="">All Enterprises</option>
          {enterprises.map((e) => <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>)}
        </select>
        {/* Tag filter — collect all unique tags */}
        {(() => {
          const allTags = [...new Set(tasks.flatMap(t => t.tags || []))].sort();
          if (!allTags.length) return null;
          return (
            <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400 h-9">
              <option value="">All Tags</option>
              {allTags.map((tag) => <option key={tag} value={tag}>#{tag}</option>)}
            </select>
          );
        })()}
        {(filterPerson || filterEnterprise || filterTag || search) && (
          <button onClick={() => { setFilterPerson(""); setFilterEnterprise(""); setFilterTag(""); setSearch(""); }} className="text-xs text-slate-400 hover:text-rose-500 flex items-center gap-1"><X className="w-3 h-3" /> Clear</button>
        )}
        <span className="ml-auto text-xs text-slate-400">{filtered.length} of {tasks.length}</span>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-slate-800 text-white rounded-2xl px-5 py-3 mb-5">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white h-7" onClick={bulkComplete}>Mark Completed</Button>
          <div className="flex items-center gap-2">
            <select value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)}
              className="text-sm border border-white/20 rounded-lg px-2 py-1 bg-slate-700 text-white focus:outline-none h-7">
              <option value="">Reassign to...</option>
              {appUsers.map((u) => <option key={u.id} value={u.email}>{u.full_name || u.email}</option>)}
            </select>
            {bulkAssignee && <Button size="sm" variant="outline" className="h-7 text-white border-white/30 hover:bg-white/10" onClick={bulkReassign}>Apply</Button>}
          </div>
          {perms.can_delete && <Button size="sm" variant="outline" className="h-7 border-rose-400 text-rose-300 hover:bg-rose-500/20" onClick={bulkDelete}>Delete</Button>}
          <Button size="sm" variant="ghost" className="h-7 text-slate-300 hover:text-white ml-auto" onClick={clearSelection}><X className="w-3.5 h-3.5" /></Button>
        </div>
      )}

      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {grouped.map((col) => {
            const style = COLUMN_STYLES[col.key] || COLUMN_STYLES.open;
            return (
              <div key={col.key} className="flex flex-col min-h-[300px]" onDragOver={onDragOver} onDrop={(e) => onDrop(e, col.key)}>
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl border ${style.header}`}>
                  <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                  <h3 className="text-sm font-semibold text-slate-700 flex-1">{col.label}</h3>
                  <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${style.count}`}>{col.items.length}</span>
                </div>
                <div className="flex-1 p-2 rounded-b-xl border border-t-0 bg-slate-50/50 border-slate-100 min-h-[200px] space-y-2">
                  {col.items.map((task) => (
                    <div key={task.id} draggable={!!perms.l3_create} onDragStart={(e) => e.dataTransfer.setData("taskId", task.id)} className="cursor-grab active:cursor-grabbing">
                      {renderCard(task, false)}
                    </div>
                  ))}
                  {col.items.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-slate-100">
                      <p className="text-xs text-slate-300">Drop here</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "list" && (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
              <Clock className="w-8 h-8 text-slate-200 mb-2" />
              <p className="text-sm text-slate-300">No tasks match this filter</p>
            </div>
          ) : filtered.map((task) => renderCard(task, true))}
        </div>
      )}

      {viewMode === "timeline" && (
        <TaskTimelineView tasks={filtered} renderCard={(task) => renderCard(task, true)} />
      )}

      {viewMode === "calendar" && (
        <TaskCalendarView tasks={tasks} />
      )}

      <TaskForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(d, saveAndNew) => {
          if (editing) { updateMut.mutate({ id: editing.id, data: d }); }
          else { createMut.mutate(d); if (saveAndNew) { setEditing(null); setFormOpen(true); } }
        }}
        initialData={editing}
        appUsers={appUsers}
        enterprises={enterprises}
        products={products}
        services={services}
        people={people}
        currentUser={currentUser}
      />

      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.title} />

      <TaskDetailPanel
        task={detailTask}
        open={!!detailTask}
        onClose={() => setDetailTask(null)}
        products={products}
        services={services}
      />

      <OutcomeDialog
        open={!!outcomeTask}
        onClose={() => setOutcomeTask(null)}
        taskTitle={outcomeTask?._bulk ? `${outcomeTask._bulk.length} tasks` : outcomeTask?.title}
        onConfirm={handleOutcomeConfirm}
      />

      <DeleteAllDialog
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        onConfirm={handleDeleteAll}
        entityLabel="Tasks"
        count={tasks.length}
      />
      <BulkImportDialog
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.refetchQueries({ queryKey: ["tasks"] });
        }}
        entityName="Tasks"
        fields={TASK_FIELDS}
        mappingRules={TASK_MAPPING_RULES}
        templateFileName="newsconseen_tasks_import_template.xlsx"
        templateExample={TASK_TEMPLATE_EXAMPLE}
        templateInstructions={TASK_TEMPLATE_INSTRUCTIONS}
        entityFetchFn={() => listFn(base44.entities.Task)}
        validateRow={validateTask}
        transformRow={transformTask}
        onImport={(row) => base44.entities.Task.create(withScope({ ...row, app_source: "import" }))}
        currentUser={currentUser}
        previewColumns={TASK_PREVIEW_COLS}
        requiredField="title"
      />

      {analyticsOpen && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shadow-sm">
            <p className="font-bold text-slate-800">Task Analytics</p>
            <button onClick={() => setAnalyticsOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <div className="p-6">
            <TasksAnalytics tasks={tasks} currentUser={currentUser} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Tasks() {
  const { data: currentUser = null, isLoading: loadingUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  const isSuperAdmin = currentUser?.role === "super_admin";
  const companyId = currentUser?.company_id;
  const listFn = useEntityListFn(currentUser);
  const qcRoot = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({ queryKey: ["tasks", companyId, currentUser?.email], queryFn: () => listFn(base44.entities.Task), enabled: currentUser !== null, staleTime: 0, refetchOnMount: "always" });
  const { data: appUsers = [] } = useQuery({ queryKey: ["appUsers", companyId], queryFn: () => isSuperAdmin || !companyId ? base44.entities.User.list() : base44.entities.User.filter({ company_id: companyId }), enabled: isAdmin, staleTime: 0, refetchOnMount: "always" });
  const { data: enterprises = [] } = useQuery({ queryKey: ["enterprises", companyId, currentUser?.email], queryFn: () => listFn(base44.entities.Enterprise), enabled: isAdmin, staleTime: 0, refetchOnMount: "always" });
  const { data: products = [] } = useQuery({ queryKey: ["products", companyId, currentUser?.email], queryFn: () => listFn(base44.entities.Product), enabled: isAdmin, staleTime: 0, refetchOnMount: "always" });
  const { data: services = [] } = useQuery({ queryKey: ["services", companyId, currentUser?.email], queryFn: () => listFn(base44.entities.Service), enabled: isAdmin, staleTime: 0, refetchOnMount: "always" });
  const { data: people = [] } = useQuery({ queryKey: ["people", companyId, currentUser?.email], queryFn: () => listFn(base44.entities.Person), enabled: isAdmin, staleTime: 0, refetchOnMount: "always" });
  const { data: addresses = [] } = useQuery({ queryKey: ["addresses", companyId, currentUser?.email], queryFn: () => listFn(base44.entities.Address), enabled: isAdmin, staleTime: 0, refetchOnMount: "always" });

  useEffect(() => {
    const unsub = base44.entities.Enterprise.subscribe(() => qcRoot.invalidateQueries({ queryKey: ["enterprises"] }));
    return unsub;
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        qcRoot.refetchQueries({ queryKey: ["tasks"] });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [qcRoot]);

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <Clock className="w-5 h-5 animate-spin mr-2" /> Loading...
      </div>
    );
  }

  if (isAdmin) {
    return (
      <AdminTasksView
        tasks={tasks} appUsers={appUsers} enterprises={enterprises}
        products={products} services={services} people={people}
        addresses={addresses} companyId={companyId}
        isSuperAdmin={isSuperAdmin} currentUser={currentUser}
        listFn={listFn}
      />
    );
  }

  const myTasks = tasks.filter((t) => t.assigned_to_email === currentUser?.email);
  return <MyTasksList tasks={myTasks} />;
}