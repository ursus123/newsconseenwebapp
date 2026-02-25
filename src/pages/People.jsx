import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/shared/PageHeader";
import DataTable from "../components/shared/DataTable";
import DeleteDialog from "../components/shared/DeleteDialog";
import PeopleForm from "../components/people/PeopleForm";
import PeopleToolbar from "../components/people/PeopleToolbar";
import PeopleGroupedView from "../components/people/PeopleGroupedView";
import { usePermissions } from "@/components/shared/usePermissions";
import { Badge } from "@/components/ui/badge";
import { fuzzyFilter } from "@/components/shared/fuzzySearch";

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
  const [filters, setFilters] = useState({ status: "", availability_status: "", person_type: "", country: "", primary_role: "" });
  const [currentUser, setCurrentUser] = useState(null);
  const qc = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const isAdmin = currentUser?.role === "admin" || isSuperAdmin;
  const companyId = currentUser?.company_id;
  const perms = usePermissions(currentUser);

  const { data: people = [] } = useQuery({
    queryKey: ["people", companyId],
    queryFn: () => isSuperAdmin || !companyId ? base44.entities.Person.list("-created_date") : base44.entities.Person.filter({ company_id: companyId }, "-created_date"),
    enabled: currentUser !== null,
  });

  const withCompany = (d) => companyId && !isSuperAdmin ? { ...d, company_id: companyId } : d;

  const createMut = useMutation({ mutationFn: (d) => base44.entities.Person.create(withCompany(d)), onSuccess: () => { qc.invalidateQueries({ queryKey: ["people"] }); qc.invalidateQueries({ queryKey: ["addresses"] }); qc.invalidateQueries({ queryKey: ["relationships"] }); setFormOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => base44.entities.Person.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["people"] }); setFormOpen(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id) => base44.entities.Person.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["people"] }); setDeleting(null); } });

  const processedPeople = useMemo(() => {
    let list = [...people];

    // Fuzzy search across name fields and address
    if (search) {
      list = fuzzyFilter(list, search, ["first_name", "last_name", "preferred_name", "primary_role", "city", "country", "address", "email", "phone"]);
    }

    // Advanced filters
    if (filters.status) list = list.filter((p) => p.status === filters.status);
    if (filters.availability_status) list = list.filter((p) => (p.availability_status || "available") === filters.availability_status);
    if (filters.person_type) list = list.filter((p) => p.person_type === filters.person_type);
    if (filters.primary_role) list = list.filter((p) => p.primary_role === filters.primary_role);
    if (filters.country) list = list.filter((p) => (p.country || "").toLowerCase().includes(filters.country.toLowerCase()));

    // Sort (skip re-sort when search is active since fuzzy results are already ranked)
    if (!search) list.sort((a, b) => {
      if (sortBy === "name_asc") return `${a.first_name}${a.last_name}`.localeCompare(`${b.first_name}${b.last_name}`);
      if (sortBy === "name_desc") return `${b.first_name}${b.last_name}`.localeCompare(`${a.first_name}${a.last_name}`);
      if (sortBy === "created_date_asc") return new Date(a.created_date) - new Date(b.created_date);
      return new Date(b.created_date) - new Date(a.created_date); // default: newest first
    });

    return list;
  }, [people, search, sortBy]);

  return (
    <div>
      <PageHeader
        title="People"
        subtitle="Manage your team members, contractors and staff"
        onAdd={perms.can_create ? () => { setEditing(null); setFormOpen(true); } : undefined}
        addLabel="Add Person"
      />

      <PeopleToolbar search={search} setSearch={setSearch} groupBy={groupBy} setGroupBy={setGroupBy} sortBy={sortBy} setSortBy={setSortBy} />

      {groupBy !== "none" ? (
        <PeopleGroupedView
          people={processedPeople}
          groupBy={groupBy}
          onEdit={perms.can_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={processedPeople}
          onEdit={perms.can_edit ? (row) => { setEditing(row); setFormOpen(true); } : undefined}
          onDelete={perms.can_delete ? (row) => setDeleting(row) : undefined}
        />
      )}

      <PeopleForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(d) => editing
        ? base44.entities.Person.update(editing.id, d).then(() => { qc.invalidateQueries({ queryKey: ["people"] }); setFormOpen(false); setEditing(null); })
        : base44.entities.Person.create(withCompany(d)).then((res) => { qc.invalidateQueries({ queryKey: ["people"] }); qc.invalidateQueries({ queryKey: ["addresses"] }); qc.invalidateQueries({ queryKey: ["relationships"] }); return res; })
      }
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