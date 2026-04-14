import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
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

export default function TasksAnalytics({ tasks = [], currentUser }) {
  const [open, setOpen] = useState(true); // open by default since it's shown in overlay
  const d = useMemo(() => {
    const now = new Date();
    const completed = tasks.filter(t=>t.status==="completed");
    const open_ = tasks.filter(t=>t.status==="open");
    const overdue = tasks.filter(t=>t.due_date&&new Date(t.due_date)<now&&t.status!=="completed"&&t.status!=="cancelled");
    // completion rate by type
    const typeComp = {};
    tasks.forEach(t=>{ if(!typeComp[t.task_type]) typeComp[t.task_type]={total:0,comp:0}; typeComp[t.task_type].total++; if(t.status==="completed") typeComp[t.task_type].comp++; });
    const compByType = Object.entries(typeComp).map(([type,{total,comp}])=>({type:type.length>14?type.slice(0,12)+"\u2026":type,rate:total?Math.round((comp/total)*100):0})).sort((a,b)=>b.rate-a.rate).slice(0,8);
    // outcome
    const outMap = {};
    tasks.forEach(t=>{if(t.outcome){outMap[t.outcome]=(outMap[t.outcome]||0)+1;}});
    const outcomes = Object.entries(outMap).map(([name,count])=>({name,count}));
    // priority × status
    const priSta = {};
    tasks.forEach(t=>{const k=t.priority||"normal"; priSta[k]=(priSta[k]||0)+1;});
    const byPri = Object.entries(priSta).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
    // weekly volume (last 8 weeks)
    const weekly = Array.from({length:8},(_,i)=>{
      const d = new Date(now); d.setDate(d.getDate()-((7-i)*7));
      const d2 = new Date(d); d2.setDate(d2.getDate()+7);
      const key = `W-${8-i}`;
      return {week:key,count:tasks.filter(t=>t.created_date&&new Date(t.created_date)>=d&&new Date(t.created_date)<d2).length};
    });
    // on-time vs overdue completed
    const onTime = completed.filter(t=>t.due_date&&t.updated_date&&new Date(t.updated_date)<=new Date(t.due_date)).length;
    const late = completed.filter(t=>t.due_date&&t.updated_date&&new Date(t.updated_date)>new Date(t.due_date)).length;
    return {
      byType:cnt(tasks,"task_type"), byStatus:cnt(tasks,"status"), byPri,
      compByType, outcomes, overdue:overdue.length,
      byAssignee:cnt(tasks,"assigned_to_name").slice(0,10),
      byEnterprise:cnt(tasks,"enterprise").slice(0,10),
      createdByMonth:byMonth(tasks,"created_date"), weekly,
      backlog:Array.from({length:6},(_,i)=>({month:format(subMonths(now,5-i),"MMM"),open:tasks.filter(t=>t.status==="open"&&t.created_date&&t.created_date<=format(subMonths(now,5-i),"yyyy-MM")+"-31").length})),
      compVsCancelled:[{name:"Completed",count:completed.length},{name:"Cancelled",count:tasks.filter(t=>t.status==="cancelled").length}],
      onTime,late,
      withDue:tasks.filter(t=>t.due_date).length,
      noDue:tasks.filter(t=>!t.due_date).length,
    };
  }, [tasks]);
  if (tasks.length < 2) return null;
  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ChartCard title="By Task Type" sql={`SELECT task_type, COUNT(*) FROM Task GROUP BY task_type ORDER BY 2 DESC;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><BarChart data={d.byType} margin={{left:-20}}><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" radius={[4,4,0,0]}>{d.byType.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Bar></BarChart></ResponsiveContainer></ChartCard>
        <ChartCard title="By Status" sql={`SELECT status, COUNT(*) FROM Task GROUP BY status;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{d.byStatus.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
        <ChartCard title="By Priority" sql={`SELECT priority, COUNT(*) FROM Task GROUP BY priority ORDER BY 2 DESC;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><BarChart data={d.byPri} margin={{left:-20}}><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" radius={[4,4,0,0]}>{d.byPri.map((_,i)=><Cell key={i} fill={["#ef4444","#f97316","#f59e0b","#10b981"][i]||PALETTE[i%10]}/>)}</Bar></BarChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Completion Rate by Type" sql={`SELECT task_type, ROUND(100.0*SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END)/COUNT(*),1) rate FROM Task GROUP BY task_type ORDER BY rate DESC LIMIT 8;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><BarChart data={d.compByType} margin={{left:-20}}><XAxis dataKey="type" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} domain={[0,100]}/><Tooltip formatter={(v)=>`${v}%`}/><Bar dataKey="rate" fill="#10b981" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Overdue Tasks" description="Due date passed, not completed" sql={`SELECT COUNT(*) FROM Task WHERE due_date<NOW() AND status NOT IN ('completed','cancelled');`} currentUser={currentUser} entity="Tasks"><div className="flex items-center justify-center min-h-[180px]"><div className="text-center"><p className="text-5xl font-bold text-rose-600">{d.overdue}</p><p className="text-sm text-slate-500 mt-2">overdue tasks</p></div></div></ChartCard>
        <ChartCard title="Outcome Distribution" sql={`SELECT outcome, COUNT(*) FROM Task GROUP BY outcome ORDER BY 2 DESC;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><BarChart data={d.outcomes} margin={{left:-20}}><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#8b5cf6" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Top Assignees" sql={`SELECT assigned_to_name, COUNT(*) FROM Task GROUP BY assigned_to_name ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Tasks">{d.byAssignee.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.byAssignee} layout="vertical" margin={{left:0,right:10}}><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={90}/><Tooltip/><Bar dataKey="count" fill="#3b82f6" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No assignee data</p>}</ChartCard>
        <ChartCard title="Tasks by Enterprise" sql={`SELECT enterprise, COUNT(*) FROM Task GROUP BY enterprise ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Tasks">{d.byEnterprise.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.byEnterprise} layout="vertical" margin={{left:0,right:10}}><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={90}/><Tooltip/><Bar dataKey="count" fill="#06b6d4" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No enterprise data</p>}</ChartCard>
        <ChartCard title="Created by Month" sql={`SELECT DATE_TRUNC('month',created_date) m, COUNT(*) FROM Task GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><LineChart data={d.createdByMonth} margin={{left:-20}}><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Weekly Task Volume" description="Last 8 weeks" sql={`SELECT DATE_TRUNC('week',created_date) w, COUNT(*) FROM Task GROUP BY 1 ORDER BY 1 DESC LIMIT 8;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><BarChart data={d.weekly} margin={{left:-20}}><XAxis dataKey="week" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#6366f1" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Open Task Backlog" sql={`SELECT DATE_TRUNC('month',created_date) m, COUNT(*) FROM Task WHERE status='open' GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><AreaChart data={d.backlog} margin={{left:-20}}><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Area type="monotone" dataKey="open" stroke="#ef4444" fill="#fee2e2"/></AreaChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Completed vs Cancelled" sql={`SELECT status, COUNT(*) FROM Task WHERE status IN ('completed','cancelled') GROUP BY status;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.compVsCancelled} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{[0,1].map(i=><Cell key={i} fill={["#10b981","#ef4444"][i]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
        <ChartCard title="On-Time vs Late Completed" sql={`SELECT CASE WHEN updated_date<=due_date THEN 'On Time' ELSE 'Late' END, COUNT(*) FROM Task WHERE status='completed' AND due_date IS NOT NULL GROUP BY 1;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={[{name:"On Time",count:d.onTime},{name:"Late",count:d.late}]} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{[0,1].map(i=><Cell key={i} fill={["#10b981","#f97316"][i]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
        <ChartCard title="With vs Without Due Date" sql={`SELECT CASE WHEN due_date IS NOT NULL THEN 'Has Due Date' ELSE 'No Due Date' END, COUNT(*) FROM Task GROUP BY 1;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={[{name:"Has Due Date",count:d.withDue},{name:"No Due Date",count:d.noDue}]} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{[0,1].map(i=><Cell key={i} fill={PALETTE[i]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Priority × Status" sql={`SELECT priority, status, COUNT(*) FROM Task GROUP BY priority, status ORDER BY 1,2;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><BarChart data={d.byPri} margin={{left:-20}}><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#f97316" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Outcome Pie" sql={`SELECT outcome, COUNT(*) FROM Task GROUP BY outcome ORDER BY 2 DESC;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.outcomes} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.outcomes.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Type Pie" sql={`SELECT task_type, COUNT(*) FROM Task GROUP BY task_type ORDER BY 2 DESC;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byType} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byType.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Status Pie" sql={`SELECT status, COUNT(*) FROM Task GROUP BY status;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byStatus} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byStatus.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Assignee Pie" sql={`SELECT assigned_to_name, COUNT(*) FROM Task GROUP BY assigned_to_name ORDER BY 2 DESC LIMIT 8;`} currentUser={currentUser} entity="Tasks"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byAssignee.slice(0,8)} cx="50%" cy="50%" innerRadius={30} outerRadius={70} dataKey="count" nameKey="name">{d.byAssignee.slice(0,8).map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
      </div>
    </div>
  );
}
