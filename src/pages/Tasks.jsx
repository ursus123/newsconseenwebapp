import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import TaskForm, { taskTypeLabel } from "../components/tasks/TaskForm";
import DeleteDialog from "../components/shared/DeleteDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pencil, Trash2, Calendar, User, Building2, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";
import { motion } from "framer-motion";

const PRIORITY_COLOR = {
  low: "bg-slate-100 text-slate-500",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-rose-50 text-rose-600",
};

const STATUS_GROUPS = [
  { key: "open", label: "Open", color: "border-l-slate-300" },
  { key: "in_progress", label: "In Progress", color: "border-l-blue-400" },
  { key: "completed", label: "Completed", color: "border-l-emerald-400" },
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

function TaskCard({ task, onEdit, onDelete }) {
  const borderColor = {
    open: "border-l-slate-300",
    in_progress: "border-l-blue-400",
    completed: "border-l-emerald-400",
    cancelled: "border-l-rose-300",
  };

  const overdue = isDuePast(task);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={`p-4 border-l-4 ${borderColor[task.status] || "border-l-slate-300"} hover:shadow-md transition-shadow`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Task type label */}
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

              {task.assigned_to && (
                <Badge variant="outline" className="text-xs gap-1">
                  <User className="w-3 h-3" />{task.assigned_to}
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

          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-emerald-600" onClick={() => onEdit(task)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-rose-600" onClick={() => onDelete(task)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function Tasks() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [filter, setFilter] = useState("all");
  const qc = useQueryClient();

  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => base44.entities.Task.list("-created_date") });
  const { data: people = [] } = useQuery({ queryKey: ["people"], queryFn: () => base44.entities.Person.list() });
  const { data: enterprises = [] } = useQuery({ queryKey: ["enterprises"], queryFn: () => base44.entities.Enterprise.list() });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => base44.entities.Product.list() });
  const { data: services = [] } = useQuery({ queryKey: ["services"], queryFn: () => base44.entities.Service.list() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });
  const createMut = useMutation({ mutationFn: (d) => base44.entities.Task.create(d), onSuccess: () => { invalidate(); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Task.update(id, data), onSuccess: () => { invalidate(); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Task.delete(id), onSuccess: () => { invalidate(); setDeleting(null); } });

  // Filter logic
  const filtered = tasks.filter((t) => {
    if (filter === "all") return true;
    if (filter === "open") return t.status === "open" || t.status === "in_progress";
    if (filter === "overdue") return isDuePast(t);
    if (filter === "today") return t.due_date && isToday(parseISO(t.due_date));
    if (filter === "completed") return t.status === "completed";
    return true;
  });

  // Group for kanban (only when showing all/open)
  const showKanban = filter === "all";
  const grouped = STATUS_GROUPS.map((s) => ({
    ...s,
    items: filtered.filter((t) => t.status === s.key),
  }));

  const openEdit = (t) => { setEditing(t); setFormOpen(true); };

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Queue of planned and performed work"
        onAdd={() => { setEditing(null); setFormOpen(true); }}
        addLabel="New Task"
      />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-6">
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
            {f.key === "overdue" && tasks.filter(isDuePast).length > 0 && (
              <span className="ml-1.5 bg-rose-100 text-rose-600 text-[10px] font-semibold rounded-full px-1.5 py-0.5">
                {tasks.filter(isDuePast).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Kanban columns */}
      {showKanban ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {grouped.map((col) => (
            <div key={col.key}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-slate-600">{col.label}</h3>
                <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{col.items.length}</span>
              </div>
              <div className="space-y-3">
                {col.items.map((task) => (
                  <TaskCard key={task.id} task={task} onEdit={openEdit} onDelete={(t) => setDeleting(t)} />
                ))}
                {col.items.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-slate-100 rounded-2xl">
                    <CheckCircle className="w-6 h-6 text-slate-200 mb-1" />
                    <p className="text-xs text-slate-300">No tasks</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Flat list for filters */
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
              <Clock className="w-8 h-8 text-slate-200 mb-2" />
              <p className="text-sm text-slate-300">No tasks match this filter</p>
            </div>
          ) : (
            filtered.map((task) => (
              <TaskCard key={task.id} task={task} onEdit={openEdit} onDelete={(t) => setDeleting(t)} />
            ))
          )}
        </div>
      )}

      <TaskForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(d, saveAndNew) => {
          if (editing) {
            updateMut.mutate({ id: editing.id, data: d });
          } else {
            createMut.mutate(d);
            if (saveAndNew) { setEditing(null); setFormOpen(true); }
          }
        }}
        initialData={editing}
        people={people}
        enterprises={enterprises}
        products={products}
        services={services}
      />
      <DeleteDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMut.mutate(deleting.id)}
        itemName={deleting?.title}
      />
    </div>
  );
}