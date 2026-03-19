import React from "react";
import { AlertTriangle } from "lucide-react";

export default function CriticalMissedBanner({ criticals }) {
  if (!criticals || criticals.length === 0) return null;

  return (
    <div className="bg-red-600 text-white px-4 py-3 space-y-1">
      {criticals.map((c) => (
        <div key={c.id} className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 animate-pulse" />
          <div>
            <p className="text-sm font-black">🚨 CRITICAL MISSED DOSE: {c.title}</p>
            <p className="text-xs opacity-90">
              {c.client} has not received this medication for {Math.floor(c.overdueMins / 60)}h {c.overdueMins % 60}m — scheduled at {c.scheduledTime}
            </p>
            <p className="text-xs font-bold mt-0.5">Record outcome to dismiss this alert.</p>
          </div>
        </div>
      ))}
    </div>
  );
}