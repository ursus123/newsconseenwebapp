import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Users, Building2, Package, Calendar, Clock, ExternalLink } from "lucide-react";
import { differenceInMonths, differenceInDays, format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const TYPE_CONFIG = {
  person_enterprise: { label: "Person → Enterprise", color: "bg-blue-50 text-blue-700" },
  item_enterprise:   { label: "Item → Enterprise",   color: "bg-purple-50 text-purple-700" },
  item_person:       { label: "Item → Person",        color: "bg-amber-50 text-amber-700" },
  person_service:    { label: "Person → Service",     color: "bg-cyan-50 text-cyan-700" },
  enterprise_service:{ label: "Enterprise → Service", color: "bg-indigo-50 text-indigo-700" },
  person_address:    { label: "Person → Address",     color: "bg-teal-50 text-teal-700" },
  enterprise_address:{ label: "Enterprise → Address", color: "bg-emerald-50 text-emerald-700" },
};

const statusColor = { active: "bg-emerald-50 text-emerald-700", ended: "bg-rose-50 text-rose-600", archived: "bg-slate-100 text-slate-400" };

function duration(start, end) {
  if (!start) return null;
  const endDate = end ? new Date(end) : new Date();
  const months = differenceInMonths(endDate, new Date(start));
  const days = differenceInDays(endDate, new Date(start));
  if (months >= 1) return `${months} month${months !== 1 ? "s" : ""}`;
  return `${days} day${days !== 1 ? "s" : ""}`;
}

function Row({ label, value, children }) {
  if (!value && !children) return null;
  return (
    <div>
      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-700 mt-0.5">{children || value}</p>
    </div>
  );
}

export default function RelationshipDetailPanel({ rel, open, onClose }) {
  const { data: relatedTasks = [] } = useQuery({
    queryKey: ["rel-tasks", rel?.id],
    queryFn: () => base44.entities.Task.filter({ enterprise: rel.enterprise_name }),
    enabled: !!rel?.enterprise_name && open,
  });

  const { data: relatedTx = [] } = useQuery({
    queryKey: ["rel-tx", rel?.id],
    queryFn: () => base44.entities.Transaction.filter({ enterprise: rel.enterprise_name }),
    enabled: !!rel?.enterprise_name && open,
  });

  if (!rel) return null;
  const cfg = TYPE_CONFIG[rel.relationship_type];
  const dur = duration(rel.start_date, rel.end_date);

  const linkedTasks = relatedTasks.filter((t) => !rel.person_name || t.related_person === rel.person_name || t.assigned_to_name === rel.person_name).slice(0, 5);
  const linkedTx = relatedTx.slice(0, 5);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-slate-100">
          <SheetTitle className="text-base font-semibold text-slate-800">Relationship Detail</SheetTitle>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {cfg && <Badge className={cfg.color}>{cfg.label}</Badge>}
            <Badge className={statusColor[rel.status] || statusColor.active}>{rel.status || "active"}</Badge>
          </div>
        </SheetHeader>

        <div className="py-5 space-y-5">
          {/* Entities */}
          <div className="space-y-3">
            {rel.person_name && (
              <Row label="Person">
                <Link to={createPageUrl("People")} className="text-blue-600 hover:underline flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />{rel.person_name}<ExternalLink className="w-3 h-3 opacity-50" />
                </Link>
              </Row>
            )}
            {rel.enterprise_name && (
              <Row label="Enterprise">
                <Link to={createPageUrl("Enterprises")} className="text-purple-600 hover:underline flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />{rel.enterprise_name}<ExternalLink className="w-3 h-3 opacity-50" />
                </Link>
              </Row>
            )}
            {rel.item_name && (
              <Row label="Item">
                <Link to={createPageUrl("Products")} className="text-amber-700 hover:underline flex items-center gap-1">
                  <Package className="w-3.5 h-3.5" />{rel.item_name}<ExternalLink className="w-3 h-3 opacity-50" />
                </Link>
              </Row>
            )}
            {rel.role && <Row label="Role / Custody" value={rel.role} />}
            {rel.responsibility_type && <Row label="Responsibility" value={rel.responsibility_type} />}
            {rel.location && <Row label="Location" value={rel.location} />}
          </div>

          {/* Dates */}
          <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-3 gap-3">
            <div><p className="text-[11px] text-slate-400 font-semibold uppercase mb-1">Start</p><p className="text-sm font-medium text-slate-700">{rel.start_date || "—"}</p></div>
            <div><p className="text-[11px] text-slate-400 font-semibold uppercase mb-1">End</p><p className="text-sm font-medium text-slate-700">{rel.end_date || "Active"}</p></div>
            <div><p className="text-[11px] text-slate-400 font-semibold uppercase mb-1">Duration</p><p className="text-sm font-medium text-slate-700">{dur || "—"}</p></div>
          </div>

          {rel.notes && (
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-[11px] text-slate-400 font-semibold uppercase mb-1">Notes</p>
              <p className="text-sm text-slate-600">{rel.notes}</p>
            </div>
          )}

          {/* Audit */}
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Audit Trail</p>
            {rel.created_date && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Created {rel.created_by || ""} · {format(new Date(rel.created_date), "MMM d, yyyy")}
              </div>
            )}
            {rel.updated_date && rel.updated_date !== rel.created_date && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Updated · {format(new Date(rel.updated_date), "MMM d, yyyy")}
              </div>
            )}
          </div>

          {/* Related tasks */}
          {linkedTasks.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Related Tasks ({linkedTasks.length})</p>
              <div className="space-y-2">
                {linkedTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 text-xs">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${t.status === "completed" ? "bg-emerald-400" : "bg-blue-400"}`} />
                    <span className="flex-1 text-slate-700 truncate">{t.title}</span>
                    <span className="text-slate-400 shrink-0">{t.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related transactions */}
          {linkedTx.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Related Transactions</p>
              <div className="space-y-2">
                {linkedTx.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 text-xs">
                    <span className="flex-1 text-slate-700 capitalize">{(tx.transaction_type || "").replace(/_/g, " ")}</span>
                    {tx.amount != null && <span className="text-slate-600 font-medium">${parseFloat(tx.amount).toLocaleString()}</span>}
                    <span className="text-slate-400">{tx.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={onClose} className="w-full rounded-xl">Close</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}