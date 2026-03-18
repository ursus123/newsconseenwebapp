import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

export default function VoidDialog({ open, onClose, onConfirm }) {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={() => { setReason(""); onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <AlertTriangle className="w-5 h-5" /> Void Transaction
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-slate-600">
            This will reverse all impacts of the posted transaction and cannot be undone.
          </p>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Reason for voiding *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this transaction is being voided..."
              rows={3}
              className="rounded-xl"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setReason(""); onClose(); }}>Cancel</Button>
            <Button
              disabled={!reason.trim()}
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={handleConfirm}
            >
              Void Transaction
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}