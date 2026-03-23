import { format } from "date-fns";

function toCSV(rows) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  return [keys.join(","), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCountReport(session, products) {
  if (!session) return;

  const entries = Object.entries(session.counts);
  const now = new Date();

  const rows = entries.map(([productId, count]) => {
    const diff = count.physical_count !== null ? count.physical_count - count.system_count : null;
    const pct = diff !== null && count.system_count > 0
      ? ((Math.abs(diff) / count.system_count) * 100).toFixed(1)
      : null;
    const valueDiff = diff !== null ? diff * (count.cost_price || 0) : null;

    let status = "uncounted";
    if (count.counted && diff !== null) {
      if (diff === 0) status = "match";
      else if (diff > 0) status = "surplus";
      else if (pct <= 10) status = "close";
      else status = "gap";
    }

    return {
      item_name: count.product_name,
      sku: count.sku || "",
      category: count.category || "",
      unit: count.unit || "",
      system_count: count.system_count,
      physical_count: count.physical_count !== null ? count.physical_count : "",
      difference: diff !== null ? diff : "",
      difference_pct: pct !== null ? `${pct}%` : "",
      value_difference: valueDiff !== null ? valueDiff.toFixed(2) : "",
      notes: count.notes || "",
      status,
    };
  });

  const startedAt = session.started_at ? new Date(session.started_at) : null;
  const duration = startedAt ? Math.round((now - startedAt) / 60000) + " min" : "";
  const counted = entries.filter(([, c]) => c.counted && c.physical_count !== null).length;
  const updated = entries.filter(([, c]) => c.counted && c.physical_count !== null && c.physical_count !== c.system_count).length;
  const systemValue = entries.reduce((sum, [, c]) => sum + (c.system_count * (c.cost_price || 0)), 0);
  const countedValue = entries.filter(([, c]) => c.physical_count !== null)
    .reduce((sum, [, c]) => sum + (c.physical_count * (c.cost_price || 0)), 0);

  const info = [{
    enterprise: session.enterprise || "",
    location: session.location || "",
    counted_by: session.counted_by || "",
    started_at: startedAt ? format(startedAt, "yyyy-MM-dd HH:mm") : "",
    completed_at: format(now, "yyyy-MM-dd HH:mm"),
    duration,
    total_items: entries.length,
    items_counted: counted,
    items_updated: updated,
    total_system_value: systemValue.toFixed(2),
    total_counted_value: countedValue.toFixed(2),
    total_value_difference: (countedValue - systemValue).toFixed(2),
  }];

  const csv = `=== Count Results ===\n${toCSV(rows)}\n\n=== Session Info ===\n${toCSV(info)}`;
  const dateStr = format(now, "yyyy-MM-dd");
  const safeName = (session.enterprise || "all").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  downloadCSV(csv, `stock_count_${safeName}_${dateStr}.csv`);
}