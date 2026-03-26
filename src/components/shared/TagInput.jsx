import React, { useState, useRef } from "react";
import { X, Tag } from "lucide-react";

const TAG_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
];

// Deterministic color per tag text
export function tagColor(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export default function TagInput({ value = [], onChange, placeholder = "Add tag…", className = "" }) {
  const [input, setInput] = useState("");
  const inputRef = useRef(null);

  const addTag = (raw) => {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag || value.includes(tag)) { setInput(""); return; }
    onChange([...value, tag]);
    setInput("");
  };

  const removeTag = (tag) => onChange(value.filter((t) => t !== tag));

  const handleKey = (e) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(input); }
    if (e.key === "Backspace" && !input && value.length > 0) removeTag(value[value.length - 1]);
  };

  return (
    <div
      className={`flex flex-wrap gap-1.5 items-center min-h-[38px] border border-slate-200 rounded-xl px-3 py-2 bg-white focus-within:ring-1 focus-within:ring-emerald-400 cursor-text ${className}`}
      onClick={() => inputRef.current?.focus()}
    >
      <Tag className="w-3.5 h-3.5 text-slate-300 shrink-0" />
      {value.map((tag) => (
        <span key={tag} className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${tagColor(tag)}`}>
          {tag}
          <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(tag); }} className="hover:opacity-70">
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => input && addTag(input)}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[80px] text-sm outline-none bg-transparent text-slate-700 placeholder:text-slate-300"
      />
    </div>
  );
}