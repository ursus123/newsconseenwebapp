import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";

function getInitials(name) {
  if (!name) return "—";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function getCellCode(task) {
  if (!task) return "";
  if (task.outcome === "completed") return "A";
  if (task.outcome === "refused") return "R";
  if (task.outcome === "missed") return "M";
  if (task.internal_notes?.includes("PRN")) return "PRN";
  return "—";
}

export default function MARExportButton({ tasks, selectedClient, selectedMonth, enterprise, user }) {
  const [loading, setLoading] = useState(false);

  const handleExport = () => {
    if (!selectedClient) return;
    setLoading(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const clientName = `${selectedClient.first_name} ${selectedClient.last_name}`;
      const monthStr = format(selectedMonth, "MMMM yyyy");
      const days = eachDayOfInterval({ start: startOfMonth(selectedMonth), end: endOfMonth(selectedMonth) });

      // Header
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("MEDICATION ADMINISTRATION RECORD (MAR)", 148, 15, { align: "center" });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Facility: ${enterprise || "—"}`, 20, 25);
      doc.text(`Client: ${clientName}`, 20, 31);
      if (selectedClient.date_of_birth) doc.text(`DOB: ${selectedClient.date_of_birth}`, 100, 31);
      if (selectedClient.city) doc.text(`Room/Unit: ${selectedClient.city}`, 160, 31);
      doc.text(`Month: ${monthStr}`, 20, 37);
      doc.text(`Printed by: ${user?.full_name || user?.email || "—"}  Date: ${format(new Date(), "PPP")}`, 20, 43);

      // Group tasks by med name
      const groups = {};
      tasks.forEach((t) => {
        if (t.task_type !== "medication_admin") return;
        const month = format(selectedMonth, "yyyy-MM");
        if (!t.scheduled_date?.startsWith(month)) return;
        const key = t.title || "Unknown";
        if (!groups[key]) groups[key] = { byDate: {}, meta: t };
        groups[key].byDate[t.scheduled_date] = t;
      });

      const medNames = Object.keys(groups);
      if (medNames.length === 0) {
        doc.setFontSize(12);
        doc.text("No medication records for this month.", 148, 80, { align: "center" });
      } else {
        // Table
        const colWidth = Math.min(6, (250 - 40) / days.length);
        const startX = 20;
        let y = 55;

        // Header row
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setFillColor(59, 130, 246);
        doc.setTextColor(255, 255, 255);
        doc.rect(startX, y - 4, 38, 6, "F");
        doc.text("MEDICATION", startX + 1, y);
        doc.text("TIME", startX + 32, y);

        days.forEach((d, i) => {
          const x = startX + 40 + i * colWidth;
          doc.setFillColor(59, 130, 246);
          doc.rect(x, y - 4, colWidth, 6, "F");
          doc.text(format(d, "d"), x + colWidth / 2, y, { align: "center" });
        });
        y += 5;
        doc.setTextColor(0, 0, 0);

        // Med rows
        medNames.forEach((medName, ri) => {
          const { byDate, meta } = groups[medName];
          if (y > 175) { doc.addPage(); y = 20; }
          const rowFill = ri % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
          doc.setFillColor(...rowFill);
          doc.rect(startX, y - 3, 260, 7, "F");
          doc.setFontSize(7);
          doc.setFont("helvetica", "bold");
          doc.text(medName.slice(0, 22).toUpperCase(), startX + 1, y + 1);
          doc.setFont("helvetica", "normal");
          doc.text(meta.scheduled_time || "—", startX + 32, y + 1);
          days.forEach((d, i) => {
            const ds = format(d, "yyyy-MM-dd");
            const task = byDate[ds];
            const code = getCellCode(task);
            const x = startX + 40 + i * colWidth;
            const colors = {
              "A": [16, 185, 129], "R": [245, 158, 11], "M": [239, 68, 68],
              "PRN": [59, 130, 246], "—": [203, 213, 225],
            };
            const [r2, g, b] = colors[code] || [203, 213, 225];
            doc.setFillColor(r2, g, b);
            doc.setTextColor(255, 255, 255);
            doc.rect(x + 0.5, y - 2.5, colWidth - 1, 6, "F");
            if (code) doc.text(code, x + colWidth / 2, y + 1, { align: "center" });
            doc.setTextColor(0, 0, 0);
          });
          y += 8;
        });

        // Legend
        y += 5;
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Legend:", startX, y);
        doc.setFont("helvetica", "normal");
        doc.text("A = Administered  R = Refused  M = Missed  PRN = As Needed", startX + 16, y);

        // Signature line
        y += 12;
        doc.line(startX, y, 90, y);
        doc.text("Nurse/Carer Signature", startX, y + 4);
        doc.line(110, y, 180, y);
        doc.text("Date", 110, y + 4);

        // Page number
        doc.setFontSize(8);
        doc.text(`Page 1 of 1`, 270, 195, { align: "right" });
      }

      doc.save(`MAR_${clientName.replace(/ /g, "_")}_${format(selectedMonth, "MMM_yyyy")}.pdf`);
    } catch (e) {
      console.error("MAR export error:", e);
    }
    setLoading(false);
  };

  if (!selectedClient) return null;

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 active:scale-95 transition-all shadow disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      Export MAR PDF
    </button>
  );
}