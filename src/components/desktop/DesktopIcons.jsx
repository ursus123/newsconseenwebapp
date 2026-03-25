import React, { useState } from "react";
import { DESKTOP_APPS } from "@/desktop/desktopApps";

// Only show a subset on the desktop itself
const DESKTOP_ICON_IDS = [
  "attendance", "people", "enterprises", "inventory",
  "tasks", "transactions", "reports", "location",
  "settings", "applications",
];

export default function DesktopIcons({ onOpenApp }) {
  const [hoveredId, setHoveredId] = useState(null);

  const apps = DESKTOP_APPS.filter(a => DESKTOP_ICON_IDS.includes(a.id));

  return (
    <div className="absolute top-6 left-6 flex flex-col gap-1 z-10">
      {apps.map(app => (
        <button
          key={app.id}
          onDoubleClick={() => onOpenApp(app)}
          onMouseEnter={() => setHoveredId(app.id)}
          onMouseLeave={() => setHoveredId(null)}
          className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl transition-all w-20 group"
          style={{
            background: hoveredId === app.id ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.04)",
            border: hoveredId === app.id ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
          }}
          title={`Double-click to open ${app.name}`}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-lg transition-transform group-hover:scale-110"
            style={{ background: `${app.color}22`, border: `1px solid ${app.color}44` }}
          >
            {app.icon}
          </div>
          <span
            className="text-[11px] text-white text-center leading-tight font-medium drop-shadow"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
          >
            {app.name}
          </span>
        </button>
      ))}
    </div>
  );
}