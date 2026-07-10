import React, { useState } from "react";
import { ncClient } from "@/api/ncClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dataService from "@/services/dataService";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { createRecord } from "@/services/dataService";
import { ChevronLeft, Calendar, CheckCircle2, AlertCircle, Clock, X } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";

const LEAVE_TYPES = ["Annual", "Sick", "Emergency", "Study", "Unpaid", "Maternity", "Paternity", "Other"];

const STATUS_STYLE = {
  pending:  { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-400"  },
  approved: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  rejected: { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200",    dot: "bg-rose-500"   },
};

function Toast({ msg, ok, onDismiss }) {
  return (
    <div
      onClick={onDismiss}
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white font-bold text-sm cursor-pointer
        ${ok ? "bg-emerald-600" : "bg-rose-600"}`}
    >
      {ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      {msg}
    </div>
  );
}

const EMPTY = { leave_type: "Annual", start_date: "", end_date: "", reason: "", half_day: false };

export default function LeaveRequest() {
  const qc = useQueryClient();
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"], queryFn: () => ncClient.auth.me(),
    staleTime: 0, refetchOnMount: "always",
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["leave-requests", currentUser?.company_id],
    queryFn: () => ncClient.entities.Task.filter(
      { company_id: currentUser.company_id, task_type: "leave_request" }, "-created_date", 100,
    ),
    enabled: !!currentUser?.company_id,
    staleTime: 0, refetchOnMount: "always",
  });

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

  const [tab,    setTab]    = useState("new");
  const [form,   setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toast,  setToast]  = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const days = form.start_date && form.end_date
    ? Math.max(1, differenceInCalendarDays(new Date(form.end_date), new Date(form.start_date)) + 1)
    : null;

  const showToast = (msg, ok) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const handleSubmit = async () => {
    if (!form.leave_type || !form.start_date || !form.end_date) {
      showToast("Fill in leave type, start and end date", false); return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      showToast("End date must be after start date", false); return;
    }
    setSaving(true);
    try {
      await createRecord("task", {
        task_type:      "leave_request",
        title:          `${form.leave_type} Leave — ${currentUser.full_name || currentUser.email}`,
        status:         "pending",
        outcome:        "pending",
        outcome_notes:  form.reason || null,
        scheduled_date: form.start_date,
        due_date:       form.end_date,
        priority:       form.leave_type === "Emergency" ? "urgent" : "medium",
        assigned_to_email: currentUser.email,
        assigned_to_name:  currentUser.full_name || currentUser.email,
        custom_fields: JSON.stringify({
          leave_type:  form.leave_type,
          start_date:  form.start_date,
          end_date:    form.end_date,
          days:        days,
          half_day:    form.half_day,
        }),
      }, currentUser, { queryClient: qc });
      setForm(EMPTY);
      showToast("Leave request submitted!", true);
      setTab("history");
    } catch {
      showToast("Failed to submit — try again", false);
    }
    setSaving(false);
  };

  const handleApprove = async (req, approved) => {
    try {
      await dataService.updateRecord("task", req.id, {
        status:  approved ? "completed" : "cancelled",
        outcome: approved ? "approved" : "rejected",
        outcome_notes: (req.outcome_notes || "") + (approved ? " [Approved]" : " [Rejected]"),
      }, currentUser, { queryClient: qc });
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      showToast(approved ? "Approved!" : "Rejected", approved);
    } catch {
      showToast("Action failed", false);
    }
  };

  const myRequests = requests.filter(r => r.assigned_to_email === currentUser?.email);
  const teamRequests = requests.filter(r => r.assigned_to_email !== currentUser?.email);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-100">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">🏖️ Leave Request</p>
          <p className="text-sm font-semibold text-slate-700 leading-tight">
            {currentUser?.full_name || currentUser?.email}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-100 px-4">
        <div className="flex gap-0 overflow-x-auto">
          {[
            { key: "new",     label: "New Request" },
            { key: "history", label: "My Requests" },
            ...(isAdmin ? [{ key: "team", label: "Team" }] : []),
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.key ? "border-cyan-600 text-cyan-700" : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">

        {/* NEW REQUEST */}
        {tab === "new" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <p className="text-sm font-bold text-slate-700">Request Leave</p>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Leave Type</label>
              <div className="flex flex-wrap gap-2">
                {LEAVE_TYPES.map(lt => (
                  <button
                    key={lt}
                    onClick={() => set("leave_type", lt)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      form.leave_type === lt
                        ? "bg-cyan-600 text-white border-cyan-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-cyan-300"
                    }`}
                  >
                    {lt}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Start Date</label>
                <input
                  type="date" value={form.start_date}
                  onChange={e => set("start_date", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">End Date</label>
                <input
                  type="date" value={form.end_date}
                  onChange={e => set("end_date", e.target.value)}
                  min={form.start_date}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
            </div>

            {days && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-50 border border-cyan-200 text-sm text-cyan-700 font-semibold">
                <Calendar className="w-4 h-4" />
                {days} day{days !== 1 ? "s" : ""}
                <label className="ml-auto flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                  <input type="checkbox" checked={form.half_day} onChange={e => set("half_day", e.target.checked)} className="rounded" />
                  Half day
                </label>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Reason (optional)</label>
              <textarea
                value={form.reason} onChange={e => set("reason", e.target.value)}
                rows={3} placeholder="Brief reason for leave..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none"
              />
            </div>

            <button
              onClick={handleSubmit} disabled={saving || !form.start_date || !form.end_date}
              className="w-full py-3.5 rounded-xl bg-cyan-600 text-white font-bold text-sm hover:bg-cyan-700 active:scale-95 transition-all disabled:opacity-40"
            >
              {saving ? "Submitting…" : "Submit Leave Request"}
            </button>
          </div>
        )}

        {/* MY HISTORY */}
        {tab === "history" && (
          <div className="space-y-3">
            {isLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
            {!isLoading && myRequests.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No leave requests yet</p>
              </div>
            )}
            {myRequests.map(r => {
              const cf = (() => { try { return JSON.parse(r.custom_fields || "{}"); } catch { return {}; } })();
              const st = STATUS_STYLE[r.outcome] || STATUS_STYLE.pending;
              return (
                <div key={r.id} className={`bg-white rounded-2xl border p-4 shadow-sm ${st.border}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{cf.leave_type || "Leave"}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {cf.start_date} → {cf.end_date}
                        {cf.days && <span className="ml-1 font-semibold">({cf.days}d)</span>}
                      </p>
                    </div>
                    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${st.bg} ${st.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {(r.outcome || "pending").charAt(0).toUpperCase() + (r.outcome || "pending").slice(1)}
                    </span>
                  </div>
                  {r.outcome_notes && (
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2">{r.outcome_notes.replace(" [Approved]", "").replace(" [Rejected]", "")}</p>
                  )}
                  <p className="text-[10px] text-slate-300 mt-2">{r.created_date ? format(new Date(r.created_date), "dd MMM yyyy") : ""}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* TEAM (admin) */}
        {tab === "team" && isAdmin && (
          <div className="space-y-3">
            {isLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
            {!isLoading && requests.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No leave requests from the team</p>
              </div>
            )}
            {requests.map(r => {
              const cf = (() => { try { return JSON.parse(r.custom_fields || "{}"); } catch { return {}; } })();
              const isPending = !r.outcome || r.outcome === "pending";
              const st = STATUS_STYLE[r.outcome] || STATUS_STYLE.pending;
              return (
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{r.assigned_to_name || r.assigned_to_email}</p>
                      <p className="text-xs text-slate-500">{cf.leave_type} · {cf.start_date} → {cf.end_date}</p>
                    </div>
                    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${st.bg} ${st.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {(r.outcome || "pending").charAt(0).toUpperCase() + (r.outcome || "pending").slice(1)}
                    </span>
                  </div>
                  {r.outcome_notes && <p className="text-xs text-slate-400 line-clamp-2">{r.outcome_notes.replace(" [Approved]", "").replace(" [Rejected]", "")}</p>}
                  {isPending && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleApprove(r, true)}
                        className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleApprove(r, false)}
                        className="flex-1 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold hover:bg-rose-100 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />}
    </div>
  );
}
