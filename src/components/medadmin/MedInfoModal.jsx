import React from "react";
import { X, Pill, AlertTriangle, Info, Package, Calendar, Thermometer, FileText, ShieldAlert } from "lucide-react";

function Section({ icon: Icon, title, content, color = "text-gray-700", bg = "bg-gray-50" }) {
  if (!content) return null;
  return (
    <div className={`rounded-2xl p-4 ${bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <p className={`text-xs font-bold uppercase tracking-wider ${color}`}>{title}</p>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{content}</p>
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-2 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 shrink-0">{label}</span>
      <span className="text-xs font-semibold text-gray-700 text-right">{value}</span>
    </div>
  );
}

export default function MedInfoModal({ product, taskTitle, onClose }) {
  const name = product?.name || taskTitle || "Medication";

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100 z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
              {product?.image_url
                ? <img src={product.image_url} className="w-10 h-10 rounded-xl object-cover" alt="" />
                : <Pill className="w-6 h-6 text-blue-600" />}
            </div>
            <div>
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Medication Info</p>
              <p className="text-lg font-black text-gray-900 leading-tight">{name.toUpperCase()}</p>
              {product?.sku && <p className="text-xs text-gray-400">SKU: {product.sku}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* No product found */}
          {!product && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Info className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm font-semibold">No product record linked</p>
              <p className="text-xs mt-1 opacity-60">Add this medication to the Products catalogue to see details here.</p>
            </div>
          )}

          {product && (
            <>
              {/* Description */}
              <Section
                icon={FileText}
                title="Description"
                content={product.description}
                color="text-blue-700"
                bg="bg-blue-50"
              />

              {/* Dosage instructions */}
              <Section
                icon={Info}
                title="Dosage Instructions"
                content={product.dosage_instructions}
                color="text-emerald-700"
                bg="bg-emerald-50"
              />

              {/* Side effects */}
              <Section
                icon={AlertTriangle}
                title="Common Side Effects"
                content={product.side_effects}
                color="text-amber-700"
                bg="bg-amber-50"
              />

              {/* Contraindications */}
              <Section
                icon={ShieldAlert}
                title="Contraindications & Warnings"
                content={product.contraindications}
                color="text-red-700"
                bg="bg-red-50"
              />

              {/* Storage */}
              <Section
                icon={Thermometer}
                title="Storage Instructions"
                content={product.storage_instructions}
                color="text-indigo-700"
                bg="bg-indigo-50"
              />

              {/* Quick facts */}
              <div className="bg-gray-50 rounded-2xl px-4 py-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Quick Facts</p>
                <InfoRow label="Batch No." value={product.batch_number} />
                <InfoRow label="Expiry" value={product.expiry_date} />
                <InfoRow label="Supplier" value={product.supplier} />
                <InfoRow label="Stock" value={product.stock_quantity != null ? `${product.stock_quantity} ${product.unit || ""}` : null} />
                <InfoRow label="Regulatory" value={product.regulatory_status?.replace(/_/g, " ")} />
              </div>

              {/* Internal notes */}
              {product.internal_notes && (
                <div className="rounded-2xl border border-gray-200 px-4 py-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Internal Notes</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{product.internal_notes}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 pb-6">
          <button
            onClick={onClose}
            className="w-full py-4 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}