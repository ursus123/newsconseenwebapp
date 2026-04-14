import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Building2, Package, Wrench, MapPin, Link2, Search, CheckSquare, X, Loader2 } from "lucide-react";

const TYPES = [
  { id: "person_enterprise",     label: "People → Enterprise",        leftLabel: "People",       rightLabel: "Enterprise",   leftKey: "person_name",     rightKey: "enterprise_name",    leftColor: "bg-blue-100 text-blue-700",     rightColor: "bg-blue-50 text-blue-600"     },
  { id: "enterprise_person",     label: "Enterprise → People",        leftLabel: "Enterprise",   rightLabel: "People",       leftKey: "enterprise_name", rightKey: "person_name",        leftColor: "bg-blue-50 text-blue-600",      rightColor: "bg-blue-100 text-blue-700"    },
  { id: "people_enterprises",    label: "People ↔ Enterprises",      leftLabel: "People",       rightLabel: "Enterprises",  leftKey: "person_name",     rightKey: "enterprise_name",    leftColor: "bg-indigo-100 text-indigo-700", rightColor: "bg-indigo-50 text-indigo-600" },
  { id: "person_person",         label: "Person → Person",            leftLabel: "People (From)", rightLabel: "People (To)", leftKey: "person_name",     rightKey: "secondary_person",   leftColor: "bg-rose-100 text-rose-700",     rightColor: "bg-rose-50 text-rose-600"     },
  { id: "enterprise_enterprise", label: "Enterprise → Enterprise",    leftLabel: "Parent Ent.",  rightLabel: "Child Ent.",   leftKey: "enterprise_name", rightKey: "secondary_enterprise",leftColor: "bg-violet-100 text-violet-700", rightColor: "bg-violet-50 text-violet-600" },
  { id: "item_enterprise",       label: "Items → Enterprise",         leftLabel: "Items",        rightLabel: "Enterprise",   leftKey: "item_name",       rightKey: "enterprise_name",    leftColor: "bg-purple-100 text-purple-700", rightColor: "bg-purple-50 text-purple-600" },
  { id: "item_person",           label: "Items → Person",             leftLabel: "Items",        rightLabel: "Person",       leftKey: "item_name",       rightKey: "person_name",        leftColor: "bg-amber-100 text-amber-700",   rightColor: "bg-amber-50 text-amber-600"   },
  { id: "person_service",        label: "People → Service",           leftLabel: "People",       rightLabel: "Service",      leftKey: "person_name",     rightKey: "service_name",       leftColor: "bg-cyan-100 text-cyan-700",     rightColor: "bg-cyan-50 text-cyan-600"     },
  { id: "enterprise_service",    label: "Enterprise → Service",       leftLabel: "Enterprises",  rightLabel: "Service",      leftKey: "enterprise_name", rightKey: "service_name",       leftColor: "bg-indigo-100 text-indigo-700", rightColor: "bg-indigo-50 text-indigo-600" },
  { id: "person_address",        label: "People → Address",           leftLabel: "People",       rightLabel: "Address",      leftKey: "person_name",     rightKey: "location",           leftColor: "bg-teal-100 text-teal-700",     rightColor: "bg-teal-50 text-teal-600"     },
  { id: "enterprise_address",    label: "Enterprise → Address",       leftLabel: "Enterprises",  rightLabel: "Address",      leftKey: "enterprise_name", rightKey: "location",           leftColor: "bg-emerald-100 text-emerald-700", rightColor: "bg-emerald-50 text-emerald-600" },
];

// Filter chip definitions per entity type
const PERSON_TYPE_CHIPS = ["staff", "client", "contact", "volunteer"];
const ITEM_TYPE_CHIPS   = ["physical", "living", "digital", "service_package", "financial_instrument"];
const ENT_TIER_CHIPS    = ["headquarters", "regional_office", "branch", "subsidiary", "franchise", "department", "unit", "project"];

function FilterChips({ options, active, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onToggle(opt)}
          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all capitalize ${active === opt ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"}`}
        >
          {opt.replace(/_/g, " ")}
        </button>
      ))}
      {active && (
        <button onClick={() => onToggle(null)} className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-rose-200 text-rose-500 bg-rose-50 hover:bg-rose-100">
          Clear
        </button>
      )}
    </div>
  );
}

function SelectableList({ items, selected, onToggle, searchPlaceholder, nameKey = "name", colorClass = "bg-slate-100 text-slate-700", chipOptions, chipField }) {
  const [search, setSearch] = useState("");
  const [activeChip, setActiveChip] = useState(null);

  const filtered = useMemo(() => {
    let list = items;
    if (activeChip && chipField) list = list.filter(i => i[chipField] === activeChip);
    if (search) list = list.filter(i => (i[nameKey] || "").toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [items, search, nameKey, activeChip, chipField]);

  return (
    <div className="flex flex-col h-full">
      {chipOptions && chipOptions.length > 0 && (
        <FilterChips options={chipOptions} active={activeChip} onToggle={setActiveChip} />
      )}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={searchPlaceholder || "Search..."}
          className="w-full pl-8 pr-3 h-8 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
        />
      </div>
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className="text-[10px] text-slate-400">{selected.length} selected</span>
        <button className="text-[10px] text-emerald-600 hover:underline" onClick={() => filtered.forEach(i => !selected.includes(i[nameKey]) && onToggle(i[nameKey]))}>
          Select all visible
        </button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 max-h-48">
        {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-6">No items found</p>}
        {filtered.map(item => {
          const val = item[nameKey];
          const isSelected = selected.includes(val);
          return (
            <label key={item.id || val} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${isSelected ? "bg-emerald-50 border border-emerald-200" : "hover:bg-slate-50 border border-transparent"}`}>
              <Checkbox checked={isSelected} onCheckedChange={() => onToggle(val)} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${colorClass}`}>{val}</span>
                {item._subtitle && (
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{item._subtitle}</p>
                )}
              </div>
              {item._badge && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase shrink-0">{item._badge}</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SingleSelect({ items, selected, onSelect, searchPlaceholder, nameKey = "name", colorClass = "bg-slate-100 text-slate-700", chipOptions, chipField }) {
  const [search, setSearch] = useState("");
  const [activeChip, setActiveChip] = useState(null);

  const filtered = useMemo(() => {
    let list = items;
    if (activeChip && chipField) list = list.filter(i => i[chipField] === activeChip);
    if (search) list = list.filter(i => (i[nameKey] || "").toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [items, search, nameKey, activeChip, chipField]);

  return (
    <div className="flex flex-col h-full">
      {chipOptions && chipOptions.length > 0 && (
        <FilterChips options={chipOptions} active={activeChip} onToggle={setActiveChip} />
      )}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={searchPlaceholder || "Search..."}
          className="w-full pl-8 pr-3 h-8 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
        />
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 max-h-48">
        {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-6">No items found</p>}
        {filtered.map(item => {
          const val = item[nameKey];
          const isSelected = selected === val;
          return (
            <label key={item.id || val} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${isSelected ? "bg-emerald-50 border border-emerald-200" : "hover:bg-slate-50 border border-transparent"}`}>
              <Checkbox checked={isSelected} onCheckedChange={() => onSelect(val)} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${colorClass}`}>{val}</span>
                {item._subtitle && (
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{item._subtitle}</p>
                )}
              </div>
              {item._badge && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase shrink-0">{item._badge}</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function BulkAssignDialog({ open, onClose, onAssign, people = [], enterprises = [], products = [], services = [], addresses = [], existingRelationships = [], currentUser = null }) {
  const [mode, setMode] = useState(null);
  const [leftSelected, setLeftSelected] = useState([]);
  const [rightSelected, setRightSelected] = useState([]);
  const [rightSingle, setRightSingle] = useState("");
  const [role, setRole] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  const modeConfig = TYPES.find(t => t.id === mode);

  // Build items with context (_badge for type, _subtitle for role)
  const buildPeopleItems = () => people.map(p => ({
    id: p.id,
    name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.first_name || "Unknown",
    _badge: p.person_type,
    _subtitle: p.primary_role || null,
    person_type: p.person_type,
  }));

  const buildEnterpriseItems = () => enterprises.map(e => ({
    id: e.id,
    name: e.enterprise_name,
    _badge: e.enterprise_tier,
    _subtitle: e.enterprise_type ? `Type: ${e.enterprise_type}` : null,
    enterprise_tier: e.enterprise_tier,
  }));

  const buildProductItems = () => products.map(p => ({
    id: p.id,
    name: p.name || p.product_name,
    _badge: p.item_type,
    _subtitle: p.item_class ? (Array.isArray(p.item_class) ? p.item_class[0] : p.item_class) : null,
    item_type: p.item_type,
  }));

  const getLeftItems = () => {
    if (!modeConfig) return [];
    if (["person_enterprise", "people_enterprises", "person_service", "person_address", "person_person"].includes(mode)) return buildPeopleItems();
    if (["enterprise_person", "enterprise_service", "enterprise_address", "enterprise_enterprise"].includes(mode)) return buildEnterpriseItems();
    if (["item_enterprise", "item_person"].includes(mode)) return buildProductItems();
    return [];
  };

  const getRightItems = () => {
    if (!modeConfig) return [];
    if (["person_enterprise", "people_enterprises", "item_enterprise", "enterprise_service", "enterprise_enterprise"].includes(mode)) return buildEnterpriseItems();
    if (["enterprise_person", "item_person", "person_person"].includes(mode)) return buildPeopleItems();
    if (["person_service"].includes(mode)) return services.map(s => ({ id: s.id, name: s.name }));
    if (["person_address", "enterprise_address"].includes(mode)) return addresses.map(a => ({ id: a.id, name: a.label || a.address_line1 }));
    return [];
  };

  // Chip config for left/right panels
  const getLeftChips = () => {
    if (["person_enterprise", "people_enterprises", "person_service", "person_address", "person_person"].includes(mode)) return { options: PERSON_TYPE_CHIPS, field: "person_type" };
    if (["enterprise_person", "enterprise_service", "enterprise_address", "enterprise_enterprise"].includes(mode)) return { options: ENT_TIER_CHIPS, field: "enterprise_tier" };
    if (["item_enterprise", "item_person"].includes(mode)) return { options: ITEM_TYPE_CHIPS, field: "item_type" };
    return {};
  };

  const getRightChips = () => {
    if (["person_enterprise", "people_enterprises", "item_enterprise", "enterprise_service", "enterprise_enterprise"].includes(mode)) return { options: ENT_TIER_CHIPS, field: "enterprise_tier" };
    if (["enterprise_person", "item_person", "person_person"].includes(mode)) return { options: PERSON_TYPE_CHIPS, field: "person_type" };
    return {};
  };

  const isManyToMany = mode === "people_enterprises";
  const isEnterprisePerson = mode === "enterprise_person";
  const leftItems = getLeftItems();
  const rightItems = getRightItems();
  const leftChips = getLeftChips();
  const rightChips = getRightChips();

  const toggleLeft = (val) => setLeftSelected(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);

  const getPairsCount = () => {
    if (isManyToMany) return leftSelected.length * rightSelected.length;
    if (isEnterprisePerson) return leftSelected.length * rightSelected.length;
    return leftSelected.length;
  };

  const buildPairs = () => {
    const today = startDate || new Date().toISOString().split("T")[0];
    const pairs = [];

    const relType = {
      person_enterprise:     "person_enterprise",
      enterprise_person:     "person_enterprise",
      people_enterprises:    "person_enterprise",
      item_enterprise:       "item_enterprise",
      item_person:           "item_person",
      person_service:        "person_service",
      enterprise_service:    "enterprise_service",
      person_address:        "person_address",
      enterprise_address:    "enterprise_address",
      person_person:         "person_person",
      enterprise_enterprise: "enterprise_enterprise",
    }[mode];

    if (isManyToMany) {
      for (const l of leftSelected) for (const r of rightSelected) {
        pairs.push({ relationship_type: relType, person_name: l, enterprise_name: r, role, start_date: today, status: "active" });
      }
    } else if (isEnterprisePerson) {
      // Left = enterprises (multi), Right = people (multi-select)
      for (const ent of leftSelected) for (const person of rightSelected) {
        pairs.push({ relationship_type: relType, enterprise_name: ent, person_name: person, role, start_date: today, status: "active" });
      }
    } else {
      const rightVal = rightSingle;
      for (const l of leftSelected) {
        const rec = { relationship_type: relType, role, start_date: today, status: "active" };
        if (["person_enterprise", "people_enterprises"].includes(mode)) { rec.person_name = l; rec.enterprise_name = rightVal; }
        else if (mode === "item_enterprise") { rec.item_name = l; rec.enterprise_name = rightVal; }
        else if (mode === "item_person") { rec.item_name = l; rec.person_name = rightVal; }
        else if (mode === "person_service") { rec.person_name = l; rec.service_name = rightVal; }
        else if (mode === "enterprise_service") { rec.enterprise_name = l; rec.service_name = rightVal; }
        else if (mode === "person_address") { rec.person_name = l; rec.location = rightVal; }
        else if (mode === "enterprise_address") { rec.enterprise_name = l; rec.location = rightVal; }
        else if (mode === "person_person") { rec.person_name = l; rec.secondary_person = rightVal; }
        else if (mode === "enterprise_enterprise") { rec.enterprise_name = l; rec.secondary_enterprise = rightVal; }
        pairs.push(rec);
      }
    }

    // Mark duplicates
    return pairs.map(p => {
      const isDuplicate = existingRelationships.some(r =>
        r.relationship_type === p.relationship_type &&
        (!p.person_name || r.person_name === p.person_name) &&
        (!p.enterprise_name || r.enterprise_name === p.enterprise_name) &&
        (!p.item_name || r.item_name === p.item_name) &&
        (!p.service_name || r.service_name === p.service_name) &&
        (!p.location || r.location === p.location)
      );
      return { ...p, isDuplicate };
    });
  };

  const handleAssign = async () => {
    const pairs = buildPairs().filter(p => !p.isDuplicate);
    if (pairs.length === 0) return;
    setLoading(true);
    await onAssign(pairs);
    setLoading(false);
    handleClose();
  };

  const handleClose = () => {
    setMode(null); setLeftSelected([]); setRightSelected([]); setRightSingle(""); setRole("");
    onClose();
  };

  const pairs = mode ? buildPairs() : [];
  const newPairs = pairs.filter(p => !p.isDuplicate);
  const dupPairs = pairs.filter(p => p.isDuplicate);
  const isValid = leftSelected.length > 0 && (isManyToMany || isEnterprisePerson ? rightSelected.length > 0 : !!rightSingle);

  // Helper to get display names for a pair
  const pairLeft = (p) => p.person_name || p.enterprise_name || p.item_name || "—";
  const pairRight = (p) => p.secondary_person || p.secondary_enterprise || (p.person_name && p.enterprise_name ? p.enterprise_name : null) || p.enterprise_name || p.person_name || p.service_name || p.location || "—";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="w-4 h-4 text-emerald-600" /> Bulk Assign Relationships
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Choose mode */}
        {!mode && (
          <div>
            <p className="text-sm text-slate-500 mb-4">Choose what you want to bulk-assign:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {TYPES.map(t => (
                <button key={t.id} onClick={() => { setMode(t.id); setLeftSelected([]); setRightSelected([]); setRightSingle(""); }}
                  className="text-left border border-slate-200 rounded-xl p-4 hover:border-emerald-400 hover:bg-emerald-50 transition-all group">
                  <p className="text-sm font-semibold text-slate-700 group-hover:text-emerald-700">{t.label}</p>
                  <p className="text-xs text-slate-400 mt-1">Select multiple <strong>{t.leftLabel}</strong> → one or many <strong>{t.rightLabel}</strong></p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Select + configure */}
        {mode && modeConfig && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setMode(null)} className="text-xs text-slate-400 hover:text-slate-600">← Back</button>
              <Badge className="bg-emerald-50 text-emerald-700">{modeConfig.label}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left panel */}
              <div className="bg-slate-50 rounded-xl p-4 flex flex-col">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Select {modeConfig.leftLabel} <span className="text-emerald-600">({leftSelected.length} selected)</span>
                </p>
                <SelectableList
                  items={leftItems}
                  selected={leftSelected}
                  onToggle={toggleLeft}
                  searchPlaceholder={`Search ${modeConfig.leftLabel}...`}
                  nameKey="name"
                  colorClass={modeConfig.leftColor}
                  chipOptions={leftChips.options}
                  chipField={leftChips.field}
                />
              </div>

              {/* Right panel */}
              <div className="bg-slate-50 rounded-xl p-4 flex flex-col">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Target {modeConfig.rightLabel}{" "}
                  {(isManyToMany || isEnterprisePerson) && <span className="text-emerald-600">({rightSelected.length} selected)</span>}
                </p>
                {isManyToMany || isEnterprisePerson ? (
                  <SelectableList
                    items={rightItems}
                    selected={rightSelected}
                    onToggle={(val) => setRightSelected(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val])}
                    searchPlaceholder={`Search ${modeConfig.rightLabel}...`}
                    nameKey="name"
                    colorClass={modeConfig.rightColor}
                    chipOptions={rightChips.options}
                    chipField={rightChips.field}
                  />
                ) : (
                  <SingleSelect
                    items={rightItems}
                    selected={rightSingle}
                    onSelect={(val) => setRightSingle(prev => prev === val ? "" : val)}
                    searchPlaceholder={`Search ${modeConfig.rightLabel}...`}
                    nameKey="name"
                    colorClass={modeConfig.rightColor}
                    chipOptions={rightChips.options}
                    chipField={rightChips.field}
                  />
                )}
              </div>
            </div>

            {/* Optional role + date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">Role (optional)</label>
                <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Manager, Staff..."
                  className="w-full h-9 text-sm border border-slate-200 rounded-lg px-3 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full h-9 text-sm border border-slate-200 rounded-lg px-3 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
              </div>
            </div>

            {/* Preview table */}
            {isValid && pairs.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-bold text-slate-600">
                    Preview: {newPairs.length} new · {dupPairs.length > 0 && <span className="text-amber-600">{dupPairs.length} duplicate{dupPairs.length !== 1 ? "s" : ""}</span>}
                  </p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="text-left px-3 py-1.5 text-slate-500 font-semibold">Left</th>
                        <th className="text-left px-3 py-1.5 text-slate-500 font-semibold">Right</th>
                        <th className="text-left px-3 py-1.5 text-slate-500 font-semibold">Role</th>
                        <th className="text-left px-3 py-1.5 text-slate-500 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pairs.slice(0, 20).map((p, i) => (
                        <tr key={i} className={`border-b border-slate-50 ${p.isDuplicate ? "bg-amber-50" : "bg-white"}`}>
                          <td className="px-3 py-1.5 font-medium text-slate-700 truncate max-w-[120px]">{pairLeft(p)}</td>
                          <td className="px-3 py-1.5 text-slate-600 truncate max-w-[120px]">{pairRight(p)}</td>
                          <td className="px-3 py-1.5 text-slate-400">{p.role || "—"}</td>
                          <td className="px-3 py-1.5">
                            {p.isDuplicate ? (
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 font-semibold text-[10px]">Already exists</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-semibold text-[10px]">New</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {pairs.length > 20 && (
                        <tr><td colSpan={4} className="px-3 py-1.5 text-slate-400 text-center">...and {pairs.length - 20} more</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button disabled={!isValid || loading || newPairs.length === 0} onClick={handleAssign}
                className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Assigning...</> : `Assign ${newPairs.length} Relationship${newPairs.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
