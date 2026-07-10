import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, User, Building2, Clock, CheckCircle, AlertCircle, ArrowLeftRight, Package, Wrench, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { createPageUrl } from "@/utils";
import { taskTypeLabel } from "./TaskForm";
import { useQuery } from "@tanstack/react-query";
import { ncClient } from "@/api/ncClient";

const PRIORITY_COLOR = {
  low: "bg-slate-100 text-slate-500",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-rose-50 text-rose-600",
};
const STATUS_COLOR = {
  open: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-500",
};
const APP_SOURCE_BADGE = {
  med_admin: { label: "Med Admin", cls: "bg-purple-50 text-purple-700" },
  clock: { label: "Attendance", cls: "bg-blue-50 text-blue-700" },
  delivery: { label: "Delivery", cls: "bg-amber-50 text-amber-700" },
  maintenance: { label: "Maintenance", cls: "bg-orange-50 text-orange-700" },
};

function Row({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">{label}</p>
        <p className="text-sm text-slate-700 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function fmt(d) {
  if (!d) return null;
  try { return format(new Date(d), "MMM d, yyyy 'at' h:mm a"); } catch { return d; }
}

export default function TaskDetailPanel({ task, open, onClose, products, services }) {
  const { data: linkedTransaction } = useQuery({
    queryKey: ["linked-tx", task?.id],
    queryFn: async () => {
      const txs = await ncClient.entities.Transaction.filter({ source_task_id: task.id });
      return txs[0] || null;
    },
    enabled: !!task?.id && open,
  });

  if (!task) return null;

  const srcBadge = task.app_source ? APP_SOURCE_BADGE[task.app_source] : null;
  const linkedProduct = task.related_item ? products?.find((p) => p.name === task.related_item) : null;
  const linkedService = task.related_service ? services?.find((s) => s.name === task.related_service) : null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-slate-100">
          <SheetTitle className="text-base font-semibold text-slate-800 pr-8">{task.title}</SheetTitle>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <Badge className={STATUS_COLOR[task.status] || STATUS_COLOR.open}>{(task.status || "open").replace(/_/g, " ")}</Badge>
            <Badge className={PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.normal}>{task.priority || "normal"}</Badge>
            <Badge variant="outline" className="text-xs">{taskTypeLabel(task.task_type)}</Badge>
            {srcBadge && <Badge className={`${srcBadge.cls} text-xs`}>{srcBadge.label}</Badge>}
          </div>
        </SheetHeader>

        <div className="py-5 space-y-5">
          {/* Core Info */}
          <div className="space-y-3">
            <Row icon={Building2} label="Enterprise" value={task.enterprise} />
            <Row icon={User} label="Assigned To" value={task.assigned_to_name || task.assigned_to_email} />
            <Row icon={User} label="Related Person" value={task.related_person} />
            <Row icon={Calendar} label="Scheduled" value={task.scheduled_date ? `${task.scheduled_date}${task.scheduled_time ? ` at ${task.scheduled_time}` : ""}` : null} />
            <Row icon={Calendar} label="Due" value={task.due_date ? `${task.due_date}${task.due_time ? ` at ${task.due_time}` : ""}` : null} />
          </div>

          {/* Outcome */}
          {(task.outcome || task.outcome_notes || task.outcome_reason) && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Outcome</p>
              <div className="flex flex-wrap gap-1.5">
                {task.outcome && (
                  <Badge className="bg-emerald-50 text-emerald-700">{task.outcome.replace(/_/g, " ")}</Badge>
                )}
                {task.outcome_reason && (
                  <Badge variant="outline" className="text-xs text-slate-600">{task.outcome_reason.replace(/_/g, " ")}</Badge>
                )}
              </div>
              {task.actual_completion_time && (
                <p className="text-xs text-slate-500">
                  Completed at <span className="font-medium text-slate-700">{task.actual_completion_time}</span>
                  {task.scheduled_time && task.actual_completion_time !== task.scheduled_time && (
                    <span className="text-slate-400"> (scheduled {task.scheduled_time})</span>
                  )}
                </p>
              )}
              {task.completed_by && (
                <p className="text-xs text-slate-500">By <span className="font-medium text-slate-700">{task.completed_by}</span></p>
              )}
              {task.outcome_notes && (
                <p className="text-sm text-slate-600 italic">{task.outcome_notes}</p>
              )}
            </div>
          )}

          {/* Linked Items */}
          {linkedProduct && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Linked Item</p>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">{linkedProduct.name}</span>
              </div>
              <p className="text-xs text-slate-500 ml-6">Stock: {linkedProduct.stock_quantity ?? "—"} {linkedProduct.unit || ""}</p>
              {task.quantity_used != null && (
                <p className="text-xs text-slate-600 ml-6 font-medium">
                  Qty used: <span className="text-slate-800">{task.quantity_used} {linkedProduct.unit || "units"}</span>
                </p>
              )}
            </div>
          )}

          {linkedService && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Linked Service</p>
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">{linkedService.name}</span>
                {linkedService.category && <Badge variant="outline" className="text-xs">{linkedService.category.replace(/_/g, " ")}</Badge>}
              </div>
            </div>
          )}

          {/* Linked Transaction */}
          {linkedTransaction && (
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 space-y-1">
              <p className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-2">Linked Transaction</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-violet-500" />
                  <span className="text-sm font-medium text-violet-800">{(linkedTransaction.transaction_type || "").replace(/_/g, " ")}</span>
                  <Badge className="bg-violet-100 text-violet-700 text-xs">{linkedTransaction.status}</Badge>
                </div>
                <a
                  href={createPageUrl("Transactions")}
                  className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800"
                >
                  View <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {linkedTransaction.amount != null && (
                <p className="text-xs text-violet-600 ml-6">${parseFloat(linkedTransaction.amount).toLocaleString()}</p>
              )}
            </div>
          )}

          {/* Audit Trail */}
          <div className="border-t border-slate-100 pt-4 space-y-2.5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Audit Trail</p>
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-slate-400 mt-0.5" />
              <div>
                <span className="text-xs font-semibold text-slate-600">Created: </span>
                <span className="text-xs text-slate-500">{task.created_by || "—"} {task.created_date ? `on ${fmt(task.created_date)}` : ""}</span>
              </div>
            </div>
            {task.assigned_to_name && (
              <div className="flex items-start gap-3">
                <User className="w-4 h-4 text-blue-400 mt-0.5" />
                <div>
                  <span className="text-xs font-semibold text-slate-600">Assigned to: </span>
                  <span className="text-xs text-slate-500">{task.assigned_to_name} ({task.assigned_to_email})</span>
                </div>
              </div>
            )}
            {task.status === "completed" && (
              <div className="flex items-start gap-3">
                <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5" />
                <div>
                  <span className="text-xs font-semibold text-slate-600">Completed</span>
                  {task.updated_date && <span className="text-xs text-slate-500"> on {fmt(task.updated_date)}</span>}
                </div>
              </div>
            )}
            {task.app_source && task.app_source !== "manual" && (
              <div className="flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-xs font-semibold text-slate-600">Source: </span>
                  <span className="text-xs text-slate-500">{task.app_source}</span>
                </div>
              </div>
            )}
            {task.internal_notes && (
              <div className="bg-slate-50 rounded-lg p-3 mt-2">
                <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Internal Notes</p>
                <p className="text-xs text-slate-600">{task.internal_notes}</p>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={onClose} className="w-full rounded-xl">Close</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}