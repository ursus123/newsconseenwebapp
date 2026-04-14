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

export default function ProductsAnalytics({ products = [], currentUser }) {
  const [open, setOpen] = useState(false);
  const d = useMemo(() => {
    const now = new Date();
    const stockBuckets = [
      {range:"0 (Out)",count:products.filter(p=>p.stock_quantity!=null&&parseFloat(p.stock_quantity)===0).length},
      {range:"1-10",count:products.filter(p=>p.stock_quantity!=null&&parseFloat(p.stock_quantity)>0&&parseFloat(p.stock_quantity)<=10).length},
      {range:"11-50",count:products.filter(p=>p.stock_quantity!=null&&parseFloat(p.stock_quantity)>10&&parseFloat(p.stock_quantity)<=50).length},
      {range:"51-200",count:products.filter(p=>p.stock_quantity!=null&&parseFloat(p.stock_quantity)>50&&parseFloat(p.stock_quantity)<=200).length},
      {range:"200+",count:products.filter(p=>p.stock_quantity!=null&&parseFloat(p.stock_quantity)>200).length},
    ];
    const lowStock = products.filter(p=>p.stock_quantity!=null&&p.reorder_level!=null&&parseFloat(p.stock_quantity)<=parseFloat(p.reorder_level)).length;
    const expiryBuckets = [
      {status:"Expired",count:products.filter(p=>p.expiry_date&&differenceInDays(new Date(p.expiry_date),now)<0).length},
      {status:"<30d",count:products.filter(p=>p.expiry_date&&differenceInDays(new Date(p.expiry_date),now)>=0&&differenceInDays(new Date(p.expiry_date),now)<30).length},
      {status:"<90d",count:products.filter(p=>p.expiry_date&&differenceInDays(new Date(p.expiry_date),now)>=30&&differenceInDays(new Date(p.expiry_date),now)<90).length},
      {status:"OK",count:products.filter(p=>p.expiry_date&&differenceInDays(new Date(p.expiry_date),now)>=90).length},
      {status:"No Expiry",count:products.filter(p=>!p.expiry_date).length},
    ];
    const classMap = {};
    products.forEach(p => { const list = Array.isArray(p.item_class)?p.item_class:(p.item_class?[p.item_class]:[]); list.forEach(c=>{classMap[c]=(classMap[c]||0)+1;}); });
    const byClass = Object.entries(classMap).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
    return {
      byType:cnt(products,"item_type"), byStatus:cnt(products,"status"),
      byUOM:cnt(products,"unit_of_measure"), byBrand:cnt(products,"item_brand"),
      bySubtype:cnt(products,"item_subtype"), byClass,
      stockBuckets, expiryBuckets, lowStock,
      withExpiry:products.filter(p=>p.expiry_date).length,
      noExpiry:products.filter(p=>!p.expiry_date).length,
      newByMonth:byMonth(products,"created_date"),
      cumul:cumul(products,"created_date"),
    };
  }, [products]);
  if (products.length < 2) return null;
  return (
    <div className="mt-8 border border-slate-200 rounded-2xl overflow-hidden">
      <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
        <span className="text-sm font-bold text-slate-700">Product Analytics ({products.length} records)</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
      </button>
      {open && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ChartCard title="By Item Type" sql={`SELECT item_type, COUNT(*) FROM Product GROUP BY item_type ORDER BY 2 DESC;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><BarChart data={d.byType} margin={{left:-20}}><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" radius={[4,4,0,0]}>{d.byType.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="By Status" sql={`SELECT status, COUNT(*) FROM Product GROUP BY status;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{d.byStatus.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Stock Level Distribution" sql={`SELECT CASE WHEN stock_quantity=0 THEN '0 (Out)' WHEN stock_quantity<=10 THEN '1-10' WHEN stock_quantity<=50 THEN '11-50' WHEN stock_quantity<=200 THEN '51-200' ELSE '200+' END bucket, COUNT(*) FROM Product GROUP BY bucket;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><BarChart data={d.stockBuckets} margin={{left:-20}}><XAxis dataKey="range" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" radius={[4,4,0,0]}>{d.stockBuckets.map((_,i)=><Cell key={i} fill={["#ef4444","#f97316","#f59e0b","#10b981","#3b82f6"][i]}/>)}</Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Expiry Status" sql={`SELECT CASE WHEN expiry_date<NOW() THEN 'Expired' WHEN expiry_date<NOW()+INTERVAL 30 DAY THEN '<30d' WHEN expiry_date<NOW()+INTERVAL 90 DAY THEN '<90d' ELSE 'OK' END s, COUNT(*) FROM Product GROUP BY s;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><BarChart data={d.expiryBuckets} margin={{left:-20}}><XAxis dataKey="status" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" radius={[4,4,0,0]}>{d.expiryBuckets.map((_,i)=><Cell key={i} fill={["#ef4444","#f97316","#f59e0b","#10b981","#94a3b8"][i]||PALETTE[i%10]}/>)}</Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="By Unit of Measure" sql={`SELECT unit_of_measure, COUNT(*) FROM Product GROUP BY unit_of_measure ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><BarChart data={d.byUOM} layout="vertical" margin={{left:0,right:10}}><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={70}/><Tooltip/><Bar dataKey="count" fill="#8b5cf6" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Item Class Distribution" sql={`SELECT item_class, COUNT(*) FROM Product GROUP BY item_class ORDER BY 2 DESC;`} currentUser={currentUser} entity="Products">{d.byClass.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.byClass} layout="vertical" margin={{left:0,right:10}}><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={90}/><Tooltip/><Bar dataKey="count" fill="#06b6d4" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No class data</p>}</ChartCard>
          <ChartCard title="By Brand (Top 10)" sql={`SELECT item_brand, COUNT(*) FROM Product GROUP BY item_brand ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Products">{d.byBrand.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.byBrand} layout="vertical" margin={{left:0,right:10}}><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={80}/><Tooltip/><Bar dataKey="count" fill="#f59e0b" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No brand data</p>}</ChartCard>
          <ChartCard title="Item Subtype" sql={`SELECT item_subtype, COUNT(*) FROM Product GROUP BY item_subtype ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Products">{d.bySubtype.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.bySubtype} layout="vertical" margin={{left:0,right:10}}><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={100}/><Tooltip/><Bar dataKey="count" fill="#6366f1" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No subtype data</p>}</ChartCard>
          <ChartCard title="New Products by Month" sql={`SELECT DATE_TRUNC('month',created_date) m, COUNT(*) FROM Product GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><LineChart data={d.newByMonth} margin={{left:-20}}><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Cumulative Product Count" sql={`SELECT DATE_TRUNC('month',created_date) m, COUNT(*) OVER(ORDER BY DATE_TRUNC('month',created_date)) total FROM Product WHERE created_date IS NOT NULL;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><AreaChart data={d.cumul} margin={{left:-20}}><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Area type="monotone" dataKey="total" stroke="#10b981" fill="#d1fae5"/></AreaChart></ResponsiveContainer></ChartCard>
          <ChartCard title="With Expiry vs Without" sql={`SELECT CASE WHEN expiry_date IS NOT NULL THEN 'Has Expiry' ELSE 'No Expiry' END, COUNT(*) FROM Product GROUP BY 1;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={[{name:"Has Expiry",count:d.withExpiry},{name:"No Expiry",count:d.noExpiry}]} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{[0,1].map(i=><Cell key={i} fill={PALETTE[i]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Low Stock Items" description="Stock at or below reorder level" sql={`SELECT name FROM Product WHERE stock_quantity IS NOT NULL AND reorder_level IS NOT NULL AND stock_quantity<=reorder_level ORDER BY stock_quantity ASC LIMIT 10;`} currentUser={currentUser} entity="Products"><div className="flex items-center justify-center min-h-[180px]"><div className="text-center"><p className="text-4xl font-bold text-rose-600">{d.lowStock}</p><p className="text-sm text-slate-500 mt-1">items at or below reorder level</p></div></div></ChartCard>
          <ChartCard title="Item Type Pie" sql={`SELECT item_type, COUNT(*) FROM Product GROUP BY item_type;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byType} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byType.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Status Pie" sql={`SELECT status, COUNT(*) FROM Product GROUP BY status;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byStatus} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byStatus.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="UOM Pie" sql={`SELECT unit_of_measure, COUNT(*) FROM Product GROUP BY unit_of_measure ORDER BY 2 DESC LIMIT 8;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byUOM.slice(0,8)} cx="50%" cy="50%" innerRadius={30} outerRadius={70} dataKey="count" nameKey="name">{d.byUOM.slice(0,8).map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Class Pie" sql={`SELECT item_class, COUNT(*) FROM Product GROUP BY item_class ORDER BY 2 DESC;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byClass.slice(0,8)} cx="50%" cy="50%" innerRadius={30} outerRadius={70} dataKey="count" nameKey="name">{d.byClass.slice(0,8).map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Stock Buckets Pie" sql={`SELECT CASE WHEN stock_quantity=0 THEN 'Out' WHEN stock_quantity<=10 THEN 'Critical' WHEN stock_quantity<=50 THEN 'Low' ELSE 'Adequate' END bucket, COUNT(*) FROM Product GROUP BY bucket;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.stockBuckets} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="range">{d.stockBuckets.map((_,i)=><Cell key={i} fill={["#ef4444","#f97316","#f59e0b","#10b981","#3b82f6"][i]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Brand Distribution" sql={`SELECT item_brand, COUNT(*) FROM Product GROUP BY item_brand ORDER BY 2 DESC LIMIT 8;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byBrand.slice(0,8)} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byBrand.slice(0,8).map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Expiry Pie" sql={`SELECT CASE WHEN expiry_date<NOW() THEN 'Expired' WHEN expiry_date<NOW()+INTERVAL 30 DAY THEN '<30d' ELSE 'OK' END s, COUNT(*) FROM Product GROUP BY s;`} currentUser={currentUser} entity="Products"><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.expiryBuckets} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="status">{d.expiryBuckets.map((_,i)=><Cell key={i} fill={["#ef4444","#f97316","#f59e0b","#10b981","#94a3b8"][i]||PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
        </div>
      )}
    </div>
  );
}
