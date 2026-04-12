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
  Bot, ChevronDown, ChevronUp, Clock, Shield,
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

function ApprovalCard({ item, onResolve, resolving }) {
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

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => onResolve(item.id, "approved", note)}
          disabled={resolving === item.id}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          {resolving === item.id
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <CheckCircle2 className="w-3 h-3" />
          }
          Approve
        </button>
        <button
          onClick={() => onResolve(item.id, "rejected", note)}
          disabled={resolving === item.id}
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
  const [resolving, setResolving] = useState(null);

  const { data = { pending: [] }, isLoading, refetch } = useQuery({
    queryKey: ["agents-pending", companyId],
    queryFn:  () => fetchPending(companyId),
    enabled:  !!companyId,
    staleTime: 0,
    refetchInterval: 30000,
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, decision, note }) => resolveApproval(id, decision, note),
    onMutate:   ({ id }) => setResolving(id),
    onSuccess: () => {
      setResolving(null);
      qc.invalidateQueries({ queryKey: ["agents-pending", companyId] });
      qc.invalidateQueries({ queryKey: ["agents-status",  companyId] });
    },
    onError: () => setResolving(null),
  });

  const pending = data.pending || [];

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
              {pending.length} action{pending.length !== 1 ? "s" : ""} awaiting your review
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
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
            onResolve={(id, decision, note) =>
              resolveMut.mutate({ id, decision, note })
            }
          />
        ))}
      </div>

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
