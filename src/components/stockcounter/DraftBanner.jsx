import React from "react";
import { formatDistanceToNow } from "date-fns";

export default function DraftBanner({ draftInfo, onResume, onDiscard }) {
  const timeAgo = draftInfo?.started_at
    ? formatDistanceToNow(new Date(draftInfo.started_at), { addSuffix: true })
    : "";

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4">
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">📋</span>
            <p className="font-semibold text-orange-800 text-sm">You have an unfinished count session</p>
          </div>
          <p className="text-xs text-orange-700">
            {draftInfo.enterprise || "All enterprises"} — {draftInfo.progress}
          </p>
          {timeAgo && <p className="text-xs text-orange-500 mt-0.5">Started {timeAgo}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onDiscard}
            className="px-4 py-2 border border-orange-300 text-orange-700 rounded-xl text-sm font-semibold hover:bg-orange-100 transition-colors"
          >
            Discard
          </button>
          <button
            onClick={onResume}
            className="px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-bold hover:bg-orange-700 transition-colors"
          >
            Resume Count
          </button>
        </div>
      </div>
    </div>
  );
}