import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import { usePermissions } from "@/components/shared/usePermissions";
import { useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";
import { triggerTaskTransaction } from "../components/shared/triggerTaskTransaction";
import TaskForm, { taskTypeLabel } from "../components/tasks/TaskForm";
import DeleteDialog from "../components/shared/DeleteDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pencil, Trash2, Calendar, User, Building2, CheckCircle, AlertCircle, Clock, ShieldCheck, Filter, LayoutGrid, List } from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";
import { motion } from "framer-motion";
import dnd from "@hello-pangea/dnd";
const { DragDropContext, Droppable, Draggable } = dnd;

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

function isDuePast(task) {
  if (!task.due_date) return false;
  return isPast(parseISO(task.due_date)) && task.status !== "completed" && task.status !== "cancelled";
}

function TaskCard({ task, onEdit, onDelete, isAdmin }) {
  const overdue = isDuePast(task);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={`p-4 border-l-4 ${STATUS_BORDER[task.status] || "border-l-slate-300"} hover:shadow-md transition-shadow`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
              {taskTypeLabel(task.task_type)}
            </p>
            <h4 className={`font-medium text-sm ${task.status === "completed" ? "line-through text-slate-400" : "text-slate-800"}`}>
              {task.title}
            </h4>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <Badge className={PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.normal}>
                {task.priority || "normal"}
              </Badge>
              {task.assigned_to_name && (
                <Badge variant="outline" className="text-xs gap-1">
                  <User className="w-3 h-3" />{task.assigned_to_name}
                </Badge>
              )}
              {task.enterprise && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Building2 className="w-3 h-3" />{task.enterprise}
                </Badge>
              )}
              {task.due_date && (
                <Badge variant="outline" className={`text-xs gap-1 ${overdue ? "border-rose-300 text-rose-600 bg-rose-50" : ""}`}>
                  {overdue ? <AlertCircle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                  {isToday(parseISO(task.due_date)) ? "Today" : format(parseISO(task.due_date), "MMM d")}
                  {task.due_time && ` ${task.due_time}`}
                </Badge>
              )}
              {task.trigger_transaction && (
                <Badge className="bg-violet-50 text-violet-700 text-xs">→ Transaction</Badge>
              )}
            </div>
            {task.outcome_notes && (
              <p className="text-xs text-slate-400 mt-2 line-clamp-1 italic">{task.outcome_notes}</p>
            )}
          </div>
          {isAdmin && (
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-emerald-600" onClick={() => onEdit(task)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-rose-600" onClick={() => onDelete(task)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

// User view: flat list of tasks assigned to the current user
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
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              filter === f.key
                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
            <CheckCircle className="w-8 h-8 text-emerald-200 mb-2" />
            <p className="text-sm text-slate-400 font-medium">All clear!</p>
            <p className="text-xs text-slate-300">No tasks here</p>
          </div>
        ) : (
          filtered.map((task) => (
            <TaskCard key={task.id} task={task} isAdmin={false} />
          ))
        )}
      </div>
    </div>
  );
}

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

// Admin view: kanban + filters + full CRUD
function AdminTasksView({ tasks, appUsers, enterprises, products, services, people, addresses, companyId, isSuperAdmin, currentUser }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [filter, setFilter] = useState("all");
  const [viewMode, setViewMode] = useState("kanban"); // "kanban" | "list"
  const [filterPerson, setFilterPerson] = useState("");
  const [filterEnterprise, setFilterEnterprise] = useState("");
  const [filterAddress, setFilterAddress] = useState("");
  const qc = useQueryClient();
  const perms = usePermissions(currentUser);
  const withScope = useWithScope(currentUser);

  const withCompany = withScope;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const afterSave = async (task) => {
    if (task.status === "completed" && task.trigger_transaction) {
      await triggerTaskTransaction(task, null);
    }
    invalidate();
  };

  const createMut = useMutation({
    mutationFn: async (d) => {
      const task = await base44.entities.Task.create(withCompany(d));
      await afterSave(task);
      return task;
    },
    onSuccess: () => { setFormOpen(false); },
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, data }) => {
      const task = await base44.entities.Task.update(id, data);
      await afterSave(task);
      return task;
    },
    onSuccess: () => { setFormOpen(false); setEditing(null); },
  });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Task.delete(id), onSuccess: () => { invalidate(); setDeleting(null); } });

  const filtered = tasks.filter((t) => {
    if (filter === "open" && t.status !== "open" && t.status !== "in_progress") return false;
    if (filter === "overdue" && !isDuePast(t)) return false;
    if (filter === "today" && !(t.due_date && isToday(parseISO(t.due_date)))) return false;
    if (filter === "completed" && t.status !== "completed") return false;
    if (filterPerson && t.related_person !== filterPerson) return false;
    if (filterEnterprise && t.enterprise !== filterEnterprise) return false;
    if (filterAddress && !((t.outcome_notes || "").includes(filterAddress) || (t.title || "").includes(filterAddress))) return false;
    return true;
  });

  const grouped = KANBAN_COLUMNS.map((s) => ({ ...s, items: filtered.filter((t) => t.status === s.key) }));
  const openEdit = (t) => { setEditing(t); setFormOpen(true); };
  const overdueCount = tasks.filter(isDuePast).length;

  const onDragEnd = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;
    const newStatus = destination.droppableId;
    const task = tasks.find((t) => t.id === draggableId);
    if (!task) return;
    updateMut.mutate({ id: draggableId, data: { ...task, status: newStatus } });
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Admin View — All Tasks</span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <PageHeader
            title="Tasks"
            subtitle="Assign and manage tasks for app users"
            onAdd={perms.l3_create ? () => { setEditing(null); setFormOpen(true); } : undefined}
            addLabel="Assign Task"
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode("kanban")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === "kanban" ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Kanban
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === "list" ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
          >
            <List className="w-3.5 h-3.5" /> List
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              filter === f.key
                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
          >
            {f.label}
            {f.key === "overdue" && overdueCount > 0 && (
              <span className="ml-1.5 bg-rose-100 text-rose-600 text-[10px] font-semibold rounded-full px-1.5 py-0.5">
                {overdueCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Secondary filters */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        <select
          value={filterPerson}
          onChange={(e) => setFilterPerson(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        >
          <option value="">All People</option>
          {people.map((p) => (
            <option key={p.id} value={`${p.first_name} ${p.last_name}`}>{p.first_name} {p.last_name}</option>
          ))}
        </select>
        <select
          value={filterEnterprise}
          onChange={(e) => setFilterEnterprise(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        >
          <option value="">All Enterprises</option>
          {enterprises.map((e) => (
            <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>
          ))}
        </select>
        <select
          value={filterAddress}
          onChange={(e) => setFilterAddress(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        >
          <option value="">All Addresses</option>
          {addresses.map((a) => (
            <option key={a.id} value={a.address_line1}>{a.label ? `${a.label} – ` : ""}{a.address_line1}{a.city ? `, ${a.city}` : ""}</option>
          ))}
        </select>
        {(filterPerson || filterEnterprise || filterAddress) && (
          <button
            onClick={() => { setFilterPerson(""); setFilterEnterprise(""); setFilterAddress(""); }}
            className="text-xs text-slate-400 hover:text-rose-500 underline"
          >
            Clear
          </button>
        )}
      </div>

      {viewMode === "kanban" ? (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {grouped.map((col) => {
              const style = COLUMN_STYLES[col.key] || COLUMN_STYLES.open;
              return (
                <div key={col.key} className="flex flex-col min-h-[300px]">
                  <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl border ${style.header} mb-0`}>
                    <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                    <h3 className="text-sm font-semibold text-slate-700 flex-1">{col.label}</h3>
                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${style.count}`}>{col.items.length}</span>
                  </div>
                  <Droppable droppableId={col.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 p-2 rounded-b-xl border border-t-0 transition-colors min-h-[200px] space-y-2 ${
                          snapshot.isDraggingOver ? "bg-slate-100 border-slate-300" : "bg-slate-50/50 border-slate-100"
                        }`}
                      >
                        {col.items.map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={!perms.l3_create}>
                            {(prov, snap) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                className={snap.isDragging ? "opacity-80 rotate-1 scale-[1.02]" : ""}
                              >
                                <TaskCard
                                  task={task}
                                  onEdit={perms.l3_create ? openEdit : undefined}
                                  onDelete={perms.can_delete ? (t) => setDeleting(t) : undefined}
                                  isAdmin={perms.l3_create}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {col.items.length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-slate-100">
                            <p className="text-xs text-slate-300">Drop here</p>
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
              <Clock className="w-8 h-8 text-slate-200 mb-2" />
              <p className="text-sm text-slate-300">No tasks match this filter</p>
            </div>
          ) : (
            filtered.map((task) => (
              <TaskCard key={task.id} task={task} onEdit={perms.l3_create ? openEdit : undefined} onDelete={perms.can_delete ? (t) => setDeleting(t) : undefined} isAdmin={perms.l3_create} />
            ))
          )}
        </div>
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
      />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.title} />
    </div>
  );
}

export default function Tasks() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    base44.auth.me().then((u) => { setCurrentUser(u); setLoadingUser(false); }).catch(() => setLoadingUser(false));
  }, []);

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  const isSuperAdmin = currentUser?.role === "super_admin";
  const companyId = currentUser?.company_id;
  const listFn = useEntityListFn(currentUser);

  const { data: tasks = [] } = useQuery({ queryKey: ["tasks", companyId, currentUser?.email], queryFn: () => listFn(base44.entities.Task), enabled: currentUser !== null });
  const { data: appUsers = [] } = useQuery({ queryKey: ["appUsers", companyId], queryFn: () => isSuperAdmin || !companyId ? base44.entities.User.list() : base44.entities.User.filter({ company_id: companyId }), enabled: isAdmin });
  const qcRoot = useQueryClient();
  const { data: enterprises = [] } = useQuery({ queryKey: ["enterprises", companyId, currentUser?.email], queryFn: () => listFn(base44.entities.Enterprise), enabled: isAdmin });

  // Refresh enterprise list in real-time when new enterprises are added
  useEffect(() => {
    const unsub = base44.entities.Enterprise.subscribe(() => {
      qcRoot.invalidateQueries({ queryKey: ["enterprises"] });
    });
    return unsub;
  }, []);
  const { data: products = [] } = useQuery({ queryKey: ["products", companyId, currentUser?.email], queryFn: () => listFn(base44.entities.Product), enabled: isAdmin });
  const { data: services = [] } = useQuery({ queryKey: ["services", companyId, currentUser?.email], queryFn: () => listFn(base44.entities.Service), enabled: isAdmin });
  const { data: people = [] } = useQuery({ queryKey: ["people", companyId, currentUser?.email], queryFn: () => listFn(base44.entities.Person), enabled: isAdmin });
  const { data: addresses = [] } = useQuery({ queryKey: ["addresses", companyId, currentUser?.email], queryFn: () => listFn(base44.entities.Address), enabled: isAdmin });

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
        tasks={tasks}
        appUsers={appUsers}
        enterprises={enterprises}
        products={products}
        services={services}
        people={people}
        addresses={addresses}
        companyId={companyId}
        isSuperAdmin={isSuperAdmin}
        currentUser={currentUser}
      />
    );
  }

  // Regular user: see only tasks assigned to their email
  const myTasks = tasks.filter((t) => t.assigned_to_email === currentUser?.email);
  return <MyTasksList tasks={myTasks} />;
}