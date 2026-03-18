import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

export default function PostConfirmDialog({ open, onClose, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <CheckCircle className="w-5 h-5" /> Post Transaction
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-slate-600">
            Post this transaction? This will lock the record, update inventory, and reflect on dashboards. <strong>This cannot be undone</strong> (only voided).
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onConfirm}>
              Post Transaction
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}