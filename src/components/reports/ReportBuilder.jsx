import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Plus, ChevronUp, ChevronDown, Trash2, MoreHorizontal, BarChart2, Type, AlignLeft, Minus, Space, Hash } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ChartRenderer from "./ChartRenderer";

const SECTION_TYPES = [
  { type: "heading", label: "Heading", icon: Type },
  { type: "text", label: "Text Block", icon: AlignLeft },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: Space },
  { type: "metric", label: "Metric Card", icon: Hash },
  { type: "chart", label: "Chart", icon: BarChart2 },
];

function SectionEditor({ section, index, total, charts, onUpdate, onMove, onDelete, onDuplicate }) {
  const update = (patch) => onUpdate(index, { ...section, ...patch });

  return (
    <div className="group relative bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all">
      {/* Section controls */}
      <div className="absolute -left-10 top-2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
        <button onClick={() => onMove(index, -1)} disabled={index === 0} className="p-1 rounded hover:bg-slate-200 disabled:opacity-20">
          <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
        </button>
        <button onClick={() => onMove(index, 1)} disabled={index === total - 1} className="p-1 rounded hover:bg-slate-200 disabled:opacity-20">
          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>
      <div className="absolute -right-8 top-2 opacity-0 group-hover:opacity-100 transition-all">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded hover:bg-slate-200">
              <MoreHorizontal className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={() => onDuplicate(index)}>Duplicate</DropdownMenuItem>
            <DropdownMenuItem className="text-rose-600" onClick={() => onDelete(index)}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="p-4">
        {section.type === "heading" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              {["H1", "H2", "H3"].map((h) => (
                <button
                  key={h}
                  onClick={() => update({ level: h })}
                  className={`text-xs px-2 py-0.5 rounded font-bold ${section.level === h ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {h}
                </button>
              ))}
            </div>
            <input
              value={section.content || ""}
              onChange={(e) => update({ content: e.target.value })}
              placeholder="Heading text..."
              className={`w-full outline-none font-bold text-slate-800 ${section.level === "H1" ? "text-2xl" : section.level === "H3" ? "text-base" : "text-xl"}`}
            />
          </div>
        )}

        {section.type === "text" && (
          <textarea
            value={section.content || ""}
            onChange={(e) => update({ content: e.target.value })}
            placeholder="Start typing your paragraph..."
            className="w-full outline-none text-sm text-slate-700 resize-none min-h-[80px]"
            rows={4}
          />
        )}

        {section.type === "divider" && (
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-slate-200" />
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Divider</span>
            <hr className="flex-1 border-slate-200" />
          </div>
        )}

        {section.type === "spacer" && (
          <div className="h-6 flex items-center justify-center">
            <span className="text-[10px] text-slate-300 uppercase tracking-wider">Spacer</span>
          </div>
        )}

        {section.type === "metric" && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-slate-400 font-medium block mb-1">Icon</label>
              <Input value={section.icon || ""} onChange={(e) => update({ icon: e.target.value })} placeholder="👥" className="h-7 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-medium block mb-1">Value</label>
              <Input value={section.value || ""} onChange={(e) => update({ value: e.target.value })} placeholder="169" className="h-7 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-medium block mb-1">Label</label>
              <Input value={section.label || ""} onChange={(e) => update({ label: e.target.value })} placeholder="Total Clients" className="h-7 text-xs" />
            </div>
            {/* Preview */}
            <div className="col-span-3">
              <div className="inline-flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
                <span className="text-2xl">{section.icon || "📊"}</span>
                <div>
                  <p className="text-xl font-black text-slate-800">{section.value || "—"}</p>
                  <p className="text-xs text-slate-500">{section.label || "Metric"}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {section.type === "chart" && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-slate-400 font-medium block mb-1">Chart</label>
                <select
                  value={section.chart_id || ""}
                  onChange={(e) => update({ chart_id: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg text-xs px-3 py-1.5 outline-none bg-white"
                >
                  <option value="">Select a chart...</option>
                  {charts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-medium block mb-1">Width</label>
                <select
                  value={section.width || "full"}
                  onChange={(e) => update({ width: e.target.value })}
                  className="border border-slate-200 rounded-lg text-xs px-3 py-1.5 outline-none bg-white"
                >
                  <option value="full">Full Width</option>
                  <option value="half">Half Width</option>
                </select>
              </div>
            </div>
            {section.chart_id && (
              <div className="h-48 border border-slate-100 rounded-xl overflow-hidden">
                <ChartRenderer chart={charts.find((c) => c.id === section.chart_id)} height={192} />
              </div>
            )}
            <Input
              value={section.caption || ""}
              onChange={(e) => update({ caption: e.target.value })}
              placeholder="Chart caption (optional)"
              className="text-xs h-7"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportBuilder({ report, folders, charts, currentUser, onClose }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(report?.title || "");
  const [status, setStatus] = useState(report?.status || "draft");
  const [folderId, setFolderId] = useState(report?.folder_id || "");
  const [sharedWithRoles, setSharedWithRoles] = useState(report?.shared_with_roles || ["admin"]);
  const [isPublic, setIsPublic] = useState(report?.is_public || false);
  const [allowComments, setAllowComments] = useState(report?.allow_comments || false);
  const [sections, setSections] = useState(report?.sections || []);
  const [chartSearch, setChartSearch] = useState("");

  const saveMut = useMutation({
    mutationFn: (data) => report
      ? base44.entities.Report.update(report.id, data)
      : base44.entities.Report.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      onClose();
    },
  });

  const addSection = (type) => {
    setSections((prev) => [...prev, { type, content: "", level: "H2" }]);
  };

  const updateSection = (index, updated) => {
    setSections((prev) => prev.map((s, i) => i === index ? updated : s));
  };

  const moveSection = (index, dir) => {
    setSections((prev) => {
      const next = [...prev];
      const newIdx = index + dir;
      if (newIdx < 0 || newIdx >= next.length) return next;
      [next[index], next[newIdx]] = [next[newIdx], next[index]];
      return next;
    });
  };

  const deleteSection = (index) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const duplicateSection = (index) => {
    setSections((prev) => {
      const copy = { ...prev[index] };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  const handleSave = () => {
    saveMut.mutate({
      title,
      status,
      folder_id: folderId || null,
      sections,
      shared_with_roles: sharedWithRoles,
      is_public: isPublic,
      allow_comments: allowComments,
      company_id: currentUser?.company_id,
      last_edited_by: currentUser?.email,
      published_at: status === "published" ? new Date().toISOString() : report?.published_at,
    });
  };

  const filteredCharts = charts.filter((c) =>
    !chartSearch || c.title.toLowerCase().includes(chartSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 bg-white shrink-0">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Report title..."
          className="flex-1 font-semibold border-0 text-slate-800 text-sm focus-visible:ring-0 pl-0"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={handleSave} disabled={saveMut.isPending}>
          <Save className="w-3.5 h-3.5" /> {saveMut.isPending ? "Saving..." : status === "published" ? "Publish" : "Save Draft"}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left palette */}
        <div className="w-72 border-r border-slate-100 flex flex-col overflow-y-auto bg-slate-50 shrink-0">
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Add Section</p>
              <div className="grid grid-cols-2 gap-1.5">
                {SECTION_TYPES.map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => addSection(type)}
                    className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-xs font-medium text-slate-700"
                  >
                    <Icon className="w-3.5 h-3.5 text-slate-400" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">My Charts</p>
              <input
                value={chartSearch}
                onChange={(e) => setChartSearch(e.target.value)}
                placeholder="Search charts..."
                className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none mb-2"
              />
              <div className="space-y-1">
                {filteredCharts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSections((prev) => [...prev, { type: "chart", chart_id: c.id, width: "full" }])}
                    className="w-full text-left px-3 py-2 bg-white rounded-lg border border-slate-200 hover:border-emerald-300 transition-all"
                  >
                    <p className="text-xs font-medium text-slate-700 truncate">{c.title}</p>
                    <p className="text-[10px] text-slate-400 capitalize">{c.chart_type} chart</p>
                  </button>
                ))}
                {filteredCharts.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-2">No charts yet</p>
                )}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Settings</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">Folder</label>
                  <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className="w-full border border-slate-200 rounded-lg text-xs px-2 py-1.5 outline-none bg-white">
                    <option value="">Uncategorized</option>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.icon || "📁"} {f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium mb-1 block">Visible to</label>
                  {["admin", "executive", "user"].map((role) => (
                    <label key={role} className="flex items-center gap-2 mb-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sharedWithRoles.includes(role)}
                        onChange={() => setSharedWithRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role])}
                        className="rounded"
                      />
                      <span className="text-xs text-slate-600 capitalize">{role}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={allowComments} onChange={(e) => setAllowComments(e.target.checked)} className="rounded" />
                    <span className="text-xs text-slate-600">Allow comments</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-100">
          <div className="max-w-3xl mx-auto">
            {sections.length === 0 ? (
              <div className="border-2 border-dashed border-slate-300 rounded-2xl py-16 text-center">
                <BarChart2 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">Your report is empty</p>
                <p className="text-slate-300 text-sm mt-1">Click sections on the left to add content</p>
              </div>
            ) : (
              <div className="ml-12 mr-8 space-y-3">
                {sections.map((section, i) => (
                  <SectionEditor
                    key={i}
                    section={section}
                    index={i}
                    total={sections.length}
                    charts={charts}
                    onUpdate={updateSection}
                    onMove={moveSection}
                    onDelete={deleteSection}
                    onDuplicate={duplicateSection}
                  />
                ))}
                <button
                  onClick={() => addSection("text")}
                  className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add section
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}