import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, X } from "lucide-react";

const priorityColor = { low: "bg-slate-100 text-slate-600", medium: "bg-blue-50 text-blue-700", high: "bg-amber-50 text-amber-700", urgent: "bg-rose-50 text-rose-700" };
const statusColor = { todo: "bg-slate-100 text-slate-600", in_progress: "bg-blue-50 text-blue-700", completed: "bg-emerald-50 text-emerald-700", cancelled: "bg-rose-50 text-rose-500" };

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">{label}{required && <span className="text-rose-500 ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

export default function TaskForm({ open, onClose, onSubmit, initialData, people, enterprises, products, services }) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (open) {
      setForm(initialData || { status: "todo", priority: "medium", category: "operations" });
    }
  }, [open, initialData]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = (e) => { e.preventDefault(); onSubmit(form); };
  const handleSaveAndNew = () => onSubmit(form, true);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl w-full p-0 overflow-hidden max-h-[92vh]">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-base font-semibold text-slate-800">
                {initialData ? "Edit Task" : "New Task"}
              </DialogTitle>
              <p className="text-xs text-slate-400 mt-0.5">Plan and assign a unit of work</p>
            </div>
            <div className="flex gap-1.5">
              <Badge className={priorityColor[form.priority] || priorityColor.medium}>{form.priority || "medium"}</Badge>
              <Badge className={statusColor[form.status] || statusColor.todo}>{(form.status || "todo").replace(/_/g, " ")}</Badge>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[60vh]">

            {/* Title */}
            <Field label="Task Title" required>
              <Input value={form.title || ""} onChange={(e) => set("title", e.target.value)} className="rounded-xl" placeholder="e.g. Deliver package to customer..." />
            </Field>

            {/* Description */}
            <Field label="Description">
              <Textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} className="rounded-xl resize-none" rows={3} placeholder="What needs to be done..." />
            </Field>

            {/* Status & Priority */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <Select value={form.status || "todo"} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={form.priority || "medium"} onValueChange={(v) => set("priority", v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Category */}
            <Field label="Category">
              <Select value={form.category || "operations"} onValueChange={(v) => set("category", v)}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["operations","sales","finance","hr","marketing","maintenance","delivery","inspection","other"].map((c) => (
                    <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="h-px bg-slate-100" />
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Assignment (Who / Where / What)</p>

            {/* Assigned To */}
            <Field label="Assigned To (Person)">
              <Select value={form.assigned_to || ""} onValueChange={(v) => set("assigned_to", v)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select person..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>— None —</SelectItem>
                  {(people || []).map((p) => {
                    const name = p.preferred_name || `${p.first_name} ${p.last_name}`.trim();
                    return <SelectItem key={p.id} value={name}>{name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </Field>

            {/* Related Enterprise */}
            <Field label="Related Enterprise">
              <Select value={form.related_enterprise || ""} onValueChange={(v) => set("related_enterprise", v)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select enterprise..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>— None —</SelectItem>
                  {(enterprises || []).map((e) => (
                    <SelectItem key={e.id} value={e.enterprise_name}>{e.enterprise_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Related Item */}
            <Field label="Related Item (optional)">
              <Select value={form.related_item || ""} onValueChange={(v) => set("related_item", v)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select item..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>— None —</SelectItem>
                  {(products || []).map((p) => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Related Service */}
            <Field label="Related Service (optional)">
              <Select value={form.related_service || ""} onValueChange={(v) => set("related_service", v)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select service..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>— None —</SelectItem>
                  {(services || []).map((s) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="h-px bg-slate-100" />
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Timing</p>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start Date">
                <Input type="date" value={form.start_date || ""} onChange={(e) => set("start_date", e.target.value)} className="rounded-xl" />
              </Field>
              <Field label="Due Date">
                <Input type="date" value={form.due_date || ""} onChange={(e) => set("due_date", e.target.value)} className="rounded-xl" />
              </Field>
            </div>

            <Field label="Estimated Hours">
              <Input type="number" value={form.estimated_hours ?? ""} onChange={(e) => set("estimated_hours", parseFloat(e.target.value) || 0)} className="rounded-xl" placeholder="e.g. 2" />
            </Field>

            <Field label="Internal Notes">
              <Textarea value={form.internal_notes || ""} onChange={(e) => set("internal_notes", e.target.value)} className="rounded-xl resize-none" rows={3} placeholder="Additional context, instructions..." />
            </Field>

            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-600">
              ℹ️ Tasks describe intended work. Use Transactions to record actual stock, revenue, or ownership changes.
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/40">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl text-sm">
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleSaveAndNew} className="rounded-xl text-sm border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                Save & New
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm shadow-lg shadow-emerald-500/20">
                <Save className="w-4 h-4 mr-2" /> Save
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}