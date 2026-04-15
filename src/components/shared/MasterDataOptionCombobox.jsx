import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Plus, Badge as BadgeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function MasterDataOptionCombobox({
  entityType,
  fieldName,
  parentValue,
  value,
  onChange,
  placeholder = "Select option...",
  allowCustom = true,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customInput, setCustomInput] = useState("");
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    const loadOptions = async () => {
      setLoading(true);
      try {
        const result = await base44.entities.MasterDataOption.filter({
          entity_type: entityType,
          field_name: fieldName,
          parent_value: parentValue || undefined,
          is_active: true,
        });
        setOptions(result || []);
      } catch (err) {
        console.error("Failed to load master data options:", err);
      } finally {
        setLoading(false);
      }
    };

    if (entityType && fieldName) {
      loadOptions();
    }
  }, [entityType, fieldName, parentValue]);

  const systemDefaults = options.filter((o) => o.is_system_default);
  const customOptions = options.filter((o) => !o.is_system_default);

  const handleSelect = (option) => {
    onChange(option.value);
    setOpen(false);
    setSearch("");
    setCustomInput("");
  };

  const handleAddCustom = async () => {
    if (!customInput.trim() || !currentUser) return;

    try {
      const newOption = await base44.entities.MasterDataOption.create({
        entity_type: entityType,
        field_name: fieldName,
        value: customInput.toLowerCase().replace(/\s+/g, "_"),
        label: customInput,
        parent_value: parentValue || null,
        is_system_default: false,
        is_active: true,
        company_id: currentUser.company_id || null,
        created_by: currentUser.email,
      });

      setOptions([...options, newOption]);
      onChange(newOption.value);
      setCustomInput("");
      setOpen(false);
    } catch (err) {
      console.error("Failed to create custom option:", err);
    }
  };

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className="w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="w-full justify-between"
          >
            <span className="truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <div className="flex items-center border-b px-3 py-2">
              <Input
                placeholder="Search or create..."
                value={search || customInput}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCustomInput(e.target.value);
                }}
                className="border-0 outline-none focus-visible:ring-0"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {loading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
              ) : filtered.length === 0 && !customInput ? (
                <CommandEmpty>No options found.</CommandEmpty>
              ) : (
                <>
                  {systemDefaults.filter((o) =>
                    search ? o.label.toLowerCase().includes(search.toLowerCase()) : true
                  ).length > 0 && (
                    <CommandGroup heading="System Defaults">
                      {systemDefaults
                        .filter((o) =>
                          search ? o.label.toLowerCase().includes(search.toLowerCase()) : true
                        )
                        .map((option) => (
                          <CommandItem
                            key={option.id}
                            value={option.value}
                            onSelect={() => handleSelect(option)}
                            className="cursor-pointer"
                          >
                            <span className="flex-1">{option.label}</span>
                            {value === option.value && (
                              <span className="ml-2 text-primary">✓</span>
                            )}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  )}
                  {customOptions.filter((o) =>
                    search ? o.label.toLowerCase().includes(search.toLowerCase()) : true
                  ).length > 0 && (
                    <CommandGroup heading="Custom">
                      {customOptions
                        .filter((o) =>
                          search ? o.label.toLowerCase().includes(search.toLowerCase()) : true
                        )
                        .map((option) => (
                          <CommandItem
                            key={option.id}
                            value={option.value}
                            onSelect={() => handleSelect(option)}
                            className="cursor-pointer"
                          >
                            <span className="flex-1">{option.label}</span>
                            <Badge variant="secondary" className="ml-2 text-xs">
                              Custom
                            </Badge>
                            {value === option.value && (
                              <span className="ml-2 text-primary">✓</span>
                            )}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  )}
                </>
              )}
            </div>
            {allowCustom && customInput && !options.find((o) => o.label === customInput) && (
              <div className="border-t px-3 py-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start gap-2"
                  onClick={handleAddCustom}
                >
                  <Plus className="h-4 w-4" /> Add "{customInput}"
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}