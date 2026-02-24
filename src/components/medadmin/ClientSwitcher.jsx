import React, { useState } from "react";
import { X, User, Search } from "lucide-react";

export default function ClientSwitcher({ people, current, onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const filtered = people.filter((p) =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <p className="text-base font-black text-gray-900">Select Client</p>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="flex-1 bg-transparent text-sm text-gray-700 focus:outline-none"
            />
          </div>
        </div>
        <div className="overflow-y-auto max-h-72 px-5 py-3 space-y-2">
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No clients found</p>
          )}
          {filtered.map((p) => {
            const isActive = current?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-left
                  ${isActive ? "bg-blue-50 border-2 border-blue-200" : "bg-gray-50 border-2 border-transparent hover:bg-gray-100"}`}
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  {p.photo_url
                    ? <img src={p.photo_url} className="w-10 h-10 rounded-full object-cover" alt="" />
                    : <User className="w-5 h-5 text-blue-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{p.first_name} {p.last_name}</p>
                  {p.primary_role && <p className="text-xs text-gray-400 truncate">{p.primary_role}</p>}
                </div>
                {isActive && <span className="text-xs font-bold text-blue-600">Current</span>}
              </button>
            );
          })}
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}