import React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * ExportCSVButton
 * @param {Object[]} data - Array of records to export
 * @param {string[]} fields - Field keys to include (in order)
 * @param {Object} labels - Optional map of field key → column header label
 * @param {string} filename - Downloaded file name (without .csv)
 */
export default function ExportCSVButton({ data = [], fields, labels = {}, filename = "export" }) {
  const handleExport = () => {
    if (!data.length) return;

    const keys = fields || Object.keys(data[0]).filter(k => !["id", "created_by"].includes(k));
    const header = keys.map(k => labels[k] || k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));

    const escape = (val) => {
      if (val === null || val === undefined) return "";
      const str = Array.isArray(val) ? val.join("; ") : typeof val === "object" ? JSON.stringify(val) : String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const rows = data.map(row => keys.map(k => escape(row[k])).join(","));
    const csv = [header.join(","), ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-xl"
      onClick={handleExport}
      disabled={!data.length}
      title={data.length ? `Export ${data.length} records to CSV` : "No data to export"}
    >
      <Download className="w-4 h-4 mr-2" />
      Export CSV
    </Button>
  );
}