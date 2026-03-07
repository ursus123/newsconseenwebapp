import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import RelationshipForm from "../components/relationships/RelationshipForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Building2, Package } from "lucide-react";
import { usePermissions } from "@/components/shared/usePermissions";

const TYPE_CONFIG = {
  person_enterprise: { label: "Person → Enterprise", color: "bg-blue-50 text-blue-700" },
  item_enterprise:   { label: "Item → Enterprise",   color: "bg-purple-50 text-purple-700" },
  item_person:       { label: "Item → Person",        color: "bg-amber-50 text-amber-700" },
};

const statusColor = (s) => ({
  active:   "bg-emerald-50 text-emerald-700",
  ended:    "bg-rose-50 text-rose-600",
  archived: "bg-slate-100 text-slate-400",
}[s] || "bg-slate-100 text-slate-600");

const columns = [
  { key: "relationship_type", label: "Type", render: (val) => {
    const c = TYPE_CONFIG[val];
    return c ? <Badge className={c.color}>{c.label}</Badge> : val;
  }},
  { key: "person_name", label: "Person", render: (v) => v || "—" },
  { key: "enterprise_name", label: "Enterprise", render: (v) => v || "—" },
  { key: "item_name", label: "Item", render: (v) => v || "—" },
  { key: "role", label: "Role / Custody", render: (v) => v || "—" },
  { key: "start_date", label: "Start" },
  { key: "end_date", label: "End", render: (v) => v || "—" },
  { key: "status", label: "Status", render: (val) => <Badge className={statusColor(val)}>{val || "active"}</Badge> },
];

const TYPE_TABS = [
  { id: "all", label: "All Assignments", icon: null },
  { id: "person_enterprise", label: "Person → Enterprise", icon: Users },
  { id: "item_enterprise", label: "Item → Enterprise", icon: Building2 },
  { id: "item_person", label: "Item → Person", icon: Package },
];

export default function Relationships() {
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState("person_enterprise");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [currentUser, setCurrentUser] = useState(null);
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);
  const perms = usePermissions(currentUser);

  const { data: relationships = [] } = useQuery({ queryKey: ["relationships"], queryFn: () => base44.entities.Relationship.list("-created_date") });
  const { data: people = [] } = useQuery({ queryKey: ["people"], queryFn: () => base44.entities.Person.list() });
  const { data: enterprises = [] } = useQuery({ queryKey: ["enterprises"], queryFn: () => base44.entities.Enterprise.list() });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => base44.entities.Product.list() });

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Relationship.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["relationships"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Relationship.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["relationships"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Relationship.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["relationships"] }); setDeleting(null); } });

  const handleSubmit = (data, saveAndNew = false) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, data });
    } else {
      createMut.mutate(data);
      if (saveAndNew) { setFormOpen(true); }
    }
  };

  const handleEnd = (data) => {
    updateMut.mutate({ id: editing.id, data });
  };

  const openNew = (type) => { setFormType(type); setEditing(null); setFormOpen(true); };

  const filtered = activeTab === "all" ? relationships : relationships.filter((r) => r.relationship_type === activeTab);

  return (
    <div>
      <PageHeader title="Relationships" subtitle="Assign people, items and enterprises — preserve history" />

      {/* Quick-add buttons — Layer 2: l2_assign required */}
      {perms.l2_assign && (
        <div className="flex flex-wrap gap-3 mb-6">
          <Button onClick={() => openNew("person_enterprise")} className="bg-blue-600 hover:bg-blue-700 rounded-xl shadow shadow-blue-500/20">
            <Users className="w-4 h-4 mr-2" /> Assign Person → Enterprise
          </Button>
          <Button onClick={() => openNew("item_enterprise")} className="bg-purple-600 hover:bg-purple-700 rounded-xl shadow shadow-purple-500/20">
            <Building2 className="w-4 h-4 mr-2" /> Assign Item → Enterprise
          </Button>
          <Button onClick={() => openNew("item_person")} className="bg-amber-500 hover:bg-amber-600 rounded-xl shadow shadow-amber-500/20">
            <Package className="w-4 h-4 mr-2" /> Assign Item → Person
          </Button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
        {TYPE_TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
              ${activeTab === t.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {t.icon && <t.icon className="w-3.5 h-3.5" />}
            {t.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        searchField="person_name"
        onEdit={(row) => { setEditing(row); setFormType(row.relationship_type); setFormOpen(true); }}
        onDelete={(row) => setDeleting(row)}
      />

      <RelationshipForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={handleSubmit}
        onEnd={handleEnd}
        initialData={editing}
        type={formType}
        people={people}
        enterprises={enterprises}
        products={products}
      />

      <DeleteDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMut.mutate(deleting.id)}
        itemName="this assignment"
      />
    </div>
  );
}