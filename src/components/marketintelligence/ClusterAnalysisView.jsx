import React, { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

// Classify competitors based on name/type keywords
function classifyCompetitor(name = "") {
  const n = name.toLowerCase();
  const directKeywords    = ["care", "health", "clinic", "medical", "pharmacy", "hospital", "nursing", "rehab", "therapy", "wellness", "gym", "school", "childcare", "dental", "vet", "restaurant", "hotel"];
  const indirectKeywords  = ["insurance", "benefits", "staffing", "agency", "recruiter", "hr ", "transport", "delivery", "lab ", "diagnostic", "telehealth"];
  const compKeywords      = ["pharmacy", "drug", "supply", "equipment", "training", "education", "consulting", "tech", "software", "app", "platform"];

  if (compKeywords.some(k => n.includes(k))) return "complementary";
  if (indirectKeywords.some(k => n.includes(k))) return "indirect";
  if (directKeywords.some(k => n.includes(k))) return "direct";
  return "direct"; // default
}

const CLUSTER_CONFIG = {
  direct:        { label: "Direct",        color: "#ef4444", desc: "Same service, same market",           icon: "🔴" },
  indirect:      { label: "Indirect",      color: "#f97316", desc: "Adjacent solutions, overlapping needs", icon: "🟠" },
  complementary: { label: "Complementary", color: "#3b82f6", desc: "Partnering potential, non-competing",  icon: "🔵" },
};

const REACH_RADIUS = { direct: 15, indirect: 25, complementary: 35 }; // assumed km reach per type

export default function ClusterAnalysisView({ competitors, radiusKm }) {
  const classified = useMemo(() =>
    competitors.map(c => ({ ...c, cluster: classifyCompetitor(c.name) })),
    [competitors]
  );

  const clusterCounts = useMemo(() => {
    const counts = { direct: 0, indirect: 0, complementary: 0 };
    classified.forEach(c => counts[c.cluster]++);
    return counts;
  }, [classified]);

  const pieData = Object.entries(clusterCounts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: CLUSTER_CONFIG[k].label, value: v, color: CLUSTER_CONFIG[k].color, key: k }));

  // Market footprint = total estimated reach area (π·r²) per cluster vs user's reach
  const userReachArea = Math.PI * Math.pow(radiusKm, 2);
  const footprintData = Object.entries(clusterCounts).map(([k, count]) => {
    const clusterArea = count * Math.PI * Math.pow(REACH_RADIUS[k], 2);
    return {
      name: CLUSTER_CONFIG[k].label,
      competitors: Math.round(clusterArea / 1000), // in km² / 1000 for readability
      yours: Math.round(userReachArea / 1000),
      color: CLUSTER_CONFIG[k].color,
    };
  }).filter(d => d.competitors > 0);

  const CustomPieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-slate-700">{item.name}</p>
        <p style={{ color: item.payload.color }} className="font-bold">{item.value} competitors</p>
        <p className="text-slate-400">{CLUSTER_CONFIG[item.payload.key]?.desc}</p>
      </div>
    );
  };

  const CustomBarTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs space-y-0.5">
        <p className="font-semibold text-slate-700 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.fill }} className="font-medium">{p.name}: {p.value}k km²</p>
        ))}
      </div>
    );
  };

  return (
    <div>
      <p className="text-xs text-slate-500 mb-4">Competitors auto-classified by business type into <strong>Direct</strong>, <strong>Indirect</strong>, and <strong>Complementary</strong> categories.</p>

      {/* Cluster summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {Object.entries(CLUSTER_CONFIG).map(([k, cfg]) => (
          <div key={k} className="rounded-xl border p-3" style={{ borderColor: cfg.color + "40", backgroundColor: cfg.color + "08" }}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm">{cfg.icon}</span>
              <span className="text-xs font-bold text-slate-700">{cfg.label}</span>
            </div>
            <div className="text-2xl font-black" style={{ color: cfg.color }}>{clusterCounts[k]}</div>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{cfg.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Pie chart */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Competitor Composition</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip content={<CustomPieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Market footprint bar */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Estimated Market Footprint vs Your Reach</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={footprintData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => `${v}k`} width={36} />
              <Tooltip content={<CustomBarTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="competitors" name="Competitor Reach" radius={[4, 4, 0, 0]}>
                {footprintData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
              <Bar dataKey="yours" name="Your Reach" fill="#10b981" fillOpacity={0.6} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Competitor list by cluster */}
      <div className="mt-4 space-y-3">
        {Object.entries(CLUSTER_CONFIG).map(([k, cfg]) => {
          const group = classified.filter(c => c.cluster === k);
          if (!group.length) return null;
          return (
            <div key={k}>
              <p className="text-xs font-bold mb-1.5" style={{ color: cfg.color }}>{cfg.icon} {cfg.label} ({group.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {group.map((c, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full border" style={{ borderColor: cfg.color + "50", backgroundColor: cfg.color + "10", color: cfg.color }}>
                    {c.name} · {c.distance_km}km
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}