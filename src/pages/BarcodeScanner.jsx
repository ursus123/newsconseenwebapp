import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ChevronLeft, Building2, Zap, X, List, Camera
} from "lucide-react";
import StockSummaryCards from "@/components/barcodescanner/StockSummaryCards";
import ScannerViewfinder from "@/components/barcodescanner/ScannerViewfinder";
import ProductCard from "@/components/barcodescanner/ProductCard";
import ActivityLog from "@/components/barcodescanner/ActivityLog";
import LowStockPanel from "@/components/barcodescanner/LowStockPanel";
import BulkQueue from "@/components/barcodescanner/BulkQueue";

export function playBeep(error = false) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = error ? 400 : 1800;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (error ? 0.3 : 0.1));
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + (error ? 0.3 : 0.1));
  } catch (e) {}
}

export default function BarcodeScanner() {
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [enterprises, setEnterprises] = useState([]);
  const [selectedEnterprise, setSelectedEnterprise] = useState("");
  const [mode, setMode] = useState("in"); // in | out | check
  const [bulkMode, setBulkMode] = useState(false);
  const [mobileTab, setMobileTab] = useState("scanner"); // scanner | activity

  const [scannedProduct, setScannedProduct] = useState(null);
  const [notFound, setNotFound] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [recall, setRecall] = useState(null);
  const [successFlash, setSuccessFlash] = useState(null);

  const [activityLog, setActivityLog] = useState([]);
  const [bulkQueue, setBulkQueue] = useState([]);
  const [lowStockFilter, setLowStockFilter] = useState("low"); // "low" | "zero"

  const barcodeInputRef = useRef(null);
  const productCardRef = useRef(null);
  const [manualBarcode, setManualBarcode] = useState("");

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      base44.entities.Product.filter({ status: "active", company_id: user.company_id }, "name", 500),
      base44.entities.Enterprise.filter({ status: "active", company_id: user.company_id }),
    ]).then(([prods, ents]) => {
      setProducts(prods);
      setEnterprises(ents);
      if (ents.length === 1) setSelectedEnterprise(ents[0].enterprise_name);
    });
  }, [user]);

  // Focus input on load
  useEffect(() => {
    setTimeout(() => barcodeInputRef.current?.focus(), 500);
  }, []);

  // Auto-scroll to product card on mobile when product found
  useEffect(() => {
    if (scannedProduct && productCardRef.current) {
      productCardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [scannedProduct]);

  // Scan history helpers
  const getScanHistory = () => {
    try { return JSON.parse(localStorage.getItem(`scanner_history_${user?.email}`) || "[]"); } catch { return []; }
  };
  const pushScanHistory = (val) => {
    if (!user?.email) return;
    const hist = getScanHistory().filter((v) => v !== val);
    hist.unshift(val);
    localStorage.setItem(`scanner_history_${user.email}`, JSON.stringify(hist.slice(0, 10)));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "i" || e.key === "I") setMode("in");
      if (e.key === "o" || e.key === "O") setMode("out");
      if (e.key === "c" || e.key === "C") setMode("check");
      if (e.key === "b" || e.key === "B") setBulkMode((v) => !v);
      if (e.key === "Escape") { setScannedProduct(null); setNotFound(null); setManualBarcode(""); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const checkRecall = async (name) => {
    try {
      const res = await fetch(`https://newsconseenwebapp-production.up.railway.app/medications/recalls?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      setRecall(data?.has_active_recall ? data : null);
    } catch { setRecall(null); }
  };

  const handleScan = useCallback(async (barcodeValue) => {
    const val = barcodeValue?.trim();
    if (!val || isProcessing) return;
    setIsProcessing(true);
    setNotFound(null);
    setScannedProduct(null);
    setRecall(null);

    playBeep(false);
    if (navigator.vibrate) navigator.vibrate(50);
    pushScanHistory(val);

    const found = products.find(
      (p) => p.sku === val || p.barcode === val || p.name?.toLowerCase() === val.toLowerCase()
    );

    if (found) {
      if (bulkMode) {
        setBulkQueue((q) => {
          const existing = q.find((r) => r.product.id === found.id);
          if (existing) return q.map((r) => r.product.id === found.id ? { ...r, qty: r.qty + 1 } : r);
          return [...q, { product: found, qty: 1, direction: mode }];
        });
        setIsProcessing(false);
        setManualBarcode("");
        setTimeout(() => barcodeInputRef.current?.focus(), 300);
        return;
      }
      setScannedProduct(found);
      setQuantity(1);
      checkRecall(found.name);
    } else {
      playBeep(true);
      setNotFound(val);
    }

    setIsProcessing(false);
    setManualBarcode("");
  }, [products, isProcessing, bulkMode, mode]);

  const handleConfirm = async (prod = scannedProduct, qty = quantity, dir = mode) => {
    if (!prod || isProcessing) return;
    if (dir === "check") {
      setSuccessFlash({ product: prod, oldQty: prod.stock_quantity, newQty: prod.stock_quantity, dir });
      addToLog(prod, qty, dir, prod.stock_quantity, prod.stock_quantity, null, null);
      setTimeout(() => { setSuccessFlash(null); setScannedProduct(null); setNotes(""); setTimeout(() => barcodeInputRef.current?.focus(), 100); }, 1500);
      return;
    }

    // Stock OUT validation
    let effectiveQty = qty;
    if (dir === "out" && qty > (prod.stock_quantity || 0)) {
      const confirmed = window.confirm(
        `⚠️ Only ${prod.stock_quantity || 0} units in stock.\nYou are trying to remove ${qty} units.\nThis will result in 0 stock.\nProceed anyway?`
      );
      if (!confirmed) return;
      effectiveQty = prod.stock_quantity || 0;
    }

    setIsProcessing(true);
    const oldQty = prod.stock_quantity || 0;
    const newQty = dir === "in" ? oldQty + effectiveQty : Math.max(0, oldQty - effectiveQty);

    await base44.entities.Product.update(prod.id, { stock_quantity: newQty });

    const txn = await base44.entities.Transaction.create({
      transaction_type: dir === "in" ? "stock_in" : "stock_out",
      status: "posted",
      date: format(new Date(), "yyyy-MM-dd"),
      enterprise: selectedEnterprise,
      company_id: user?.company_id,
      description: `${dir === "in" ? "Stock IN" : "Stock OUT"}: ${prod.name} x${effectiveQty}`,
      line_items: [{ item_name: prod.name, quantity: effectiveQty, unit_price: prod.unit_price || 0 }],
      amount: effectiveQty * (prod.unit_price || 0),
      payment_status: "na",
      internal_notes: notes || "",
    });

    const task = await base44.entities.Task.create({
      task_type: "stock_counting",
      title: `${dir === "in" ? "Stock IN" : "Stock OUT"}: ${prod.name} x${effectiveQty}`,
      status: "completed",
      outcome: "completed",
      company_id: user?.company_id,
      enterprise: selectedEnterprise,
      related_item: prod.name,
      assigned_to_name: user?.full_name || user?.email,
      assigned_to_email: user?.email,
      outcome_notes: `Barcode: ${prod.sku || "—"} | Qty: ${effectiveQty} | New stock: ${newQty} | Notes: ${notes || "none"}`,
    });

    // Auto-create reorder task if stock hits zero
    let reorderCreated = false;
    if (dir === "out" && newQty === 0) {
      reorderCreated = true;
      await base44.entities.Task.create({
        task_type: "stock_counting",
        title: `URGENT: Reorder ${prod.name} — OUT OF STOCK`,
        status: "open",
        priority: "urgent",
        company_id: user?.company_id,
        enterprise: selectedEnterprise,
        related_item: prod.name,
        assigned_to_email: user?.email,
        outcome_notes: `${prod.name} (SKU: ${prod.sku || "—"}) reached zero stock after scan by ${user?.full_name || user?.email} at ${format(new Date(), "HH:mm on MMM d")}`,
      });
    }

    // Update local products cache
    setProducts((ps) => ps.map((p) => p.id === prod.id ? { ...p, stock_quantity: newQty } : p));

    playBeep(false);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    setSuccessFlash({ product: prod, oldQty, newQty, dir, reorderCreated });
    addToLog(prod, effectiveQty, dir, oldQty, newQty, txn.id, task.id);

    setIsProcessing(false);
    setTimeout(() => {
      setSuccessFlash(null);
      setScannedProduct(null);
      setNotes("");
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }, 2000);
  };

  const addToLog = (prod, qty, dir, oldQty, newQty, txnId, taskId) => {
    const entry = {
      id: Date.now(),
      time: new Date(),
      product: prod,
      qty,
      dir,
      oldQty,
      newQty,
      txnId,
      taskId,
      undoTimeout: dir !== "check" ? Date.now() + 30000 : null,
    };
    setActivityLog((l) => [entry, ...l]);
  };

  const handleUndo = async (entry) => {
    if (!entry.txnId && !entry.taskId) return;
    const prod = products.find((p) => p.id === entry.product.id);
    if (prod) {
      await base44.entities.Product.update(prod.id, { stock_quantity: entry.oldQty });
      setProducts((ps) => ps.map((p) => p.id === prod.id ? { ...p, stock_quantity: entry.oldQty } : p));
    }
    if (entry.txnId) await base44.entities.Transaction.delete(entry.txnId).catch(() => {});
    if (entry.taskId) await base44.entities.Task.delete(entry.taskId).catch(() => {});
    setActivityLog((l) => l.filter((e) => e.id !== entry.id));
  };

  const modeConfig = {
    in:    { label: "Stock IN",  emoji: "📥", color: "emerald", btn: "bg-emerald-600 hover:bg-emerald-700 text-white", active: "bg-emerald-100 text-emerald-800 border-emerald-400" },
    out:   { label: "Stock OUT", emoji: "📤", color: "rose",    btn: "bg-rose-600 hover:bg-rose-700 text-white",       active: "bg-rose-100 text-rose-800 border-rose-400" },
    check: { label: "Check",     emoji: "🔍", color: "blue",    btn: "bg-blue-600 hover:bg-blue-700 text-white",       active: "bg-blue-100 text-blue-800 border-blue-400" },
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={createPageUrl("Applications")} className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-800">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xl">📷</span>
            <p className="text-white font-black text-base">Barcode Scanner</p>
          </div>

          {/* Enterprise */}
          {enterprises.length > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 rounded-xl border border-slate-700 text-sm">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select value={selectedEnterprise} onChange={(e) => setSelectedEnterprise(e.target.value)}
                className="bg-transparent text-slate-200 text-sm focus:outline-none">
                <option value="">All</option>
                {enterprises.map((e) => <option key={e.id} value={e.enterprise_name}>{e.enterprise_name}</option>)}
              </select>
            </div>
          )}

          {/* Bulk toggle */}
          <button onClick={() => setBulkMode((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${bulkMode ? "bg-violet-600 text-white border-violet-500" : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"}`}>
            <Zap className="w-3.5 h-3.5 inline mr-1" />Bulk
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1.5 mt-2">
          {Object.entries(modeConfig).map(([key, cfg]) => (
            <button key={key} onClick={() => setMode(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-black border-2 transition-all ${mode === key ? cfg.active : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"}`}>
              <span>{cfg.emoji}</span> {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="lg:hidden flex bg-slate-900 border-b border-slate-800 shrink-0">
        <button onClick={() => setMobileTab("scanner")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold transition-all ${mobileTab === "scanner" ? "text-white border-b-2 border-indigo-500" : "text-slate-500"}`}>
          <Camera className="w-4 h-4" /> Scanner
        </button>
        <button onClick={() => setMobileTab("activity")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold transition-all ${mobileTab === "activity" ? "text-white border-b-2 border-indigo-500" : "text-slate-500"}`}>
          <List className="w-4 h-4" /> Activity
        </button>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — Scanner + Product */}
        <div className={`flex flex-col flex-1 overflow-y-auto ${mobileTab === "activity" ? "hidden lg:flex" : "flex"}`}>
          {/* Camera viewfinder */}
          <ScannerViewfinder onScan={handleScan} isProcessing={isProcessing} />

          {/* Manual entry */}
          <div className="px-4 py-3 bg-slate-900 border-t border-slate-800">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-2">Or enter barcode manually</p>
            <div className="flex gap-2">
              <input
                ref={barcodeInputRef}
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScan(manualBarcode)}
                placeholder="Type or scan barcode…"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-lg placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ fontSize: "18px" }}
              />
              <button onClick={() => handleScan(manualBarcode)} disabled={!manualBarcode || isProcessing}
                className="px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                Go
              </button>
            </div>
          </div>

          {/* Bulk queue */}
          {bulkMode && (
            <BulkQueue
              queue={bulkQueue}
              onUpdateQueue={setBulkQueue}
              onProcessAll={async (queue) => {
                const stockMap = {};
                products.forEach((p) => { stockMap[p.id] = p.stock_quantity ?? 0; });
                for (const row of queue) {
                  const currentStock = stockMap[row.product.id] ?? 0;
                  const newQty = row.direction === "in"
                    ? currentStock + row.qty
                    : Math.max(0, currentStock - row.qty);
                  stockMap[row.product.id] = newQty;
                  await handleConfirm({ ...row.product, stock_quantity: currentStock }, row.qty, row.direction);
                }
                setBulkQueue([]);
              }}
            />
          )}

          {/* Product / Not Found */}
          <div className="flex-1 bg-slate-950 px-4 py-4 space-y-4">
            {/* Not found */}
            {notFound && !scannedProduct && (
              <div className="animate-shake bg-red-950 border-2 border-red-700 rounded-2xl p-5">
                <div className="flex items-start gap-3 mb-3">
                  <X className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-300 font-black text-base">Product Not Found</p>
                    <p className="text-red-400 text-sm mt-0.5 font-mono">{notFound}</p>
                  </div>
                </div>
                <p className="text-red-400 text-sm mb-4">This barcode is not in your inventory.</p>
                <div className="flex gap-2">
                  <Link to={createPageUrl("Products")}
                    className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 text-white text-sm font-bold rounded-xl text-center transition-colors">
                    + Create Product
                  </Link>
                  <button onClick={() => setNotFound(null)}
                    className="px-4 py-2.5 border border-red-700 text-red-400 text-sm font-bold rounded-xl hover:bg-red-900 transition-colors">
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Product found */}
            {scannedProduct && !bulkMode && (
              <ProductCard
                product={scannedProduct}
                mode={mode}
                modeConfig={modeConfig}
                quantity={quantity}
                onQuantityChange={setQuantity}
                notes={notes}
                onNotesChange={setNotes}
                recall={recall}
                successFlash={successFlash}
                isProcessing={isProcessing}
                onConfirm={() => handleConfirm()}
                onClear={() => { setScannedProduct(null); setNotFound(null); setRecall(null); setTimeout(() => barcodeInputRef.current?.focus(), 100); }}
              />
            )}

            {/* Low stock panel */}
            {!scannedProduct && !notFound && (
              <LowStockPanel
                products={products}
                onSelectProduct={(p) => { setScannedProduct(p); setMode("in"); setQuantity(1); }}
              />
            )}
          </div>

          {/* Keyboard shortcuts hint */}
          <div className="px-4 py-2 bg-slate-900 border-t border-slate-800">
            <p className="text-slate-600 text-[10px] font-mono text-center">
              [I] IN · [O] OUT · [C] Check · [B] Bulk · [Esc] Clear
            </p>
          </div>
        </div>

        {/* Right — Activity Log */}
        <div className={`w-full lg:w-96 lg:border-l border-slate-800 bg-slate-900 flex flex-col overflow-hidden ${mobileTab === "activity" ? "flex" : "hidden lg:flex"}`}>
          <ActivityLog
            log={activityLog}
            onUndo={handleUndo}
          />
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 10%; }
          50% { top: 85%; }
          100% { top: 10%; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}