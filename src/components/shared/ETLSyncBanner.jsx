/**
 * ETLSyncBanner
 *
 * Small inline badge that shows ETL sync status for a single entity.
 * Renders nothing when there is no active sync state.
 *
 * Props:
 *   syncState   — object returned by useTaxonomySync()
 *   entityType  — the entity key to watch: "person", "enterprise", etc.
 *
 * Usage:
 *   <ETLSyncBanner syncState={syncState} entityType="person" />
 */

import React from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function ETLSyncBanner({ syncState, entityType }) {
  const state = syncState?.[entityType];
  if (!state) return null;

  if (state === "syncing") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700 select-none">
        <Loader2 className="w-3 h-3 animate-spin" />
        Syncing analytics…
      </span>
    );
  }

  if (state === "synced") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700 select-none">
        <CheckCircle2 className="w-3 h-3" />
        Analytics synced
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-xs font-medium text-rose-600 select-none">
        <AlertCircle className="w-3 h-3" />
        Sync failed — retries on next save
      </span>
    );
  }

  return null;
}
