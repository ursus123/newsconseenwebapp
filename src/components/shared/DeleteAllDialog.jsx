import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, AlertTriangle } from "lucide-react";

/**
 * DeleteAllDialog — confirms deleting all records in an entity.
 * Props: open, onClose, onConfirm, entityLabel, count
 */
export default function DeleteAllDialog({ open, onClose, onConfirm, entityLabel = "records", count = 0 }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  const handleConfirm = async () => {
    setConfirming(true);
    await onConfirm();
    setConfirming(false);
    setTyped("");
    onClose();
  };

  const handleClose = () => { setTyped(""); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-rose-600" />
            </div>
            <DialogTitle className="text-rose-700">Delete All {entityLabel}</DialogTitle>
          </div>
          <DialogDescription>
            <div className="space-y-3 mt-2">
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-700">
                  This will permanently delete <span className="font-bold">{count} {entityLabel}</span> from the Base44 database. This action cannot be undone.
                </p>
              </div>
              <p className="text-sm text-slate-600">
                Type <span className="font-mono font-bold text-rose-600">DELETE ALL</span> to confirm:
              </p>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="DELETE ALL"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
              />
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={handleClose} className="rounded-xl">Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={typed !== "DELETE ALL" || confirming}
            className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl disabled:opacity-40"
          >
            {confirming ? "Deleting..." : `Delete All ${count}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}