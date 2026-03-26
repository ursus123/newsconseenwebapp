import React from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { getFilteredRoles } from "@/hooks/useMasterDataOptions";

export default function ClientStep2SecondaryRoles({ formData, personType, primaryRole, onChange }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [input, setInput] = React.useState("");

  // Get all available roles for this person type, excluding the primary role
  const availableRoles = getFilteredRoles(personType).filter(
    (role) => role !== primaryRole && !formData.secondary_roles?.includes(role)
  );

  const filtered = input
    ? availableRoles.filter((role) =>
        role.toLowerCase().includes(input.toLowerCase())
      )
    : availableRoles;

  const handleAddRole = (role) => {
    const updated = [...(formData.secondary_roles || []), role];
    onChange("secondary_roles", updated);
    setInput("");
    setIsOpen(false);
  };

  const handleRemoveRole = (roleToRemove) => {
    const updated = (formData.secondary_roles || []).filter(
      (role) => role !== roleToRemove
    );
    onChange("secondary_roles", updated);
  };

  // Don't show if no primary role selected
  if (!primaryRole) {
    return null;
  }

  return (
    <div className="space-y-2 border-t pt-4 mt-4">
      <Label>Secondary Roles (Optional)</Label>
      <p className="text-xs text-slate-500 mb-2">
        Add additional roles for this person within the {personType} category.
      </p>

      {/* Selected roles */}
      {formData.secondary_roles && formData.secondary_roles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {formData.secondary_roles.map((role) => (
            <Badge
              key={role}
              variant="secondary"
              className="flex items-center gap-1 cursor-pointer hover:bg-slate-300 transition-colors"
              onClick={() => handleRemoveRole(role)}
            >
              {role.replace(/_/g, " ")}
              <X className="w-3 h-3 ml-1" />
            </Badge>
          ))}
        </div>
      )}

      {/* Add secondary role input */}
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search and add secondary roles..."
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={availableRoles.length === 0}
        />

        {isOpen && filtered.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
            {filtered.map((role) => (
              <button
                key={role}
                onClick={() => handleAddRole(role)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm flex items-center justify-between"
              >
                <span>{role.replace(/_/g, " ")}</span>
              </button>
            ))}
          </div>
        )}

        {availableRoles.length === 0 && (
          <p className="text-xs text-slate-400 mt-1">
            No additional roles available for this person type.
          </p>
        )}
      </div>
    </div>
  );
}