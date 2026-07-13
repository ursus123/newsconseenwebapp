import React, { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Loader2, CheckCircle, Clock, AlertCircle, ChevronRight } from "lucide-react";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import { RAILWAY_URL, RAILWAY_API_KEY, authHeaders } from "@/config/api";

const idjwiHeaders = async (user) => ({
  ...(await authHeaders()),
  ...(RAILWAY_API_KEY ? { "x-idjwi-api-key": RAILWAY_API_KEY } : {}),
  ...(user?.email ? { "x-idjwi-user": user.email } : {}),
  ...(user?.role ? { "x-idjwi-role": user.role } : {}),
});

const HINTS = [
  "Add Sarah Kamau as a new client, active, Westlands branch",
  "New staff member: John Mwangi, driver, starts Monday",
  "Create a follow-up task for ABC Corp due next Friday",
  "Add product: Amoxicillin 500mg, 200 units in stock",
  "New enterprise: City Clinic, commercial, Nairobi",
  "Log a payment from XYZ Ltd, KES 45,000",
];

function StatusBadge({ status, approvalId, navigate }) {
  if (status === "executed" || status === "notified") {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 text-xs font-medium">
        <CheckCircle className="w-3.5 h-3.5" /> Created
      </span>
    );
  }
  if (status === "pending") {
    return (
      <button
        onClick={() => navigate(createPageUrl("Agents"))}
        className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 text-xs font-medium hover:bg-amber-100 transition-colors"
      >
        <Clock className="w-3.5 h-3.5" /> Pending approval
        <ChevronRight className="w-3 h-3" />
      </button>
    );
  }
  return null;
}

export default function QuickAddButton({ currentUser }) {
  const [open, setOpen]         = useState(false);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [answer, setAnswer]     = useState(null);
  const [status, setStatus]     = useState(null);
  const [approvalId, setApprovalId] = useState(null);
  const [error, setError]       = useState(null);
  const [hintIdx, setHintIdx]   = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Rotate hint placeholder
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setHintIdx(i => (i + 1) % HINTS.length), 3500);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (open) {
      setAnswer(null); setStatus(null); setApprovalId(null);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // Global opener — other components call window.__openQuickAdd(prefillText)
  useEffect(() => {
    window.__openQuickAdd = (text = "") => {
      setInput(text);
      setAnswer(null); setStatus(null); setApprovalId(null); setError(null);
      setOpen(true);
    };
    return () => { delete window.__openQuickAdd; };
  }, []);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading || !currentUser?.company_id) return;

    setLoading(true);
    setAnswer(null); setStatus(null); setApprovalId(null); setError(null);

    try {
      const resp = await fetch(`${RAILWAY_URL}/copilot/ask`, {
        method:  "POST",
        headers: await idjwiHeaders(currentUser),
        body: JSON.stringify({
          question:        `Please add the following record: ${question}`,
          company_id:      currentUser.company_id,
          enterprise_name: currentUser.enterprise_name || "",
          history:         [],
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!resp.ok) {
        let detail = `HTTP ${resp.status}`;
        try { const b = await resp.json(); detail = b.detail || detail; } catch {}
        throw new Error(detail);
      }

      const result = await resp.json();

      // Extract approval status from tool responses embedded in the answer
      const toolsCalled = result.tools_called || [];
      if (toolsCalled.includes("create_record") || toolsCalled.includes("request_action")) {
        const toolsDetail = result.tools_detail || [];
        for (const td of toolsDetail) {
          const res = td?.result;
          if (res?.status) { setStatus(res.status); setApprovalId(res.approval_id || null); break; }
          if (res?.approval?.status) { setStatus(res.approval.status); break; }
        }
      }

      setAnswer(result.answer || "Done.");
    } catch (e) {
      setError(e.name === "TimeoutError" ? "Request timed out — try again." : e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === "Escape") setOpen(false);
  };

  if (!currentUser?.company_id) return null;

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setOpen(true)}
        title="Add a record with AI"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl
                   bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-500/30
                   transition-all hover:scale-105 hover:shadow-2xl hover:shadow-emerald-500/40
                   text-sm font-semibold"
      >
        <Sparkles className="w-4 h-4" />
        Add with AI
      </button>

      {/* Dialog backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Add a record with AI</p>
                  <p className="text-xs text-slate-400">Describe it in plain language</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input area */}
            <div className="p-5">
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={3}
                  placeholder={HINTS[hintIdx]}
                  disabled={loading}
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 bg-slate-50
                             text-sm text-slate-800 placeholder-slate-400
                             focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400
                             resize-none transition-all disabled:opacity-60"
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-emerald-600 text-white
                             disabled:opacity-40 disabled:cursor-not-allowed
                             hover:bg-emerald-700 transition-colors"
                >
                  {loading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />
                  }
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Press <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px]">Enter</kbd> to send
                · <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px]">Shift+Enter</kbd> for new line
              </p>
            </div>

            {/* Result */}
            {(answer || error) && (
              <div className="px-5 pb-5">
                <div className={`rounded-xl p-4 text-sm ${error ? "bg-red-50 border border-red-200" : "bg-slate-50 border border-slate-200"}`}>
                  {error ? (
                    <div className="flex items-start gap-2 text-red-700">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>{error}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{answer}</p>
                      {status && (
                        <StatusBadge status={status} approvalId={approvalId} navigate={navigate} />
                      )}
                    </div>
                  )}
                </div>

                {/* Add another */}
                {!error && (
                  <button
                    onClick={() => { setAnswer(null); setStatus(null); setInput(""); setError(null); inputRef.current?.focus(); }}
                    className="mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                  >
                    + Add another record
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
