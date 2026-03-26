import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { useMasterDataOptions, getFilteredRoles, getSystemSubtypes, createCustomOption } from "@/hooks/useMasterDataOptions";
import { toast } from "sonner";

function CustomCombobox({ label, value, onChange, options, customOptions, entityType, fieldName, personType, isRoles }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState(value || "");
  const [isCreating, setIsCreating] = useState(false);

  // Filter system defaults based on person_type if this is roles
  let systemDefaults = [];
  if (isRoles && personType) {
    systemDefaults = getFilteredRoles(personType);
  } else if (!isRoles) {
    systemDefaults = getSystemSubtypes();
  }

  const filtered = input
    ? systemDefaults.filter(opt =>
        opt.toLowerCase().includes(input.toLowerCase())
      )
    : systemDefaults;

  const handleSelect = (val) => {
    onChange(val);
    setInput(val);
    setIsOpen(false);
  };

  const handleAddCustom = async () => {
    if (!input.trim()) return;

    setIsCreating(true);
    try {
      await createCustomOption(entityType, fieldName, input, input);
      handleSelect(input);
      toast.success(`Added custom ${fieldName}`);
    } catch (err) {
      toast.error("Failed to add custom option");
    } finally {
      setIsCreating(false);
    }
  };

  const isCustom = customOptions.some(opt => opt.value === value);

  return (
    <div className="relative">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={`Search or type ${label.toLowerCase()}...`}
            className="w-full"
          />
          {isOpen && (filtered.length > 0 || customOptions.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-56 overflow-y-auto">
              {/* System defaults */}
              {filtered.length > 0 && (
                <div>
                  {filtered.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleSelect(opt)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* Divider if there are custom options */}
              {customOptions.length > 0 && filtered.length > 0 && (
                <div className="border-t border-slate-200 py-1 px-3 text-xs text-slate-400 font-semibold">
                  Custom
                </div>
              )}

              {/* Custom options */}
              {customOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleSelect(opt.value)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm flex items-center justify-between"
                >
                  <span>{opt.value}</span>
                  <Badge variant="outline" className="text-xs">Custom</Badge>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add custom option button */}
        {input && !systemDefaults.includes(input) && !customOptions.some(opt => opt.value === input) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddCustom}
            disabled={isCreating}
            className="flex-shrink-0"
          >
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        )}
      </div>

      {/* Show badge if custom */}
      {isCustom && value && (
        <div className="mt-1">
          <Badge variant="secondary" className="text-xs">Custom</Badge>
        </div>
      )}
    </div>
  );
}

export default function PersonTypeAndRoleSection({ formData, onChange }) {
  const personTypeValue = formData.person_type || "staff";

  const { customOptions: roleCustom } = useMasterDataOptions("person", "primary_role");
  const { customOptions: subtypeCustom } = useMasterDataOptions("person", "person_subtype");

  return (
    <div className="space-y-4 border-t pt-4 mt-4">
      <div>
        <Label htmlFor="person_type">Person Type</Label>
        <Select value={personTypeValue} onValueChange={(value) => onChange("person_type", value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="contact">Contact</SelectItem>
            <SelectItem value="volunteer">Volunteer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <CustomCombobox
        label="Primary Role"
        value={formData.primary_role || ""}
        onChange={(val) => onChange("primary_role", val)}
        customOptions={roleCustom}
        entityType="person"
        fieldName="primary_role"
        personType={personTypeValue}
        isRoles={true}
      />

      <CustomCombobox
        label="Person Subtype"
        value={formData.person_subtype || ""}
        onChange={(val) => onChange("person_subtype", val)}
        customOptions={subtypeCustom}
        entityType="person"
        fieldName="person_subtype"
        isRoles={false}
      />

      <div>
        <Label htmlFor="engagement_model">Engagement Model</Label>
        <Select
          value={formData.engagement_model || ""}
          onValueChange={(value) => onChange("engagement_model", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select engagement model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="employed">Employed</SelectItem>
            <SelectItem value="contracted">Contracted</SelectItem>
            <SelectItem value="freelance">Freelance</SelectItem>
            <SelectItem value="volunteer">Volunteer</SelectItem>
            <SelectItem value="elected">Elected</SelectItem>
            <SelectItem value="appointed">Appointed</SelectItem>
            <SelectItem value="enrolled">Enrolled</SelectItem>
            <SelectItem value="subscribed">Subscribed</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}