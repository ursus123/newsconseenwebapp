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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useMasterDataOptions, getFilteredItemSubtypes, getSuggestedItemClasses, getUnitOfMeasureForType, getSystemItemTypes, getSystemItemClasses, createCustomOption } from "@/hooks/useMasterDataOptions";
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

export default function ProductTypeAndClassificationSection({ formData, onChange }) {
  const itemTypeValue = formData.item_type || "physical";
  const [suggestedClasses, setSuggestedClasses] = useState([]);

  const { customOptions: subtypeCustom } = useMasterDataOptions("item", "item_subtype");
  const systemSubtypes = getFilteredItemSubtypes(itemTypeValue);
  const unitOptions = getUnitOfMeasureForType(itemTypeValue);

  // Auto-suggest item classes based on subtype
  useEffect(() => {
    if (formData.item_subtype) {
      const suggested = getSuggestedItemClasses(formData.item_subtype);
      setSuggestedClasses(suggested);
      // Auto-fill if item_class is not already set
      if (!formData.item_class || formData.item_class.length === 0) {
        onChange("item_class", suggested);
      }
    }
  }, [formData.item_subtype, formData.item_class, onChange]);

  const handleItemClassToggle = (classValue) => {
    const current = formData.item_class || [];
    if (current.includes(classValue)) {
      onChange("item_class", current.filter(c => c !== classValue));
    } else {
      onChange("item_class", [...current, classValue]);
    }
  };

  return (
    <div className="space-y-4 border-t pt-4 mt-4">
      <div>
        <Label htmlFor="item_type">Item Type</Label>
        <Select value={itemTypeValue} onValueChange={(value) => onChange("item_type", value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getSystemItemTypes().map((type) => (
              <SelectItem key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CustomCombobox
        label="Item Subtype"
        value={formData.item_subtype || ""}
        onChange={(val) => onChange("item_subtype", val)}
        customOptions={subtypeCustom}
        options={systemSubtypes}
        entityType="item"
        fieldName="item_subtype"
      />

      <div>
        <Label htmlFor="item_brand">Brand / Manufacturer</Label>
        <Input
          id="item_brand"
          value={formData.item_brand || ""}
          onChange={(e) => onChange("item_brand", e.target.value)}
          placeholder="Brand or manufacturer name"
          className="w-full"
        />
      </div>

      <div>
        <Label htmlFor="item_variant">Variant</Label>
        <Input
          id="item_variant"
          value={formData.item_variant || ""}
          onChange={(e) => onChange("item_variant", e.target.value)}
          placeholder="e.g., size, color, dosage, model number, crop variety"
          className="w-full"
        />
      </div>

      <div>
        <Label>Item Class</Label>
        <div className="border border-slate-200 rounded-lg p-3 space-y-2">
          {getSystemItemClasses().map((classValue) => (
            <div key={classValue} className="flex items-center gap-2">
              <Checkbox
                id={`class_${classValue}`}
                checked={(formData.item_class || []).includes(classValue)}
                onCheckedChange={() => handleItemClassToggle(classValue)}
              />
              <label htmlFor={`class_${classValue}`} className="text-sm cursor-pointer">
                {classValue.replace(/_/g, " ")}
                {suggestedClasses.includes(classValue) && (
                  <Badge variant="secondary" className="ml-2 text-xs">Suggested</Badge>
                )}
              </label>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="unit_of_measure">Unit of Measure</Label>
        <Select
          value={formData.unit_of_measure || "piece"}
          onValueChange={(value) => onChange("unit_of_measure", value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* Show filtered options first */}
            {unitOptions.map((unit) => (
              <SelectItem key={unit} value={unit}>
                {unit}
              </SelectItem>
            ))}
            {/* Divider and all other options */}
            {unitOptions.length > 0 && (
              <>
                <SelectItem value="---separator---" disabled className="border-t">
                  Other units
                </SelectItem>
                {["piece", "box", "carton", "pallet", "bag", "sachet", "bottle", "vial", "ampule", "tube",
                  "kg", "g", "mg", "ton", "lb", "oz",
                  "liter", "ml", "gallon",
                  "meter", "cm", "mm", "foot", "inch",
                  "head", "flock", "herd",
                  "acre", "hectare", "plot",
                  "license_seat", "user_account", "session", "hour", "day", "month", "year"
                ].filter(u => !unitOptions.includes(u)).map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}