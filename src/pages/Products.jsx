import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import EntityForm from "../components/shared/EntityForm";
import DeleteDialog from "../components/shared/DeleteDialog";
import { Badge } from "@/components/ui/badge";

const statusColor = (s) => {
  const map = { active: "bg-emerald-50 text-emerald-700", discontinued: "bg-slate-100 text-slate-600", out_of_stock: "bg-rose-50 text-rose-700" };
  return map[s] || "bg-slate-100 text-slate-600";
};

const categories = [
  { value: "electronics", label: "Electronics" }, { value: "food_beverage", label: "Food & Beverage" },
  { value: "clothing", label: "Clothing" }, { value: "office_supplies", label: "Office Supplies" },
  { value: "raw_materials", label: "Raw Materials" }, { value: "tools_equipment", label: "Tools & Equipment" },
  { value: "health_beauty", label: "Health & Beauty" }, { value: "household", label: "Household" },
  { value: "other", label: "Other" },
];

const units = [
  { value: "piece", label: "Piece" }, { value: "kg", label: "Kg" }, { value: "liter", label: "Liter" },
  { value: "meter", label: "Meter" }, { value: "box", label: "Box" }, { value: "pack", label: "Pack" },
  { value: "dozen", label: "Dozen" }, { value: "other", label: "Other" },
];

const formFields = [
  { key: "name", label: "Product Name", required: true },
  { key: "sku", label: "SKU" },
  { key: "category", label: "Category", type: "select", options: categories },
  { key: "unit_price", label: "Selling Price ($)", type: "number", required: true },
  { key: "cost_price", label: "Cost Price ($)", type: "number" },
  { key: "stock_quantity", label: "Stock Quantity", type: "number" },
  { key: "min_stock_level", label: "Min Stock Level", type: "number" },
  { key: "unit", label: "Unit", type: "select", default: "piece", options: units },
  { key: "supplier", label: "Supplier" },
  { key: "status", label: "Status", type: "select", default: "active", options: [
    { value: "active", label: "Active" }, { value: "discontinued", label: "Discontinued" }, { value: "out_of_stock", label: "Out of Stock" },
  ]},
  { key: "description", label: "Description", type: "textarea" },
];

const columns = [
  { key: "name", label: "Product" },
  { key: "sku", label: "SKU" },
  { key: "category", label: "Category", badge: true, badgeColor: () => "bg-amber-50 text-amber-700" },
  { key: "unit_price", label: "Price", render: (v) => v ? `$${v.toLocaleString()}` : "—" },
  { key: "stock_quantity", label: "Stock", render: (v, row) => {
    const low = (v || 0) <= (row.min_stock_level || 0) && row.min_stock_level;
    return <span className={low ? "text-rose-600 font-semibold" : ""}>{v ?? 0}</span>;
  }},
  { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{(val || "active").replace(/_/g, " ")}</Badge> },
];

export default function Products() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const qc = useQueryClient();

  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => base44.entities.Product.list("-created_date") });

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Product.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Product.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Product.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setDeleting(null); } });

  return (
    <div>
      <PageHeader title="Products" subtitle="Manage your product inventory" onAdd={() => { setEditing(null); setFormOpen(true); }} addLabel="Add Product" />
      <DataTable columns={columns} data={products} searchField="name" onEdit={(row) => { setEditing(row); setFormOpen(true); }} onDelete={(row) => setDeleting(row)} />
      <EntityForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)} fields={formFields} initialData={editing} title={editing ? "Edit Product" : "Add Product"} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.name} />
    </div>
  );
}