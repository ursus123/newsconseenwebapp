import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, Rocket } from "lucide-react";

export default function ComingSoonModal({ app, userEmail, onClose }) {
  const storageKey = `notify_me_apps_${userEmail}`;
  const notified = JSON.parse(localStorage.getItem(storageKey) || "[]");
  const [requested, setRequested] = useState(notified.includes(app?.id));

  const handleNotify = () => {
    const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!existing.includes(app.id)) {
      localStorage.setItem(storageKey, JSON.stringify([...existing, app.id]));
    }
    setRequested(true);
  };

  if (!app) return null;

  return (
    <Dialog open={!!app} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="text-2xl">{app.emoji}</span>
            {app.name} — Coming Soon
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
            <Rocket className="w-5 h-5 text-slate-400 shrink-0" />
            <p className="text-sm text-slate-600">
              This application is being built and will be available soon. Want to be notified when it launches?
            </p>
          </div>
          {requested ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-medium">
              <Bell className="w-4 h-4" /> You'll be notified when this app launches!
            </div>
          ) : (
            <Button className="w-full" onClick={handleNotify}>
              <Bell className="w-4 h-4" /> Notify Me
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}