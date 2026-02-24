import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpDown, Layers } from "lucide-react";

export default function PeopleToolbar({ search, setSearch, groupBy, setGroupBy, sortBy, setSortBy }) {
  return (
    <div className="flex flex-wrap gap-3 mb-5 items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search people..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 rounded-xl bg-white border-slate-200"
        />
      </div>

      {/* Group By */}
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-slate-400 shrink-0" />
        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="w-44 rounded-xl border-slate-200 bg-white">
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
          <SelectTrigger className="w-44 rounded-xl border-slate-200 bg-white">
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
  );
}