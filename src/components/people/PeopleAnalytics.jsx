import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, LabelList,
} from "recharts";
import { subMonths, format, differenceInDays } from "date-fns";
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
function wrap(title, children) {
  return (
    <div className="mt-8 border border-slate-200 rounded-2xl overflow-hidden">
      {children}
    </div>
  );
}


function CategoryHeader({ title, icon }) {
  return (
    <div className="col-span-full flex items-center gap-2 pt-3 pb-1 border-b border-slate-100 mb-1">
      {icon && <span className="text-sm">{icon}</span>}
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
    </div>
  );
}

export default function PeopleAnalytics({ people = [], currentUser, standalone = false }) {
  const [open, setOpen] = useState(standalone);
  const d = useMemo(() => {
    const now = new Date();
    const skillMap = {};
    people.forEach(p => {
      const raw = p.skills;
      const list = Array.isArray(raw) ? raw : (typeof raw==="string"&&raw ? raw.split(/[,;]/).map(s=>s.trim()).filter(Boolean) : []);
      list.forEach(s => { skillMap[s]=(skillMap[s]||0)+1; });
    });
    const skills = Object.entries(skillMap).map(([k,v])=>({skill:k.length>16?k.slice(0,14)+"\u2026":k,count:v})).sort((a,b)=>b.count-a.count).slice(0,10);
    const tenureBuckets = [
      {range:"<1yr",count:people.filter(p=>p.start_date&&differenceInDays(now,new Date(p.start_date))<365).length},
      {range:"1-3yr",count:people.filter(p=>p.start_date&&differenceInDays(now,new Date(p.start_date))>=365&&differenceInDays(now,new Date(p.start_date))<1095).length},
      {range:"3-5yr",count:people.filter(p=>p.start_date&&differenceInDays(now,new Date(p.start_date))>=1095&&differenceInDays(now,new Date(p.start_date))<1825).length},
      {range:"5+yr",count:people.filter(p=>p.start_date&&differenceInDays(now,new Date(p.start_date))>=1825).length},
    ];
    const certExp = [
      {status:"Expired",count:people.filter(p=>p.certification_expiry&&differenceInDays(new Date(p.certification_expiry),now)<0).length},
      {status:"<30d",count:people.filter(p=>p.certification_expiry&&differenceInDays(new Date(p.certification_expiry),now)>=0&&differenceInDays(new Date(p.certification_expiry),now)<30).length},
      {status:"<90d",count:people.filter(p=>p.certification_expiry&&differenceInDays(new Date(p.certification_expiry),now)>=30&&differenceInDays(new Date(p.certification_expiry),now)<90).length},
      {status:"OK",count:people.filter(p=>p.certification_expiry&&differenceInDays(new Date(p.certification_expiry),now)>=90).length},
      {status:"No Cert",count:people.filter(p=>!p.certification_expiry).length},
    ];
    const hD = byMonth(people,"start_date").map((h,i)=>({...h,departed:people.filter(p=>p.end_date&&p.end_date.startsWith(format(subMonths(new Date(),5-i),"yyyy-MM"))).length}));
    return {
      byType:cnt(people,"person_type"), byStatus:cnt(people,"status"), byEngagement:cnt(people,"engagement_model"),
      byGender:cnt(people,"gender"), byAvail:cnt(people.filter(p=>p.status!=="inactive"),"availability_status"),
      byCountry:cnt(people,"country"), byRole:cnt(people,"primary_role"), byPayment:cnt(people,"payment_type"),
      bySubtype:cnt(people,"person_subtype"), skills, tenureBuckets, certExp,
      hires:byMonth(people,"start_date"), hD, cumul:cumul(people,"start_date"),
      rateDist:[
        {range:"0-3k",count:people.filter(p=>p.cost_rate&&parseFloat(p.cost_rate)<3000).length},
        {range:"3-6k",count:people.filter(p=>p.cost_rate&&parseFloat(p.cost_rate)>=3000&&parseFloat(p.cost_rate)<6000).length},
        {range:"6-10k",count:people.filter(p=>p.cost_rate&&parseFloat(p.cost_rate)>=6000&&parseFloat(p.cost_rate)<10000).length},
        {range:"10k+",count:people.filter(p=>p.cost_rate&&parseFloat(p.cost_rate)>=10000).length},
      ],
    };
  }, [people]);
  if (people.length < 2) return null;
  return (
    <div className="mt-8 border border-slate-200 rounded-2xl overflow-hidden">
      {!standalone && <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
        <span className="text-sm font-bold text-slate-700">People Analytics ({people.length} records)</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
      </button>}
      {open && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ChartCard title="By Person Type" sql={`SELECT person_type, COUNT(*) as count FROM Person GROUP BY person_type ORDER BY count DESC;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><BarChart data={d.byType} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" radius={[4,4,0,0]}>{d.byType.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="By Status" sql={`SELECT status, COUNT(*) FROM Person GROUP BY status;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" labelLine={false} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>{d.byStatus.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Headcount Trend" sql={`SELECT DATE_TRUNC('month',start_date) as m, COUNT(*) OVER(ORDER BY DATE_TRUNC('month',start_date)) as total FROM Person WHERE start_date IS NOT NULL;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><AreaChart data={d.cumul} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Area type="monotone" dataKey="total" stroke="#3b82f6" fill="#dbeafe"/></AreaChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Hires vs Departures" description="Last 6 months" sql={`SELECT DATE_TRUNC('month',start_date) m, COUNT(*) hires FROM Person GROUP BY 1 ORDER BY 1 DESC LIMIT 6;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><BarChart data={d.hD} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#10b981" radius={[4,4,0,0]} name="Hires"/><Bar dataKey="departed" fill="#ef4444" radius={[4,4,0,0]} name="Departed"/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Tenure Distribution" sql={`SELECT CASE WHEN DATEDIFF(NOW(),start_date)<365 THEN '<1yr' WHEN DATEDIFF(NOW(),start_date)<1095 THEN '1-3yr' WHEN DATEDIFF(NOW(),start_date)<1825 THEN '3-5yr' ELSE '5+yr' END bucket, COUNT(*) FROM Person GROUP BY bucket;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><BarChart data={d.tenureBuckets} margin={{left:-20}}><XAxis dataKey="range" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#8b5cf6" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Certification Expiry" sql={`SELECT CASE WHEN certification_expiry<NOW() THEN 'Expired' WHEN certification_expiry<NOW()+INTERVAL 30 DAY THEN '<30d' WHEN certification_expiry<NOW()+INTERVAL 90 DAY THEN '<90d' ELSE 'OK' END s, COUNT(*) FROM Person GROUP BY s;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><BarChart data={d.certExp} margin={{left:-20}}><XAxis dataKey="status" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" radius={[4,4,0,0]}>{d.certExp.map((_,i)=><Cell key={i} fill={["#ef4444","#f97316","#f59e0b","#10b981","#94a3b8"][i]||PALETTE[i%10]}/>)}</Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Engagement Model" sql={`SELECT engagement_model, COUNT(*) FROM Person GROUP BY engagement_model ORDER BY 2 DESC;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><BarChart data={d.byEngagement} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#f59e0b" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="By Gender" sql={`SELECT gender, COUNT(*) FROM Person GROUP BY gender;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byGender} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{d.byGender.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Availability Status" description="Active staff only" sql={`SELECT availability_status, COUNT(*) FROM Person WHERE status='active' GROUP BY availability_status;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><BarChart data={d.byAvail} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#06b6d4" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Top Skills" sql={`SELECT skill, COUNT(*) FROM Person CROSS JOIN UNNEST(skills) s(skill) GROUP BY skill ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="People">{d.skills.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.skills} layout="vertical" margin={{left:0,right:10}}><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="skill" type="category" tick={{fontSize:10}} width={90}/><Tooltip/><Bar dataKey="count" fill="#10b981" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No skills data yet</p>}</ChartCard>
          <ChartCard title="Person Subtype" sql={`SELECT person_subtype, COUNT(*) FROM Person GROUP BY person_subtype ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="People">{d.bySubtype.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.bySubtype} layout="vertical" margin={{left:0,right:10}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={100}/><Tooltip/><Bar dataKey="count" fill="#6366f1" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No subtype data</p>}</ChartCard>
          <ChartCard title="Cost Rate Distribution" sql={`SELECT CASE WHEN cost_rate<3000 THEN '0-3k' WHEN cost_rate<6000 THEN '3-6k' WHEN cost_rate<10000 THEN '6-10k' ELSE '10k+' END bucket, COUNT(*) FROM Person GROUP BY bucket;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><BarChart data={d.rateDist} margin={{left:-20}}><XAxis dataKey="range" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#f97316" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Payment Type" sql={`SELECT payment_type, COUNT(*) FROM Person GROUP BY payment_type ORDER BY 2 DESC;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byPayment} cx="50%" cy="50%" innerRadius={35} outerRadius={70} dataKey="count" nameKey="name">{d.byPayment.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Top Roles" sql={`SELECT primary_role, COUNT(*) FROM Person GROUP BY primary_role ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="People">{d.byRole.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.byRole} layout="vertical" margin={{left:0,right:10}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={100}/><Tooltip/><Bar dataKey="count" fill="#ec4899" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No role data</p>}</ChartCard>
          <ChartCard title="Top Countries" sql={`SELECT country, COUNT(*) FROM Person GROUP BY country ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><BarChart data={d.byCountry} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#14b8a6" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="New Hires by Month" sql={`SELECT DATE_TRUNC('month',start_date) m, COUNT(*) FROM Person GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><LineChart data={d.hires} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Country Pie" sql={`SELECT country, COUNT(*) FROM Person GROUP BY country ORDER BY 2 DESC LIMIT 8;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byCountry.slice(0,8)} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byCountry.slice(0,8).map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Engagement Model Pie" sql={`SELECT engagement_model, COUNT(*) FROM Person GROUP BY engagement_model;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byEngagement} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byEngagement.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Status Over Time" sql={`SELECT DATE_TRUNC('month',updated_date) m, status, COUNT(*) FROM Person GROUP BY 1,2 ORDER BY 1;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><BarChart data={d.byStatus} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" opacity={0.3}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar cursor="pointer" dataKey="count" fill="#3b82f6" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Subtype Distribution Pie" sql={`SELECT person_subtype, COUNT(*) FROM Person GROUP BY person_subtype ORDER BY 2 DESC;`} currentUser={currentUser} entity="People"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.bySubtype.slice(0,8)} cx="50%" cy="50%" innerRadius={30} outerRadius={70} dataKey="count" nameKey="name">{d.bySubtype.slice(0,8).map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
        </div>
      )}
    </div>
  );
}
