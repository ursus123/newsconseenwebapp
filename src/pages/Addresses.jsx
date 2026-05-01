import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import AddressForm from "../components/addresses/AddressForm";
import AddressDetailPanel from "../components/addresses/AddressDetailPanel";
import AddressLeafletMap from "../components/addresses/AddressLeafletMap";
import SearchFilterBar from "../components/shared/SearchFilterBar";
import BulkActionBar from "../components/shared/BulkActionBar";
import { Badge } from "@/components/ui/badge";
import { addRecordToQueryCache, createWithScope, useEntityListFn, useWithScope } from "@/components/shared/useDataQuery";
import { fuzzyFilter } from "@/components/shared/fuzzySearch";
import BulkImportDialog from "../components/shared/BulkImportDialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  Upload, MapPin, CheckCircle, Navigation, AlertCircle,
  Map, Loader2, List, BarChart2, X,
} from "lucide-react";
import ExportCSVButton from "@/components/shared/ExportCSVButton";
import DeleteAllDialog from "@/components/shared/DeleteAllDialog";
import SpreadsheetToolbar from "@/components/shared/SpreadsheetToolbar";
import { useSpreadsheet } from "@/hooks/useSpreadsheet";
import AddressAnalytics from "@/components/addresses/AddressAnalytics";
import {
  ADDRESS_FIELDS, ADDRESS_MAPPING_RULES, ADDRESS_TEMPLATE_EXAMPLE,
  ADDRESS_TEMPLATE_INSTRUCTIONS, validateAddress, transformAddress,
} from "@/components/shared/importConfigs";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";
const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, { method: "POST" }).catch(() => {});
function triggerWorkflows(companyId, triggerType, entityData) {
  fetch(`${RAILWAY_URL}/workflows/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({ company_id: companyId, trigger_type: triggerType, entity_type: "address", entity_data: entityData }),
  }).catch(() => {});
}
function logAudit(companyId, action, record, userEmail) {
  fetch(`${RAILWAY_URL}/audit/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}) },
    body: JSON.stringify({ company_id: companyId, entity_type: "address", entity_id: record?.id, entity_name: [record?.address_line1, record?.city].filter(Boolean).join(", ") || record?.id, action, changed_by: userEmail }),
  }).catch(() => {});
}

const statusColor = (s) => ({
  active: "bg-emerald-50 text-emerald-700",
  archived: "bg-slate-100 text-slate-400",
}[s] || "bg-slate-100 text-slate-600");

async function geocodeAddress(address) {
  const query = [address.address_line1, address.city, address.state_region, address.postal_code, address.country].filter(Boolean).join(", ");
  const res = await fetch(`${RAILWAY_URL}/geo/geocode?address=${encodeURIComponent(query)}`);
  const data = await res.json();
  if (data.found && data.lat && data.lon) return { latitude: data.lat, longitude: data.lon };
  return null;
}

function StatCard({ icon: Icon, iconColor, value, label }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-3">
      <div className={`p-2 rounded-xl ${iconColor}`}><Icon className="w-5 h-5" /></div>
      <div>
        <p className="text-2xl font-black text-slate-800 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

const ADDR_PREVIEW_COLS = [
  { label: "Address Line 1", render: (r) => r.address_line1 || <span className="text-rose-500">MISSING</span> },
  { label: "City", render: (r) => r.city || <span className="text-rose-500">MISSING</span> },
  { label: "Region", render: (r) => r.state_region || "—" },
  { label: "Country", render: (r) => r.country || <span className="text-rose-500">MISSING</span> },
  { label: "Label", render: (r) => r.label || "—" },
];

const FILTER_DEFS = [
  { key: "status", label: "All Status", options: [{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }] },
  { key: "gps", label: "GPS Status", options: [{ value: "yes", label: "Has GPS" }, { value: "no", label: "No GPS" }] },
];

export default function Addresses() {
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [detailAddress, setDetailAddress] = useState(null);
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [geocodingAll, setGeocodingAll] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState(null);
  const [geocodingRowId, setGeocodingRowId] = useState(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [viewMode, setViewMode] = useState("table");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "", gps: "" });
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") qc.refetchQueries({ queryKey: ["addresses"] }); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [qc]);

  const listFn = useEntityListFn(currentUser);
  const withScope = useWithScope(currentUser);

  const { data: addresses = [] } = useQuery({
    queryKey: ["addresses", currentUser?.company_id, currentUser?.email],
    queryFn: () => listFn(base44.entities.Address),
    enabled: currentUser !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createMut = useMutation({
    mutationFn: async (d) => {
      let data = { ...d };
      if (!data.latitude || !data.longitude) {
        const coords = await geocodeAddress(data);
        if (coords) data = { ...data, ...coords };
      }
      return createWithScope(base44.entities.Address, data, currentUser);
    },
    onSuccess: (created) => { addRecordToQueryCache(qc, ["addresses"], created); qc.invalidateQueries({ queryKey: ["addresses"] }); qc.refetchQueries({ queryKey: ["addresses"] }); triggerETL("address"); logAudit(created?.company_id || currentUser?.company_id, "created", created, currentUser?.email); triggerWorkflows(created?.company_id || currentUser?.company_id, "entity_created", created); setFormOpen(false); setEditing(null); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data, prevData }) => {
      let updated = { ...data };
      const coreChanged = prevData && (prevData.address_line1 !== data.address_line1 || prevData.city !== data.city || prevData.country !== data.country);
      if (coreChanged || (!data.latitude && !data.longitude)) {
        const coords = await geocodeAddress(data);
        if (coords) updated = { ...updated, ...coords };
      }
      return base44.entities.Address.update(id, updated);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
      qc.refetchQueries({ queryKey: ["addresses"] });
      triggerETL("address");
      logAudit(currentUser?.company_id, "updated", editing, currentUser?.email);
      triggerWorkflows(currentUser?.company_id, "entity_updated", editing);
      setFormOpen(false); setEditing(null);
      if (detailAddress) setDetailAddress(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Address.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["addresses"] }); triggerETL("address"); logAudit(currentUser?.company_id, "deleted", deleting, currentUser?.email); setDeleting(null); },
  });

  const handleSubmit = async (data, saveAndNew = false) => {
    if (editing) { return updateMut.mutateAsync({ id: editing.id, data, prevData: editing }); }
    const created = await createMut.mutateAsync(data);
    if (saveAndNew) { setEditing(null); setFormOpen(true); }
    return created;
  };

  const handleArchive = (item) => {
    updateMut.mutate({ id: item.id, data: { ...item, status: "archived" }, prevData: item });
    setFormOpen(false); setEditing(null);
  };

  const handleGeocodeAll = async () => {
    const missing = addresses.filter((a) => !a.latitude || !a.longitude);
    if (!missing.length) return;
    setGeocodingAll(true);
    for (let i = 0; i < missing.length; i++) {
      setGeocodeProgress(`Geocoding ${i + 1} of ${missing.length}...`);
      const coords = await geocodeAddress(missing[i]);
      if (coords) await base44.entities.Address.update(missing[i].id, { ...missing[i], ...coords });
    }
    setGeocodeProgress("✅ All addresses geocoded");
    qc.invalidateQueries({ queryKey: ["addresses"] });
    setGeocodingAll(false);
    setTimeout(() => setGeocodeProgress(null), 3000);
  };

  const handleGeocodeRow = async (row, e) => {
    e.stopPropagation();
    setGeocodingRowId(row.id);
    const coords = await geocodeAddress(row);
    if (coords) { await base44.entities.Address.update(row.id, { ...row, ...coords }); qc.invalidateQueries({ queryKey: ["addresses"] }); }
    setGeocodingRowId(null);
  };

  const handleDeleteAll = async () => {
    for (const a of addresses) { try { await base44.entities.Address.delete(a.id); } catch (e) { /* 404 = already gone */ } }
    qc.invalidateQueries({ queryKey: ["addresses"] });
    triggerETL("address");
    toast({ title: `All ${addresses.length} addresses deleted` });
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    for (const id of selectedIds) await base44.entities.Address.delete(id);
    qc.invalidateQueries({ queryKey: ["addresses"] });
    triggerETL("address");
    toast({ title: `${selectedIds.length} addresses deleted` });
    setSelectedIds([]);
    setBulkDeleting(false);
  };

  // Fuzzy search + filter
  const processedAddresses = useMemo(() => {
    let list = [...addresses];
    if (search) list = fuzzyFilter(list, search, ["label", "address_line1", "city", "state_region", "country", "postal_code"]);
    if (filters.status) list = list.filter((a) => a.status === filters.status);
    if (filters.gps === "yes") list = list.filter((a) => a.latitude && a.longitude);
    if (filters.gps === "no") list = list.filter((a) => !a.latitude || !a.longitude);
    return list;
  }, [addresses, search, filters]);

  const missingGps = addresses.filter((a) => !a.latitude || !a.longitude);
  const geocoded = addresses.filter((a) => a.latitude && a.longitude).length;
  const active = addresses.filter((a) => a.status !== "archived").length;
  const archived = addresses.filter((a) => a.status === "archived").length;

  const columns = [
    {
      key: "label", label: "Address",
      render: (val, row) => (
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-800">{val || "—"}</p>
              {row.latitude && row.longitude
                ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">GPS ✓</span>
                : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">No GPS</span>
              }
            </div>
            <p className="text-xs text-slate-400">{[row.address_line1, row.city, row.country].filter(Boolean).join(", ")}</p>
          </div>
        </div>
      ),
    },
    { key: "postal_code", label: "Postcode", render: (val) => val || "—" },
    { key: "country", label: "Country", render: (val) => val || "—" },
    { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{val || "active"}</Badge> },
    {
      key: "_actions", label: "",
      render: (_, row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <a href={row.latitude && row.longitude ? `https://www.openstreetmap.org/?mlat=${row.latitude}&mlon=${row.longitude}&zoom=16` : `https://www.openstreetmap.org/search?query=${encodeURIComponent([row.address_line1, row.city, row.country].filter(Boolean).join(" "))}`}
            target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="Open in map">
            <Map className="w-4 h-4" />
          </a>
          {(!row.latitude || !row.longitude) && (
            <button onClick={(e) => handleGeocodeRow(row, e)} disabled={geocodingRowId === row.id}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors" title="Geocode">
              {geocodingRowId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
            </button>
          )}
        </div>
      ),
    },
  ];

  const ss = useSpreadsheet(processedAddresses, columns);

  return (
    <div>
      <PageHeader title="Addresses" subtitle="Master address records linked to people, enterprises & transactions" onAdd={() => { setEditing(null); setFormOpen(true); }} addLabel="New Address">
        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setImportOpen(true)}>
          <Upload className="w-4 h-4 mr-2" /> Import
        </Button>
        <ExportCSVButton
          data={processedAddresses}
          fields={["label","address_line1","address_line2","city","state_region","postal_code","country","status","latitude","longitude"]}
          filename="addresses_export"
        />
        {addresses.length > 0 && (
          <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteAllOpen(true)}>
            🗑️ Delete All
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard icon={MapPin} iconColor="bg-slate-100 text-slate-600" value={addresses.length} label="Total Addresses" />
        <StatCard icon={CheckCircle} iconColor="bg-emerald-50 text-emerald-600" value={active} label="Active" />
        <StatCard icon={Navigation} iconColor="bg-blue-50 text-blue-600" value={geocoded} label="Geocoded" />
        <StatCard icon={AlertCircle} iconColor="bg-slate-100 text-slate-500" value={archived} label="Archived" />
      </div>

      {missingGps.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
          <p className="text-sm text-amber-800">⚠️ <strong>{missingGps.length}</strong> {missingGps.length === 1 ? "address has" : "addresses have"} no GPS — map features won't work.</p>
          <button onClick={handleGeocodeAll} disabled={geocodingAll}
            className="shrink-0 flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-900 transition-colors whitespace-nowrap">
            {geocodingAll ? <><Loader2 className="w-4 h-4 animate-spin" /> {geocodeProgress}</> : geocodeProgress ? <span className="text-emerald-700">{geocodeProgress}</span> : "Geocode All →"}
          </button>
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          <button
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === "table" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <List className="w-3.5 h-3.5" /> Table
          </button>
          <button
            onClick={() => setViewMode("map")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === "map" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <Map className="w-3.5 h-3.5" /> Map
          </button>
        </div>
        <button onClick={() => setAnalyticsOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-all shadow-sm">
          <BarChart2 className="w-3.5 h-3.5" /> Analytics
        </button>
      </div>

      {viewMode === "map" ? (
        <AddressLeafletMap addresses={processedAddresses} onAddressClick={(row) => setDetailAddress(row)} onAutoGeocode={handleGeocodeAll} />
      ) : (
        <>
          <SearchFilterBar
            search={search} setSearch={setSearch}
            filters={filters} setFilters={setFilters}
            filterDefs={FILTER_DEFS}
            placeholder="Search addresses, cities, countries..."
            resultCount={processedAddresses.length}
            totalCount={addresses.length}
          />

          <BulkActionBar
            selectedIds={selectedIds}
            onClear={() => setSelectedIds([])}
            onDeleteSelected={handleBulkDelete}
            canDelete
          />

          <SpreadsheetToolbar
            {...ss.toolbarProps}
            numericFields={[]}
            selectedIds={selectedIds}
            onSelectAll={() => setSelectedIds(ss.processedData.map((r) => r.id))}
            onClearSelect={() => setSelectedIds([])}
            onWriteBack={async (updates) => {
              for (const { id, field, value } of updates) {
                await base44.entities.Address.update(id, { [field]: value });
              }
              triggerETL("address");
              qc.invalidateQueries({ queryKey: ["addresses"] });
              toast({ title: `${updates.length} record${updates.length !== 1 ? "s" : ""} updated` });
            }}
          />

          <DataTable
            {...ss.tableProps}
            onRowClick={(row) => setDetailAddress(row)}
            onEdit={(row) => { setEditing(row); setFormOpen(true); }}
            onDelete={(row) => setDeleting(row)}
            bulkMode
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onCellEdit={async (id, field, value) => {
              await base44.entities.Address.update(id, { [field]: value });
              triggerETL("address");
              qc.invalidateQueries({ queryKey: ["addresses"] });
            }}
          />
        </>
      )}

      {detailAddress && (
        <AddressDetailPanel address={detailAddress} currentUser={currentUser} onClose={() => setDetailAddress(null)}
          onGeocoded={(updated) => { setDetailAddress(updated); qc.invalidateQueries({ queryKey: ["addresses"] }); }} />
      )}
      <DeleteAllDialog open={deleteAllOpen} onClose={() => setDeleteAllOpen(false)} onConfirm={handleDeleteAll} entityLabel="Addresses" count={addresses.length} />
      <AddressForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} onSubmit={handleSubmit} onArchive={handleArchive} initialData={editing} />
      <DeleteDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMut.mutate(deleting.id)} itemName={deleting?.label || "this address"} />
      <BulkImportDialog
        open={importOpen}
        onClose={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["addresses"] }); qc.refetchQueries({ queryKey: ["addresses"] }); }}
        entityName="Addresses" fields={ADDRESS_FIELDS} mappingRules={ADDRESS_MAPPING_RULES}
        templateFileName="newsconseen_addresses_import_template.xlsx"
        templateExample={ADDRESS_TEMPLATE_EXAMPLE} templateInstructions={ADDRESS_TEMPLATE_INSTRUCTIONS}
        entityFetchFn={() => listFn(base44.entities.Address)}
        validateRow={validateAddress} transformRow={transformAddress}
        onImport={(row) => createWithScope(base44.entities.Address, row, currentUser)}
        currentUser={currentUser} previewColumns={ADDR_PREVIEW_COLS} requiredField="address_line1"
      />

      {analyticsOpen && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shadow-sm">
            <p className="font-bold text-slate-800">Addresses Analytics</p>
            <button onClick={() => setAnalyticsOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <div className="p-6">
            <AddressAnalytics addresses={addresses} currentUser={currentUser} standalone={true} />
          </div>
        </div>
      )}
    </div>
  );
}
