import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import ProductForm from "../components/products/ProductForm";
import BulkImportDialog from "../components/shared/BulkImportDialog";
import {
  PRODUCT_FIELDS,
  PRODUCT_MAPPING_RULES,
  PRODUCT_TEMPLATE_EXAMPLE,
  PRODUCT_TEMPLATE_INSTRUCTIONS,
  validateProduct,
  transformProduct,
} from "@/components/shared/importConfigs";
import SearchFilterBar from "../components/shared/SearchFilterBar";
import BulkActionBar from "../components/shared/BulkActionBar";
import { usePermissions } from "@/components/shared/usePermissions";
import { useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";
import { fuzzyFilter } from "@/components/shared/fuzzySearch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Package, AlertTriangle, Pill, DollarSign } from "lucide-react";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const triggerETL = (entity) => {
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, { method: "POST" }).catch(() => {});
};

const statusColor = (s) => ({ active: "bg-emerald-50 text-emerald-700", discontinued: "bg-slate-100 text-slate-600", out_of_stock: "bg-rose-50 text-rose-700", archived: "bg-slate-100 text-slate-400" }[s] || "bg-slate-100 text-slate-600");
const itemTypeColor = (t) => ({
  physical:             "bg-blue-50 text-blue-700",
  living:               "bg-green-50 text-green-700",
  digital:              "bg-purple-50 text-purple-700",
  service_package:      "bg-amber-50 text-amber-700",
  financial_instrument: "bg-rose-50 text-rose-700",
}[t] || "bg-slate-100 text-slate-500");

const buildColumns = (recalls) => [
  {
    key: "name", label: "Item / Product",
    render: (val, row) => (
      <div>
        <p className="font-medium text-slate-800">{val}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {row.sku && <span className="text-[10px] font-mono text-slate-400">{row.sku}</span>}
          {row.regulatory_status === "controlled" && <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-medium">Controlled</span>}
          {row.regulatory_status === "prescription" && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">Rx</span>}
          {recalls[row.id] && <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-bold animate-pulse">⚠️ RECALL</span>}
        </div>
      </div>
    ),
  },
  { key: "item_type", label: "Type", render: (val) => val ? <Badge className={itemTypeColor(val)}>{val.replace(/_/g, " ")}</Badge> : "—" },
  { key: "category", label: "Category", render: (val) => val ? <Badge className="bg-amber-50 text-amber-700">{val.replace(/_/g, " ")}</Badge> : "—" },
  {
    key: "stock_quantity", label: "Stock",
    render: (v, row) => {
      const qty = v ?? 0; const min = row.min_stock_level ?? 0;
      const max = Math.max(qty, min * 2, 1); const pct = Math.min((qty / max) * 100, 100);
      const low = min > 0 && qty <= min; const out = qty === 0;
      return (
        <div className="min-w-[80px]">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-sm font-semibold ${out ? "text-rose-600" : low ? "text-amber-600" : "text-slate-700"}`}>{qty} {row.unit || ""}</span>
            {low && !out && <span className="text-[10px] text-amber-500">Low</span>}
            {out && <span className="text-[10px] text-rose-500">Out</span>}
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${out ? "bg-rose-400" : low ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      );
    },
  },
  { key: "unit_price", label: "Price", render: (v) => v != null ? <span className="font-medium text-slate-700">${parseFloat(v).toLocaleString()}</span> : "—" },
  { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{(val || "active").replace(/_/g, " ")}</Badge> },
];

const ITEM_TYPE_ALIASES = {
  physical:             ["physical", "product", "goods", "medication", "equipment", "supply", "asset"],
  living:               ["living", "livestock", "crop", "animal"],
  digital:              ["digital", "software", "license"],
  service_package:      ["service_package", "service"],
  financial_instrument: ["financial_instrument"],
};

const TYPE_TABS = [
  { id: "all",                  label: "All Items" },
  { id: "physical",             label: "Physical" },
  { id: "living",               label: "Living" },
  { id: "digital",              label: "Digital" },
  { id: "service_package",      label: "Services" },
  { id: "financial_instrument", label: "Financial" },
  { id: "low_stock",            label: "⚠️ Low Stock" },
];

function StatCard({ icon: Icon, iconClass, label, value }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconClass}`}><Icon className="w-4 h-4" /></div>
      <div><p className="text-xs text-slate-400">{label}</p><p className="text-lg font-bold text-slate-800 leading-tight">{value}</p></div>
    </div>
  );
}

const FILTER_DEFS = [
  { key: "status", label: "All Status", options: [{ value: "active", label: "Active" }, { value: "out_of_stock", label: "Out of Stock" }, { value: "discontinued", label: "Discontinued" }, { value: "archived", label: "Archived" }] },
  { key: "item_type", label: "All Types", options: [{ value: "physical", label: "Physical" }, { value: "living", label: "Living" }, { value: "digital", label: "Digital" }, { value: "service_package", label: "Service Package" }, { value: "financial_instrument", label: "Financial Instrument" }] },
  { key: "category", label: "All Categories", options: [{ value: "electronics", label: "Electronics" }, { value: "food_beverage", label: "Food & Beverage" }, { value: "health_beauty", label: "Health & Beauty" }, { value: "tools_equipment", label: "Tools & Equipment" }, { value: "other", label: "Other" }] },
];

export default function Products() {
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [recalls, setRecalls] = useState({});
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "", item_type: "", category: "" });
  const [selectedIds, setSelectedIds] = useState([]);
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["products"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const companyId = currentUser?.company_id;
  const perms = usePermissions(currentUser);
  const listFn = useEntityListFn(currentUser);
  const withScope = useWithScope(currentUser);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", companyId, currentUser?.email],
    queryFn: () => listFn(base44.entities.Product),
    enabled: currentUser !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    const medications = products.filter((p) => p.item_type === "medication");
    medications.forEach(async (med) => {
      try {
        const res = await fetch(`https://newsconseenwebapp-production.up.railway.app/medications/recalls?name=${encodeURIComponent(med.name)}`);
        const data = await res.json();
        if (data?.has_active_recall) setRecalls((prev) => ({ ...prev, [med.id]: data }));
      } catch {}
    });
  }, [products]);

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Product.create(withScope(d)), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); triggerETL("product"); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Product.update(id, withScope(data)), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); triggerETL("product"); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Product.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setDeleting(null); } });

  const handleArchive = (item) => { updateMut.mutate({ id: item.id, data: { ...item, status: "archived" } }); setFormOpen(false); setEditing(null); };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await base44.entities.Product.delete(id);
    qc.invalidateQueries({ queryKey: ["products"] });
    toast({ title: `${selectedIds.length} items deleted` });
    setSelectedIds([]);
  };

  const lowStockItems = products.filter((p) => p.stock_quantity != null && p.min_stock_level != null && p.stock_quantity <= p.min_stock_level && p.status === "active");
  const totalStockValue = "$" + products.reduce((sum, p) => sum + ((parseFloat(p.stock_quantity) || 0) * (parseFloat(p.cost_price) || 0)), 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

  const tabFiltered = activeTab === "low_stock"
    ? products.filter((p) => p.stock_quantity != null && p.min_stock_level != null && p.stock_quantity <= p.min_stock_level)
    : activeTab === "all" ? products : products.filter((p) => (ITEM_TYPE_ALIASES[activeTab] || [activeTab]).includes(p.item_type));

  const processedProducts = useMemo(() => {
    let list = [...tabFiltered];
    if (search) list = fuzzyFilter(list, search, ["name", "sku", "description", "supplier", "category", "item_type"]);
    if (filters.status) list = list.filter((p) => p.status === filters.status);
    if (filters.item_type) list = list.filter((p) => p.item_type === filters.item_type);
    if (filters.category) list = list.filter((p) => p.category === filters.category);
    return list;
  }, [tabFiltered, search, filters]);

  const visibleTabs = TYPE_TABS.filter((t) => {
    if (t.id === "all") return true;
    if (t.id === "low_stock") return lowStockItems.length > 0;
    return products.some((p) => (ITEM_TYPE_ALIASES[t.id] || [t.id]).includes(p.item_type));
  });

  const tabCount = (tab) => {
    if (tab.id === "all") return products.length;
    if (tab.id === "low_stock") return lowStockItems.length;
    return products.filter((p) => (ITEM_TYPE_ALIASES[tab.id] || [tab.id]).includes(p.item_type)).length;
  };

  const columns = buildColumns(recalls);

  return (
    <div className="space-y-5">
      <PageHeader title="Products & Items" subtitle="Manage inventory, assets, and items"
        onAdd={perms.can_create ? () => { setEditing(null); setFormOpen(true); } : undefined} addLabel="New Item">
        {perms.can_create && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Package} iconClass="bg-slate-100 text-slate-500" label="Total Items" value={products.length} />
        <StatCard icon={AlertTriangle} iconClass={lowStockItems.length > 0 ? "bg-amber-50 text-amber-500" : "bg-slate-100 text-slate-400"} label="Low Stock" value={lowStockItems.length} />
        <StatCard icon={Pill} iconClass="bg-blue-50 text-blue-600" label="Physical Items" value={products.filter((p) => (ITEM_TYPE_ALIASES.physical || []).includes(p.item_type)).length} />
        <StatCard icon={DollarSign} iconClass="bg-emerald-50 text-emerald-600" label="Total Stock Value" value={totalStockValue} />
      </div>

      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-sm text-amber-700"><span className="font-semibold">{lowStockItems.length} item(s)</span> are at or below minimum stock level</p>
          </div>
          <button onClick={() => setActiveTab("low_stock")} className="text-xs font-semibold text-amber-700 hover:underline shrink-0">View all →</button>
        </div>
      )}

      {visibleTabs.length > 1 && (
        <div className="bg-slate-100 rounded-xl p-1 flex flex-wrap gap-1">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${isActive ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
                {tab.label}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"}`}>{tabCount(tab)}</span>
              </button>
            );
          })}
        </div>
      )}

      <SearchFilterBar
        search={search} setSearch={setSearch}
        filters={filters} setFilters={setFilters}
        filterDefs={FILTER_DEFS}
        placeholder="Search by name, SKU, supplier..."
        resultCount={processedProducts.length}
        totalCount={tabFiltered.length}
      />

      <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds([])} onDeleteSelected={perms.can_delete ? handleBulkDelete : undefined} canDelete={perms.can_delete} />

      {!isLoading && products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-100 rounded-2xl">
          <Package className="w-10 h-10 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium mb-1">No products or items yet</p>
          <p className="text-slate-300 text-sm mb-4">Add medications, equipment and supplies to track inventory</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">Add First Item</Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl">Import from Excel</Button>
          </div>
        </div>
      ) : (
        <DataTable columns={columns} data={processedProducts}
          onEdit={perms.can_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
          bulkMode selectedIds={selectedIds} onSelectionChange={setSelectedIds}
        />
      )}

      <ProductForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)}
        onArchive={handleArchive} initialData={editing} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.name} />
      <BulkImportDialog
        entityName="Products"
        fields={PRODUCT_FIELDS}
        mappingRules={PRODUCT_MAPPING_RULES}
        templateFileName="newsconseen_products_import_template.xlsx"
        templateExample={PRODUCT_TEMPLATE_EXAMPLE}
        templateInstructions={PRODUCT_TEMPLATE_INSTRUCTIONS}
        validateRow={validateProduct}
        transformRow={(row) => transformProduct(row, currentUser)}
        entityFetchFn={() => listFn(base44.entities.Product)}
        onImport={async (row) => base44.entities.Product.create({ ...row, company_id: currentUser?.company_id })}
        currentUser={currentUser}
        previewColumns={[
          { label: "Product Name", render: (r) => r.product_name || <span className="text-rose-500">MISSING</span> },
          { label: "Type",         render: (r) => r.item_type    || "—" },
          { label: "Class",        render: (r) => r.item_class   || "—" },
          { label: "UOM",          render: (r) => r.unit_of_measure || "—" },
          { label: "Status",       render: (r) => r.status       || "active" },
        ]}
        requiredField="product_name"
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          qc.invalidateQueries({ queryKey: ["products"] });
          qc.refetchQueries({ queryKey: ["products"] });
        }}
      />
    </div>
  );
}