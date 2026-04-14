import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, LabelList,
} from "recharts";
import { subMonths, format } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import ChartCard from "@/components/shared/ChartCard";

const PALETTE = ["#3b82f6","#10b981","#8b5cf6","#f59e0b","#06b6d4","#ef4444","#6366f1","#14b8a6","#f97316","#ec4899"];
function cnt(arr, key, limit=10) {
  const m = {};
  arr.forEach(r => { const v = (r[key] || "Unknown"); m[v] = (m[v]||0)+1; });
  return Object.entries(m).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,limit);
}
function byMonth(arr, dateKey, months=6) {
  const now = new Date();
  return Array.from({length:months},(_,i)=>{
    const d = subMonths(now, months-1-i);
    const key = format(d,"yyyy-MM");
    return { month: format(d,"MMM"), count: arr.filter(r=>r[dateKey]&&r[dateKey].startsWith(key)).length };
  });
}
function cumul(arr, dateKey, months=6) {
  const now = new Date();
  const sorted = arr.filter(r=>r[dateKey]).map(r=>r[dateKey]).sort();
  return Array.from({length:months},(_,i)=>{
    const d = subMonths(now, months-1-i);
    const key = format(d,"yyyy-MM");
    return { month: format(d,"MMM"), total: sorted.filter(dt=>dt<=key+"-31").length };
  });
}

function CategoryHeader({ title, icon }) {
  return (
    <div className="col-span-full flex items-center gap-2 pt-3 pb-1 border-b border-slate-100 mb-1">
      {icon && <span className="text-sm">{icon}</span>}
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
    </div>
  );
}

export default function EnterprisesAnalytics({ enterprises = [], currentUser, standalone = false }) {
  const [open, setOpen] = useState(standalone);
  const d = useMemo(() => ({
    byType:cnt(enterprises,"enterprise_type"), byTier:cnt(enterprises,"enterprise_tier"),
    byStatus:cnt(enterprises,"status"), byOpStatus:cnt(enterprises,"operating_status"),
    byCountry:cnt(enterprises,"country"), byRegion:cnt(enterprises,"region"),
    byCity:cnt(enterprises,"city"), bySubtype:cnt(enterprises,"enterprise_subtype"),
    bySicDiv:cnt(enterprises,"sic_division"),
    newByMonth:byMonth(enterprises,"created_date"),
    cumul:cumul(enterprises,"created_date"),
    withSite:enterprises.filter(e=>e.website).length,
    withoutSite:enterprises.filter(e=>!e.website).length,
    hqCount:enterprises.filter(e=>e.enterprise_tier==="headquarters").length,
    branchCount:enterprises.filter(e=>e.enterprise_tier==="branch").length,
  }), [enterprises]);
  if (enterprises.length < 2) return null;
  return (
    <div className="mt-8 border border-slate-200 rounded-2xl overflow-hidden">
      {!standalone && <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
        <span className="text-sm font-bold text-slate-700">Enterprise Analytics ({enterprises.length} records)</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
      </button>}
      {open && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <CategoryHeader title="Composition" icon="🏢" />
          <ChartCard title="By Enterprise Type" sql={`SELECT enterprise_type, COUNT(*) FROM Enterprise GROUP BY enterprise_type ORDER BY 2 DESC;`} currentUser={currentUser} entity="Enterprises" tableData={d.byType}><ResponsiveContainer width="100%" height={180}><BarChart data={d.byType} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" radius={[4,4,0,0]}>{d.byType.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="By Tier" sql={`SELECT enterprise_tier, COUNT(*) FROM Enterprise GROUP BY enterprise_tier ORDER BY 2 DESC;`} currentUser={currentUser} entity="Enterprises" tableData={d.byTier}><ResponsiveContainer width="100%" height={180}><BarChart data={d.byTier} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#8b5cf6" radius={[4,4,0,0]}><LabelList dataKey="count" position="top" style={{fontSize:9,fill:"#64748b"}}/></Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="By Status" sql={`SELECT status, COUNT(*) FROM Enterprise GROUP BY status;`} currentUser={currentUser} entity="Enterprises" tableData={d.byStatus}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{d.byStatus.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Operating Status" sql={`SELECT operating_status, COUNT(*) FROM Enterprise GROUP BY operating_status;`} currentUser={currentUser} entity="Enterprises" tableData={d.byOpStatus}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byOpStatus} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{d.byOpStatus.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Enterprise Subtype" sql={`SELECT enterprise_subtype, COUNT(*) FROM Enterprise GROUP BY enterprise_subtype ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Enterprises" tableData={d.bySubtype}>{d.bySubtype.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.bySubtype} layout="vertical" margin={{left:0,right:10}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={100}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#6366f1" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No subtype data</p>}</ChartCard>
          <ChartCard title="HQ vs Branches" sql={`SELECT enterprise_tier, COUNT(*) FROM Enterprise GROUP BY enterprise_tier;`} currentUser={currentUser} entity="Enterprises" tableData={[{name:"HQ",count:d.hqCount},{name:"Branch",count:d.branchCount},{name:"Other",count:enterprises.length-d.hqCount-d.branchCount}]}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={[{name:"HQ",count:d.hqCount},{name:"Branch",count:d.branchCount},{name:"Other",count:enterprises.length-d.hqCount-d.branchCount}]} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{[0,1,2].map(i=><Cell key={i} fill={PALETTE[i]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>

          <CategoryHeader title="Geography" icon="🌍" />
          <ChartCard title="By Country" sql={`SELECT country, COUNT(*) FROM Enterprise GROUP BY country ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Enterprises" tableData={d.byCountry}><ResponsiveContainer width="100%" height={180}><BarChart data={d.byCountry} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#10b981" radius={[4,4,0,0]}><LabelList dataKey="count" position="top" style={{fontSize:9,fill:"#64748b"}}/></Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="By Region" sql={`SELECT region, COUNT(*) FROM Enterprise GROUP BY region ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Enterprises" tableData={d.byRegion}><ResponsiveContainer width="100%" height={180}><BarChart data={d.byRegion} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#06b6d4" radius={[4,4,0,0]}><LabelList dataKey="count" position="top" style={{fontSize:9,fill:"#64748b"}}/></Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="By City (Top 10)" sql={`SELECT city, COUNT(*) FROM Enterprise GROUP BY city ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Enterprises" tableData={d.byCity}>{d.byCity.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.byCity} layout="vertical" margin={{left:0,right:10}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={90}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#f59e0b" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No city data</p>}</ChartCard>

          <CategoryHeader title="Industry Classification" icon="🏭" />
          <ChartCard title="SIC Division" sql={`SELECT sic_division, COUNT(*) FROM Enterprise GROUP BY sic_division ORDER BY 2 DESC;`} currentUser={currentUser} entity="Enterprises" tableData={d.bySicDiv}><ResponsiveContainer width="100%" height={180}><BarChart data={d.bySicDiv} layout="vertical" margin={{left:0,right:10}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={100}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#ec4899" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Website Coverage" sql={`SELECT CASE WHEN website IS NOT NULL AND website!='' THEN 'Has Website' ELSE 'No Website' END, COUNT(*) FROM Enterprise GROUP BY 1;`} currentUser={currentUser} entity="Enterprises" tableData={[{name:"Has Website",count:d.withSite},{name:"No Website",count:d.withoutSite}]}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={[{name:"Has Website",count:d.withSite},{name:"No Website",count:d.withoutSite}]} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{[0,1].map(i=><Cell key={i} fill={PALETTE[i]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Type Pie" sql={`SELECT enterprise_type, COUNT(*) FROM Enterprise GROUP BY enterprise_type;`} currentUser={currentUser} entity="Enterprises" tableData={d.byType}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byType} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byType.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>

          <CategoryHeader title="Growth & Trends" icon="📈" />
          <ChartCard title="New Enterprises by Month" sql={`SELECT DATE_TRUNC('month',created_date) m, COUNT(*) FROM Enterprise GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Enterprises" tableData={d.newByMonth}><ResponsiveContainer width="100%" height={180}><LineChart data={d.newByMonth} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Cumulative Enterprise Count" sql={`SELECT DATE_TRUNC('month',created_date) m, COUNT(*) OVER(ORDER BY DATE_TRUNC('month',created_date)) total FROM Enterprise WHERE created_date IS NOT NULL;`} currentUser={currentUser} entity="Enterprises" tableData={d.cumul}><ResponsiveContainer width="100%" height={180}><AreaChart data={d.cumul} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Area type="monotone" dataKey="total" stroke="#8b5cf6" fill="#ede9fe"/></AreaChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Tier Pie" sql={`SELECT enterprise_tier, COUNT(*) FROM Enterprise GROUP BY enterprise_tier;`} currentUser={currentUser} entity="Enterprises" tableData={d.byTier}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byTier} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byTier.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Country Pie" sql={`SELECT country, COUNT(*) FROM Enterprise GROUP BY country ORDER BY 2 DESC LIMIT 8;`} currentUser={currentUser} entity="Enterprises" tableData={d.byCountry.slice(0,8)}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byCountry.slice(0,8)} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byCountry.slice(0,8).map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Subtype Pie" sql={`SELECT enterprise_subtype, COUNT(*) FROM Enterprise GROUP BY enterprise_subtype ORDER BY 2 DESC LIMIT 8;`} currentUser={currentUser} entity="Enterprises" tableData={d.bySubtype.slice(0,8)}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.bySubtype.slice(0,8)} cx="50%" cy="50%" innerRadius={30} outerRadius={70} dataKey="count" nameKey="name">{d.bySubtype.slice(0,8).map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Status × Type" sql={`SELECT enterprise_type, status, COUNT(*) FROM Enterprise GROUP BY enterprise_type, status ORDER BY 1,2;`} currentUser={currentUser} entity="Enterprises" tableData={d.byType}><ResponsiveContainer width="100%" height={180}><BarChart data={d.byType} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#14b8a6" radius={[4,4,0,0]}><LabelList dataKey="count" position="top" style={{fontSize:9,fill:"#64748b"}}/></Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Region Pie" sql={`SELECT region, COUNT(*) FROM Enterprise GROUP BY region ORDER BY 2 DESC LIMIT 8;`} currentUser={currentUser} entity="Enterprises" tableData={d.byRegion.slice(0,8)}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byRegion.slice(0,8)} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byRegion.slice(0,8).map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Operating Status Trend" sql={`SELECT operating_status, COUNT(*) FROM Enterprise WHERE operating_status IS NOT NULL GROUP BY operating_status ORDER BY 2 DESC;`} currentUser={currentUser} entity="Enterprises" tableData={d.byOpStatus}><ResponsiveContainer width="100%" height={180}><BarChart data={d.byOpStatus} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#f97316" radius={[4,4,0,0]}><LabelList dataKey="count" position="top" style={{fontSize:9,fill:"#64748b"}}/></Bar></BarChart></ResponsiveContainer></ChartCard>
        </div>
      )}
    </div>
  );
}
