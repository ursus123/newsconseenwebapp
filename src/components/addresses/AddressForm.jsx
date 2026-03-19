import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, X, Archive, Trash2, Upload, MapPin, Link2, StickyNote, Loader2, Search, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";

const TABS = [
  { id: "details", label: "Address Details", icon: MapPin },
  { id: "usage", label: "Usage & Links", icon: Link2 },
  { id: "notes", label: "Notes & Files", icon: StickyNote },
];

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      {children}
    </div>
  );
}

export default function AddressForm({ open, onClose, onSubmit, onArchive, initialData }) {
  const [activeTab, setActiveTab] = useState("details");
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState(null);
  const [geocodeNote, setGeocodeNote] = useState(null);

  useEffect(() => {
    if (open) {
      setActiveTab("details");
      setForm(initialData || { status: "active", attachment_urls: [], linked_people: [], linked_enterprises: [] });
      setGeocodeError(null);
      setGeocodeNote(null);
    }
  }, [open, initialData]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const geocodeAddress = async () => {
    const { address_line1, address_line2, city, state_region, postal_code, country } = form;
    if (!country) {
      setGeocodeError("Please enter a country first");
      return;
    }

    setGeocoding(true);
    setGeocodeError(null);
    setGeocodeNote(null);
    
    try {
      // Try multiple query strategies
      const strategies = [
        // Strategy 1: Full address
        [address_line1, address_line2, city, state_region, postal_code, country].filter(Boolean).join(", "),
        // Strategy 2: Without address line 2
        [address_line1, city, state_region, postal_code, country].filter(Boolean).join(", "),
        // Strategy 3: City-level fallback
        city && country ? [city, state_region, country].filter(Boolean).join(", ") : null,
      ].filter(Boolean);

      let result = null;
      let usedStrategy = 0;

      for (let i = 0; i < strategies.length; i++) {
        const query = encodeURIComponent(strategies[i]);
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
        const data = await response.json();
        
        if (data && data.length > 0) {
          result = data[0];
          usedStrategy = i;
          break;
        }
      }
      
      if (result) {
        const { lat, lon, display_name } = result;
        setForm((f) => ({ ...f, latitude: parseFloat(lat), longitude: parseFloat(lon) }));
        
        if (usedStrategy === 0) {
          setGeocodeNote(`✓ Exact match found: ${display_name}`);
        } else if (usedStrategy === 1) {
          setGeocodeNote(`⚠ Approximate match (no unit/suite): ${display_name}`);
        } else {
          setGeocodeNote(`⚠ City-level match only: ${display_name}. Consider adding more address details for precision.`);
        }
      } else {
        setGeocodeError("Could not find coordinates. Try: (1) Check spelling, (2) Add more address details, (3) Enter coordinates manually.");
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      setGeocodeError("Network error. Please check your connection and try again.");
    } finally {
      setGeocoding(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set("attachment_urls", [...(form.attachment_urls || []), file_url]);
    setUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  const handleSaveAndNew = () => {
    onSubmit(form, true);
  };

  const statusColors = { active: "bg-emerald-50 text-emerald-700", archived: "bg-slate-100 text-slate-500" };

  const renderTab = () => {
    switch (activeTab) {
      case "details":
        return (
          <div className="space-y-4">
            <Field label="Country" required>
              <Input value={form.country || ""} onChange={(e) => set("country", e.target.value)} className="rounded-xl" placeholder="e.g. United States, Canada, UK..." />
            </Field>
            <Field label="Address Line 1" required>
              <Input value={form.address_line1 || ""} onChange={(e) => set("address_line1", e.target.value)} className="rounded-xl" placeholder="Street number and name" />
            </Field>
            <Field label="Address Line 2">
              <Input value={form.address_line2 || ""} onChange={(e) => set("address_line2", e.target.value)} className="rounded-xl" placeholder="Apt, Suite, Floor, etc." />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City">
                <Input value={form.city || ""} onChange={(e) => set("city", e.target.value)} className="rounded-xl" />
              </Field>
              <Field label="State / Region">
                <Input value={form.state_region || ""} onChange={(e) => set("state_region", e.target.value)} className="rounded-xl" />
              </Field>
            </div>
            <Field label="Postal Code">
              <Input value={form.postal_code || ""} onChange={(e) => set("postal_code", e.target.value)} className="rounded-xl" />
            </Field>
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Geo Coordinates</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={geocodeAddress}
                  disabled={geocoding || !form.country}
                  className="rounded-lg text-xs h-7"
                >
                  {geocoding ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Search className="w-3 h-3 mr-1.5" />
                      Verify Address
                    </>
                  )}
                </Button>
              </div>
              {geocodeNote && form.latitude && form.longitude && (
                <div className="mb-3 rounded-xl overflow-hidden border border-emerald-200">
                  <img
                    src={`https://staticmap.openstreetmap.de/staticmap.php?center=${form.latitude},${form.longitude}&zoom=15&size=400x120&markers=${form.latitude},${form.longitude},red-pushpin`}
                    alt="Map preview"
                    className="w-full h-24 object-cover"
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Latitude">
                  <Input type="number" step="any" value={form.latitude ?? ""} onChange={(e) => set("latitude", e.target.value ? parseFloat(e.target.value) : undefined)} className="rounded-xl" placeholder="0.0000" />
                </Field>
                <Field label="Longitude">
                  <Input type="number" step="any" value={form.longitude ?? ""} onChange={(e) => set("longitude", e.target.value ? parseFloat(e.target.value) : undefined)} className="rounded-xl" placeholder="0.0000" />
                </Field>
              </div>
              
              {geocodeError && (
                <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
                  {geocodeError}
                </div>
              )}
              
              {geocodeNote && (
                <div className="mt-2 text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-700">
                  {geocodeNote}
                </div>
              )}
              
              {form.latitude && form.longitude && !geocodeNote && (
                <div className="mt-2 text-xs text-emerald-600 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Coordinates set: {form.latitude.toFixed(4)}, {form.longitude.toFixed(4)}
                </div>
              )}
            </div>
          </div>
        );

      case "usage":
        return (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-3">Linked People</p>
              {(form.linked_people || []).length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center bg-slate-50 rounded-xl">No people linked yet. Link from the People Form.</p>
              ) : (
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold">Person Name</th>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold">Address Type</th>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(form.linked_people || []).map((p, i) => (
                        <tr key={i} className="border-t border-slate-50">
                          <td className="px-4 py-2 text-slate-700">{p.person_name}</td>
                          <td className="px-4 py-2 text-slate-500">{p.address_type}</td>
                          <td className="px-4 py-2">{p.active ? <span className="text-emerald-500">✓</span> : <span className="text-slate-300">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-3">Linked Enterprises</p>
              {(form.linked_enterprises || []).length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center bg-slate-50 rounded-xl">No enterprises linked yet. Link from the Enterprise Form.</p>
              ) : (
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold">Enterprise Name</th>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold">Location Type</th>
                        <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(form.linked_enterprises || []).map((e, i) => (
                        <tr key={i} className="border-t border-slate-50">
                          <td className="px-4 py-2 text-slate-700">{e.enterprise_name}</td>
                          <td className="px-4 py-2 text-slate-500">{e.location_type}</td>
                          <td className="px-4 py-2">{e.active ? <span className="text-emerald-500">✓</span> : <span className="text-slate-300">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-600">
              <p className="font-semibold mb-1">Linking is done from master records:</p>
              <p>• People Form → link a person to this address</p>
              <p>• Enterprise Form → link an enterprise to this address</p>
            </div>
          </div>
        );

      case "notes":
        return (
          <div className="space-y-5">
            <Field label="Internal Notes">
              <Textarea value={form.internal_notes || ""} onChange={(e) => set("internal_notes", e.target.value)} className="rounded-xl resize-none" rows={5} placeholder="Directions, access codes, context..." />
            </Field>
            <Field label="Attachments">
              <div className="space-y-2">
                {(form.attachment_urls || []).map((url, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <a href={url} target="_blank" rel="noreferrer" className="text-sm text-emerald-600 underline truncate flex-1">Attachment {i + 1}</a>
                    <button type="button" onClick={() => set("attachment_urls", form.attachment_urls.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <label className="flex items-center gap-3 border-2 border-dashed border-slate-200 rounded-xl px-4 py-5 cursor-pointer hover:border-emerald-400 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400" />
                  <span className="text-sm text-slate-500">{uploading ? "Uploading..." : "Click to upload file"}</span>
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
              </div>
            </Field>
          </div>
        );

      default:
        return null;
    }
  };

  const currentIdx = TABS.findIndex((t) => t.id === activeTab);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-full p-0 overflow-hidden max-h-[92vh]">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-lg font-semibold text-slate-800">
                {initialData ? "Edit Address" : "New Address"}
              </DialogTitle>
              {initialData?.id && <p className="text-xs text-slate-400 mt-0.5">ID: {initialData.id.slice(0, 8).toUpperCase()}</p>}
            </div>
            <Badge className={statusColors[form.status] || "bg-slate-100 text-slate-500"}>
              ● {(form.status || "active")}
            </Badge>
          </div>
          {/* Always-visible header fields */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Address Label</Label>
              <Input value={form.label || ""} onChange={(e) => set("label", e.target.value)} className="rounded-xl h-9 text-sm" placeholder="e.g. Main Office, Home, Branch" />
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Status</Label>
              <Select value={form.status || "active"} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="rounded-xl h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="flex overflow-hidden">
            {/* Tab Nav */}
            <div className="bg-slate-50/60 px-3 py-4 shrink-0 border-r border-slate-100 min-h-[360px]">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left w-full mb-0.5 transition-all
                      ${active ? "bg-emerald-50 text-emerald-700 font-medium" : "text-slate-500 hover:bg-white hover:text-slate-700"}`}>
                    <Icon className={`w-4 h-4 shrink-0 ${active ? "text-emerald-600" : "text-slate-400"}`} />
                    <span className="whitespace-nowrap">{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div className="flex-1 px-6 py-5 overflow-y-auto max-h-[360px]">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-700">{TABS.find((t) => t.id === activeTab)?.label}</h3>
                <div className="h-px bg-slate-100 mt-2" />
              </div>
              {renderTab()}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/40">
            <div className="flex gap-2">
              {currentIdx > 0 && (
                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setActiveTab(TABS[currentIdx - 1].id)}>← Back</Button>
              )}
              {currentIdx < TABS.length - 1 && (
                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setActiveTab(TABS[currentIdx + 1].id)}>Next →</Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl text-sm"><X className="w-4 h-4 mr-1" /> Cancel</Button>
              {initialData && onArchive && (
                <Button type="button" variant="outline" onClick={() => onArchive(initialData)} className="rounded-xl text-sm border-slate-300 text-slate-600 hover:bg-slate-50">
                  <Archive className="w-4 h-4 mr-1" /> Archive
                </Button>
              )}
              <Button type="button" variant="outline" onClick={handleSaveAndNew} className="rounded-xl text-sm border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                Save & New
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm shadow-lg shadow-emerald-500/20">
                <Save className="w-4 h-4 mr-2" /> Save
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}