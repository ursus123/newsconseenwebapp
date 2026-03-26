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
import { Plus } from "lucide-react";
import { useMasterDataOptions, getFilteredEnterpriseSubtypes, getSICDivisionForSubtype, getSICCodeHint, createCustomOption } from "@/hooks/useMasterDataOptions";
import { toast } from "sonner";

function CustomCombobox({ label, value, onChange, customOptions, options, entityType, fieldName }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState(value || "");
  const [isCreating, setIsCreating] = useState(false);

  const systemDefaults = options || [];
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

export default function EnterpriseTypeAndSubtypeSection({ formData, onChange }) {
  const enterpriseTypeValue = formData.enterprise_type || "commercial";
  const [sicHint, setSicHint] = useState("");

  const { customOptions: subtypeCustom } = useMasterDataOptions("enterprise", "enterprise_subtype");
  const systemSubtypes = getFilteredEnterpriseSubtypes(enterpriseTypeValue);

  // Auto-suggest SIC division based on subtype
  useEffect(() => {
    if (formData.enterprise_subtype) {
      const suggestedDiv = getSICDivisionForSubtype(formData.enterprise_subtype);
      if (suggestedDiv && !formData.sic_division) {
        onChange("sic_division", suggestedDiv);
      }
      const hint = getSICCodeHint(formData.enterprise_subtype);
      setSicHint(hint || "");
    }
  }, [formData.enterprise_subtype, formData.sic_division, onChange]);

  return (
    <div className="space-y-4 border-t pt-4 mt-4">
      <div>
        <Label htmlFor="enterprise_type">Enterprise Type</Label>
        <Select value={enterpriseTypeValue} onValueChange={(value) => onChange("enterprise_type", value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="commercial">Commercial</SelectItem>
            <SelectItem value="nonprofit">Nonprofit</SelectItem>
            <SelectItem value="government">Government</SelectItem>
            <SelectItem value="household">Household</SelectItem>
            <SelectItem value="cooperative">Cooperative</SelectItem>
            <SelectItem value="trust">Trust</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <CustomCombobox
        label="Enterprise Subtype"
        value={formData.enterprise_subtype || ""}
        onChange={(val) => onChange("enterprise_subtype", val)}
        customOptions={subtypeCustom}
        options={systemSubtypes}
        entityType="enterprise"
        fieldName="enterprise_subtype"
      />

      <div>
        <Label htmlFor="sic_division">SIC Division</Label>
        <Select
          value={formData.sic_division || ""}
          onValueChange={(value) => onChange("sic_division", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select SIC division" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="A_agriculture_forestry_fishing">A - Agriculture, Forestry, Fishing</SelectItem>
            <SelectItem value="B_mining">B - Mining</SelectItem>
            <SelectItem value="C_construction">C - Construction</SelectItem>
            <SelectItem value="D_manufacturing">D - Manufacturing</SelectItem>
            <SelectItem value="E_transport_communications_utilities">E - Transport, Communications, Utilities</SelectItem>
            <SelectItem value="F_wholesale_trade">F - Wholesale Trade</SelectItem>
            <SelectItem value="G_retail_trade">G - Retail Trade</SelectItem>
            <SelectItem value="H_finance_insurance_real_estate">H - Finance, Insurance, Real Estate</SelectItem>
            <SelectItem value="I_services">I - Services</SelectItem>
            <SelectItem value="J_public_administration">J - Public Administration</SelectItem>
            <SelectItem value="K_education_health_social">K - Education, Health, Social</SelectItem>
            <SelectItem value="L_nonprofit_religious">L - Nonprofit, Religious</SelectItem>
            <SelectItem value="M_household_individual">M - Household, Individual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="sic_code">SIC Code</Label>
        <Input
          id="sic_code"
          value={formData.sic_code || ""}
          onChange={(e) => onChange("sic_code", e.target.value)}
          placeholder={sicHint ? `e.g., ${sicHint}` : "e.g., 8200 for education, 5812 for restaurants"}
          className="w-full"
        />
      </div>

      <div>
        <Label htmlFor="enterprise_tier">Enterprise Tier</Label>
        <Select
          value={formData.enterprise_tier || ""}
          onValueChange={(value) => onChange("enterprise_tier", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select enterprise tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="headquarters">Headquarters</SelectItem>
            <SelectItem value="regional_office">Regional Office</SelectItem>
            <SelectItem value="branch">Branch</SelectItem>
            <SelectItem value="subsidiary">Subsidiary</SelectItem>
            <SelectItem value="franchise">Franchise</SelectItem>
            <SelectItem value="department">Department</SelectItem>
            <SelectItem value="unit">Unit</SelectItem>
            <SelectItem value="project">Project</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}