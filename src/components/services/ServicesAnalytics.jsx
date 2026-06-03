import React, { useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { subMonths, format } from "date-fns";
import ChartCard from "@/components/shared/ChartCard";

const PALETTE = ["#10b981","#3b82f6","#8b5cf6","#f59e0b","#06b6d4","#ef4444","#6366f1","#14b8a6","#f97316","#ec4899"];

function cnt(arr, key, limit = 10) {
  const m = {};
  arr.forEach(r => { const v = r[key] || "Unknown"; m[v] = (m[v] || 0) + 1; });
  return Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

function byMonth(arr, dateKey, months = 6) {
  const now = new Date();
  return Array.from({ length: months }, (_, i) => {
    const d = subMonths(now, months - 1 - i);
    const key = format(d, "yyyy-MM");
    return { month: format(d, "MMM"), count: arr.filter(r => r[dateKey] && r[dateKey].startsWith(key)).length };
  });
}

function cumul(arr, dateKey, months = 6) {
  const now = new Date();
  const sorted = arr.filter(r => r[dateKey]).map(r => r[dateKey]).sort();
  return Array.from({ length: months }, (_, i) => {
    const d = subMonths(now, months - 1 - i);
    const key = format(d, "yyyy-MM");
    return { month: format(d, "MMM"), total: sorted.filter(dt => dt <= key + "-31").length };
  });
}

function SectionHeader({ title, icon }) {
  return (
    <div className="col-span-full flex items-center gap-2 pt-3 pb-1 border-b border-slate-100 mb-1">
      {icon && <span className="text-sm">{icon}</span>}
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
    </div>
  );
}

export default function ServicesAnalytics({ services = [], currentUser }) {
  const d = useMemo(() => {
    const avgPrice = services.length > 0
      ? (services.reduce((s, r) => s + (parseFloat(r.price) || 0), 0) / services.length).toFixed(2)
      : 0;

    const priceBuckets = [
      { range: "Free", count: services.filter(s => !s.price || parseFloat(s.price) === 0).length },
      { range: "<$50", count: services.filter(s => parseFloat(s.price) > 0 && parseFloat(s.price) < 50).length },
      { range: "$50–200", count: services.filter(s => parseFloat(s.price) >= 50 && parseFloat(s.price) < 200).length },
      { range: "$200–500", count: services.filter(s => parseFloat(s.price) >= 200 && parseFloat(s.price) < 500).length },
      { range: "$500+", count: services.filter(s => parseFloat(s.price) >= 500).length },
    ];

    return {
      byStatus:   cnt(services, "status"),
      byCategory: cnt(services, "category"),
      byType:     cnt(services, "service_type"),
      byPricing:  cnt(services, "pricing_model"),
      byDelivery: cnt(services, "delivery_mode"),
      byScope:    cnt(services, "service_scope"),
      priceBuckets,
      avgPrice,
      withCert:   services.filter(s => s.requires_certification).length,
      noCert:     services.filter(s => !s.requires_certification).length,
      newByMonth: byMonth(services, "created_date"),
      cumulData:  cumul(services, "created_date"),
    };
  }, [services]);

  if (services.length < 1) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <SectionHeader title="Catalogue" icon="🛠️" />

      <ChartCard title="By Status" sql={`SELECT status, COUNT(*) FROM services GROUP BY status;`} currentUser={currentUser} entity="Services" tableData={d.byStatus}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={d.byStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
              {d.byStatus.map((_, i) => <Cell key={i} fill={PALETTE[i % 10]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="By Category" sql={`SELECT category, COUNT(*) FROM services GROUP BY category ORDER BY 2 DESC;`} currentUser={currentUser} entity="Services" tableData={d.byCategory}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={d.byCategory} layout="vertical" margin={{ left: 0, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
            <Tooltip />
            <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="By Service Type" sql={`SELECT service_type, COUNT(*) FROM services GROUP BY service_type;`} currentUser={currentUser} entity="Services" tableData={d.byType}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={d.byType} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {d.byType.map((_, i) => <Cell key={i} fill={PALETTE[i % 10]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <SectionHeader title="Pricing" icon="💰" />

      <ChartCard title="By Pricing Model" sql={`SELECT pricing_model, COUNT(*) FROM services GROUP BY pricing_model;`} currentUser={currentUser} entity="Services" tableData={d.byPricing}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={d.byPricing} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">
              {d.byPricing.map((_, i) => <Cell key={i} fill={PALETTE[i % 10]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Price Range Distribution" sql={`SELECT CASE WHEN price=0 OR price IS NULL THEN 'Free' WHEN price<50 THEN '<$50' WHEN price<200 THEN '$50-200' WHEN price<500 THEN '$200-500' ELSE '$500+' END bucket, COUNT(*) FROM services GROUP BY bucket;`} currentUser={currentUser} entity="Services" tableData={d.priceBuckets}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={d.priceBuckets} margin={{ left: -20 }}>
            <XAxis dataKey="range" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {d.priceBuckets.map((_, i) => <Cell key={i} fill={PALETTE[i % 10]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Average Price" description="Across all services" sql={`SELECT AVG(price) FROM services WHERE price IS NOT NULL;`} currentUser={currentUser} entity="Services" tableData={[{ name: "Avg Price", count: parseFloat(d.avgPrice) }]}>
        <div className="flex items-center justify-center min-h-[180px]">
          <div className="text-center">
            <p className="text-4xl font-bold text-emerald-600">${parseFloat(d.avgPrice).toLocaleString()}</p>
            <p className="text-sm text-slate-500 mt-1">average price across {services.filter(s => s.price).length} priced services</p>
          </div>
        </div>
      </ChartCard>

      <SectionHeader title="Delivery" icon="🚀" />

      <ChartCard title="By Delivery Mode" sql={`SELECT delivery_mode, COUNT(*) FROM services GROUP BY delivery_mode;`} currentUser={currentUser} entity="Services" tableData={d.byDelivery}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={d.byDelivery} layout="vertical" margin={{ left: 0, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
            <Tooltip />
            <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Certification Required" sql={`SELECT requires_certification, COUNT(*) FROM services GROUP BY requires_certification;`} currentUser={currentUser} entity="Services" tableData={[{ name: "Requires Cert", count: d.withCert }, { name: "No Cert", count: d.noCert }]}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={[{ name: "Requires Cert", count: d.withCert }, { name: "No Cert", count: d.noCert }]}
              cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
              <Cell fill="#f59e0b" /><Cell fill="#10b981" />
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <SectionHeader title="Growth" icon="📈" />

      <ChartCard title="New Services by Month" sql={`SELECT DATE_TRUNC('month', created_date) m, COUNT(*) FROM services GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Services" tableData={d.newByMonth}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={d.newByMonth} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Cumulative Service Count" sql={`SELECT DATE_TRUNC('month', created_date) AS month, COUNT(*) AS count FROM services WHERE created_date IS NOT NULL GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Services" tableData={d.cumulData}>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={d.cumulData} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Area type="monotone" dataKey="total" stroke="#10b981" fill="#d1fae5" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Category Pie" sql={`SELECT category, COUNT(*) FROM services GROUP BY category ORDER BY 2 DESC LIMIT 8;`} currentUser={currentUser} entity="Services" tableData={d.byCategory.slice(0, 8)}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={d.byCategory.slice(0, 8)} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">
              {d.byCategory.slice(0, 8).map((_, i) => <Cell key={i} fill={PALETTE[i % 10]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
