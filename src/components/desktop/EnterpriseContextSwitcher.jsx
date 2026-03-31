import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

const STORAGE_KEY = "active_enterprise_id";

export default function EnterpriseContextSwitcher({ isLight, currentUser }) {
  const [enterprises, setEnterprises] = useState([]);
  const [activeId, setActiveId] = useState(() => localStorage.getItem(STORAGE_KEY) || null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!currentUser) return;
    const filters = { status: "active" };
    if (currentUser.company_id) filters.company_id = currentUser.company_id;
    base44.entities.Enterprise.filter(filters)
      .then(list => {
        setEnterprises(list);
        // If no active enterprise is set yet, default to first
        if (!localStorage.getItem(STORAGE_KEY) && list.length > 0) {
          setActiveId(list[0].id);
          localStorage.setItem(STORAGE_KEY, list[0].id);
        }
      })
      .catch(() => {});
  }, [currentUser]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (id) => {
    setActiveId(id);
    localStorage.setItem(STORAGE_KEY, id);
    setOpen(false);
    window.dispatchEvent(new CustomEvent("enterprise-context-change", { detail: { enterpriseId: id } }));
  };

  const active = enterprises.find(e => e.id === activeId);
  const label = active?.enterprise_name || active?.short_name || "All Enterprises";

  const textColor = isLight ? "#374151" : "#e2e8f0";
  const mutedColor = isLight ? "#6b7280" : "#94a3b8";
  const bg = isLight ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.08)";
  const border = isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.12)";
  const dropdownBg = isLight ? "rgba(255,255,255,0.97)" : "rgba(8,15,30,0.97)";

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "3px 10px", borderRadius: 8,
          background: bg, border,
          backdropFilter: "blur(8px)",
          cursor: "pointer", color: textColor,
          fontSize: 12, fontWeight: 500,
          maxWidth: 160, overflow: "hidden",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
          {label.length > 20 ? label.slice(0, 20) + "…" : label}
        </span>
        <span style={{ color: mutedColor, fontSize: 10 }}>▾</span>
      </button>

      {open && enterprises.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0,
          background: dropdownBg,
          border: isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10, overflow: "hidden",
          boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
          backdropFilter: "blur(20px)",
          minWidth: 200, maxHeight: 280, overflowY: "auto",
          zIndex: 99999,
        }}>
          {enterprises.map(e => (
            <button
              key={e.id}
              onClick={() => select(e.id)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 14px", background: "none", border: "none",
                color: e.id === activeId ? (isLight ? "#059669" : "#34d399") : textColor,
                fontWeight: e.id === activeId ? 600 : 400,
                fontSize: 12, cursor: "pointer",
              }}
              onMouseEnter={ev => ev.currentTarget.style.background = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.07)"}
              onMouseLeave={ev => ev.currentTarget.style.background = "none"}
            >
              {e.enterprise_name || e.short_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}