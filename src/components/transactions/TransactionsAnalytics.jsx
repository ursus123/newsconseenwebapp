import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
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

function CategoryHeader({ title, icon }) {
  return (
    <div className="col-span-full flex items-center gap-2 pt-3 pb-1 border-b border-slate-100 mb-1">
      {icon && <span className="text-sm">{icon}</span>}
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</h3>
    </div>
  );
}

export default function TransactionsAnalytics({ transactions = [], currentUser, standalone = false }) {
  const [open, setOpen] = useState(standalone);
  const d = useMemo(() => {
    const now = new Date();
    const income = transactions.filter(t=>t.transaction_type==="sale_service"||t.transaction_type==="product_sale"||t.transaction_type==="service_fee");
    const expenses = transactions.filter(t=>t.transaction_type==="expense"||t.transaction_type==="payroll"||t.transaction_type==="contractor_payment"||t.transaction_type==="utility_expense"||t.transaction_type==="supply_purchase");
    const revenueByMonth = Array.from({length:6},(_,i)=>{ const dt=subMonths(now,5-i); const key=format(dt,"yyyy-MM"); return {month:format(dt,"MMM"),revenue:income.filter(t=>t.date&&t.date.startsWith(key)).reduce((s,t)=>s+(parseFloat(t.amount)||0),0)}; });
    const expenseByMonth = Array.from({length:6},(_,i)=>{ const dt=subMonths(now,5-i); const key=format(dt,"yyyy-MM"); return {month:format(dt,"MMM"),expense:expenses.filter(t=>t.date&&t.date.startsWith(key)).reduce((s,t)=>s+(parseFloat(t.amount)||0),0)}; });
    const pnlByMonth = revenueByMonth.map((r,i)=>({month:r.month,revenue:r.revenue,expense:expenseByMonth[i].expense,net:r.revenue-expenseByMonth[i].expense}));
    const cumulRev = revenueByMonth.reduce((acc,r,i)=>{acc.push({month:r.month,total:(acc[i-1]?.total||0)+r.revenue});return acc;},[]);
    const cpMap = {};
    transactions.filter(t=>t.counterparty||t.primary_person).forEach(t=>{ const k=t.counterparty||t.primary_person; cpMap[k]=(cpMap[k]||0)+(parseFloat(t.amount)||0); });
    const topCP = Object.entries(cpMap).map(([name,total])=>({name:name.length>16?name.slice(0,14)+"\u2026":name,total:Math.round(total)})).sort((a,b)=>b.total-a.total).slice(0,10);
    const outstanding = transactions.filter(t=>(t.payment_status==="unpaid"||t.payment_status==="partial")&&t.amount).reduce((s,t)=>s+(parseFloat(t.amount)||0)-(parseFloat(t.amount_paid)||0),0);
    const overdue = transactions.filter(t=>t.due_date&&new Date(t.due_date)<now&&t.payment_status!=="paid").length;
    const incomeVsExpense = [{name:"Income",count:income.length,amount:income.reduce((s,t)=>s+(parseFloat(t.amount)||0),0)},{name:"Expense",count:expenses.length,amount:expenses.reduce((s,t)=>s+(parseFloat(t.amount)||0),0)}];
    return {
      byType:cnt(transactions,"transaction_type"), byPayStatus:cnt(transactions,"payment_status"),
      byStatus:cnt(transactions,"status"), byMethod:cnt(transactions,"payment_method"),
      byEnterprise:cnt(transactions,"enterprise").slice(0,10),
      byPerson:cnt(transactions,"primary_person").slice(0,10),
      revenueByMonth, expenseByMonth, pnlByMonth, cumulRev, topCP,
      outstanding:Math.round(outstanding), overdue,
      volumeByMonth:byMonth(transactions,"date"),
      incomeVsExpense,
    };
  }, [transactions]);
  if (transactions.length < 2) return null;
  return (
    <div className="mt-8 border border-slate-200 rounded-2xl overflow-hidden">
      {!standalone && <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
        <span className="text-sm font-bold text-slate-700">Transaction Analytics ({transactions.length} records)</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
      </button>}
      {open && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <CategoryHeader title="Revenue & P&L" icon="💰" />
          <ChartCard title="Revenue by Month" sql={`SELECT DATE_TRUNC('month',date) m, SUM(amount) FROM Transaction WHERE transaction_type IN ('sale_service','product_sale','service_fee') GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Transactions" tableData={d.revenueByMonth}><ResponsiveContainer width="100%" height={180}><BarChart data={d.revenueByMonth} margin={{left:-10}}><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={(v)=>v.toLocaleString()}/><Bar dataKey="revenue" fill="#10b981" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Expenses by Month" sql={`SELECT DATE_TRUNC('month',date) m, SUM(amount) FROM Transaction WHERE transaction_type='expense' GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Transactions" tableData={d.expenseByMonth}><ResponsiveContainer width="100%" height={180}><BarChart data={d.expenseByMonth} margin={{left:-10}}><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={(v)=>v.toLocaleString()}/><Bar dataKey="expense" fill="#ef4444" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="P&L by Month" description="Revenue minus Expenses" sql={`SELECT DATE_TRUNC('month',date) m, SUM(CASE WHEN transaction_type IN ('sale_service') THEN amount ELSE -amount END) net FROM Transaction GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Transactions" tableData={d.pnlByMonth}><ResponsiveContainer width="100%" height={180}><BarChart data={d.pnlByMonth} margin={{left:-10}}><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={(v)=>v.toLocaleString()}/><Bar dataKey="net" radius={[4,4,0,0]}>{d.pnlByMonth.map((e,i)=><Cell key={i} fill={e.net>=0?"#10b981":"#ef4444"}/>)}</Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Cumulative Revenue" sql={`SELECT DATE_TRUNC('month',date) m, SUM(SUM(amount)) OVER(ORDER BY DATE_TRUNC('month',date)) total FROM Transaction WHERE transaction_type IN ('sale_service','product_sale') GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Transactions" tableData={d.cumulRev}><ResponsiveContainer width="100%" height={180}><AreaChart data={d.cumulRev} margin={{left:-10}}><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={(v)=>v.toLocaleString()}/><Area type="monotone" dataKey="total" stroke="#10b981" fill="#d1fae5"/></AreaChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Revenue vs Expense Overlay" sql={`SELECT DATE_TRUNC('month',date) m, SUM(CASE WHEN transaction_type IN ('sale_service') THEN amount ELSE 0 END) rev, SUM(CASE WHEN transaction_type='expense' THEN amount ELSE 0 END) exp FROM Transaction GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Transactions" tableData={d.pnlByMonth}><ResponsiveContainer width="100%" height={180}><BarChart data={d.pnlByMonth} margin={{left:-10}}><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={(v)=>v.toLocaleString()}/><Bar dataKey="revenue" fill="#10b981" radius={[4,4,0,0]} name="Revenue"/><Bar dataKey="expense" fill="#ef4444" radius={[4,4,0,0]} name="Expense"/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="P&L Cumulative" sql={`SELECT DATE_TRUNC('month',date) m, SUM(SUM(CASE WHEN transaction_type IN ('sale_service') THEN amount ELSE -amount END)) OVER(ORDER BY DATE_TRUNC('month',date)) pnl FROM Transaction GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Transactions" tableData={d.pnlByMonth}><ResponsiveContainer width="100%" height={180}><AreaChart data={d.pnlByMonth.reduce((acc,r,i)=>{ acc.push({month:r.month,pnl:(acc[i-1]?.pnl||0)+r.net}); return acc; },[])} margin={{left:-10}}><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={(v)=>v.toLocaleString()}/><Area type="monotone" dataKey="pnl" stroke="#3b82f6" fill="#dbeafe"/></AreaChart></ResponsiveContainer></ChartCard>

          <CategoryHeader title="Payment & Status" icon="💳" />
          <ChartCard title="By Transaction Type" sql={`SELECT transaction_type, COUNT(*) FROM Transaction GROUP BY transaction_type ORDER BY 2 DESC;`} currentUser={currentUser} entity="Transactions" tableData={d.byType}><ResponsiveContainer width="100%" height={180}><BarChart data={d.byType} margin={{left:-20}}><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" radius={[4,4,0,0]}>{d.byType.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Bar></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Payment Status" sql={`SELECT payment_status, COUNT(*) FROM Transaction GROUP BY payment_status;`} currentUser={currentUser} entity="Transactions" tableData={d.byPayStatus}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byPayStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{d.byPayStatus.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Outstanding Amount" description="Unpaid + partial invoices" sql={`SELECT SUM(amount-amount_paid) FROM Transaction WHERE payment_status IN ('unpaid','partial');`} currentUser={currentUser} entity="Transactions" tableData={[{name:"Outstanding",count:d.outstanding},{name:"Overdue invoices",count:d.overdue}]}><div className="flex items-center justify-center min-h-[180px]"><div className="text-center"><p className="text-3xl font-bold text-amber-600">{d.outstanding.toLocaleString()}</p><p className="text-sm text-slate-500 mt-1">outstanding (all currencies)</p><p className="text-xs text-rose-500 mt-2">{d.overdue} invoices overdue</p></div></div></ChartCard>
          <ChartCard title="Payment Method" sql={`SELECT payment_method, COUNT(*) FROM Transaction GROUP BY payment_method ORDER BY 2 DESC;`} currentUser={currentUser} entity="Transactions" tableData={d.byMethod}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byMethod} cx="50%" cy="50%" innerRadius={35} outerRadius={70} dataKey="count" nameKey="name">{d.byMethod.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Income vs Expense Count" sql={`SELECT CASE WHEN transaction_type IN ('sale_service','product_sale','service_fee') THEN 'Income' ELSE 'Expense' END, COUNT(*) FROM Transaction GROUP BY 1;`} currentUser={currentUser} entity="Transactions" tableData={d.incomeVsExpense}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.incomeVsExpense} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="count" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>{[0,1].map(i=><Cell key={i} fill={["#10b981","#ef4444"][i]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="By Status" sql={`SELECT status, COUNT(*) FROM Transaction GROUP BY status;`} currentUser={currentUser} entity="Transactions" tableData={d.byStatus}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byStatus} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byStatus.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>

          <CategoryHeader title="Counterparties & Volume" icon="🤝" />
          <ChartCard title="Transaction Volume by Month" sql={`SELECT DATE_TRUNC('month',date) m, COUNT(*) FROM Transaction GROUP BY 1 ORDER BY 1;`} currentUser={currentUser} entity="Transactions" tableData={d.volumeByMonth}><ResponsiveContainer width="100%" height={180}><LineChart data={d.volumeByMonth} margin={{left:-20}}><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Top Counterparties by Amount" sql={`SELECT counterparty, SUM(amount) total FROM Transaction GROUP BY counterparty ORDER BY total DESC LIMIT 10;`} currentUser={currentUser} entity="Transactions" tableData={d.topCP}>{d.topCP.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.topCP} layout="vertical" margin={{left:0,right:10}}><XAxis type="number" tick={{fontSize:10}}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={90}/><Tooltip formatter={(v)=>v.toLocaleString()}/><Bar dataKey="total" fill="#8b5cf6" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No counterparty data</p>}</ChartCard>
          <ChartCard title="By Enterprise" sql={`SELECT enterprise, COUNT(*) FROM Transaction GROUP BY enterprise ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Transactions" tableData={d.byEnterprise}>{d.byEnterprise.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.byEnterprise} layout="vertical" margin={{left:0,right:10}}><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={90}/><Tooltip/><Bar dataKey="count" fill="#06b6d4" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No enterprise data</p>}</ChartCard>
          <ChartCard title="Top People by Transaction Count" sql={`SELECT primary_person, COUNT(*) FROM Transaction GROUP BY primary_person ORDER BY 2 DESC LIMIT 10;`} currentUser={currentUser} entity="Transactions" tableData={d.byPerson}>{d.byPerson.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={d.byPerson} layout="vertical" margin={{left:0,right:10}}><XAxis type="number" tick={{fontSize:10}} allowDecimals={false}/><YAxis dataKey="name" type="category" tick={{fontSize:10}} width={90}/><Tooltip/><Bar dataKey="count" fill="#f97316" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<p className="text-xs text-slate-400 text-center py-16">No person data</p>}</ChartCard>
          <ChartCard title="Type Pie" sql={`SELECT transaction_type, COUNT(*) FROM Transaction GROUP BY transaction_type ORDER BY 2 DESC;`} currentUser={currentUser} entity="Transactions" tableData={d.byType}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byType} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byType.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Payment Status Pie" sql={`SELECT payment_status, COUNT(*) FROM Transaction GROUP BY payment_status;`} currentUser={currentUser} entity="Transactions" tableData={d.byPayStatus}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byPayStatus} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byPayStatus.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Payment Method Pie" sql={`SELECT payment_method, COUNT(*) FROM Transaction GROUP BY payment_method;`} currentUser={currentUser} entity="Transactions" tableData={d.byMethod}><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={d.byMethod} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="name">{d.byMethod.map((_,i)=><Cell key={i} fill={PALETTE[i%10]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
        </div>
      )}
    </div>
  );
}
