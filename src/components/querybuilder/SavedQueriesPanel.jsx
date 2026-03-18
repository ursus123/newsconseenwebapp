import React, { useState } from "react";
import { FolderOpen, Folder, Search, Play, Trash2, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function QueryGroup({ title, queries, onLoad, onDelete }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-300 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {open ? <FolderOpen className="w-3 h-3 text-amber-500" /> : <Folder className="w-3 h-3 text-amber-500" />}
        {title} ({queries.length})
      </button>
      {open && queries.map((q) => (
        <div key={q.id} className="group flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer ml-2"
          onClick={() => onLoad(q)}>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-300 font-medium truncate">{q.name}</p>
            {q.description && <p className="text-[9px] text-slate-600 truncate">{q.description}</p>}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] text-slate-600 flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />{timeAgo(q.updated_date)}
              </span>
              {q.last_run_rows > 0 && <span className="text-[9px] text-emerald-600">{q.last_run_rows} rows</span>}
            </div>
          </div>
          <div className="hidden group-hover:flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onLoad(q); }}
              className="p-1 rounded hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-400 transition-colors"
              title="Load query"
            >
              <Play className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(q.id); }}
              className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SavedQueriesPanel({ onLoadQuery }) {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const { data: queries = [], isLoading } = useQuery({
    queryKey: ["savedQueries"],
    queryFn: () => base44.entities.QueryDefinition.list("-updated_date", 200),
  });

  const handleDelete = async (id) => {
    await base44.entities.QueryDefinition.delete(id);
    qc.invalidateQueries({ queryKey: ["savedQueries"] });
  };

  const filtered = queries.filter((q) =>
    !search || q.name?.toLowerCase().includes(search.toLowerCase()) || q.script?.toLowerCase().includes(search.toLowerCase())
  );

  // Group by data_source
  const groups = {};
  filtered.forEach((q) => {
    const g = q.data_source || "General";
    if (!groups[g]) groups[g] = [];
    groups[g].push(q);
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search */}
      <div className="shrink-0 px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-2 py-1.5">
          <Search className="w-3 h-3 text-slate-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search queries…"
            className="flex-1 bg-transparent text-xs text-slate-300 outline-none placeholder-slate-600"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-1">
        {isLoading && <p className="text-[10px] text-slate-600 text-center py-4 font-mono">Loading…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-[10px] text-slate-600 text-center py-6 font-mono">
            {search ? "No matching queries" : "No saved queries yet"}
          </p>
        )}
        {Object.entries(groups).map(([group, qs]) => (
          <QueryGroup
            key={group}
            title={group}
            queries={qs}
            onLoad={(q) => onLoadQuery(q.script, q.name)}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}