import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle } from "lucide-react";

const OUTCOMES = [
  { value: "completed", label: "Completed" },
  { value: "partially_done", label: "Partially Done" },
  { value: "refused", label: "Refused" },
  { value: "missed", label: "Missed" },
  { value: "not_applicable", label: "Not Applicable" },
];

export default function OutcomeDialog({ open, onClose, taskTitle, onConfirm }) {
  const nowTime = () => new Date().toTimeString().slice(0, 5);
  const [outcome, setOutcome] = useState("completed");
  const [notes, setNotes] = useState("");
  const [completedTime, setCompletedTime] = useState(nowTime());

  const handleConfirm = () => {
    onConfirm({ outcome, outcome_notes: notes, completed_time: completedTime });
    setOutcome("completed");
    setNotes("");
    setCompletedTime(nowTime());
  };

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <CheckCircle className="w-5 h-5" /> Complete Task
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {taskTitle && (
            <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2 font-medium">{taskTitle}</p>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Outcome *</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Outcome Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observations, details, what happened..."
              rows={3}
              className="rounded-xl resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Completion Time</Label>
            <Input type="time" value={completedTime} onChange={(e) => setCompletedTime(e.target.value)} className="rounded-xl" />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleConfirm}>
              Mark Completed
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}