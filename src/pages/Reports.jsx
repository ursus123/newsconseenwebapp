import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import EntityForm from "../components/shared/EntityForm";
import DeleteDialog from "../components/shared/DeleteDialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Eye } from "lucide-react";

const reportTypes = [
  { value: "financial", label: "Financial" }, { value: "inventory", label: "Inventory" },
  { value: "staff", label: "Staff" }, { value: "client", label: "Client" },
  { value: "performance", label: "Performance" }, { value: "custom", label: "Custom" },
];

const formFields = [
  { key: "title", label: "Report Title", required: true },
  { key: "type", label: "Type", type: "select", required: true, options: reportTypes },
  { key: "date_range_start", label: "Start Date", type: "date" },
  { key: "date_range_end", label: "End Date", type: "date" },
  { key: "content", label: "Notes / Content", type: "textarea" },
  { key: "status", label: "Status", type: "select", default: "draft", options: [
    { value: "draft", label: "Draft" }, { value: "published", label: "Published" },
  ]},
];

const typeColor = (t) => {
  const map = { financial: "bg-emerald-50 text-emerald-700", inventory: "bg-amber-50 text-amber-700", staff: "bg-blue-50 text-blue-700", client: "bg-purple-50 text-purple-700", performance: "bg-cyan-50 text-cyan-700", custom: "bg-slate-100 text-slate-600" };
  return map[t] || "bg-slate-100 text-slate-600";
};

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export default function Reports() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const qc = useQueryClient();

  React.useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";

  const { data: reports = [] } = useQuery({ queryKey: ["reports"], queryFn: () => base44.entities.Report.list("-created_date") });

  const { data: accessRecord } = useQuery({
    queryKey: ["myAccess", currentUser?.email],
    queryFn: async () => {
      const records = await base44.entities.UserAppAccess.filter({ user_email: currentUser.email });
      return records[0] || null;
    },
    enabled: !!currentUser && !isAdmin,
  });

  // For regular users: only show reports they're assigned to
  const visibleReports = isAdmin
    ? reports
    : reports.filter((r) => accessRecord?.allowed_reports?.includes(r.id));
  const { data: transactions = [] } = useQuery({ queryKey: ["transactions_r"], queryFn: () => base44.entities.Transaction.list("-date", 200) });
  const { data: people = [] } = useQuery({ queryKey: ["people_r"], queryFn: () => base44.entities.Person.list() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients_r"], queryFn: () => base44.entities.Client.list() });

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Report.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Report.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Report.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); setDeleting(null); } });

  // Quick stats for built-in charts
  const expenseByCategory = React.useMemo(() => {
    const cats = {};
    transactions.filter(t => ["purchase", "expense"].includes(t.type)).forEach(t => {
      const cat = t.category || "other";
      cats[cat] = (cats[cat] || 0) + (t.amount || 0);
    });
    return Object.entries(cats).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [transactions]);

  const clientsByIndustry = React.useMemo(() => {
    const ind = {};
    clients.forEach(c => { const i = c.industry || "other"; ind[i] = (ind[i] || 0) + 1; });
    return Object.entries(ind).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [clients]);

  const columns = [
    { key: "title", label: "Title" },
    { key: "type", label: "Type", render: (val) => <Badge className={typeColor(val)}>{(val || "custom").replace(/_/g, " ")}</Badge> },
    { key: "date_range_start", label: "Start", render: (v) => v ? format(new Date(v), "MMM d, yyyy") : "—" },
    { key: "date_range_end", label: "End", render: (v) => v ? format(new Date(v), "MMM d, yyyy") : "—" },
    { key: "status", label: "Status", render: (val) => <Badge className={val === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}>{val || "draft"}</Badge> },
  ];

  return (
    <div>
      <PageHeader title="Reports" subtitle={isAdmin ? "Create and manage business reports" : "Your assigned reports"} onAdd={isAdmin ? () => { setEditing(null); setFormOpen(true); } : undefined} addLabel="Create Report" />

      {/* Quick Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="border border-slate-100 rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Expenses by Category</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenseByCategory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-100 rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Clients by Industry</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56 flex items-center justify-center">
              {clientsByIndustry.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={clientsByIndustry} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                      {clientsByIndustry.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-400">No client data yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <h3 className="text-sm font-semibold text-slate-600 mb-4">Your Reports</h3>
      <DataTable
        columns={columns}
        data={visibleReports}
        searchField="title"
        onEdit={isAdmin ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
        onDelete={isAdmin ? (row) => setDeleting(row) : undefined}
      />
      <EntityForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)} fields={formFields} initialData={editing} title={editing ? "Edit Report" : "Create Report"} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.title} />
    </div>
  );
}