import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Users, Briefcase, Package, ArrowLeftRight, ClipboardList, Wrench } from "lucide-react";
import StatCard from "../components/dashboard/StatCard";
import RevenueChart from "../components/dashboard/RevenueChart";
import RecentActivity from "../components/dashboard/RecentActivity";

export default function Dashboard() {
  const { data: people = [] } = useQuery({ queryKey: ["people"], queryFn: () => base44.entities.Person.list() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => base44.entities.Client.list() });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => base44.entities.Product.list() });
  const { data: services = [] } = useQuery({ queryKey: ["services"], queryFn: () => base44.entities.Service.list() });
  const { data: transactions = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => base44.entities.Transaction.list("-date", 100) });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => base44.entities.Task.list() });

  const totalIncome = transactions.filter((t) => ["sale", "payment_received"].includes(t.type)).reduce((s, t) => s + (t.amount || 0), 0);
  const totalExpense = transactions.filter((t) => ["purchase", "expense"].includes(t.type)).reduce((s, t) => s + (t.amount || 0), 0);
  const pendingTasks = tasks.filter((t) => t.status === "todo" || t.status === "in_progress").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Business overview at a glance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        <StatCard title="People" value={people.length} icon={Users} color="blue" subtitle="Team members" />
        <StatCard title="Clients" value={clients.length} icon={Briefcase} color="purple" subtitle={`${clients.filter(c => c.status === "active").length} active`} />
        <StatCard title="Products" value={products.length} icon={Package} color="amber" subtitle={`${products.filter(p => (p.stock_quantity || 0) <= (p.min_stock_level || 0)).length} low stock`} />
        <StatCard title="Income" value={`$${totalIncome.toLocaleString()}`} icon={ArrowLeftRight} color="emerald" subtitle="Total revenue" />
        <StatCard title="Expenses" value={`$${totalExpense.toLocaleString()}`} icon={ArrowLeftRight} color="rose" subtitle="Total spending" />
        <StatCard title="Tasks" value={pendingTasks} icon={ClipboardList} color="cyan" subtitle={`${tasks.filter(t => t.status === "completed").length} completed`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <RevenueChart transactions={transactions} />
        </div>
        <RecentActivity transactions={transactions} />
      </div>
    </div>
  );
}