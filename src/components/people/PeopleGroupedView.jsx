import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const statusColor = (s) => {
  const map = { active: "bg-emerald-50 text-emerald-700", inactive: "bg-slate-100 text-slate-600", on_leave: "bg-amber-50 text-amber-700" };
  return map[s] || "bg-slate-100 text-slate-600";
};

const availColor = (s) => {
  const map = { available: "bg-green-50 text-green-700", busy: "bg-amber-50 text-amber-700", on_leave: "bg-slate-100 text-slate-500", unavailable: "bg-rose-50 text-rose-700" };
  return map[s] || "bg-slate-100 text-slate-600";
};

function PersonCard({ person, onEdit, onDelete }) {
  const name = person.preferred_name || `${person.first_name || ""} ${person.last_name || ""}`.trim();
  const initials = `${person.first_name?.[0] || ""}${person.last_name?.[0] || ""}`.toUpperCase();

  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-white border border-slate-100 rounded-xl hover:shadow-sm transition-shadow">
      <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-semibold text-emerald-700 shrink-0">
        {initials || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{name || "—"}</p>
        <p className="text-xs text-slate-400 truncate">{person.primary_role || "No role"} {person.city ? `· ${person.city}` : ""}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge className={availColor(person.availability_status)} >{(person.availability_status || "available").replace(/_/g, " ")}</Badge>
        <Badge className={statusColor(person.status)}>{(person.status || "active").replace(/_/g, " ")}</Badge>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-emerald-600" onClick={() => onEdit(person)}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-rose-600" onClick={() => onDelete(person)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function GroupSection({ label, people, onEdit, onDelete }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 mb-3 w-full text-left group"
      >
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <span className="text-sm font-semibold text-slate-600 capitalize">{label.replace(/_/g, " ") || "Unassigned"}</span>
        <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{people.length}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
            {people.map((p) => (
              <PersonCard key={p.id} person={p} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PeopleGroupedView({ people, groupBy, onEdit, onDelete }) {
  const groups = {};
  people.forEach((p) => {
    const key = p[groupBy] || "Unassigned";
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });

  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });

  return (
    <div>
      {sortedKeys.map((key) => (
        <GroupSection key={key} label={key} people={groups[key]} onEdit={onEdit} onDelete={onDelete} />
      ))}
      {people.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">No people found</p>
      )}
    </div>
  );
}