import React from "react";
import { format, parseISO } from "date-fns";
import { getWeekDays, fmtDuration, buildDayRecords } from "./clockUtils";
import { CheckCircle2, XCircle, Minus } from "lucide-react";

function exportCSV(records) {
  const rows = [["Date", "Day", "Clock In", "Clock Out", "Total", "Breaks", "Net Worked", "Enterprise"]];
  records.forEach((r) => {
    rows.push([
      r.date,
      format(parseISO(r.date), "EEEE"),
      r.cin?.scheduled_time || "",
      r.cout?.scheduled_time || "",
      r.totalMins !== null ? fmtDuration(r.totalMins) : "",
      fmtDuration(r.breakMins),
      r.netMins !== null ? fmtDuration(r.netMins) : "",
      r.enterprise || "",
    ]);
  });
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance_${format(new Date(), "yyyy-MM")}.csv`;
  a.click();
}

function DayRow({ dayRecord, date }) {
  const dateStr = format(date, "yyyy-MM-dd");
  const today = format(new Date(), "yyyy-MM-dd");
  const isFuture = dateStr > today;

  let status, statusEl;
  if (isFuture) {
    status = "future";
    statusEl = <span className="text-xs text-slate-300">—</span>;
  } else if (dayRecord) {
    if (dayRecord.cout) {
      status = "present";
      statusEl = <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Present</span>;
    } else {
      status = "partial";
      statusEl = <span className="text-xs text-amber-600 font-medium">In progress</span>;
    }
  } else {
    status = "absent";
    statusEl = <span className="flex items-center gap-1 text-xs text-red-500 font-medium"><XCircle className="w-3.5 h-3.5" /> Absent</span>;
  }

  return (
    <div className={`flex items-center py-3 border-b border-slate-50 last:border-0 gap-3 ${dateStr === today ? "bg-emerald-50/50 -mx-4 px-4 rounded-xl" : ""}`}>
      <div className="w-24 shrink-0">
        <p className="text-sm font-semibold text-slate-700">{format(date, "EEE")}</p>
        <p className="text-xs text-slate-400">{format(date, "MMM d")}</p>
      </div>
      <div className="flex-1 min-w-0">
        {dayRecord ? (
          <p className="text-xs text-slate-500 truncate">
            {dayRecord.cin?.scheduled_time || "—"} → {dayRecord.cout?.scheduled_time || "ongoing"}
            {dayRecord.enterprise && <span className="ml-2 text-slate-400">· {dayRecord.enterprise}</span>}
          </p>
        ) : (
          <p className="text-xs text-slate-300">No record</p>
        )}
      </div>
      <div className="text-right shrink-0 w-20">
        {dayRecord?.netMins !== null && dayRecord?.netMins !== undefined ? (
          <p className="text-sm font-bold text-slate-700">{fmtDuration(dayRecord.netMins)}</p>
        ) : null}
        {statusEl}
      </div>
    </div>
  );
}

export default function WeeklyView({ tasks, mode }) {
  const weekDays = getWeekDays();
  const allRecords = buildDayRecords(tasks);

  if (mode === "week") {
    const recordByDate = {};
    allRecords.forEach((r) => { recordByDate[r.date] = r; });

    const daysWorked = weekDays.filter((d) => {
      const ds = format(d, "yyyy-MM-dd");
      const r = recordByDate[ds];
      return r && (r.cin || r.cout);
    }).length;

    const totalWeekMins = allRecords.filter((r) => {
      const ds = r.date;
      return weekDays.some((d) => format(d, "yyyy-MM-dd") === ds);
    }).reduce((acc, r) => acc + (r.totalMins || 0), 0);

    const totalBreakMins = allRecords.filter((r) => {
      return weekDays.some((d) => format(d, "yyyy-MM-dd") === r.date);
    }).reduce((acc, r) => acc + (r.breakMins || 0), 0);

    const netWeekMins = totalWeekMins - totalBreakMins;

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">This Week</p>
          {weekDays.map((d) => (
            <DayRow key={d.toISOString()} date={d} dayRecord={recordByDate[format(d, "yyyy-MM-dd")]} />
          ))}
        </div>
        {/* Weekly totals */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Weekly Totals</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Days Worked", value: `${daysWorked} / 5` },
              { label: "Total Hours", value: fmtDuration(totalWeekMins) },
              { label: "Total Breaks", value: fmtDuration(totalBreakMins) },
              { label: "Net Worked", value: fmtDuration(netWeekMins) },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className="text-lg font-bold text-slate-800">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // History mode — last 30 days
  const sorted = allRecords.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">Last 30 days of records</p>
        <button
          onClick={() => exportCSV(sorted)}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg"
        >
          Export CSV
        </button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        {sorted.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No attendance records found.</p>
        )}
        {sorted.map((r) => {
          const date = parseISO(r.date);
          return <DayRow key={r.date} date={date} dayRecord={r} />;
        })}
      </div>
    </div>
  );
}