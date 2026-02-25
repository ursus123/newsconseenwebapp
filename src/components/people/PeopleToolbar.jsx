import React, { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown, Layers, SlidersHorizontal, X } from "lucide-react";

const ALL_ROLES = [
  "Support Worker", "Registered Nurse", "Care Coordinator", "Team Leader", "Manager",
  "Cleaner", "Driver", "Receptionist", "Accountant", "HR Officer", "Other",
];

export default function PeopleToolbar({ search, setSearch, groupBy, setGroupBy, sortBy, setSortBy, filters, setFilters }) {
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = Object.values(filters || {}).filter(Boolean).length;

  const setFilter = (key, val) => setFilters((f) => ({ ...f, [key]: val === "__all__" ? "" : val }));
  const clearFilters = () => setFilters({ status: "", availability_status: "", person_type: "", country: "", primary_role: "" });

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Fuzzy search people..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-xl bg-white border-slate-200"
          />
          {search && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setSearch("")}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters toggle */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`rounded-xl gap-2 border-slate-200 ${showFilters ? "bg-emerald-50 border-emerald-300 text-emerald-700" : ""}`}
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 bg-emerald-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>

        {/* Group By */}
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-400 shrink-0" />
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="w-40 rounded-xl border-slate-200 bg-white">
              <SelectValue placeholder="Group by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Grouping</SelectItem>
              <SelectItem value="role_category">Category</SelectItem>
              <SelectItem value="availability_status">Availability</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="primary_role">Role</SelectItem>
              <SelectItem value="city">Location (City)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sort By */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40 rounded-xl border-slate-200 bg-white">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_date_desc">Newest First</SelectItem>
              <SelectItem value="created_date_asc">Oldest First</SelectItem>
              <SelectItem value="name_asc">Name A → Z</SelectItem>
              <SelectItem value="name_desc">Name Z → A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-4 flex flex-wrap gap-3 items-end">
          <FilterSelect label="Status" value={filters.status || "__all__"} onChange={(v) => setFilter("status", v)}
            options={[{ value: "__all__", label: "Any Status" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "on_leave", label: "On Leave" }]} />
          <FilterSelect label="Availability" value={filters.availability_status || "__all__"} onChange={(v) => setFilter("availability_status", v)}
            options={[{ value: "__all__", label: "Any" }, { value: "available", label: "Available" }, { value: "busy", label: "Busy" }, { value: "on_leave", label: "On Leave" }, { value: "unavailable", label: "Unavailable" }]} />
          <FilterSelect label="Person Type" value={filters.person_type || "__all__"} onChange={(v) => setFilter("person_type", v)}
            options={[{ value: "__all__", label: "Any Type" }, { value: "employee", label: "Employee" }, { value: "contractor", label: "Contractor" }, { value: "freelancer", label: "Freelancer" }, { value: "vendor", label: "Vendor" }, { value: "client", label: "Client" }, { value: "patient", label: "Patient" }, { value: "external_partner", label: "External Partner" }]} />
          <FilterSelect label="Primary Role" value={filters.primary_role || "__all__"} onChange={(v) => setFilter("primary_role", v)}
            options={[{ value: "__all__", label: "Any Role" }, ...ALL_ROLES.map((r) => ({ value: r, label: r }))]} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Country</label>
            <Input
              placeholder="e.g. Australia"
              value={filters.country || ""}
              onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}
              className="rounded-lg border-slate-200 h-9 text-sm w-36"
            />
          </div>
          {activeFilterCount > 0 && (
            <Button type="button" variant="ghost" size="sm" className="rounded-lg text-slate-500 hover:text-red-500 h-9" onClick={clearFilters}>
              <X className="w-3.5 h-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>
      )}

      {/* Active filter badges */}
      {activeFilterCount > 0 && !showFilters && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(filters).filter(([, v]) => v).map(([k, v]) => (
            <Badge key={k} variant="outline" className="gap-1 text-xs text-slate-600 cursor-pointer hover:bg-slate-100" onClick={() => setFilter(k, "")}>
              {k.replace(/_/g, " ")}: {v} <X className="w-2.5 h-2.5" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="rounded-lg border-slate-200 h-9 text-sm w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}