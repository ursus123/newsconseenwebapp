import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import TaskForm from "../components/tasks/TaskForm";
import DeleteDialog from "../components/shared/DeleteDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pencil, Trash2, Calendar, User, Building2, Package } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";

const priorityColor = { low: "bg-slate-100 text-slate-600", medium: "bg-blue-50 text-blue-700", high: "bg-amber-50 text-amber-700", urgent: "bg-rose-50 text-rose-700" };
const statusMap = { todo: "To Do", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" };

const formFields = [
  { key: "title", label: "Title", required: true },
  { key: "description", label: "Description", type: "textarea" },
  { key: "assigned_to", label: "Assigned To" },
  { key: "priority", label: "Priority", type: "select", default: "medium", options: [
    { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" },
  ]},
  { key: "status", label: "Status", type: "select", default: "todo", options: [
    { value: "todo", label: "To Do" }, { value: "in_progress", label: "In Progress" }, { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" },
  ]},
  { key: "due_date", label: "Due Date", type: "date" },
  { key: "category", label: "Category", type: "select", default: "operations", options: [
    { value: "operations", label: "Operations" }, { value: "sales", label: "Sales" }, { value: "finance", label: "Finance" },
    { value: "hr", label: "HR" }, { value: "marketing", label: "Marketing" }, { value: "maintenance", label: "Maintenance" }, { value: "other", label: "Other" },
  ]},
];

function TaskCard({ task, onEdit, onDelete, onStatusChange }) {
  const borderColor = { todo: "border-l-slate-300", in_progress: "border-l-blue-400", completed: "border-l-emerald-400", cancelled: "border-l-rose-300" };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={`p-4 border-l-4 ${borderColor[task.status] || "border-l-slate-300"} hover:shadow-md transition-shadow`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className={`font-medium text-sm ${task.status === "completed" ? "line-through text-slate-400" : "text-slate-800"}`}>
              {task.title}
            </h4>
            {task.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge className={priorityColor[task.priority] || priorityColor.medium}>{task.priority}</Badge>
              {task.assigned_to && (
                <Badge variant="outline" className="text-xs gap-1"><User className="w-3 h-3" />{task.assigned_to}</Badge>
              )}
              {task.due_date && (
                <Badge variant="outline" className="text-xs gap-1"><Calendar className="w-3 h-3" />{format(new Date(task.due_date), "MMM d")}</Badge>
              )}
            </div>
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
  const qc = useQueryClient();

  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => base44.entities.Task.list("-created_date") });

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Task.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Task.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Task.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); setDeleting(null); } });

  const grouped = {
    todo: tasks.filter((t) => t.status === "todo"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    completed: tasks.filter((t) => t.status === "completed"),
  };

  return (
    <div>
      <PageHeader title="Tasks" subtitle="Manage and track business tasks" onAdd={() => { setEditing(null); setFormOpen(true); }} addLabel="Add Task" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Object.entries(grouped).map(([status, items]) => (
          <div key={status}>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold text-slate-600">{statusMap[status]}</h3>
              <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{items.length}</span>
            </div>
            <div className="space-y-3">
              {items.map((task) => (
                <TaskCard key={task.id} task={task} onEdit={(t) => { setEditing(t); setFormOpen(true); }} onDelete={(t) => setDeleting(t)} />
              ))}
              {items.length === 0 && <p className="text-xs text-slate-300 text-center py-8">No tasks</p>}
            </div>
          </div>
        ))}
      </div>

      <EntityForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)} fields={formFields} initialData={editing} title={editing ? "Edit Task" : "Add Task"} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.title} />
    </div>
  );
}