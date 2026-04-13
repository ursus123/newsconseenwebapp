// ==============================================================
// ApprovalGate — Phase 4D Human-in-the-loop approval UI
// ==============================================================
// Shows all pending agent actions awaiting operator approval.
// Operator reviews the agent's reasoning and approves/rejects.
// ==============================================================

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, CheckCircle2, XCircle, Loader2, RefreshCw,
  Bot, ChevronDown, ChevronUp, Clock, Shield, Zap, ExternalLink,
  FileText, Tag,
} from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const RISK_STYLE = {
  approve:  "bg-amber-50  border-amber-200  text-amber-800",
  critical: "bg-rose-50   border-rose-200   text-rose-800",
  notify:   "bg-blue-50   border-blue-200   text-blue-800",
};

const RISK_BADGE = {
  approve:  "bg-amber-100 text-amber-700",
  critical: "bg-rose-100  text-rose-700",
  notify:   "bg-blue-100  text-blue-700",
};

async function fetchPending(companyId) {
  const r = await fetch(`${RAILWAY_URL}/agents/approvals/pending?company_id=${companyId}`);
  if (!r.ok) return { pending: [] };
  return r.json();
}

async function resolveApproval(approvalId, decision, note = "") {
  const r = await fetch(`${RAILWAY_URL}/agents/approvals/${approvalId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, resolved_by: "operator", note }),
  });
  if (!r.ok) throw new Error("Resolve failed");
  return r.json();
}

async function fetchExecuted(companyId) {
  const r = await fetch(`${RAILWAY_URL}/agents/actions/executed?company_id=${companyId}&limit=20`);
  if (!r.ok) return { executed: [] };
  return r.json();
}

const ACTION_TYPE_LABELS = {
  create_task:           "Created task",
  create_follow_up:      "Created follow-up",
  flag_record:           "Flagged record",
  update_record:         "Updated record",
  update_task_status:    "Updated task status",
  reassign_task:         "Reassigned task",
  create_transaction:    "Created transaction",
  create_purchase_order: "Created purchase order",
  send_client_message:   "Sent client message",
  send_whatsapp:         "Sent WhatsApp",
  send_email:            "Sent email",
  internal_alert:        "Sent internal alert",
  trigger_etl:           "Triggered ETL",
};

const ENTITY_COLORS = {
  task:        "bg-violet-100 text-violet-700",
  person:      "bg-blue-100 text-blue-700",
  enterprise:  "bg-amber-100 text-amber-700",
  product:     "bg-rose-100 text-rose-700",
  transaction: "bg-emerald-100 text-emerald-700",
  alert:       "bg-indigo-100 text-indigo-700",
};

function ApprovalCard({ item, onResolve, resolving, executionResult }) {
  const [expanded, setExpanded]   = useState(false);
  const [note, setNote]           = useState("");
  const riskStyle = RISK_STYLE[item.risk_level] || RISK_STYLE.approve;
  const riskBadge = RISK_BADGE[item.risk_level] || RISK_BADGE.approve;

  const payload = item.action_payload || {};

  return (
    <div className={`rounded-xl border p-4 ${riskStyle}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center shrink-0 mt-0.5">
            <Bot className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-xs font-bold capitalize">{item.agent_name} Agent</p>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${riskBadge}`}>
                {item.risk_level}
              </span>
              <span className="text-[9px] text-current opacity-60">
                {item.action_type?.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-xs font-semibold mb-1">{item.action_label}</p>
            {item.reasoning && (
              <p className="text-[10px] opacity-70 line-clamp-2">{item.reasoning}</p>
            )}
            <p className="text-[9px] opacity-50 flex items-center gap-1 mt-1">
              <Clock className="w-2.5 h-2.5" />
              {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="shrink-0 text-current opacity-50 hover:opacity-100"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded payload */}
      {expanded && (
        <div className="mt-3 bg-white/50 rounded-lg p-3 text-[10px] font-mono text-current opacity-80">
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      )}

      {/* Draft message preview */}
      {payload.inputs?.message && (
        <div className="mt-3 bg-white/60 rounded-lg p-3">
          <p className="text-[10px] font-semibold mb-1 opacity-60">Draft message:</p>
          <p className="text-xs">{payload.inputs.message}</p>
        </div>
      )}

      {/* Note input */}
      <div className="mt-3">
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional note (e.g. approved with edits)"
          className="w-full text-xs border border-current/20 rounded-lg px-3 py-1.5 bg-white/60 placeholder:opacity-40"
        />
      </div>

      {/* Execution result (shown after approval) */}
      {executionResult && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-xs flex items-start gap-2 ${
          executionResult.executed
            ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
            : "bg-rose-50 border border-rose-200 text-rose-800"
        }`}>
          {executionResult.executed
            ? <Zap className="w-3 h-3 shrink-0 mt-0.5" />
            : <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
          }
          <span>
            {executionResult.executed
              ? <>Executed — {executionResult.entity_type && <span className={`font-mono text-[10px] px-1 rounded ${ENTITY_COLORS[executionResult.entity_type] || "bg-slate-100 text-slate-600"}`}>{executionResult.entity_type}</span>} {executionResult.entity_id ? `id: ${executionResult.entity_id.slice(0, 8)}…` : ""}</>
              : `Execution failed: ${executionResult.error || "unknown error"}`
            }
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => onResolve(item.id, "approved", note)}
          disabled={resolving === item.id || !!executionResult}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          {resolving === item.id
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <CheckCircle2 className="w-3 h-3" />
          }
          {executionResult?.executed ? "Executed" : "Approve & Execute"}
        </button>
        <button
          onClick={() => onResolve(item.id, "rejected", note)}
          disabled={resolving === item.id || !!executionResult}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold border border-current/30 hover:bg-white/60 px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          <XCircle className="w-3 h-3" /> Reject
        </button>
      </div>
    </div>
  );
}

export default function ApprovalGate({ companyId }) {
  const qc = useQueryClient();
  const [resolving, setResolving]           = useState(null);
  const [executionResults, setExecResults]  = useState({}); // approval_id → result

  const { data = { pending: [] }, isLoading, refetch } = useQuery({
    queryKey: ["agents-pending", companyId],
    queryFn:  () => fetchPending(companyId),
    enabled:  !!companyId,
    staleTime: 0,
    refetchInterval: 30000,
  });

  const { data: executedData = { executed: [] }, refetch: refetchExecuted } = useQuery({
    queryKey: ["agents-executed", companyId],
    queryFn:  () => fetchExecuted(companyId),
    enabled:  !!companyId,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, decision, note }) => resolveApproval(id, decision, note),
    onMutate:   ({ id }) => setResolving(id),
    onSuccess: (data, { id, decision }) => {
      setResolving(null);
      // Store execution result for inline display
      if (decision === "approved" && data.execution) {
        setExecResults(prev => ({ ...prev, [id]: data.execution }));
      }
      qc.invalidateQueries({ queryKey: ["agents-pending",  companyId] });
      qc.invalidateQueries({ queryKey: ["agents-status",   companyId] });
      qc.invalidateQueries({ queryKey: ["agents-executed", companyId] });
    },
    onError: () => setResolving(null),
  });

  const pending  = data.pending   || [];
  const executed = executedData.executed || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Approval Gate</h2>
            <p className="text-xs text-slate-500">
              {pending.length} pending · {executed.length} executed
            </p>
          </div>
        </div>
        <button
          onClick={() => { refetch(); refetchExecuted(); }}
          className="text-xs text-slate-500 hover:text-amber-600 border border-slate-200 px-2.5 py-1.5 rounded-lg"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      )}

      {!isLoading && pending.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-slate-600">No pending approvals</p>
          <p className="text-xs text-slate-400 max-w-xs">
            Agent actions that require your approval will appear here.
            Low-risk actions execute automatically.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {pending.map(item => (
          <ApprovalCard
            key={item.id}
            item={item}
            resolving={resolving}
            executionResult={executionResults[item.id] || null}
            onResolve={(id, decision, note) =>
              resolveMut.mutate({ id, decision, note })
            }
          />
        ))}
      </div>

      {/* Executed Actions — Phase 13 */}
      {executed.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pt-2">
            <Zap className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-slate-700">Executed Actions</h3>
            <span className="text-xs text-slate-400">({executed.length})</span>
          </div>
          <div className="space-y-2">
            {executed.map((item, i) => {
              const res    = item.execution_result || {};
              const label  = ACTION_TYPE_LABELS[item.action_type] || item.action_type?.replace(/_/g, " ");
              const entClr = ENTITY_COLORS[res.entity_type] || "bg-slate-100 text-slate-600";
              return (
                <div key={i} className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
                  <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-emerald-800 capitalize">
                        {item.agent_name} — {label}
                      </p>
                      {res.entity_type && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${entClr}`}>
                          {res.entity_type}
                        </span>
                      )}
                      {res.entity_id && (
                        <span className="text-[9px] font-mono text-slate-400">
                          {res.entity_id.slice(0, 8)}…
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-emerald-600 truncate">{item.action_label}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] text-slate-400">
                      {item.executed_at
                        ? new Date(item.executed_at).toLocaleString("en-GB", {
                            day: "2-digit", month: "short",
                            hour: "2-digit", minute: "2-digit",
                          })
                        : ""}
                    </p>
                    {res.audit_id && (
                      <p className="text-[9px] text-indigo-500 flex items-center gap-0.5 justify-end mt-0.5">
                        <FileText className="w-2.5 h-2.5" /> Audit
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Risk level guide */}
      {pending.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1.5">
          <p className="font-semibold text-slate-700 mb-2">Risk level guide</p>
          <div className="flex items-center gap-2">
            <span className="w-16 text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-center">APPROVE</span>
            <span>Client messages, financial records, purchase orders</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 text-[10px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full text-center">CRITICAL</span>
            <span>Bulk operations, deletions — always requires explicit approval</span>
          </div>
        </div>
      )}
    </div>
  );
}
