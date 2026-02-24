import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, X, CheckCircle, AlertCircle } from "lucide-react";

// ── Task type catalogue ───────────────────────────────────────────────────────
export const TASK_TYPE_GROUPS = [
  {
    group: "Time & Attendance",
    types: [
      { value: "clock_in_out", label: "Clock-In / Clock-Out" },
      { value: "shift_start_end", label: "Shift Start / End" },
      { value: "break", label: "Break" },
      { value: "overtime_approval", label: "Overtime Approval" },
      { value: "absence_leave", label: "Absence / Leave" },
    ],
  },
  {
    group: "Operations & Inventory",
    types: [
      { value: "stock_counting", label: "Stock Counting" },
      { value: "shelf_restocking", label: "Shelf Restocking" },
      { value: "inventory_inspection", label: "Inventory Inspection" },
      { value: "receiving_check", label: "Receiving Check" },
      { value: "picking_packing", label: "Picking / Packing" },
      { value: "delivery_preparation", label: "Delivery Preparation" },
      { value: "delivery_confirmation", label: "Delivery Confirmation" },
    ],
  },
  {
    group: "Service & Maintenance",
    types: [
      { value: "maintenance", label: "Maintenance Task" },
      { value: "repair", label: "Repair Task" },
      { value: "installation", label: "Installation Task" },
      { value: "cleaning", label: "Cleaning Task" },
      { value: "inspection", label: "Inspection Task" },
      { value: "preventive_maintenance", label: "Preventive Maintenance" },
      { value: "service_visit", label: "Service Visit" },
    ],
  },
  {
    group: "Healthcare / Regulated",
    types: [
      { value: "medication_admin", label: "Medication Administration" },
      { value: "vital_signs_check", label: "Vital Signs Check" },
      { value: "incident_observation", label: "Incident Observation" },
      { value: "care_plan_activity", label: "Care Plan Activity" },
      { value: "safety_check", label: "Safety Check" },
    ],
  },
  {
    group: "Administrative",
    types: [
      { value: "staff_onboarding", label: "Staff Onboarding" },
      { value: "training_completion", label: "Training Completion" },
      { value: "certification_renewal", label: "Certification Renewal" },
      { value: "document_review", label: "Document Review" },
      { value: "performance_review", label: "Performance Review" },
      { value: "meeting_followup", label: "Meeting Follow-Up" },
    ],
  },
  {
    group: "Logistics & Field",
    types: [
      { value: "delivery_task", label: "Delivery Task" },
      { value: "pickup_task", label: "Pickup Task" },
      { value: "route_assignment", label: "Route Assignment" },
      { value: "vehicle_inspection", label: "Vehicle Inspection" },
      { value: "fuel_log", label: "Fuel Log Entry" },
      { value: "equipment_checkout", label: "Equipment Check-Out / In" },
    ],
  },
  {
    group: "Financial & Support",
    types: [
      { value: "expense_preparation", label: "Expense Preparation" },
      { value: "invoice_review", label: "Invoice Review" },
      { value: "payment_followup", label: "Payment Follow-Up" },
      { value: "customer_support", label: "Customer Support Ticket" },
      { value: "complaint_handling", label: "Complaint Handling" },
    ],
  },
  {
    group: "Other",
    types: [{ value: "other", label: "Other" }],
  },
];

// Lookup helper
export const taskTypeLabel = (value) => {
  for (const g of TASK_TYPE_GROUPS) {
    const t = g.types.find((t) => t.value === value);
    if (t) return t.label;
  }
  return value || "—";
};

const PRIORITY_COLOR = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-rose-50 text-rose-700",
};
const STATUS_COLOR = {
  open: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-500",
};

function Field({ label, required, hint, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function SectionDivider({ label }) {
  return (
    <div className="pt-2">
      <div className="h-px bg-slate-100 mb-3" />
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
    </div>
  );
}

export default function TaskForm({ open, onClose, onSubmit, initialData, people, enterprises, products, services }) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (open) {
      setForm(
        initialData || {
          status: "open",
          priority: "normal",
          outcome: "pending",
          trigger_transaction: false,
        }
      );
    }
  }, [open, initialData]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = (e) => { e.preventDefault(); onSubmit(form); };
  const handleMarkCompleted = () => onSubmit({ ...form, status: "completed", outcome: "completed" });
  const handleSaveAndNew = () => onSubmit(form, true);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-full p-0 overflow-hidden max-h-[95vh] flex flex-col">
        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-base font-semibold text-slate-800">
                {initialData ? "Edit Task" : "New Task"}
              </DialogTitle>
              <p className="text-xs text-slate-400 mt-0.5">Assign and track a unit of work — does not change stock, revenue, or ownership</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Badge className={PRIORITY_COLOR[form.priority] || PRIORITY_COLOR.normal}>
                {form.priority || "normal"}
              </Badge>
              <Badge className={STATUS_COLOR[form.status] || STATUS_COLOR.open}>
                {(form.status || "open").replace(/_/g, " ")}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* ── Body ── */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

            {/* Task Type */}
            <Field label="Task Type" required>
              <Select value={form.task_type || ""} onValueChange={(v) => set("task_type", v)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select task type..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {TASK_TYPE_GROUPS.map((g) => (
                    <React.Fragment key={g.group}>
                      <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{g.group}</div>
                      {g.types.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Title */}
            <Field label="Task Title / Summary" required>
              <Input
                value={form.title || ""}
                onChange={(e) => set("title", e.target.value)}
                className="rounded-xl"
                placeholder="e.g. Deliver package to Warehouse A..."
              />
            </Field>

            {/* Status & Priority */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <Select value={form.status || "open"} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={form.priority || "normal"} onValueChange={(v) => set("priority", v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* ── Assignment ── */}
            <SectionDivider label="Assignment" />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Assigned To (Executor)">
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
              <Field label="Enterprise">
                <Select value={form.enterprise || ""} onValueChange={(v) => set("enterprise", v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select enterprise..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>— None —</SelectItem>
                    {(enterprises || []).map((e) => (
                      <SelectItem key={e.id} value={e.enterprise_name}>{e.enterprise_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* ── Contextual Links ── */}
            <SectionDivider label="Related To (optional — references only, no ownership change)" />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Related Person (client, patient…)">
                <Select value={form.related_person || ""} onValueChange={(v) => set("related_person", v)}>
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
              <Field label="Related Item">
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
            </div>

            <Field label="Related Service">
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

            {/* ── Timing ── */}
            <SectionDivider label="Timing" />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Scheduled Date">
                <Input type="date" value={form.scheduled_date || ""} onChange={(e) => set("scheduled_date", e.target.value)} className="rounded-xl" />
              </Field>
              <Field label="Scheduled Time">
                <Input type="time" value={form.scheduled_time || ""} onChange={(e) => set("scheduled_time", e.target.value)} className="rounded-xl" />
              </Field>
              <Field label="Due Date">
                <Input type="date" value={form.due_date || ""} onChange={(e) => set("due_date", e.target.value)} className="rounded-xl" />
              </Field>
              <Field label="Due Time">
                <Input type="time" value={form.due_time || ""} onChange={(e) => set("due_time", e.target.value)} className="rounded-xl" />
              </Field>
            </div>

            {/* ── Execution Result ── */}
            <SectionDivider label="Execution Result" />

            <Field label="Outcome">
              <Select value={form.outcome || "pending"} onValueChange={(v) => set("outcome", v)}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="partially_done">Partially Done</SelectItem>
                  <SelectItem value="refused">Refused</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                  <SelectItem value="not_applicable">Not Applicable</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Outcome Notes">
              <Textarea
                value={form.outcome_notes || ""}
                onChange={(e) => set("outcome_notes", e.target.value)}
                className="rounded-xl resize-none"
                rows={3}
                placeholder="What happened, observations, results..."
              />
            </Field>

            {/* ── Transaction Trigger ── */}
            <SectionDivider label="Trigger a Transaction? (Optional)" />

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => set("trigger_transaction", !form.trigger_transaction)}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${form.trigger_transaction ? "bg-emerald-500" : "bg-slate-200"}`}
                >
                  <span className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.trigger_transaction ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <span className="text-sm text-slate-700">
                  {form.trigger_transaction ? "Yes — this task should trigger a transaction" : "No — task only, no state change"}
                </span>
              </div>

              {form.trigger_transaction && (
                <Field label="Transaction Type to Trigger" hint="The actual transaction must be created separately in the Transactions module.">
                  <Select value={form.transaction_type || ""} onValueChange={(v) => set("transaction_type", v)}>
                    <SelectTrigger className="rounded-xl bg-white"><SelectValue placeholder="Select type..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stock_out">Stock Out</SelectItem>
                      <SelectItem value="stock_in">Stock In</SelectItem>
                      <SelectItem value="stock_transfer">Stock Transfer</SelectItem>
                      <SelectItem value="sale_service">Sale / Service</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}

              <div className="flex items-start gap-2 text-xs text-slate-400 bg-white rounded-lg p-2.5 border border-slate-100">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                <span>Tasks never modify inventory, revenue, or ownership. Go to <strong className="text-slate-600">Transactions</strong> to record the actual state change.</span>
              </div>
            </div>

            {/* Internal Notes */}
            <Field label="Internal Notes">
              <Textarea
                value={form.internal_notes || ""}
                onChange={(e) => set("internal_notes", e.target.value)}
                className="rounded-xl resize-none"
                rows={2}
                placeholder="Internal context, instructions..."
              />
            </Field>
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/40 shrink-0">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl text-sm">
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleSaveAndNew} className="rounded-xl text-sm border-slate-300">
                Save &amp; New
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleMarkCompleted}
                className="rounded-xl text-sm border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <CheckCircle className="w-4 h-4 mr-1.5" /> Mark Completed
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