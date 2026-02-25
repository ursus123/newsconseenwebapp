import React from "react";
import { AlertCircle, Clock, Pill, User, X } from "lucide-react";
import { format } from "date-fns";

const SNOOZE_OPTIONS = [
  { label: "5 min", minutes: 5 },
  { label: "10 min", minutes: 10 },
  { label: "15 min", minutes: 15 },
];

export default function MedAlertModal({ notification, onSnooze, onAdminister, onDismiss }) {
  if (!notification) return null;

  const isOverdue = notification.type === "overdue";

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header - Color coded by urgency */}
        <div className={`px-6 py-5 ${isOverdue ? "bg-gradient-to-r from-red-500 to-red-600" : "bg-gradient-to-r from-blue-500 to-blue-600"}`}>
          <div className="flex items-start gap-3 text-white">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isOverdue ? "bg-white/20" : "bg-white/20"}`}>
              {isOverdue ? (
                <AlertCircle className="w-6 h-6 animate-pulse" />
              ) : (
                <Clock className="w-6 h-6" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold opacity-90 uppercase tracking-wider">
                {isOverdue ? "⚠️ Medication Overdue" : "🔔 Medication Due"}
              </p>
              <p className="text-xl font-black mt-0.5 leading-tight">{notification.title}</p>
            </div>
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Client info */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Client</p>
              <p className="text-sm font-black text-slate-800">{notification.client}</p>
            </div>
          </div>

          {/* Time info */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Scheduled Time</p>
              <p className="text-sm font-black text-slate-800">{notification.scheduledTime}</p>
              {isOverdue && (
                <p className="text-xs text-red-600 font-semibold mt-0.5">
                  Created {format(notification.createdAt, "h:mm a")}
                </p>
              )}
            </div>
          </div>

          {/* Snooze options */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
              Snooze Reminder
            </p>
            <div className="grid grid-cols-3 gap-2">
              {SNOOZE_OPTIONS.map((option) => (
                <button
                  key={option.minutes}
                  onClick={() => onSnooze(option.minutes)}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all group"
                >
                  <Clock className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                  <span className="text-sm font-bold text-slate-600 group-hover:text-blue-600">
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={onAdminister}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base shadow-lg hover:shadow-xl transition-all active:scale-98 ${
                isOverdue
                  ? "bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700"
                  : "bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700"
              }`}
            >
              <Pill className="w-5 h-5" />
              Administer Now
            </button>
            <button
              onClick={onDismiss}
              className="w-full py-3 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all"
            >
              Dismiss Alert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}