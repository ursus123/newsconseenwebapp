import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wrench, Search, CheckCircle2, XCircle, Loader2,
  RefreshCw, AlertTriangle, User, Building2, Edit2, Save
} from "lucide-react";

const ENTITIES = [
  { key: "Enterprise",        get: () => base44.entities.Enterprise },
  { key: "Person",            get: () => base44.entities.Person },
  { key: "Product",           get: () => base44.entities.Product },
  { key: "Service",           get: () => base44.entities.Service },
  { key: "Address",           get: () => base44.entities.Address },
  { key: "Relationship",      get: () => base44.entities.Relationship },
  { key: "Task",              get: () => base44.entities.Task },
  { key: "Transaction",       get: () => base44.entities.Transaction },
  { key: "MedicationProfile", get: () => base44.entities.MedicationProfile },
];

const BAD_IDS = ["", null, undefined, "brightstar_parent"];
const isBad = (v) => BAD_IDS.includes(v);

export default function DataRepair() {
  const [currentUser, setCurrentUser] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [selectedAdmin, setSelectedAdmin] = useState(null);

  // Preview state
  const [scanning, setScanning] = useState(false);
  const [counts, setCounts] = useState(null); // { EntityKey: [records] }

  // Fix state
  const [fixing, setFixing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentEntity: "" });
  const [fixDone, setFixDone] = useState(false);

  // Enterprise name fix state
  const [badEnterprises, setBadEnterprises] = useState([]);
  const [nameEdits, setNameEdits] = useState({});
  const [savingName, setSavingName] = useState({});

  // Verify state
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyUser, setVerifyUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    base44.entities.User.list()
      .then((users) => {
        const adminUsers = users.filter((u) => u.role === "admin");
        setAdmins(adminUsers);
      })
      .finally(() => setLoadingAdmins(false));
  }, [currentUser]);

  // Guard — super_admin only
  if (currentUser && currentUser.role !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <AlertTriangle className="w-8 h-8 text-rose-400" />
        <p className="font-semibold text-slate-700">Access Denied</p>
        <p className="text-sm">This page is only accessible to super admins.</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const handleSelectAdmin = (e) => {
    const admin = admins.find((a) => a.id === e.target.value);
    setSelectedAdmin(admin || null);
    setCounts(null);
    setFixDone(false);
    setVerifyResult(null);
    setVerifyUser(null);
    setBadEnterprises([]);
    setNameEdits({});
  };

  const handleScan = async () => {
    if (!selectedAdmin) return;
    setScanning(true);
    setCounts(null);
    setFixDone(false);
    setVerifyResult(null);

    const result = {};
    for (const { key, get } of ENTITIES) {
      const all = await get().list();
      result[key] = all.filter(
        (r) => isBad(r.company_id) && r.created_by === selectedAdmin.email
      );
    }
    setCounts(result);
    setScanning(false);
  };

  const totalAffected = counts
    ? Object.values(counts).reduce((s, arr) => s + arr.length, 0)
    : 0;

  const handleFix = async () => {
    if (!selectedAdmin || !counts) return;
    setFixing(true);
    setFixDone(false);

    const realId = selectedAdmin.company_id;
    const allRecords = ENTITIES.flatMap(({ key, get }) =>
      (counts[key] || []).map((r) => ({ entityObj: get(), id: r.id, key }))
    );

    setProgress({ current: 0, total: allRecords.length, currentEntity: "" });

    for (let i = 0; i < allRecords.length; i++) {
      const { entityObj, id, key } = allRecords[i];
      setProgress({ current: i, total: allRecords.length, currentEntity: key });
      await entityObj.update(id, { company_id: realId });
    }

    setProgress({ current: allRecords.length, total: allRecords.length, currentEntity: "" });
    setFixing(false);
    setFixDone(true);

    // Now find bad enterprise names
    const allEnterprises = await base44.entities.Enterprise.list();
    const bad = allEnterprises.filter(
      (e) => e.enterprise_name === "brightstar_parent" && e.created_by === selectedAdmin.email
    );
    setBadEnterprises(bad);

    // Auto-verify
    await handleVerify(realId);
  };

  const handleVerify = async (companyId) => {
    const id = companyId || selectedAdmin?.company_id;
    if (!id) return;
    const enterprises = await base44.entities.Enterprise.filter({ company_id: id });
    setVerifyResult({ count: enterprises.length, companyId: id });
  };

  const handleCheckUserCompanyId = async () => {
    const users = await base44.entities.User.list();
    const u = users.find((x) => x.email === selectedAdmin?.email);
    setVerifyUser(u);
  };

  const handleSaveName = async (id, newName) => {
    setSavingName((s) => ({ ...s, [id]: true }));
    await base44.entities.Enterprise.update(id, { enterprise_name: newName });
    setBadEnterprises((prev) => prev.filter((e) => e.id !== id));
    setSavingName((s) => ({ ...s, [id]: false }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
          <Wrench className="w-6 h-6 text-rose-600" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Data Repair</h1>
            <Badge className="bg-rose-100 text-rose-700 border-rose-200">Super Admin Only</Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Fix records where <code className="bg-slate-100 px-1 rounded text-xs">company_id</code> is empty, null, or incorrect. Select an admin user to repair their data.
          </p>
        </div>
      </div>

      {/* SECTION 1 — SELECT ADMIN */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <User className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Section 1 — Select Admin</h2>
        </div>

        {loadingAdmins ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading admin users…
          </div>
        ) : admins.length === 0 ? (
          <p className="text-sm text-slate-500">No admin users found.</p>
        ) : (
          <div className="space-y-3">
            <select
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-300"
              value={selectedAdmin?.id || ""}
              onChange={handleSelectAdmin}
            >
              <option value="">— Select an admin —</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name || "(no name)"} · {a.email} · company_id: "{a.company_id || "(empty)"}"
                </option>
              ))}
            </select>

            {selectedAdmin && (
              <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm space-y-1">
                <div className="flex gap-4 flex-wrap">
                  <span className="text-slate-500">Name: <strong className="text-slate-800">{selectedAdmin.full_name || "—"}</strong></span>
                  <span className="text-slate-500">Email: <strong className="text-slate-800">{selectedAdmin.email}</strong></span>
                  <span className="text-slate-500">
                    company_id:{" "}
                    {selectedAdmin.company_id ? (
                      <strong className="text-emerald-700">{selectedAdmin.company_id}</strong>
                    ) : (
                      <strong className="text-rose-600">(empty — fix user record first!)</strong>
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2 — PREVIEW */}
      {selectedAdmin && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Search className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Section 2 — Preview Affected Records</h2>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            This will assign all records with <code className="bg-amber-100 px-1 rounded text-xs">company_id = ""</code>,{" "}
            <code className="bg-amber-100 px-1 rounded text-xs">null</code>, or{" "}
            <code className="bg-amber-100 px-1 rounded text-xs">"brightstar_parent"</code>{" "}
            created by <strong>{selectedAdmin.email}</strong> to company_id:{" "}
            <strong className="text-emerald-700">{selectedAdmin.company_id || "(empty!)"}</strong>
          </div>

          <Button
            onClick={handleScan}
            disabled={scanning || !selectedAdmin.company_id}
            variant="outline"
            className="rounded-xl border-slate-300"
          >
            {scanning ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning all entities…</>
            ) : (
              <><Search className="w-4 h-4 mr-2" /> Scan for Affected Records</>
            )}
          </Button>

          {!selectedAdmin.company_id && (
            <p className="text-xs text-rose-600 font-medium">⚠️ Cannot scan: selected admin has no company_id. Fix their user record first.</p>
          )}

          {counts && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">
                Found <span className="text-rose-600">{totalAffected}</span> affected records:
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Entity</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Affected Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ENTITIES.map(({ key }) => (
                      <tr key={key} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5 text-slate-700 font-medium">{key}</td>
                        <td className="px-4 py-2.5 text-right">
                          {counts[key]?.length > 0 ? (
                            <span className="font-bold text-rose-600">{counts[key].length}</span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td className="px-4 py-2.5 text-slate-700">Total</td>
                      <td className="px-4 py-2.5 text-right text-rose-600">{totalAffected}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 3 — FIX */}
      {counts && totalAffected > 0 && !fixDone && (
        <div className="bg-white border border-rose-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="w-4 h-4 text-rose-500" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Section 3 — Fix Records</h2>
          </div>

          {fixing ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Fixing <strong>{progress.currentEntity}</strong>…</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3">
                <div
                  className="bg-rose-500 h-3 rounded-full transition-all duration-200"
                  style={{ width: progress.total ? `${(progress.current / progress.total) * 100}%` : "0%" }}
                />
              </div>
              <p className="text-xs text-slate-400">Do not close this window…</p>
            </div>
          ) : (
            <Button
              onClick={handleFix}
              disabled={fixing}
              className="bg-rose-600 hover:bg-rose-700 rounded-xl"
            >
              <Wrench className="w-4 h-4 mr-2" />
              Fix All {totalAffected} Records → assign to "{selectedAdmin.company_id}"
            </Button>
          )}
        </div>
      )}

      {counts && totalAffected === 0 && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 text-emerald-700 text-sm font-medium">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          No affected records found — data looks clean for this admin.
        </div>
      )}

      {/* SECTION 4 — FIX ENTERPRISE NAMES */}
      {fixDone && (
        <div className="bg-white border border-amber-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Section 4 — Fix Enterprise Names</h2>
          </div>

          {badEnterprises.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              No enterprises found with <code className="bg-slate-100 px-1 rounded text-xs">enterprise_name = "brightstar_parent"</code>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Found <strong className="text-amber-700">{badEnterprises.length}</strong> enterprise(s) with incorrect name. Correct each below:
              </p>
              {badEnterprises.map((ent) => (
                <div key={ent.id} className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 mb-1">ID: {ent.id}</p>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                      defaultValue={ent.enterprise_name}
                      placeholder="Enter correct enterprise name…"
                      onChange={(e) => setNameEdits((prev) => ({ ...prev, [ent.id]: e.target.value }))}
                    />
                  </div>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 rounded-xl shrink-0"
                    disabled={savingName[ent.id]}
                    onClick={() => handleSaveName(ent.id, nameEdits[ent.id] ?? ent.enterprise_name)}
                  >
                    {savingName[ent.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span className="ml-1">Save</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 5 — VERIFY */}
      {fixDone && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Section 5 — Verify</h2>
          </div>

          {verifyResult === null ? (
            <Button variant="outline" className="rounded-xl" onClick={() => handleVerify()}>
              <Search className="w-4 h-4 mr-2" /> Run Verification
            </Button>
          ) : verifyResult.count > 0 ? (
            <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Success!</p>
                <p>The admin can now see <strong>{verifyResult.count} enterprise(s)</strong> under company_id <code className="bg-emerald-100 px-1 rounded">{verifyResult.companyId}</code>.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
                <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Still broken</p>
                  <p>No enterprises found under company_id <code className="bg-rose-100 px-1 rounded">{verifyResult.companyId}</code>. The admin's user record may also have an empty company_id.</p>
                </div>
              </div>

              <Button variant="outline" className="rounded-xl border-slate-300 text-sm" onClick={handleCheckUserCompanyId}>
                <User className="w-4 h-4 mr-2" /> Check User's company_id
              </Button>

              {verifyUser && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm space-y-1">
                  <p className="font-medium text-slate-700">User record for {verifyUser.email}:</p>
                  <p className="text-slate-500">full_name: <strong>{verifyUser.full_name || "—"}</strong></p>
                  <p className="text-slate-500">role: <strong>{verifyUser.role}</strong></p>
                  <p className="text-slate-500">
                    company_id:{" "}
                    {verifyUser.company_id ? (
                      <strong className="text-emerald-700">{verifyUser.company_id}</strong>
                    ) : (
                      <strong className="text-rose-600">(empty) — this is the root problem</strong>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          <Button variant="ghost" size="sm" className="text-slate-400 text-xs" onClick={() => handleScan()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Re-scan to confirm 0 remaining
          </Button>
        </div>
      )}
    </div>
  );
}