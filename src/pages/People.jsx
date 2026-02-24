import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import PeopleForm from "../components/people/PeopleForm";
import PeopleToolbar from "../components/people/PeopleToolbar";
import PeopleGroupedView from "../components/people/PeopleGroupedView";
import { Badge } from "@/components/ui/badge";

const statusColor = (s) => {
  const map = { active: "bg-emerald-50 text-emerald-700", inactive: "bg-slate-100 text-slate-600", on_leave: "bg-amber-50 text-amber-700" };
  return map[s] || "bg-slate-100 text-slate-600";
};

const availColor = (s) => {
  const map = { available: "bg-green-50 text-green-700", busy: "bg-amber-50 text-amber-700", on_leave: "bg-slate-100 text-slate-500", unavailable: "bg-rose-50 text-rose-700" };
  return map[s] || "bg-slate-100 text-slate-600";
};

const columns = [
  { key: "first_name", label: "Name", render: (val, row) => (
    <span className="font-medium text-slate-800">
      {row.preferred_name || `${row.first_name || ""} ${row.last_name || ""}`.trim()}
    </span>
  )},
  { key: "primary_role", label: "Role" },
  { key: "role_category", label: "Category", render: (val) => val ? (
    <span className="text-xs text-slate-500">{val.replace(/_/g, " ")}</span>
  ) : "—" },
  { key: "phone", label: "Phone" },
  { key: "availability_status", label: "Availability", render: (val) => (
    <Badge className={availColor(val)}>{(val || "available").replace(/_/g, " ")}</Badge>
  )},
  { key: "status", label: "Status", render: (val) => (
    <Badge className={statusColor(val)}>{(val || "active").replace(/_/g, " ")}</Badge>
  )},
];

export default function People() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState("none");
  const [sortBy, setSortBy] = useState("created_date_desc");
  const qc = useQueryClient();

  const { data: people = [] } = useQuery({ queryKey: ["people"], queryFn: () => base44.entities.Person.list("-created_date") });

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Person.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["people"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Person.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["people"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Person.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["people"] }); setDeleting(null); } });

  const processedPeople = useMemo(() => {
    let list = [...people];

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        `${p.first_name} ${p.last_name} ${p.preferred_name} ${p.primary_role} ${p.city}`.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === "name_asc") return `${a.first_name}${a.last_name}`.localeCompare(`${b.first_name}${b.last_name}`);
      if (sortBy === "name_desc") return `${b.first_name}${b.last_name}`.localeCompare(`${a.first_name}${a.last_name}`);
      if (sortBy === "created_date_asc") return new Date(a.created_date) - new Date(b.created_date);
      return new Date(b.created_date) - new Date(a.created_date); // default: newest first
    });

    return list;
  }, [people, search, sortBy]);

  return (
    <div>
      <PageHeader title="People" subtitle="Manage your team members, contractors and staff" onAdd={() => { setEditing(null); setFormOpen(true); }} addLabel="Add Person" />

      <PeopleToolbar search={search} setSearch={setSearch} groupBy={groupBy} setGroupBy={setGroupBy} sortBy={sortBy} setSortBy={setSortBy} />

      {groupBy !== "none" ? (
        <PeopleGroupedView
          people={processedPeople}
          groupBy={groupBy}
          onEdit={(row) => { setEditing(row); setFormOpen(true); }}
          onDelete={(row) => setDeleting(row)}
        />
      ) : (
        <DataTable
          columns={columns}
          data={processedPeople}
          onEdit={(row) => { setEditing(row); setFormOpen(true); }}
          onDelete={(row) => setDeleting(row)}
        />
      )}

      <PeopleForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)}
        initialData={editing}
      />
      <DeleteDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMut.mutate(deleting.id)}
        itemName={deleting ? `${deleting.first_name} ${deleting.last_name}` : ""}
      />
    </div>
  );
}