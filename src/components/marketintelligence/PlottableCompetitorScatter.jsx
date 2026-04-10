import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const getColor = (rating) => rating >= 4 ? "#10b981" : rating >= 2.5 ? "#f59e0b" : "#ef4444";

const CustomDot = (props) => {
  const { cx, cy, payload } = props;
  return <circle cx={cx} cy={cy} r={6} fill={getColor(payload.y)} opacity={0.8} />;
};

export default function PlottableCompetitorScatter({ competitors, radiusKm }) {
  if (!competitors?.length) return null;

  const data = competitors.map(c => ({
    x: Number(c.distance_km) || 0,
    y: Number(c.rating) || 0,
    name: c.name || "Unknown",
  }));

  return (
    <div>
      <p className="text-xs text-slate-500 mb-1 font-medium">
        Competitor Scatter — Distance vs Rating
      </p>
      <div className="flex gap-3 text-[10px] mb-2">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Rating ≥ 4</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Rating 2.5–4</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Rating &lt; 2.5</span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="x" name="Distance" type="number" domain={[0, (radiusKm || 10) + 2]} tickFormatter={v => `${v}km`} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} label={{ value: "Distance (km)", position: "insideBottom", offset: -12, fontSize: 10, fill: "#94a3b8" }} />
          <YAxis dataKey="y" name="Rating" type="number" domain={[0, 5.5]} tickFormatter={v => `${v}★`} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={36} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => {
            if (!payload?.length) return null;
            const d = payload[0]?.payload;
            return (
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs shadow-md">
                <p className="font-semibold text-slate-800">{d.name}</p>
                <p className="text-slate-500">{d.x} km away{d.y > 0 ? ` · ${d.y}★` : ""}</p>
              </div>
            );
          }} />
          <Scatter data={data} shape={<CustomDot />} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}