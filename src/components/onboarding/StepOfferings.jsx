import React, { useState } from "react";
import { Plus, X } from "lucide-react";

const ITEM_TYPES = [
  { value: "fixed_asset", label: "Equipment / Asset" },
  { value: "medication", label: "Medication" },
  { value: "inventory_item", label: "Inventory Item" },
  { value: "consumable", label: "Supply / Consumable" },
  { value: "digital_item", label: "Digital Item" },
  { value: "other", label: "Other" },
];

const SERVICE_CATEGORIES = [
  { value: "cleaning", label: "Cleaning" },
  { value: "maintenance", label: "Maintenance" },
  { value: "it_support", label: "Healthcare / Medical" },
  { value: "consulting", label: "Consulting" },
  { value: "training", label: "Education / Training" },
  { value: "delivery", label: "Delivery" },
  { value: "other", label: "Other" },
];

const PRICING_MODELS = [
  { value: "fixed", label: "Fixed Price" },
  { value: "hourly", label: "Hourly" },
  { value: "per_unit", label: "Per Unit" },
];

const EMPTY_PRODUCT = { name: "", item_type: "inventory_item", stock_quantity: "", unit_price: "" };
const EMPTY_SERVICE = { name: "", category: "consulting", pricing_model: "fixed", price: "" };

export default function StepOfferings({ items, onChange }) {
  const [mode, setMode] = useState("product");
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE);
  const [err, setErr] = useState({});

  const inputCls = (key) =>
    `w-full px-3 py-2 rounded-xl border text-sm outline-none transition-colors
    ${err[key] ? "border-red-400 bg-red-50" : "border-slate-200 focus:border-emerald-400 bg-white"}`;

  const addItem = () => {
    const e = {};
    if (mode === "product" && !productForm.name.trim()) e.name = "Required";
    if (mode === "service" && !serviceForm.name.trim()) e.name = "Required";
    if (Object.keys(e).length) { setErr(e); return; }
    const entry = mode === "product"
      ? { ...productForm, _type: "product", id: Date.now() }
      : { ...serviceForm, _type: "service", id: Date.now() };
    onChange([...items, entry]);
    setProductForm(EMPTY_PRODUCT);
    setServiceForm(EMPTY_SERVICE);
    setErr({});
  };

  const remove = (id) => onChange(items.filter((i) => i.id !== id));

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">📦</div>
        <h2 className="text-xl font-bold text-slate-800">What do you offer or manage?</h2>
        <p className="text-slate-500 text-sm mt-1">Add your first product or service</p>
      </div>

      {/* Toggle */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { key: "product", emoji: "📦", label: "Product / Item" },
          { key: "service", emoji: "⚙️", label: "Service" },
        ].map(({ key, emoji, label }) => (
          <button
            key={key}
            onClick={() => { setMode(key); setErr({}); }}
            className={`flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 text-sm font-semibold transition-all
              ${mode === key ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
          >
            <span className="text-2xl">{emoji}</span>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
        {mode === "product" ? (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Item Name *</label>
              <input className={inputCls("name")} placeholder="e.g. Blood Pressure Monitor" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
              {err.name && <p className="text-xs text-red-500 mt-0.5">{err.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Item Type</label>
                <select className={inputCls("item_type")} value={productForm.item_type} onChange={(e) => setProductForm({ ...productForm, item_type: e.target.value })}>
                  {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Quantity</label>
                <input type="number" className={inputCls("stock_quantity")} placeholder="0" value={productForm.stock_quantity} onChange={(e) => setProductForm({ ...productForm, stock_quantity: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Price</label>
              <input type="number" className={inputCls("unit_price")} placeholder="0.00" value={productForm.unit_price} onChange={(e) => setProductForm({ ...productForm, unit_price: e.target.value })} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Service Name *</label>
              <input className={inputCls("name")} placeholder="e.g. Home Care Visit" value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} />
              {err.name && <p className="text-xs text-red-500 mt-0.5">{err.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
                <select className={inputCls("category")} value={serviceForm.category} onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })}>
                  {SERVICE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Pricing</label>
                <select className={inputCls("pricing_model")} value={serviceForm.pricing_model} onChange={(e) => setServiceForm({ ...serviceForm, pricing_model: e.target.value })}>
                  {PRICING_MODELS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Price</label>
              <input type="number" className={inputCls("price")} placeholder="0.00" value={serviceForm.price} onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })} />
            </div>
          </>
        )}
        <button
          onClick={addItem}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-emerald-300 text-emerald-600 text-sm font-semibold hover:bg-emerald-50 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add {mode === "product" ? "Product" : "Service"}
        </button>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span>{item._type === "product" ? "📦" : "⚙️"}</span>
                  <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {item._type === "product" ? item.item_type : item.category}
                  {(item.unit_price || item.price) ? ` · $${item.unit_price || item.price}` : ""}
                </p>
              </div>
              <button onClick={() => remove(item.id)} className="text-slate-300 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}