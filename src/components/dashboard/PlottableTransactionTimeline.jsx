/**
 * PlottableTransactionTimeline
 *
 * Monthly revenue + expense trend with Plottable.js brush-to-zoom on X axis.
 * Lets operators drill into a specific month without navigating away.
 *
 * Props:
 *   transactions  Array — raw transaction records (Tier 2/3) or summary rows (Tier 1)
 *   isAnalytics   bool  — true when data comes from analytics summary (Tier 1)
 *   revenueTypes  string[] — transaction_type values that count as revenue
 *
 * Logic: no business logic changes — just visualises what the Dashboard already has.
 */
import { useEffect, useRef, useMemo } from "react";
import * as Plottable from "plottable";
import { subMonths, startOfMonth, format, parseISO } from "date-fns";

const REVENUE_COLOR = "#10b981";
const EXPENSE_COLOR = "#f43f5e";

export default function PlottableTransactionTimeline({ transactions, isAnalytics, revenueTypes = [] }) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);

  // Aggregate into monthly buckets — 12 months rolling
  const monthlyData = useMemo(() => {
    const now    = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = startOfMonth(subMonths(now, 11 - i));
      return { date: d, key: format(d, "yyyy-MM"), revenue: 0, expense: 0 };
    });
    const byKey = Object.fromEntries(months.map(m => [m.key, m]));

    if (isAnalytics) {
      // analytics summary rows: { transaction_type, total_amount, month? }
      transactions.forEach(r => {
        const key = r.month?.slice(0, 7) || format(now, "yyyy-MM");
        if (!byKey[key]) return;
        if (revenueTypes.includes(r.transaction_type)) byKey[key].revenue += (r.total_amount || 0);
        else                                            byKey[key].expense += (r.total_amount || 0);
      });
    } else {
      // raw / base44 records
      transactions.forEach(t => {
        const raw = t.date || t.created_date;
        if (!raw) return;
        try {
          const key = format(typeof raw === "string" ? parseISO(raw) : new Date(raw), "yyyy-MM");
          if (!byKey[key]) return;
          const amt = Number(t.amount) || 0;
          if (revenueTypes.includes(t.transaction_type)) byKey[key].revenue += amt;
          else                                            byKey[key].expense += amt;
        } catch (_) {}
      });
    }

    return months;
  }, [transactions, isAnalytics, revenueTypes]);

  useEffect(() => {
    if (!containerRef.current || !monthlyData.length) return;

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const xScale = new Plottable.Scales.Time();
    const yScale = new Plottable.Scales.Linear();
    yScale.domainMin(0);

    const revenueDataset = new Plottable.Dataset(monthlyData.map(m => ({ x: m.date, y: m.revenue })));
    const expenseDataset = new Plottable.Dataset(monthlyData.map(m => ({ x: m.date, y: m.expense })));

    const revenueLine = new Plottable.Plots.Line()
      .addDataset(revenueDataset)
      .x(d => d.x, xScale)
      .y(d => d.y, yScale)
      .attr("stroke", REVENUE_COLOR)
      .attr("stroke-width", 2.5);

    const expenseLine = new Plottable.Plots.Line()
      .addDataset(expenseDataset)
      .x(d => d.x, xScale)
      .y(d => d.y, yScale)
      .attr("stroke", EXPENSE_COLOR)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4,3");

    const revenueArea = new Plottable.Plots.Area()
      .addDataset(revenueDataset)
      .x(d => d.x, xScale)
      .y(d => d.y, yScale)
      .y0(() => 0)
      .attr("fill", REVENUE_COLOR)
      .attr("fill-opacity", 0.08)
      .attr("stroke", "none");

    const group = new Plottable.Components.Group([revenueArea, revenueLine, expenseLine]);

    const xAxis = new Plottable.Axes.Time(xScale, "bottom");
    const yAxis = new Plottable.Axes.Numeric(yScale, "left");
    yAxis.formatter(v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`);

    // Tooltip on hover
    const tooltipDiv = document.createElement("div");
    tooltipDiv.style.cssText = "position:absolute;background:white;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:11px;color:#334155;pointer-events:none;display:none;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,0.1)";
    containerRef.current.style.position = "relative";
    containerRef.current.appendChild(tooltipDiv);

    const pointer = new Plottable.Interactions.Pointer();
    pointer.onPointerMove(point => {
      const nearest = revenueLine.entityNearest(point);
      if (nearest) {
        const d = nearest.datum;
        const month = format(d.x, "MMM yyyy");
        const expD  = expenseLine.entityNearest(point);
        tooltipDiv.innerHTML = `<strong>${month}</strong><br><span style="color:${REVENUE_COLOR}">Revenue: $${d.y.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>${expD ? `<br><span style="color:${EXPENSE_COLOR}">Expense: $${expD.datum.y.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>` : ""}`;
        tooltipDiv.style.display = "block";
        tooltipDiv.style.left = `${point.x + 12}px`;
        tooltipDiv.style.top  = `${point.y - 40}px`;
      }
    });
    pointer.onPointerExit(() => { tooltipDiv.style.display = "none"; });
    pointer.attachTo(group);

    // Pan + zoom on X (time) axis only — the brush-to-zoom experience
    const panZoom = new Plottable.Interactions.PanZoom(xScale, null);
    panZoom.attachTo(group);

    const table = new Plottable.Components.Table([
      [yAxis, group],
      [null,  xAxis],
    ]);

    table.renderTo(containerRef.current);
    chartRef.current = table;

    const ro = new ResizeObserver(() => {
      if (chartRef.current) Plottable.Utils.DOM.requestAnimationFramePolyfill(() => chartRef.current?.redraw());
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      if (tooltipDiv.parentNode) tooltipDiv.parentNode.removeChild(tooltipDiv);
    };
  }, [monthlyData]);

  const hasData = monthlyData.some(m => m.revenue > 0 || m.expense > 0);
  if (!hasData) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Revenue & Expense Trend</p>
          <p className="text-[10px] text-slate-400">12-month rolling · Drag to pan · Scroll to zoom</p>
        </div>
        <div className="flex gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-emerald-500 inline-block rounded" /> Revenue</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-rose-500 inline-block" /> Expense</span>
        </div>
      </div>
      <div ref={containerRef} style={{ width: "100%", height: 200 }} />
    </div>
  );
}
