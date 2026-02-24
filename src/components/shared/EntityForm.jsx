import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Save, X } from "lucide-react";

export default function EntityForm({ open, onClose, onSubmit, fields, initialData, title }) {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      const defaults = {};
      fields.forEach((f) => {
        if (f.default !== undefined) defaults[f.key] = f.default;
      });
      setFormData(defaults);
    }
  }, [initialData, open]);

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">{field.label}</Label>
              {field.type === "select" ? (
                <Select
                  value={formData[field.key] || ""}
                  onValueChange={(val) => handleChange(field.key, val)}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.type === "textarea" ? (
                <Textarea
                  value={formData[field.key] || ""}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="rounded-xl resize-none"
                  rows={3}
                />
              ) : (
                <Input
                  type={field.type || "text"}
                  value={formData[field.key] || ""}
                  onChange={(e) => handleChange(field.key, field.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
                  className="rounded-xl"
                  required={field.required}
                  step={field.type === "number" ? "0.01" : undefined}
                />
              )}
            </div>
          ))}
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
              <X className="w-4 h-4 mr-2" />Cancel
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">
              <Save className="w-4 h-4 mr-2" />Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}