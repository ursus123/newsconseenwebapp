/**
 * PlottableCompetitorScatter
 *
 * Scatter plot: X = distance (km), Y = rating (0–5).
 * Plottable.js — drag to pan, scroll to zoom.
 */
import { useEffect, useRef } from "react";
import * as Plottable from "plottable";

export default function PlottableCompetitorScatter({ competitors, radiusKm }) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !competitors?.length) return;

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const data = competitors.map(c => ({
      x: Number(c.distance_km) || 0,
      y: Number(c.rating)      || 0,
      name: c.name || "Unknown",
    }));

    const xScale = new Plottable.Scales.Linear();
    const yScale = new Plottable.Scales.Linear();
    xScale.domainMin(0);
    xScale.domainMax((radiusKm || 30) + 2);
    yScale.domainMin(0);
    yScale.domainMax(5.5);

    const dataset = new Plottable.Dataset(data);

    const scatter = new Plottable.Plots.Scatter()
      .addDataset(dataset)
      .x(d => d.x, xScale)
      .y(d => d.y, yScale)
      .size(10)
      .attr("fill",    d => d.y >= 4 ? "#10b981" : d.y >= 2.5 ? "#f59e0b" : "#ef4444")
      .attr("opacity", 0.8);

    const xAxis = new Plottable.Axes.Numeric(xScale, "bottom");
    xAxis.formatter(v => `${v} km`);

    const yAxis = new Plottable.Axes.Numeric(yScale, "left");
    yAxis.formatter(v => `${v}★`);

    const xLabel = new Plottable.Components.AxisLabel("Distance from center (km)", "0");
    const yLabel = new Plottable.Components.AxisLabel("Rating", "270");

    // Hover tooltip
    const tooltipDiv = document.createElement("div");
    tooltipDiv.style.cssText = "position:absolute;background:white;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:11px;color:#334155;pointer-events:none;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.1);display:none;z-index:10";
    containerRef.current.style.position = "relative";
    containerRef.current.appendChild(tooltipDiv);

    const pointer = new Plottable.Interactions.Pointer();
    pointer.onPointerMove(point => {
      const nearest = scatter.entityNearest(point);
      if (nearest) {
        const d = nearest.datum;
        tooltipDiv.innerHTML = `<strong>${d.name}</strong><br>${d.x} km away${d.y > 0 ? ` · ${d.y}★` : ""}`;
        tooltipDiv.style.display = "block";
        tooltipDiv.style.left = `${point.x + 12}px`;
        tooltipDiv.style.top  = `${point.y - 28}px`;
      }
    });
    pointer.onPointerExit(() => { tooltipDiv.style.display = "none"; });
    pointer.attachTo(scatter);

    // Pan + zoom on X axis
    const panZoom = new Plottable.Interactions.PanZoom(xScale, null);
    panZoom.attachTo(scatter);

    const table = new Plottable.Components.Table([
      [yLabel, yAxis, scatter],
      [null,   null,  xAxis  ],
      [null,   null,  xLabel ],
    ]);

    table.renderTo(containerRef.current);
    chartRef.current = table;

    const ro = new ResizeObserver(() => {
      if (chartRef.current) Plottable.Utils.DOM.requestAnimationFramePolyfill(() => chartRef.current?.redraw());
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      try { pointer.detachFrom(scatter); } catch (_) {}
      try { panZoom.detachFrom(scatter); } catch (_) {}
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      if (tooltipDiv.parentNode) tooltipDiv.parentNode.removeChild(tooltipDiv);
    };
  }, [competitors, radiusKm]);

  if (!competitors?.length) return null;

  return (
    <div>
      <p className="text-xs text-slate-500 mb-1 font-medium">
        Competitor Scatter — Distance vs Rating
        <span className="ml-2 text-[10px] text-slate-400">Drag to pan · Scroll to zoom</span>
      </p>
      <div className="flex gap-3 text-[10px] mb-2">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Rating ≥ 4</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Rating 2.5–4</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Rating &lt; 2.5 / unknown</span>
      </div>
      <div ref={containerRef} style={{ width: "100%", height: 260 }} />
    </div>
  );
}
