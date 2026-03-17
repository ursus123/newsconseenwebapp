import React, { useState, useEffect, useRef, useCallback } from "react";

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN",
  "ORDER BY", "GROUP BY", "HAVING", "LIMIT", "JOIN", "LEFT JOIN", "INNER JOIN",
  "ON", "AS", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX",
  "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM",
  "IS NULL", "IS NOT NULL", "ASC", "DESC",
];

function getWordBefore(text, pos) {
  const slice = text.slice(0, pos);
  const match = slice.match(/[\w.]+$/);
  return match ? match[0] : "";
}

export default function SqlAutocomplete({ sql, cursorPos, allTableNames, allColumns, onSelect, onClose }) {
  const word = getWordBefore(sql, cursorPos).toLowerCase();
  const ref = useRef(null);
  const [selected, setSelected] = useState(0);

  const suggestions = [];
  if (word.length >= 1) {
    // Table names
    allTableNames.forEach((t) => {
      if (t.toLowerCase().startsWith(word)) suggestions.push({ label: t, type: "table" });
    });
    // Column names
    allColumns.forEach((c) => {
      if (c.toLowerCase().startsWith(word) && !suggestions.find((s) => s.label === c))
        suggestions.push({ label: c, type: "column" });
    });
    // Keywords
    SQL_KEYWORDS.forEach((k) => {
      if (k.toLowerCase().startsWith(word) && !suggestions.find((s) => s.label === k))
        suggestions.push({ label: k, type: "keyword" });
    });
  }

  useEffect(() => { setSelected(0); }, [word]);

  const handleKey = useCallback((e) => {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      onSelect(suggestions[selected].label, word.length);
    }
    if (e.key === "Escape") onClose();
  }, [suggestions, selected, onSelect, onClose, word]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [handleKey]);

  if (!suggestions.length || !word) return null;

  const typeColor = { table: "text-violet-400", column: "text-emerald-400", keyword: "text-sky-400" };
  const typeBg = { table: "bg-violet-500/10", column: "bg-emerald-500/10", keyword: "bg-sky-500/10" };

  return (
    <div
      ref={ref}
      className="absolute z-50 bottom-full mb-1 left-0 w-64 bg-slate-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
      style={{ maxHeight: 240 }}
    >
      <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
        {suggestions.slice(0, 12).map((s, i) => (
          <div
            key={s.label}
            onMouseDown={(e) => { e.preventDefault(); onSelect(s.label, word.length); }}
            className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs transition-colors ${
              i === selected ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
            }`}
          >
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${typeBg[s.type]} ${typeColor[s.type]}`}>
              {s.type.toUpperCase()}
            </span>
            <span className="font-mono">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="px-3 py-1 border-t border-white/5 text-[9px] text-slate-600">Tab/Enter to select · Esc to close</div>
    </div>
  );
}