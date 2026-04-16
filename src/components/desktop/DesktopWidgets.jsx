import React, { useState, useEffect, useRef } from "react";
import { X, Cloud, Calendar, Clock, ChevronLeft, ChevronRight, Plus, GripVertical } from "lucide-react";
import { base44 } from "@/api/base44Client";

// ── Live Clock Widget ──────────────────────────────────────────────────────────
function ClockWidget({ isLight, onRemove, onDragStart }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hh = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const ss = time.toLocaleTimeString([], { second: "2-digit" });
  const date = time.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

  return (
    <WidgetShell isLight={isLight} onRemove={onRemove} onDragStart={onDragStart} title="Clock">
      <div className="text-center py-1">
        <div className={`text-3xl font-bold tabular-nums tracking-tight ${isLight ? "text-slate-800" : "text-white"}`}>
          {hh}<span className="text-base opacity-50">:{ss.replace(/^:/, "")}</span>
        </div>
        <div className={`text-xs mt-1 ${isLight ? "text-slate-500" : "text-slate-400"}`}>{date}</div>
      </div>
    </WidgetShell>
  );
}

// ── Mini Calendar Widget ───────────────────────────────────────────────────────
function CalendarWidget({ isLight, onRemove, onDragStart }) {
  const [current, setCurrent] = useState(new Date());
  const today = new Date();

  const year  = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) =>
    i < firstDay ? null : i - firstDay + 1
  );
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = current.toLocaleDateString([], { month: "long", year: "numeric" });
  const isToday = (d) => d && d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <WidgetShell isLight={isLight} onRemove={onRemove} onDragStart={onDragStart} title="Calendar" width={224}>
      <div>
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setCurrent(new Date(year, month - 1, 1))} className="p-0.5 rounded hover:bg-white/10 transition-colors">
            <ChevronLeft className={`w-3.5 h-3.5 ${isLight ? "text-slate-500" : "text-slate-400"}`} />
          </button>
          <span className={`text-xs font-semibold ${isLight ? "text-slate-700" : "text-slate-200"}`}>{monthLabel}</span>
          <button onClick={() => setCurrent(new Date(year, month + 1, 1))} className="p-0.5 rounded hover:bg-white/10 transition-colors">
            <ChevronRight className={`w-3.5 h-3.5 ${isLight ? "text-slate-500" : "text-slate-400"}`} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {["S","M","T","W","T","F","S"].map((d, i) => (
            <div key={i} className={`text-center text-[9px] font-bold uppercase ${isLight ? "text-slate-400" : "text-slate-500"}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((d, i) => (
            <div key={i} className={`text-center text-[10px] w-6 h-6 rounded-full flex items-center justify-center mx-auto transition-colors
              ${!d ? "" : isToday(d)
                ? "bg-emerald-500 text-white font-bold"
                : isLight ? "text-slate-600 hover:bg-slate-200" : "text-slate-300 hover:bg-white/10 cursor-pointer"
              }`}>
              {d || ""}
            </div>
          ))}
        </div>
      </div>
    </WidgetShell>
  );
}

// ── Weather Widget ─────────────────────────────────────────────────────────────
function WeatherWidget({ isLight, onRemove, onDragStart }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
    navigator.geolocation?.getCurrentPosition(async (pos) => {
      try {
        const { latitude: lat, longitude: lon } = pos.coords;
        const url = `${RAILWAY_URL}/open-data/weather?lat=${lat}&lon=${lon}`;
        const res = await fetch(url);
        const data = await res.json();
        const cw = data.current_weather;
        const wmoCodes = {
          0: { label: "Clear", emoji: "☀️" }, 1: { label: "Mainly Clear", emoji: "🌤️" },
          2: { label: "Partly Cloudy", emoji: "⛅" }, 3: { label: "Overcast", emoji: "☁️" },
          45: { label: "Foggy", emoji: "🌫️" }, 48: { label: "Icy Fog", emoji: "🌫️" },
          51: { label: "Light Drizzle", emoji: "🌦️" }, 61: { label: "Rain", emoji: "🌧️" },
          71: { label: "Snow", emoji: "❄️" }, 80: { label: "Showers", emoji: "🌦️" },
          95: { label: "Thunderstorm", emoji: "⛈️" },
        };
        const desc = wmoCodes[cw.weathercode] || { label: "Weather", emoji: "🌡️" };
        setWeather({ temp: Math.round(cw.temperature), wind: Math.round(cw.windspeed), ...desc });
      } catch {
        setError("Failed to load");
      }
      setLoading(false);
    }, () => { setError("Location denied"); setLoading(false); });
  }, []);

  return (
    <WidgetShell isLight={isLight} onRemove={onRemove} onDragStart={onDragStart} title="Weather">
      {loading ? (
        <div className="text-center py-2 text-xs text-slate-400">Loading…</div>
      ) : error ? (
        <div className="text-center py-2 text-xs text-slate-500">{error}</div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="text-3xl leading-none">{weather.emoji}</div>
          <div>
            <div className={`text-2xl font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
              {weather.temp}°C
            </div>
            <div className={`text-[10px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              {weather.label} · {weather.wind} mph
            </div>
          </div>
        </div>
      )}
    </WidgetShell>
  );
}

// ── Shared Widget Shell ────────────────────────────────────────────────────────
function WidgetShell({ children, isLight, onRemove, onDragStart, title, width = 188 }) {
  return (
    <div
      className="rounded-xl overflow-hidden select-none"
      style={{
        width,
        background: isLight ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.72)",
        border: `1px solid ${isLight ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.10)"}`,
        backdropFilter: "blur(16px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
      }}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-1 px-2.5 py-1.5 cursor-grab active:cursor-grabbing ${
          isLight ? "border-b border-black/5" : "border-b border-white/5"
        }`}
        onMouseDown={onDragStart}
      >
        <GripVertical className={`w-3 h-3 ${isLight ? "text-slate-300" : "text-slate-600"}`} />
        <span className={`text-[10px] font-semibold uppercase tracking-widest flex-1 ${isLight ? "text-slate-400" : "text-slate-500"}`}>{title}</span>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={onRemove}
          className={`rounded p-0.5 transition-colors ${isLight ? "hover:bg-black/10 text-slate-400" : "hover:bg-white/10 text-slate-600"}`}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      {/* Body */}
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

// ── Widget type config ─────────────────────────────────────────────────────────
const WIDGET_TYPES = [
  { id: "clock",    label: "Live Clock",    icon: Clock,    Component: ClockWidget },
  { id: "calendar", label: "Calendar",      icon: Calendar, Component: CalendarWidget },
  { id: "weather",  label: "Weather",       icon: Cloud,    Component: WeatherWidget },
];

// ── Main DesktopWidgets Component ──────────────────────────────────────────────
export default function DesktopWidgets({ isLight }) {
  const STORAGE_KEY = "desktop_widgets_v2";

  const [widgets, setWidgets] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [showPicker, setShowPicker] = useState(false);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const addWidget = (typeId) => {
    const already = widgets.find(w => w.typeId === typeId);
    if (already) { setShowPicker(false); return; }
    setWidgets(prev => [...prev, {
      id: Date.now(),
      typeId,
      x: 20 + prev.length * 16,
      y: 60 + prev.length * 16,
    }]);
    setShowPicker(false);
  };

  const removeWidget = (id) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  };

  const handleDragStart = (widgetId, e) => {
    e.preventDefault();
    const widget = widgets.find(w => w.id === widgetId);
    if (!widget) return;
    const ox = e.clientX - widget.x;
    const oy = e.clientY - widget.y;

    const onMove = (me) => {
      setWidgets(prev => prev.map(w =>
        w.id === widgetId ? { ...w, x: me.clientX - ox, y: me.clientY - oy } : w
      ));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <>
      {/* Rendered widgets */}
      {widgets.map(w => {
        const cfg = WIDGET_TYPES.find(t => t.id === w.typeId);
        if (!cfg) return null;
        const { Component } = cfg;
        return (
          <div
            key={w.id}
            className="absolute"
            style={{ left: w.x, top: w.y, zIndex: 5 }}
          >
            <Component
              isLight={isLight}
              onRemove={() => removeWidget(w.id)}
              onDragStart={(e) => handleDragStart(w.id, e)}
            />
          </div>
        );
      })}

      {/* Add widget button */}
      <div className="absolute bottom-16 right-3" style={{ zIndex: 6 }}>
        <button
          onClick={() => setShowPicker(v => !v)}
          className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all ${
            isLight
              ? "bg-white/70 text-slate-600 hover:bg-white border border-black/10"
              : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
          }`}
          title="Add Widget"
        >
          <Plus className="w-4 h-4" />
        </button>

        {showPicker && (
          <div
            className="absolute bottom-10 right-0 rounded-xl overflow-hidden shadow-2xl"
            style={{
              width: 180,
              background: isLight ? "rgba(248,250,252,0.98)" : "rgba(10,18,36,0.97)",
              border: `1px solid ${isLight ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.10)"}`,
              backdropFilter: "blur(20px)",
            }}
          >
            <div className={`px-3 py-2 text-[10px] font-bold uppercase tracking-widest border-b ${
              isLight ? "text-slate-400 border-black/5" : "text-slate-500 border-white/5"
            }`}>Add Widget</div>
            {WIDGET_TYPES.map(t => {
              const Icon = t.icon;
              const active = widgets.some(w => w.typeId === t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => addWidget(t.id)}
                  disabled={active}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left ${
                    active
                      ? isLight ? "text-slate-300 cursor-default" : "text-slate-600 cursor-default"
                      : isLight ? "text-slate-700 hover:bg-black/5" : "text-slate-200 hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                  {active && <span className="ml-auto text-[10px] text-slate-500">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}