import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StopCircle, Archive } from "lucide-react";

export default function EndRelationshipDialog({ open, onClose, onConfirm }) {
  const today = new Date().toISOString().split("T")[0];
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");

  const handleEnd = () => { onConfirm({ status: "ended", end_date: endDate, notes: reason }); setReason(""); setEndDate(today); };
  const handleArchive = () => { onConfirm({ status: "archived", notes: reason }); setReason(""); };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <StopCircle className="w-5 h-5" /> End Relationship
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">
            Ending preserves history for analytics. Use Archive only if this was entered in error.
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">End Date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this relationship ending?" rows={2} className="rounded-xl resize-none" />
          </div>
          <div className="flex gap-2 justify-between pt-1">
            <Button variant="outline" className="rounded-xl border-slate-300 text-slate-500" onClick={() => { handleArchive(); }}>
              <Archive className="w-4 h-4 mr-1.5" /> Archive (error)
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl" onClick={handleEnd}>
                <StopCircle className="w-4 h-4 mr-1.5" /> End Relationship
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}