import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, ScatterChart, Scatter, FunnelChart, Funnel, LabelList,
} from "recharts";
import { format, subMonths, differenceInDays, parseISO } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import ChartCard from "@/components/shared/ChartCard";

const TYPE_COLORS = {
  person_enterprise: "#3b82f6",
  item_enterprise: "#8b5cf6",
  item_person: "#f59e0b",
  person_service: "#06b6d4",
  enterprise_service: "#6366f1",
  person_address: "#14b8a6",
  enterprise_address: "#10b981",
};

const TYPE_LABELS = {
  person_enterprise: "Person→Enterprise",
  item_enterprise: "Item→Enterprise",
  item_person: "Item→Person",
  person_service: "Person→Service",
  enterprise_service: "Enterprise→Service",
  person_address: "Person→Address",
  enterprise_address: "Enterprise→Address",
};

const PALETTE = ["#3b82f6","#10b981","#8b5cf6","#f59e0b","#06b6d4","#ef4444","#6366f1","#14b8a6","#f97316","#ec4899"];


function CategoryHeader({ title, icon }) {
  return (
    <div className="col-span-full flex items-center gap-2 pt-3 pb-1 border-b border-slate-100 mb-1">
      {icon && <span className="text-sm">{icon}</span>}
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
    </div>
  );
}

export default function RelationshipAnalytics({ relationships, currentUser = null }) {
  const [expanded, setExpanded] = useState(false);

  const data = useMemo(() => {
    const active = relationships.filter(r => r.status !== "archived");
    const pe = relationships.filter(r => r.relationship_type === "person_enterprise");
    const ie = relationships.filter(r => r.relationship_type === "item_enterprise");
    const ip = relationships.filter(r => r.relationship_type === "item_person");
    const ps = relationships.filter(r => r.relationship_type === "person_service");
    const es = relationships.filter(r => r.relationship_type === "enterprise_service");

    // 1. People per enterprise
    const peMap = {};
    pe.filter(r => r.status !== "archived").forEach(r => { if (r.enterprise_name) peMap[r.enterprise_name] = (peMap[r.enterprise_name] || 0) + 1; });
    const peoplePerEnterprise = Object.entries(peMap).map(([name, count]) => ({ name: name.length > 14 ? name.slice(0, 12) + "…" : name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

    // 2. Type breakdown pie
    const typeMap = {};
    relationships.forEach(r => { typeMap[r.relationship_type] = (typeMap[r.relationship_type] || 0) + 1; });
    const typeData = Object.entries(typeMap).map(([type, count]) => ({ name: TYPE_LABELS[type] || type, value: count, type }));

    // 3. New per month
    const monthData = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i);
      const key = format(d, "yyyy-MM");
      return { month: format(d, "MMM"), count: relationships.filter(r => r.start_date && r.start_date.startsWith(key)).length };
    });

    // 4. Active vs Ended vs Archived
    const statusBreak = [
      { name: "Active", value: relationships.filter(r => (r.status || "active") === "active").length, fill: "#10b981" },
      { name: "Ended", value: relationships.filter(r => r.status === "ended").length, fill: "#ef4444" },
      { name: "Archived", value: relationships.filter(r => r.status === "archived").length, fill: "#94a3b8" },
    ];

    // 5. Roles distribution
    const roleMap = {};
    relationships.filter(r => r.role).forEach(r => { roleMap[r.role] = (roleMap[r.role] || 0) + 1; });
    const rolesData = Object.entries(roleMap).map(([role, count]) => ({ role: role.length > 14 ? role.slice(0,12)+"…" : role, count })).sort((a, b) => b.count - a.count).slice(0, 8);

    // 6. Items per enterprise
    const ieMap = {};
    ie.forEach(r => { if (r.enterprise_name) ieMap[r.enterprise_name] = (ieMap[r.enterprise_name] || 0) + 1; });
    const itemsPerEnterprise = Object.entries(ieMap).map(([name, count]) => ({ name: name.length > 14 ? name.slice(0, 12) + "…" : name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

    // 7. Duration histogram (buckets: <30d, 30-90d, 90-180d, 180d-1y, 1y+)
    const now = new Date();
    const buckets = { "<30d": 0, "30-90d": 0, "90-180d": 0, "180d-1y": 0, "1y+": 0 };
    active.filter(r => r.start_date).forEach(r => {
      const days = differenceInDays(now, new Date(r.start_date));
      if (days < 30) buckets["<30d"]++;
      else if (days < 90) buckets["30-90d"]++;
      else if (days < 180) buckets["90-180d"]++;
      else if (days < 365) buckets["180d-1y"]++;
      else buckets["1y+"]++;
    });
    const durationData = Object.entries(buckets).map(([range, count]) => ({ range, count }));

    // 8. Enterprise connectivity (how many unique types each enterprise has)
    const entTypes = {};
    relationships.filter(r => r.enterprise_name).forEach(r => {
      if (!entTypes[r.enterprise_name]) entTypes[r.enterprise_name] = new Set();
      entTypes[r.enterprise_name].add(r.relationship_type);
    });
    const entConnectivity = Object.entries(entTypes).map(([name, types]) => ({ name: name.length > 14 ? name.slice(0, 12) + "…" : name, types: types.size })).sort((a, b) => b.types - a.types).slice(0, 8);

    // 9. Cumulative relationships over time
    const sortedDates = relationships.filter(r => r.start_date).map(r => r.start_date).sort();
    const cumulData = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i);
      const key = format(d, "yyyy-MM");
      const total = sortedDates.filter(dt => dt <= key + "-31").length;
      return { month: format(d, "MMM"), total };
    });

    // 10. Person connectivity (how many enterprises each person is linked to)
    const personEnts = {};
    pe.filter(r => r.person_name && r.enterprise_name).forEach(r => {
      if (!personEnts[r.person_name]) personEnts[r.person_name] = new Set();
      personEnts[r.person_name].add(r.enterprise_name);
    });
    const personConnectivity = Object.entries(personEnts).map(([name, ents]) => ({ name: name.length > 14 ? name.slice(0, 12) + "…" : name, enterprises: ents.size })).sort((a, b) => b.enterprises - a.enterprises).slice(0, 8);

    // 11. Ended relationships by month
    const endedByMonth = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i);
      const key = format(d, "yyyy-MM");
      return { month: format(d, "MMM"), ended: relationships.filter(r => r.status === "ended" && r.end_date && r.end_date.startsWith(key)).length };
    });

    // 12. Services per enterprise
    const svcPerEnt = {};
    es.forEach(r => { if (r.enterprise_name) svcPerEnt[r.enterprise_name] = (svcPerEnt[r.enterprise_name] || 0) + 1; });
    const servicesPerEnterprise = Object.entries(svcPerEnt).map(([name, count]) => ({ name: name.length > 14 ? name.slice(0, 12) + "…" : name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

    // 13. People per service
    const pSvcMap = {};
    ps.forEach(r => { if (r.service_name) pSvcMap[r.service_name] = (pSvcMap[r.service_name] || 0) + 1; });
    const peoplePerService = Object.entries(pSvcMap).map(([name, count]) => ({ name: name.length > 14 ? name.slice(0, 12) + "…" : name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

    // 14. Items per person
    const ipMap = {};
    ip.forEach(r => { if (r.person_name) ipMap[r.person_name] = (ipMap[r.person_name] || 0) + 1; });
    const itemsPerPerson = Object.entries(ipMap).map(([name, count]) => ({ name: name.length > 14 ? name.slice(0, 12) + "…" : name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

    // 15. Churn rate: ended / (active+ended) per type
    const churnByType = Object.keys(TYPE_LABELS).map(type => {
      const total = relationships.filter(r => r.relationship_type === type).length;
      const ended = relationships.filter(r => r.relationship_type === type && r.status === "ended").length;
      return { name: TYPE_LABELS[type], churn: total ? Math.round((ended / total) * 100) : 0 };
    }).filter(d => d.churn > 0 || relationships.some(r => r.relationship_type === Object.keys(TYPE_LABELS).find(k => TYPE_LABELS[k] === d.name)));

    // 16. Start vs End month overlay
    const startEndOverlay = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i);
      const key = format(d, "yyyy-MM");
      return {
        month: format(d, "MMM"),
        started: relationships.filter(r => r.start_date && r.start_date.startsWith(key)).length,
        ended: relationships.filter(r => r.end_date && r.end_date.startsWith(key)).length,
      };
    });

    // 17. Active relationships by type over months
    const typeMonthData = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i);
      const key = format(d, "yyyy-MM");
      const row = { month: format(d, "MMM") };
      Object.keys(TYPE_LABELS).forEach(type => {
        row[type] = relationships.filter(r => r.relationship_type === type && r.start_date && r.start_date <= key + "-31").length;
      });
      return row;
    });

    // 18. Enterprise size tiers (by # of people assigned)
    const tiers = { "Solo (1)": 0, "Small (2-5)": 0, "Medium (6-20)": 0, "Large (21+)": 0 };
    Object.values(peMap).forEach(count => {
      if (count === 1) tiers["Solo (1)"]++;
      else if (count <= 5) tiers["Small (2-5)"]++;
      else if (count <= 20) tiers["Medium (6-20)"]++;
      else tiers["Large (21+)"]++;
    });
    const tierData = Object.entries(tiers).map(([tier, count]) => ({ tier, count }));

    // 19. Relationship health score (active% per enterprise)
    const entHealth = {};
    Object.keys(peMap).forEach(ent => {
      const total = pe.filter(r => r.enterprise_name === ent).length;
      const activeCount = pe.filter(r => r.enterprise_name === ent && (r.status || "active") === "active").length;
      entHealth[ent] = total ? Math.round((activeCount / total) * 100) : 0;
    });
    const healthData = Object.entries(entHealth).map(([name, health]) => ({ name: name.length > 14 ? name.slice(0, 12) + "…" : name, health })).sort((a, b) => b.health - a.health).slice(0, 8);

    // 20. Radar: relationship type coverage per top enterprise
    const topEnts = Object.keys(peMap).sort((a, b) => peMap[b] - peMap[a]).slice(0, 3);
    const radarData = Object.keys(TYPE_LABELS).map(type => {
      const row = { subject: TYPE_LABELS[type] };
      topEnts.forEach(ent => { row[ent] = relationships.filter(r => r.relationship_type === type && (r.enterprise_name === ent || r.person_name === ent)).length; });
      return row;
    });

    return {
      peoplePerEnterprise, typeData, monthData, statusBreak, rolesData,
      itemsPerEnterprise, durationData, entConnectivity, cumulData, personConnectivity,
      endedByMonth, servicesPerEnterprise, peoplePerService, itemsPerPerson,
      churnByType, startEndOverlay, typeMonthData, tierData, healthData,
      radarData, topEnts,
    };
  }, [relationships]);

  if (relationships.length < 3) return null;

  const coreCharts = (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <ChartCard currentUser={currentUser} entity="Relationships" title="People per Enterprise" description="How many people are assigned to each enterprise" sql={`SELECT enterprise_name, COUNT(*) as count\nFROM Relationship\nWHERE relationship_type = 'person_enterprise'\n  AND status != 'archived'\nGROUP BY enterprise_name\nORDER BY count DESC\nLIMIT 8;`} tableData={data.peoplePerEnterprise}>
        {data.peoplePerEnterprise.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.peoplePerEnterprise} margin={{ left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-xs text-slate-400 text-center py-12">No data</p>}
      </ChartCard>

      <ChartCard currentUser={currentUser} entity="Relationships" title="Types Breakdown" description="Distribution of all relationship types" sql={`SELECT relationship_type, COUNT(*) as count\nFROM Relationship\nGROUP BY relationship_type\nORDER BY count DESC;`} tableData={data.typeData}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={data.typeData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" labelLine={false}>
              {data.typeData.map((entry, i) => <Cell key={i} fill={TYPE_COLORS[entry.type] || "#94a3b8"} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {data.typeData.map((d, i) => (
            <span key={i} className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: TYPE_COLORS[d.type] || "#94a3b8" }} />
              {d.name}
            </span>
          ))}
        </div>
      </ChartCard>

      <ChartCard currentUser={currentUser} entity="Relationships" title="New Relationships / Month" description="Relationships created in the last 6 months" sql={`SELECT DATE_FORMAT(start_date, '%Y-%m') as month, COUNT(*) as count\nFROM Relationship\nWHERE start_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)\nGROUP BY month\nORDER BY month ASC;`} tableData={data.monthData}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data.monthData} margin={{ left: -20 }}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );

  const expandedCharts = (
    <div className="space-y-5 mt-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ChartCard currentUser={currentUser} entity="Relationships" title="Status Breakdown" description="Active vs Ended vs Archived relationships" sql={`SELECT status, COUNT(*) as count\nFROM Relationship\nGROUP BY status;`} tableData={data.statusBreak}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.statusBreak} margin={{ left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.statusBreak.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard currentUser={currentUser} entity="Relationships" title="Top Roles" description="Most common roles across all relationships" sql={`SELECT role, COUNT(*) as count\nFROM Relationship\nWHERE role IS NOT NULL AND role != ''\nGROUP BY role\nORDER BY count DESC\nLIMIT 8;`} tableData={data.rolesData}>
          {data.rolesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.rolesData} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="role" tick={{ fontSize: 10 }} width={80} />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400 text-center py-12">No role data</p>}
        </ChartCard>

        <ChartCard currentUser={currentUser} entity="Relationships" title="Items per Enterprise" description="How many items are assigned to each enterprise" sql={`SELECT enterprise_name, COUNT(*) as count\nFROM Relationship\nWHERE relationship_type = 'item_enterprise'\nGROUP BY enterprise_name\nORDER BY count DESC\nLIMIT 8;`} tableData={data.itemsPerEnterprise}>
          {data.itemsPerEnterprise.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.itemsPerEnterprise} margin={{ left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400 text-center py-12">No item→enterprise data</p>}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ChartCard currentUser={currentUser} entity="Relationships" title="Relationship Duration" description="How long active relationships have been running" sql={`SELECT\n  CASE\n    WHEN DATEDIFF(NOW(), start_date) < 30 THEN '<30d'\n    WHEN DATEDIFF(NOW(), start_date) < 90 THEN '30-90d'\n    WHEN DATEDIFF(NOW(), start_date) < 180 THEN '90-180d'\n    WHEN DATEDIFF(NOW(), start_date) < 365 THEN '180d-1y'\n    ELSE '1y+'\n  END as range, COUNT(*) as count\nFROM Relationship\nWHERE status = 'active'\nGROUP BY range;`} tableData={data.durationData}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.durationData} margin={{ left: -20 }}>
              <XAxis dataKey="range" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard currentUser={currentUser} entity="Relationships" title="Enterprise Connectivity" description="Number of unique relationship types per enterprise" sql={`SELECT enterprise_name, COUNT(DISTINCT relationship_type) as types\nFROM Relationship\nWHERE enterprise_name IS NOT NULL\nGROUP BY enterprise_name\nORDER BY types DESC\nLIMIT 8;`} tableData={data.entConnectivity}>
          {data.entConnectivity.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.entConnectivity} margin={{ left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="types" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400 text-center py-12">No data</p>}
        </ChartCard>

        <ChartCard currentUser={currentUser} entity="Relationships" title="Cumulative Growth" description="Total relationships accumulated over 6 months" sql={`SELECT DATE_FORMAT(start_date,'%Y-%m') as month,\n  COUNT(*) OVER (ORDER BY start_date) as total\nFROM Relationship\nORDER BY month;`} tableData={data.cumulData}>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data.cumulData} margin={{ left: -20 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="total" stroke="#10b981" fill="#d1fae5" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ChartCard currentUser={currentUser} entity="Relationships" title="Person Multi-Enterprise" description="People assigned to multiple enterprises" sql={`SELECT person_name, COUNT(DISTINCT enterprise_name) as enterprises\nFROM Relationship\nWHERE relationship_type = 'person_enterprise'\n  AND person_name IS NOT NULL\nGROUP BY person_name\nORDER BY enterprises DESC\nLIMIT 8;`} tableData={data.personConnectivity}>
          {data.personConnectivity.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.personConnectivity} margin={{ left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="enterprises" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400 text-center py-12">No data</p>}
        </ChartCard>

        <ChartCard currentUser={currentUser} entity="Relationships" title="Endings by Month" description="How many relationships ended each month" sql={`SELECT DATE_FORMAT(end_date,'%Y-%m') as month, COUNT(*) as ended\nFROM Relationship\nWHERE status = 'ended' AND end_date IS NOT NULL\n  AND end_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)\nGROUP BY month ORDER BY month;`} tableData={data.endedByMonth}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.endedByMonth} margin={{ left: -20 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="ended" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard currentUser={currentUser} entity="Relationships" title="Services per Enterprise" description="How many services each enterprise has" sql={`SELECT enterprise_name, COUNT(*) as count\nFROM Relationship\nWHERE relationship_type = 'enterprise_service'\nGROUP BY enterprise_name\nORDER BY count DESC LIMIT 8;`} tableData={data.servicesPerEnterprise}>
          {data.servicesPerEnterprise.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.servicesPerEnterprise} margin={{ left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400 text-center py-12">No enterprise→service data</p>}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ChartCard currentUser={currentUser} entity="Relationships" title="People per Service" description="Headcount assigned to each service" sql={`SELECT service_name, COUNT(*) as count\nFROM Relationship\nWHERE relationship_type = 'person_service'\nGROUP BY service_name ORDER BY count DESC LIMIT 8;`} tableData={data.peoplePerService}>
          {data.peoplePerService.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.peoplePerService} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <Tooltip />
                <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400 text-center py-12">No person→service data</p>}
        </ChartCard>

        <ChartCard currentUser={currentUser} entity="Relationships" title="Items per Person" description="Item custody distribution across people" sql={`SELECT person_name, COUNT(*) as count\nFROM Relationship\nWHERE relationship_type = 'item_person'\nGROUP BY person_name ORDER BY count DESC LIMIT 8;`} tableData={data.itemsPerPerson}>
          {data.itemsPerPerson.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.itemsPerPerson} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <Tooltip />
                <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400 text-center py-12">No item→person data</p>}
        </ChartCard>

        <ChartCard currentUser={currentUser} entity="Relationships" title="Churn Rate by Type" description="% of relationships that have ended per type" sql={`SELECT relationship_type,\n  ROUND(100.0 * SUM(CASE WHEN status='ended' THEN 1 ELSE 0 END) / COUNT(*), 1) as churn_pct\nFROM Relationship\nGROUP BY relationship_type;`} tableData={data.churnByType}>
          {data.churnByType.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.churnByType} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} unit="%" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={110} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="churn" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400 text-center py-12">No churn data</p>}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ChartCard currentUser={currentUser} entity="Relationships" title="Started vs Ended / Month" description="Net relationship flows over 6 months" sql={`SELECT DATE_FORMAT(start_date,'%Y-%m') as month,\n  COUNT(*) as started FROM Relationship GROUP BY month\nUNION\nSELECT DATE_FORMAT(end_date,'%Y-%m'), COUNT(*) as ended\nFROM Relationship WHERE status='ended' GROUP BY month;`} tableData={data.startEndOverlay}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.startEndOverlay} margin={{ left: -20 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="started" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="ended" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard currentUser={currentUser} entity="Relationships" title="Enterprise Size Tiers" description="Enterprises classified by assigned headcount" sql={`SELECT\n  CASE\n    WHEN people_count = 1 THEN 'Solo (1)'\n    WHEN people_count <= 5 THEN 'Small (2-5)'\n    WHEN people_count <= 20 THEN 'Medium (6-20)'\n    ELSE 'Large (21+)'\n  END as tier, COUNT(*) as count\nFROM (\n  SELECT enterprise_name, COUNT(*) as people_count\n  FROM Relationship\n  WHERE relationship_type='person_enterprise'\n  GROUP BY enterprise_name\n) t GROUP BY tier;`} tableData={data.tierData}>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data.tierData} cx="50%" cy="50%" outerRadius={70} dataKey="count" nameKey="tier" label={({ tier, count }) => count > 0 ? tier : ""} labelLine={false}>
                {data.tierData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard currentUser={currentUser} entity="Relationships" title="Relationship Health" description="% of active assignments per enterprise" sql={`SELECT enterprise_name,\n  ROUND(100.0 * SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) / COUNT(*), 0) as health\nFROM Relationship\nWHERE relationship_type='person_enterprise'\nGROUP BY enterprise_name ORDER BY health DESC LIMIT 8;`} tableData={data.healthData}>
          {data.healthData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.healthData} margin={{ left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="health" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-400 text-center py-12">No data</p>}
        </ChartCard>
      </div>

      {data.radarData.length > 0 && data.topEnts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard currentUser={currentUser} entity="Relationships" title="Relationship Type Radar — Top Enterprises" description="Coverage of relationship types across top enterprises" sql={`SELECT relationship_type, enterprise_name, COUNT(*) as count\nFROM Relationship\nWHERE enterprise_name IN (SELECT enterprise_name FROM Relationship\n  WHERE relationship_type='person_enterprise'\n  GROUP BY enterprise_name ORDER BY COUNT(*) DESC LIMIT 3)\nGROUP BY relationship_type, enterprise_name;`} tableData={data.radarData}>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={data.radarData} cx="50%" cy="50%" outerRadius={80}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9 }} />
                {data.topEnts.map((ent, i) => (
                  <Radar key={ent} name={ent} dataKey={ent} stroke={PALETTE[i]} fill={PALETTE[i]} fillOpacity={0.15} />
                ))}
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard currentUser={currentUser} entity="Relationships" title="Relationship Type Growth" description="How each relationship type has grown over 6 months" sql={`SELECT DATE_FORMAT(start_date,'%Y-%m') as month, relationship_type, COUNT(*) as count\nFROM Relationship\nWHERE start_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)\nGROUP BY month, relationship_type\nORDER BY month;`} tableData={data.typeMonthData}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.typeMonthData} margin={{ left: -20 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {Object.keys(TYPE_LABELS).map((type, i) => (
                  <Line key={type} type="monotone" dataKey={type} name={TYPE_LABELS[type]} stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.5} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );

  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold text-slate-700 mb-4">Relationship Analytics</h2>
      {coreCharts}

      <div className="mt-5 text-center">
        <button
          onClick={() => setExpanded(e => !e)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-700 transition-all shadow-sm"
        >
          {expanded ? <><ChevronUp className="w-4 h-4" /> Hide Extended Charts</> : <><ChevronDown className="w-4 h-4" /> View More Charts (17 more)</>}
        </button>
      </div>

      {expanded && expandedCharts}
    </div>
  );
}