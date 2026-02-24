import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import ProductForm from "../components/products/ProductForm";
import { usePermissions } from "@/components/shared/usePermissions";
import { Badge } from "@/components/ui/badge";

const statusColor = (s) => {
  const map = { active: "bg-emerald-50 text-emerald-700", discontinued: "bg-slate-100 text-slate-600", out_of_stock: "bg-rose-50 text-rose-700", archived: "bg-slate-100 text-slate-400" };
  return map[s] || "bg-slate-100 text-slate-600";
};

const columns = [
  { key: "name", label: "Item / Product", render: (val, row) => (
    <div>
      <p className="font-medium text-slate-800">{val}</p>
      {row.sku && <p className="text-xs text-slate-400">{row.sku}</p>}
    </div>
  )},
  { key: "item_type", label: "Type", render: (val) => val ? <Badge className="bg-purple-50 text-purple-700">{val.replace(/_/g, " ")}</Badge> : "—" },
  { key: "category", label: "Category", render: (val) => val ? <Badge className="bg-amber-50 text-amber-700">{val.replace(/_/g, " ")}</Badge> : "—" },
  { key: "unit_price", label: "Price", render: (v) => v != null ? `$${v.toLocaleString()}` : "—" },
  { key: "stock_quantity", label: "Stock", render: (v, row) => {
    const low = v != null && row.min_stock_level != null && v <= row.min_stock_level;
    return <span className={low ? "text-rose-600 font-semibold" : ""}>{v ?? "—"}</span>;
  }},
  { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{(val || "active").replace(/_/g, " ")}</Badge> },
];

export default function Products() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const companyId = currentUser?.company_id;
  const perms = usePermissions(currentUser);

  const { data: products = [] } = useQuery({
    queryKey: ["products", companyId],
    queryFn: () => isSuperAdmin || !companyId ? base44.entities.Product.list("-created_date") : base44.entities.Product.filter({ company_id: companyId }, "-created_date"),
    enabled: currentUser !== null,
  });

  const withCompany = (d) => companyId && !isSuperAdmin ? { ...d, company_id: companyId } : d;

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Product.create(withCompany(d)), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Product.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Product.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setDeleting(null); } });

  const handleArchive = (item) => {
    updateMut.mutate({ id: item.id, data: { ...item, status: "archived" } });
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader
        title="Products & Items"
        subtitle="Manage inventory, assets, and items"
        onAdd={perms.can_create ? () => { setEditing(null); setFormOpen(true); } : undefined}
        addLabel="New Item"
      />
      <DataTable
        columns={columns}
        data={products}
        searchField="name"
        onEdit={perms.can_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
        onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
      />
      <ProductForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)}
        onArchive={handleArchive}
        initialData={editing}
      />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.name} />
    </div>
  );
}