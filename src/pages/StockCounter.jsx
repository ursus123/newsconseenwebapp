import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Plus, History, ClipboardList, BarChart2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import CountSheet from "@/components/stockcounter/CountSheet";
import CountSummary from "@/components/stockcounter/CountSummary";
import CountHistory from "@/components/stockcounter/CountHistory";
import DraftBanner from "@/components/stockcounter/DraftBanner";
import NewSessionDialog from "@/components/stockcounter/NewSessionDialog";
import SubmitDialog from "@/components/stockcounter/SubmitDialog";
import SuccessScreen from "@/components/stockcounter/SuccessScreen";
import { createStockTransaction } from "@/utils/createTransaction";
import { useToast } from "@/components/ui/use-toast";

const TABS = [
  { id: "sheet",   label: "Count Sheet", icon: ClipboardList },
  { id: "summary", label: "Summary",     icon: BarChart2 },
  { id: "history", label: "History",     icon: Clock },
];

export default function StockCounter() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("sheet");
  const [session, setSession] = useState(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftInfo, setDraftInfo] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  // Check for saved draft
  useEffect(() => {
    if (!currentUser?.email) return;
    const draftKey = `stock_count_draft_${currentUser.email}`;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setHasDraft(true);
        const counted = Object.values(draft.counts || {}).filter(c => c.counted).length;
        const total = Object.keys(draft.counts || {}).length;
        setDraftInfo({
          enterprise: draft.enterprise,
          location: draft.location,
          started_at: draft.started_at,
          progress: `${counted} of ${total} items counted`,
          draft,
        });
      } catch (_) {}
    }
  }, [currentUser?.email]);

  const { data: products = [] } = useQuery({
    queryKey: ["sc_products", currentUser?.company_id],
    queryFn: () => base44.entities.Product.filter({ company_id: currentUser.company_id, status: "active" }),
    enabled: !!currentUser?.company_id,
  });

  const { data: enterprises = [] } = useQuery({
    queryKey: ["sc_enterprises", currentUser?.company_id],
    queryFn: () => base44.entities.Enterprise.filter({ company_id: currentUser.company_id, status: "active" }),
    enabled: !!currentUser?.company_id,
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ["sc_addresses", currentUser?.company_id],
    queryFn: () => base44.entities.Address.filter({ company_id: currentUser.company_id }),
    enabled: !!currentUser?.company_id,
  });

  const { data: relationships = [] } = useQuery({
    queryKey: ["sc_relationships", currentUser?.company_id],
    queryFn: () => base44.entities.Relationship.filter({ company_id: currentUser.company_id, relationship_type: "item_enterprise" }),
    enabled: !!currentUser?.company_id,
  });

  const { data: countHistory = [] } = useQuery({
    queryKey: ["sc_history", currentUser?.company_id],
    queryFn: () => base44.entities.Task.filter({ company_id: currentUser.company_id, task_type: "stock_count", status: "completed" }),
    enabled: !!currentUser?.company_id,
  });

  // Auto-save session to localStorage whenever it changes
  useEffect(() => {
    if (!session || !currentUser?.email) return;
    const draftKey = `stock_count_draft_${currentUser.email}`;
    localStorage.setItem(draftKey, JSON.stringify(session));
  }, [session, currentUser?.email]);

  const handleStartSession = (enterprise, location) => {
    const enterpriseProducts = enterprise
      ? products.filter(p => relationships.some(r => r.item_name === p.name && r.enterprise_name === enterprise && r.status === "active"))
      : products;

    const newSession = {
      id: Date.now().toString(),
      enterprise,
      location,
      started_at: new Date().toISOString(),
      counted_by: currentUser?.full_name || currentUser?.email || "",
      status: "in_progress",
      counts: Object.fromEntries(
        enterpriseProducts.map(p => [p.id, {
          physical_count: null,
          system_count: p.stock_quantity || 0,
          counted: false,
          notes: "",
          product_name: p.name,
          sku: p.sku || "",
          category: p.category || "other",
          unit: p.unit || "piece",
          cost_price: p.cost_price || 0,
        }])
      ),
    };
    setSession(newSession);
    setShowNewSession(false);
    setActiveTab("sheet");
    setHasDraft(false);
  };

  const handleResumeDraft = () => {
    if (draftInfo?.draft) {
      setSession(draftInfo.draft);
      setHasDraft(false);
      setActiveTab("sheet");
    }
  };

  const handleDiscardDraft = () => {
    const draftKey = `stock_count_draft_${currentUser?.email}`;
    localStorage.removeItem(draftKey);
    setHasDraft(false);
    setDraftInfo(null);
  };

  const updateCount = useCallback((productId, physical_count, notes, counted) => {
    setSession(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        counts: {
          ...prev.counts,
          [productId]: {
            ...prev.counts[productId],
            physical_count: physical_count !== undefined ? physical_count : prev.counts[productId].physical_count,
            notes: notes !== undefined ? notes : prev.counts[productId].notes,
            counted: counted !== undefined ? counted : prev.counts[productId].counted,
          },
        },
      };
    });
  }, []);

  const handleSubmitCount = async (updateAll) => {
    if (!session) return;
    const results = { updated: 0, skipped: 0, errors: 0 };

    for (const [productId, count] of Object.entries(session.counts)) {
      if (!count.counted && !updateAll) { results.skipped++; continue; }
      if (count.physical_count === null) { results.skipped++; continue; }
      const diff = count.physical_count - count.system_count;
      if (diff === 0) { results.skipped++; continue; }

      try {
        await base44.entities.Product.update(productId, { stock_quantity: count.physical_count });
        await createStockTransaction(
          "stock_adjustment",
          { id: productId, name: count.product_name, unit: count.unit || "units", cost_price: count.cost_price || 0 },
          diff,
          session.enterprise || currentUser.company_id,
          currentUser,
          {
            source:    "stockcounter",
            sourceRef: `stockcount-${session.id}-${productId}`,
            notes:     `Stock count adjustment. Expected: ${count.system_count}. Counted: ${count.physical_count}. Difference: ${diff > 0 ? "+" : ""}${diff}. Counted by: ${session.counted_by}. Location: ${session.location || "—"}.${count.notes ? ` Note: ${count.notes}` : ""}`,
          }
        );
        results.updated++;
      } catch (e) {
        results.errors++;
      }
      await new Promise(r => setTimeout(r, 150));
    }

    await base44.entities.Task.create({
      task_type: "stock_count",
      title: `Stock Count — ${session.enterprise} — ${new Date().toLocaleDateString()}`,
      status: "completed",
      outcome: "completed",
      enterprise: session.enterprise,
      company_id: currentUser.company_id,
      assigned_to_name: session.counted_by,
      assigned_to_email: currentUser?.email,
      outcome_notes: JSON.stringify({
        session_id: session.id,
        location: session.location,
        total_items: Object.keys(session.counts).length,
        items_counted: Object.values(session.counts).filter(c => c.counted).length,
        items_updated: results.updated,
        items_skipped: results.skipped,
        started_at: session.started_at,
        completed_at: new Date().toISOString(),
      }),
    });

    const draftKey = `stock_count_draft_${currentUser?.email}`;
    localStorage.removeItem(draftKey);
    setShowSubmit(false);
    setSubmitResult({ ...results, session });
  };

  const handleReset = () => {
    setSession(null);
    setSubmitResult(null);
    setActiveTab("sheet");
  };

  if (submitResult) {
    return (
      <SuccessScreen
        result={submitResult}
        onNewCount={handleReset}
        onViewProducts={() => navigate(createPageUrl("Products"))}
        products={products}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(createPageUrl("Applications"))} className="shrink-0">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-2xl">🔢</span>
              <h1 className="text-xl font-bold text-slate-800">Stock Counter</h1>
            </div>
            <div className="flex items-center gap-2">
              {session && (
                <Button variant="outline" size="sm" onClick={() => setShowSubmit(true)}>
                  Submit Count
                </Button>
              )}
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setShowNewSession(true)}>
                <Plus className="w-4 h-4 mr-1" /> New Count
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-orange-100 text-orange-700"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Category filter pills — only on sheet tab with active session */}
          {session && activeTab === "sheet" && (() => {
            const sessionCategories = ["All", ...new Set(
              Object.values(session.counts).map(c => c.category).filter(Boolean)
            )];
            return (
              <div className="flex gap-1 flex-wrap mt-2">
                {sessionCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                      categoryFilter === cat
                        ? "bg-orange-500 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Progress bar — only when session is active */}
          {session && (() => {
            const counts = Object.values(session.counts);
            const counted = counts.filter(c => c.counted).length;
            const total = counts.length;
            const pct = total > 0 ? Math.round((counted / total) * 100) : 0;
            return (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">{counted} of {total} items counted</span>
                  <span className="text-xs font-bold text-orange-600">{pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Draft recovery banner */}
      {hasDraft && draftInfo && (
        <DraftBanner
          draftInfo={draftInfo}
          onResume={handleResumeDraft}
          onDiscard={handleDiscardDraft}
        />
      )}

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        {activeTab === "sheet" && (
          <CountSheet
            session={session}
            products={products}
            onUpdateCount={updateCount}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            onNewSession={() => setShowNewSession(true)}
          />
        )}
        {activeTab === "summary" && (
          <CountSummary
            session={session}
            products={products}
            currentUser={currentUser}
            onSubmit={() => setShowSubmit(true)}
          />
        )}
        {activeTab === "history" && (
          <CountHistory history={countHistory} />
        )}
      </div>

      {/* Dialogs */}
      {showNewSession && (
        <NewSessionDialog
          enterprises={enterprises}
          addresses={addresses}
          onStart={handleStartSession}
          onClose={() => setShowNewSession(false)}
          defaultEnterprise={enterprises.find(e => e.id === currentUser?.company_id || e.company_id === currentUser?.company_id)?.enterprise_name || ""}
        />
      )}

      {showSubmit && session && (
        <SubmitDialog
          session={session}
          products={products}
          onConfirm={handleSubmitCount}
          onClose={() => setShowSubmit(false)}
        />
      )}
    </div>
  );
}