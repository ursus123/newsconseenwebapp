import React from "react";

export default function SectionSkeleton({ title, rows = 3 }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm animate-pulse">
      <div className="h-5 bg-slate-100 rounded w-48 mb-4" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-10 bg-slate-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}