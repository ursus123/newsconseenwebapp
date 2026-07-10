import React, { useState } from "react";
import { ncClient } from "@/api/ncClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus, Pencil, Ban, ChevronDown, ChevronUp, User,
  Pill, Calendar, Stethoscope, FileText, Clock, AlertCircle, CheckCircle2
} from "lucide-react";
import MedProfileForm from "./MedProfileForm";

const STATUS_STYLES = {
  active:       "bg-emerald-100 text-emerald-700",
  discontinued: "bg-red-100 text-red-600",
  on_hold:      "bg-yellow-100 text-yellow-700",
  prn:          "bg-blue-100 text-blue-700",
};

function MedProfileCard({ med, isAdmin, onEdit, onDiscontinue }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${med.status === "discontinued" ? "opacity-70 border-gray-100" : "border-gray-100"}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${med.status === "discontinued" ? "bg-gray-100" : "bg-blue-50"}`}>
          <Pill className={`w-4 h-4 ${med.status === "discontinued" ? "text-gray-400" : "text-blue-600"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900 truncate">{med.medication_name.toUpperCase()}</p>
          <p className="text-xs text-gray-400">{[med.strength, med.dose_amount, med.route].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[med.status] || STATUS_STYLES.active}`}>
            {med.status?.replace("_", " ").toUpperCase()}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {med.frequency && (
              <div className="flex items-start gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-gray-400 font-semibold">Frequency</p>
                  <p className="text-gray-700">{med.frequency}</p>
                </div>
              </div>
            )}
            {med.schedule_times?.length > 0 && (
              <div className="flex items-start gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-gray-400 font-semibold">Time(s)</p>
                  <p className="text-gray-700">{med.schedule_times.join(", ")}</p>
                </div>
              </div>
            )}
            {med.prescriber && (
              <div className="flex items-start gap-1.5">
                <Stethoscope className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-gray-400 font-semibold">Prescriber</p>
                  <p className="text-gray-700">{med.prescriber}</p>
                </div>
              </div>
            )}
            {med.indication && (
              <div className="flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-gray-400 font-semibold">Indication</p>
                  <p className="text-gray-700">{med.indication}</p>
                </div>
              </div>
            )}
            {med.start_date && (
              <div className="flex items-start gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-gray-400 font-semibold">Start Date</p>
                  <p className="text-gray-700">{format(new Date(med.start_date), "MMM d, yyyy")}</p>
                </div>
              </div>
            )}
            {med.end_date && (
              <div className="flex items-start gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-gray-400 font-semibold">End Date</p>
                  <p className="text-gray-700">{format(new Date(med.end_date), "MMM d, yyyy")}</p>
                </div>
              </div>
            )}
            {med.pharmacy && (
              <div className="flex items-start gap-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-gray-400 font-semibold">Pharmacy</p>
                  <p className="text-gray-700">{med.pharmacy}</p>
                </div>
              </div>
            )}
            {med.rx_number && (
              <div className="flex items-start gap-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-gray-400 font-semibold">Rx #</p>
                  <p className="text-gray-700">{med.rx_number}</p>
                </div>
              </div>
            )}
          </div>

          {med.instructions && (
            <div className="bg-blue-50 rounded-xl px-3 py-2">
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-0.5">Instructions</p>
              <p className="text-xs text-blue-800">{med.instructions}</p>
            </div>
          )}

          {med.discontinue_reason && (
            <div className="bg-red-50 rounded-xl px-3 py-2">
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-0.5">Discontinuation Reason</p>
              <p className="text-xs text-red-700">{med.discontinue_reason}</p>
            </div>
          )}

          {med.notes && (
            <p className="text-xs text-gray-500 italic">{med.notes}</p>
          )}

          {isAdmin && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onEdit(med)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200 transition-all"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              {med.status === "active" && (
                <button
                  onClick={() => onDiscontinue(med)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 transition-all"
                >
                  <Ban className="w-3.5 h-3.5" /> Discontinue
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MedProfileTab({ selectedClient, isAdmin }) {
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [discontinueTarget, setDiscontinueTarget] = useState(null);
  const [discontinueReason, setDiscontinueReason] = useState("");
  const [showPast, setShowPast] = useState(false);
  const queryClient = useQueryClient();

  const clientId = selectedClient?.id;
  const clientName = selectedClient ? `${selectedClient.first_name} ${selectedClient.last_name}` : null;

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["med-profiles", clientId],
    queryFn: () => ncClient.entities.MedicationProfile.filter({ client_id: clientId }),
    enabled: !!clientId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => ncClient.entities.MedicationProfile.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["med-profiles", clientId] }),
  });

  const handleDiscontinue = () => {
    if (!discontinueTarget) return;
    updateMutation.mutate({
      id: discontinueTarget.id,
      data: {
        status: "discontinued",
        end_date: format(new Date(), "yyyy-MM-dd"),
        discontinue_reason: discontinueReason,
      },
    });
    setDiscontinueTarget(null);
    setDiscontinueReason("");
  };

  const active = profiles.filter((p) => p.status !== "discontinued");
  const past = profiles.filter((p) => p.status === "discontinued");

  if (!selectedClient) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <User className="w-10 h-10 mb-2 opacity-30" />
        <p className="text-sm font-semibold">Select a client to view their medication profile</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Client header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          {selectedClient.photo_url
            ? <img src={selectedClient.photo_url} className="w-11 h-11 rounded-full object-cover" alt="" />
            : <User className="w-5 h-5 text-blue-600" />}
        </div>
        <div className="flex-1">
          <p className="text-base font-black text-gray-900">{clientName}</p>
          <p className="text-xs text-gray-400">{active.length} active · {past.length} past</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {/* Active medications */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Current Medications</p>
        {isLoading && <p className="text-center text-sm text-gray-400 py-8">Loading…</p>}
        {!isLoading && active.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <Pill className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">No active medications on file</p>
            {isAdmin && <p className="text-xs mt-1 opacity-60">Use "Add" to create a medication profile</p>}
          </div>
        )}
        {active.map((med) => (
          <MedProfileCard
            key={med.id}
            med={med}
            isAdmin={isAdmin}
            onEdit={(m) => { setEditTarget(m); setShowForm(true); }}
            onDiscontinue={(m) => setDiscontinueTarget(m)}
          />
        ))}
      </div>

      {/* Past medications */}
      {past.length > 0 && (
        <div className="space-y-2">
          <button
            className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1"
            onClick={() => setShowPast((v) => !v)}
          >
            {showPast ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Past / Discontinued Medications ({past.length})
          </button>
          {showPast && past.map((med) => (
            <MedProfileCard
              key={med.id}
              med={med}
              isAdmin={isAdmin}
              onEdit={(m) => { setEditTarget(m); setShowForm(true); }}
              onDiscontinue={() => {}}
            />
          ))}
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <MedProfileForm
          client={selectedClient}
          existing={editTarget}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          onSuccess={() => {
            setShowForm(false);
            setEditTarget(null);
            queryClient.invalidateQueries({ queryKey: ["med-profiles", clientId] });
          }}
        />
      )}

      {/* Discontinue confirm */}
      {discontinueTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <Ban className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-black text-gray-900 text-sm">Discontinue Medication</p>
                <p className="text-xs text-gray-400">{discontinueTarget.medication_name}</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Reason for discontinuation</label>
              <textarea
                rows={3}
                value={discontinueReason}
                onChange={(e) => setDiscontinueReason(e.target.value)}
                placeholder="e.g. Completed course, side effects, prescriber order..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDiscontinueTarget(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm">Cancel</button>
              <button onClick={handleDiscontinue} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700">Discontinue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}