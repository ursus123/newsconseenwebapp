import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, MessageSquare, Send } from "lucide-react";
import { format } from "date-fns";
import ChartSection from "./ChartSection";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";

function SectionViewer({ section, charts }) {
  if (section.type === "heading") {
    const Tag = section.level === "H1" ? "h1" : section.level === "H3" ? "h3" : "h2";
    const cls = section.level === "H1"
      ? "text-3xl font-black text-slate-900 mt-6 mb-3"
      : section.level === "H3"
      ? "text-lg font-semibold text-slate-700 mt-4 mb-2"
      : "text-2xl font-bold text-slate-800 mt-5 mb-2";
    return <Tag className={cls}>{section.content}</Tag>;
  }

  if (section.type === "text") {
    return <p className="text-slate-600 leading-relaxed text-sm mb-4">{section.content}</p>;
  }

  if (section.type === "divider") {
    return <hr className="my-6 border-slate-200" />;
  }

  if (section.type === "spacer") {
    return <div className="h-6" />;
  }

  if (section.type === "metric") {
    return (
      <div className="inline-flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 mr-4 mb-4">
        {section.icon && <span className="text-3xl">{section.icon}</span>}
        <div>
          <p className="text-3xl font-black text-slate-800">{section.value || "—"}</p>
          <p className="text-sm text-slate-500">{section.label}</p>
        </div>
      </div>
    );
  }

  if (section.type === "chart") {
    const chart = charts?.find((c) => c.id === section.chart_id);
    if (!chart) return null;
    return (
      <div className={`mb-6 ${section.width === "half" ? "inline-block w-[48%] mr-4 align-top" : "block"}`}>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-sm font-semibold text-slate-800 mb-1">{chart.title}</p>
        {chart.description && <p className="text-xs text-slate-400 mb-3">{chart.description}</p>}
        <ChartSection chart={chart} height={280} />
        </div>
        {section.caption && <p className="text-xs text-slate-400 mt-1.5 text-center italic">{section.caption}</p>}
      </div>
    );
  }

  // Market intelligence inline charts — serialized with the report at save time
  if (section.type === "mi_chart") {
    const { chartType, data, title, caption, dataKey, nameKey = "metric" } = section;
    if (!data?.length) return null;
    const dk = dataKey || Object.keys(data[0]).find(k => k !== nameKey) || "value";
    return (
      <div className="mb-6 bg-white border border-slate-100 rounded-2xl p-5">
        {title && <p className="text-sm font-semibold text-slate-800 mb-3">{title}</p>}
        <ResponsiveContainer width="100%" height={260}>
          {chartType === "radar" ? (
            <RadarChart data={data}>
              <PolarGrid />
              <PolarAngleAxis dataKey={nameKey} tick={{ fontSize: 11 }} />
              <Radar dataKey={dk} fill="#10b981" fillOpacity={0.25} stroke="#10b981" />
              <Tooltip formatter={(v) => v?.toFixed ? v.toFixed(1) : v} />
            </RadarChart>
          ) : chartType === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey={nameKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={dk} stroke="#10b981" dot={false} strokeWidth={2} />
            </LineChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey={nameKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey={dk} fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
        {caption && <p className="text-xs text-slate-400 mt-1.5 text-center italic">{caption}</p>}
      </div>
    );
  }

  if (section.type === "mi_table") {
    const { data, title, columns } = section;
    if (!data?.length) return null;
    const cols = columns || Object.keys(data[0]);
    return (
      <div className="mb-6 overflow-x-auto">
        {title && <p className="text-sm font-semibold text-slate-700 mb-2">{title}</p>}
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border border-slate-200">
              {cols.map(c => <th key={c} className="px-3 py-2 text-left font-semibold text-slate-500 border border-slate-200 capitalize">{c.replace(/_/g, " ")}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                {cols.map(c => <td key={c} className="px-3 py-2 text-slate-700 border border-slate-200">{row[c] ?? "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

export default function ReportViewer({ report, charts, currentUser, onClose, onEdit }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

  const { data: comments = [] } = useQuery({
    queryKey: ["reportComments", report?.id],
    queryFn: () => base44.entities.ReportComment.filter({ report_id: report.id }),
    enabled: !!report?.id && !!report?.allow_comments,
  });

  const addCommentMut = useMutation({
    mutationFn: (data) => base44.entities.ReportComment.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reportComments", report.id] });
      setComment("");
    },
  });

  const handlePrint = () => window.print();

  const handleAddComment = () => {
    if (!comment.trim()) return;
    addCommentMut.mutate({
      report_id: report.id,
      comment_text: comment,
      commented_by: currentUser?.email,
      commenter_name: currentUser?.full_name || currentUser?.email,
      company_id: currentUser?.company_id,
    });
  };

  if (!report) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-white shrink-0 print:hidden">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-800">{report.title}</h2>
          <p className="text-xs text-slate-400">
            {report.status === "published" && report.published_at
              ? `Published ${format(new Date(report.published_at), "MMM d, yyyy")}`
              : `Status: ${report.status}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
            <Printer className="w-3.5 h-3.5" /> Export / Print
          </Button>
          {isAdmin && onEdit && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => onEdit(report)}>
              Edit Report
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="max-w-4xl mx-auto py-10 px-8">
          {/* Cover */}
          {report.cover_image && (
            <div className="mb-8 rounded-2xl overflow-hidden h-48">
              <img src={report.cover_image} alt="Cover" className="w-full h-full object-cover" />
            </div>
          )}

          {/* Meta strip */}
          <div className="flex items-center gap-4 mb-8 pb-4 border-b border-slate-200 print:hidden">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${report.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
              {report.status}
            </span>
            {report.last_edited_by && (
              <span className="text-xs text-slate-400">Last edited by {report.last_edited_by}</span>
            )}
          </div>

          {/* Sections */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
            {(report.sections || []).map((section, i) => (
              <SectionViewer key={i} section={section} charts={charts} />
            ))}
            {(!report.sections || report.sections.length === 0) && (
              <p className="text-slate-400 text-center py-12">This report has no content yet.</p>
            )}
          </div>

          {/* Comments */}
          {report.allow_comments && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Comments ({comments.length})
              </h3>
              <div className="space-y-3 mb-4">
                {comments.map((c) => (
                  <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-700">{c.commenter_name || c.commented_by}</span>
                      <span className="text-[10px] text-slate-400">{c.created_date ? format(new Date(c.created_date), "MMM d, h:mm a") : ""}</span>
                    </div>
                    <p className="text-sm text-slate-600">{c.comment_text}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none"
                  onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                />
                <Button size="sm" onClick={handleAddComment} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}