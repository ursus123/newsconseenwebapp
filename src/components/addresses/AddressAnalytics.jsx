import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
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

export default function AddressAnalytics({ addresses = [], currentUser, standalone = false }) {
  const [open, setOpen] = useState(standalone);
  const d = useMemo(() => ({
    byType:cnt(addresses,"address_type"), byStatus:cnt(addresses,"status"),
    byCountry:cnt(addresses,"country"), byCity:cnt(addresses,"city"),
    byRegion:cnt(addresses,"region"),
    withGPS:addresses.filter(a=>a.latitude&&a.longitude).length,
    noGPS:addresses.filter(a=>!a.latitude||!a.longitude).length,
    newByMonth:byMonth(addresses,"created_date"),
    cumul:cumul(addresses,"created_date"),
    activeVsArchived:[{name:"Active",count:addresses.filter(a=>a.status!=="archived").length},{name:"Archived",count:addresses.filter(a=>a.status==="archived").length}],
    withLine2:addresses.filter(a=>a.address_line2).length,
    noLine2:addresses.filter(a=>!a.address_line2).length,
  }), [addresses]);
  if (addresses.length < 2) return null;
  return (
    <div className="mt-8 border border-slate-200 rounded-2xl overflow-hidden">
      {!standalone && <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
        <span className="text-sm font-bold text-slate-700">Address Analytics ({addresses.length} records)</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
      </button>}
      {open && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <CategoryHeader title="Composition" icon="📍" />
          <ChartCard title="By Address Type" sql={`SELECT address_type, COUNT(*) FROM Address GROUP BY address_type ORDER BY 2 DESC;`} currentUser={currentUser} entity="Addresses" tableData={d.byType}><ResponsiveContainer width="100%" height={180}><BarChart data={d.byType} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" radius={[4,4,0,0]}>{d.byType.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="By Status" sql={`SELECT status, COUNT(*) FROM Address GROUP BY status;`} currentUser={currentUser} entity="Addresses" tableData={d.byStatus}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{d.byStatus.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Active vs Archived" sql={`SELECT status, COUNT(*) FROM Address GROUP BY status;`} currentUser={currentUser} entity="Addresses" tableData={d.activeVsArchived}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.activeVsArchived} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{[0,1].map(i=><Cell key={i} fill={["#10b981","#94a3b8"][i]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Type Pie" sql={`SELECT address_type, COUNT(*) FROM Address GROUP BY address_type ORDER BY 2 DESC;`} currentUser={currentUser} entity="Addresses" tableData={d.byType}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byType} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byType.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Address Line 2 Coverage" sql={`SELECT CASE WHEN address_line2 IS NOT NULL AND address_line2!='' THEN 'Full Address' ELSE 'Line 1 Only' END, COUNT(*) FROM Address GROUP BY 1;`} currentUser={currentUser} entity="Addresses" tableData={[{name:"Full Address",count:d.withLine2},{name:"Line 1 Only",count:d.noLine2}]}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={[{name:"Full Address",count:d.withLine2},{name:"Line 1 Only",count:d.noLine2}]} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{[0,1].map(i=><Cell key={i} fill={PALETTE[i]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Operational vs Other Types" sql={`SELECT address_type, COUNT(*) FROM Address GROUP BY address_type ORDER BY 2 DESC;`} currentUser={currentUser} entity="Addresses" tableData={d.byType}><ResponsiveContainer width="100%" height={180}><BarChart data={d.byType} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#14b8a6" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>

          <CategoryHeader title="Geography" icon="🌍" />
          <ChartCard title="By Country" sql={`SELECT country, COUNT(*) FROM Address GROUP BY country ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Addresses" tableData={d.byCountry}><ResponsiveContainer width="100%" height={180}><BarChart data={d.byCountry} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#10b981" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="By City (Top 10)" sql={`SELECT city, COUNT(*) FROM Address GROUP BY city ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Addresses" tableData={d.byCity}>{d.byCity.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.byCity} layout="vertical" margin={{left:0,right:10}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={80}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#3b82f6" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No city data</p>}</ChartCard>
          <ChartCard title="By Region" sql={`SELECT region, COUNT(*) FROM Address GROUP BY region ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Addresses" tableData={d.byRegion}><ResponsiveContainer width="100%" height={180}><BarChart data={d.byRegion} layout="vertical" margin={{left:0,right:10}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={80}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#8b5cf6" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Country Pie" sql={`SELECT country, COUNT(*) FROM Address GROUP BY country ORDER BY 2 DESC LIMIT 8;`} currentUser={currentUser} entity="Addresses" tableData={d.byCountry.slice(0,8)}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byCountry.slice(0,8)} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byCountry.slice(0,8).map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="City Pie" sql={`SELECT city, COUNT(*) FROM Address GROUP BY city ORDER BY 2 DESC LIMIT 8;`} currentUser={currentUser} entity="Addresses" tableData={d.byCity.slice(0,8)}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byCity.slice(0,8)} cx="50%" cy="50%" innerRadius={30} outerRadius={70} dataKey="count" nameKey="name">{d.byCity.slice(0,8).map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Region Pie" sql={`SELECT region, COUNT(*) FROM Address GROUP BY region ORDER BY 2 DESC LIMIT 8;`} currentUser={currentUser} entity="Addresses" tableData={d.byRegion.slice(0,8)}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byRegion.slice(0,8)} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byRegion.slice(0,8).map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>

          <CategoryHeader title="Data Quality & Growth" icon="📊" />
          <ChartCard title="GPS Coverage" description="Geocoded vs missing coordinates" sql={`SELECT CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 'Geocoded' ELSE 'Missing GPS' END, COUNT(*) FROM Address GROUP BY 1;`} currentUser={currentUser} entity="Addresses" tableData={[{name:"Geocoded",count:d.withGPS},{name:"Missing GPS",count:d.noGPS}]}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={[{name:"Geocoded",count:d.withGPS},{name:"Missing GPS",count:d.noGPS}]} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{[0,1].map(i=><Cell key={i} fill={["#10b981","#f59e0b"][i]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="GPS Coverage Bar" sql={`SELECT CASE WHEN latitude IS NOT NULL THEN 'Geocoded' ELSE 'Missing' END, COUNT(*) FROM Address GROUP BY 1;`} currentUser={currentUser} entity="Addresses" tableData={[{name:"Geocoded",count:d.withGPS},{name:"Missing GPS",count:d.noGPS}]}><ResponsiveContainer width="100%" height={180}><BarChart data={[{name:"Geocoded",count:d.withGPS},{name:"Missing GPS",count:d.noGPS}]} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" radius={[4,4,0,0]}>{[0,1].map(i=><Cell key={i} fill={["#10b981","#f59e0b"][i]}/>)}</Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Contact Addresses by City" sql={`SELECT city, COUNT(*) FROM Address WHERE address_type='contact' GROUP BY city ORDER BY 2 DESC LIMIT 8;`} currentUser={currentUser} entity="Addresses" tableData={cnt(addresses.filter(a=>a.address_type==="contact"),"city")}><ResponsiveContainer width="100%" height={180}><BarChart data={cnt(addresses.filter(a=>a.address_type==="contact"),"city")} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#f97316" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="New Addresses by Month" sql={`SELECT DATE_TRUNC('month',created_date) m, COUNT(*) FROM Address GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Addresses" tableData={d.newByMonth}><ResponsiveContainer width="100%" height={180}><LineChart data={d.newByMonth} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Cumulative Addresses" sql={`SELECT DATE_TRUNC('month',created_date) m, COUNT(*) OVER(ORDER BY DATE_TRUNC('month',created_date)) total FROM Address WHERE created_date IS NOT NULL;`} currentUser={currentUser} entity="Addresses" tableData={d.cumul}><ResponsiveContainer width="100%" height={180}><AreaChart data={d.cumul} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Area type="monotone" dataKey="total" stroke="#06b6d4" fill="#cffafe"/></AreaChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Addresses with Full Data" description="Line1 + City + Country + GPS" sql={`SELECT COUNT(*) FROM Address WHERE address_line1 IS NOT NULL AND city IS NOT NULL AND country IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;`} currentUser={currentUser} entity="Addresses" tableData={[{name:"Complete",count:addresses.filter(a=>a.address_line1&&a.city&&a.country&&a.latitude&&a.longitude).length},{name:"Incomplete",count:addresses.length-addresses.filter(a=>a.address_line1&&a.city&&a.country&&a.latitude&&a.longitude).length}]}><div className="flex items-center justify-center min-h-[180px]"><div className="text-center"><p className="text-4xl font-bold text-emerald-600">{addresses.filter(a=>a.address_line1&&a.city&&a.country&&a.latitude&&a.longitude).length}</p><p className="text-sm text-slate-500 mt-1">fully complete addresses</p><p className="text-xs text-slate-400 mt-1">of {addresses.length} total</p></div></div></ChartCard>
          <ChartCard title="Government Addresses by Region" sql={`SELECT region, COUNT(*) FROM Address WHERE address_type='government' GROUP BY region ORDER BY 2 DESC;`} currentUser={currentUser} entity="Addresses" tableData={cnt(addresses.filter(a=>a.address_type==="government"),"region")}><ResponsiveContainer width="100%" height={180}><BarChart data={cnt(addresses.filter(a=>a.address_type==="government"),"region")} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#6366f1" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
        </div>
      )}
    </div>
  );
}
