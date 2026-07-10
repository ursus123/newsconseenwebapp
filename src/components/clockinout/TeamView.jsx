import React, { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { ncClient } from "@/api/ncClient";
import { todayStr, fmtDuration, buildDayRecords, getWeekDays } from "./clockUtils";
import { CheckCircle2, XCircle, Coffee, Clock, Download } from "lucide-react";

function statusBadge(staffEmail, todayRecordMap, onBreakEmails) {
  const record = todayRecordMap[staffEmail];
  if (!record) return { label: "Absent", cls: "bg-red-100 text-red-600" };
  if (onBreakEmails.includes(staffEmail)) return { label: "On Break", cls: "bg-amber-100 text-amber-700" };
  if (record.cout) return { label: "Completed", cls: "bg-blue-100 text-blue-700" };
  if (record.cin) return { label: "Clocked In", cls: "bg-emerald-100 text-emerald-700" };
  return { label: "Absent", cls: "bg-red-100 text-red-600" };
}

function exportTeamCSV(people, todayRecordMap) {
  const rows = [["Name", "Status", "Clock In", "Clock Out", "Duration", "Enterprise"]];
  people.forEach((p) => {
    const name = `${p.first_name} ${p.last_name}`;
    const r = todayRecordMap[p.email];
    rows.push([
      name,
      r ? (r.cout ? "Completed" : "Clocked In") : "Absent",
      r?.cin?.scheduled_time || "",
      r?.cout?.scheduled_time || "",
      r?.netMins !== null && r?.netMins !== undefined ? fmtDuration(r.netMins) : "",
      r?.enterprise || "",
    ]);
  });
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `team_attendance_${todayStr()}.csv`;
  a.click();
}

export function TeamTodayView({ companyId }) {
  const today = todayStr();

  const { data: todayTasks = [] } = useQuery({
    queryKey: ["team-today-tasks", companyId, today],
    queryFn: () => ncClient.entities.Task.filter({ scheduled_date: today }),
    enabled: !!companyId,
  });

  const { data: people = [] } = useQuery({
    queryKey: ["people-list", companyId],
    queryFn: () => ncClient.entities.Person.filter({ status: "active" }),
    enabled: !!companyId,
  });

  // Build per-person records
  const todayRecordMap = useMemo(() => {
    const byEmail = {};
    todayTasks.forEach((t) => {
      if (!t.assigned_to_email) return;
      if (!byEmail[t.assigned_to_email]) byEmail[t.assigned_to_email] = [];
      byEmail[t.assigned_to_email].push(t);
    });
    const result = {};
    Object.entries(byEmail).forEach(([email, tasks]) => {
      const records = buildDayRecords(tasks);
      if (records.length > 0) result[email] = records[0];
    });
    return result;
  }, [todayTasks]);

  // Who is on break right now?
  const onBreakEmails = useMemo(() => {
    const byEmail = {};
    todayTasks.forEach((t) => {
      if (!t.assigned_to_email) return;
      if (!byEmail[t.assigned_to_email]) byEmail[t.assigned_to_email] = [];
      byEmail[t.assigned_to_email].push(t);
    });
    return Object.entries(byEmail)
      .filter(([, tasks]) => {
        const sorted = tasks.sort((a, b) => (a.scheduled_time || "").localeCompare(b.scheduled_time || ""));
        const last = [...sorted].reverse().find((t) => t.task_type === "break_start" || t.task_type === "break_end");
        return last?.task_type === "break_start";
      })
      .map(([email]) => email);
  }, [todayTasks]);

  // Late arrivals — uses Person.scheduled_start_time
  const lateArrivals = useMemo(() => {
    const lates = [];
    people.forEach((p) => {
      if (!p.scheduled_start_time || !p.email) return;
      const record = todayRecordMap[p.email];
      if (!record?.cin) return;
      const [sh, sm] = p.scheduled_start_time.split(":").map(Number);
      const [ch, cm] = record.cin.scheduled_time.split(":").map(Number);
      const scheduledMins = sh * 60 + sm;
      const clockedMins = ch * 60 + cm;
      if (clockedMins - scheduledMins > 15) {
        lates.push({ email: p.email, lateBy: clockedMins - scheduledMins });
      }
    });
    return lates;
  }, [people, todayRecordMap]);

  const lateEmails = lateArrivals.map((l) => l.email);

  const present = Object.keys(todayRecordMap).filter((e) => todayRecordMap[e]?.cin).length;
  const onBreak = onBreakEmails.length;
  const absent = people.filter((p) => p.email && !todayRecordMap[p.email]?.cin).length;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Present", value: `${present} / ${people.length}`, cls: "text-emerald-600" },
          { label: "On Break", value: onBreak, cls: "text-amber-600" },
          { label: "Absent", value: absent, cls: "text-red-500" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-3 text-center shadow-sm">
            <p className={`text-2xl font-black ${s.cls}`}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-50">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Team Today</p>
          <button onClick={() => exportTeamCSV(people, todayRecordMap)} className="text-xs text-blue-600 flex items-center gap-1 hover:text-blue-700">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
        <div className="divide-y divide-slate-50">
          {people.map((p) => {
            if (!p.email) return null;
            const name = `${p.first_name} ${p.last_name}`;
            const record = todayRecordMap[p.email];
            const badge = statusBadge(p.email, todayRecordMap, onBreakEmails);
            const isLate = lateEmails.includes(p.email);
            const lateInfo = lateArrivals.find((l) => l.email === p.email);

            return (
              <div key={p.id} className={`flex items-center gap-3 px-5 py-3 ${isLate ? "bg-amber-50/50" : ""}`}>
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                  {p.first_name?.[0]}{p.last_name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-700 truncate">{name}</p>
                    {isLate && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
                        ⏰ Late {Math.round(lateInfo.lateBy)}m
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {record?.cin?.scheduled_time || "—"} → {record?.cout?.scheduled_time || (record?.cin ? "ongoing" : "—")}
                    {record?.enterprise && ` · ${record.enterprise}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                  {record?.netMins != null && (
                    <p className="text-xs text-slate-400 mt-0.5">{fmtDuration(record.netMins)}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TeamWeekView({ companyId }) {
  const weekDays = getWeekDays();

  const { data: weekTasks = [] } = useQuery({
    queryKey: ["team-week-tasks", companyId],
    queryFn: () => ncClient.entities.Task.filter({
      scheduled_date: { $gte: format(weekDays[0], "yyyy-MM-dd"), $lte: format(weekDays[6], "yyyy-MM-dd") }
    }),
    enabled: !!companyId,
  });

  const { data: people = [] } = useQuery({
    queryKey: ["people-list", companyId],
    queryFn: () => ncClient.entities.Person.filter({ status: "active" }),
    enabled: !!companyId,
  });

  const staffRecords = useMemo(() => {
    const byEmail = {};
    weekTasks.forEach((t) => {
      if (!t.assigned_to_email) return;
      if (!byEmail[t.assigned_to_email]) byEmail[t.assigned_to_email] = [];
      byEmail[t.assigned_to_email].push(t);
    });
    const result = {};
    Object.entries(byEmail).forEach(([email, tasks]) => {
      const records = buildDayRecords(tasks);
      const byDate = {};
      records.forEach((r) => { byDate[r.date] = r; });
      result[email] = byDate;
    });
    return result;
  }, [weekTasks]);

  function cellColor(record, dateStr) {
    const today = todayStr();
    if (dateStr > today) return "bg-slate-50 text-slate-300";
    if (!record || !record.cin) return "bg-red-50 text-red-400";
    if (record.netMins === null) return "bg-amber-50 text-amber-600";
    if (record.netMins >= 420) return "bg-emerald-100 text-emerald-700"; // 7h+
    if (record.netMins >= 240) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-600";
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
      <div className="px-5 py-3 border-b border-slate-50">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Team Week Heatmap</p>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-50">
            <th className="text-left px-4 py-2 text-slate-400 font-semibold w-32">Staff</th>
            {weekDays.map((d) => (
              <th key={d.toISOString()} className="px-2 py-2 text-center text-slate-400 font-semibold min-w-[60px]">
                <div>{format(d, "EEE")}</div>
                <div className="text-slate-300 font-normal">{format(d, "d")}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => {
            if (!p.email) return null;
            const name = `${p.first_name} ${p.last_name}`;
            const byDate = staffRecords[p.email] || {};
            return (
              <tr key={p.id} className="border-b border-slate-50">
                <td className="px-4 py-2 font-medium text-slate-700 truncate max-w-[120px]">{name}</td>
                {weekDays.map((d) => {
                  const ds = format(d, "yyyy-MM-dd");
                  const record = byDate[ds];
                  const cls = cellColor(record, ds);
                  return (
                    <td key={ds} className={`px-2 py-2 text-center rounded-lg ${cls}`}>
                      {record?.netMins != null ? fmtDuration(record.netMins) : (ds <= todayStr() ? "—" : "")}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}