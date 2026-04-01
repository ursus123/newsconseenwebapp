import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plug, CheckCircle2, AlertCircle, XCircle, Loader2,
  Database, Cloud, HardDrive, X, ChevronRight, ChevronDown,
  Eye, Play, RefreshCw, AlertTriangle, Table2, Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";
const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

const API_HEADERS = {
  "Content-Type": "application/json",
  ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}),
};

// ── Engine configs ──────────────────────────────────────────────────────────
const DB_ENGINES = [
  { id: "postgresql",  label: "PostgreSQL",          port: 5432,  icon: Database },
  { id: "mysql",       label: "MySQL / MariaDB",      port: 3306,  icon: Database },
  { id: "postgresql",  label: "AWS RDS (PostgreSQL)", port: 5432,  icon: Cloud    },
  { id: "mysql",       label: "AWS RDS (MySQL)",      port: 3306,  icon: Cloud    },
  { id: "mssql",       label: "SQL Server / Azure",   port: 1433,  icon: Database },
  { id: "sqlite",      label: "SQLite (file path)",   port: null,  icon: HardDrive},
];

const ENTITY_TYPES = [
  { id: "people",       label: "People (staff / clients / contacts)" },
  { id: "enterprises",  label: "Enterprises (branches / organisations)" },
  { id: "products",     label: "Products / Inventory" },
  { id: "transactions", label: "Transactions / Invoices" },
  { id: "tasks",        label: "Tasks / Visits" },
];

const DB_CONNECTOR_IDS = new Set([
  "postgresql_db", "mysql_db", "aws_rds", "mssql_db", "sqlite_db",
]);

// ── DatabaseConnectModal ─────────────────────────────────────────────────────
function DatabaseConnectModal({ connector, companyId, onClose }) {
  const { toast } = useToast();

  const [step, setStep]               = useState("credentials"); // credentials | tables | preview | mapping | sync
  const [engineType, setEngineType]   = useState("postgresql");
  const [host, setHost]               = useState("");
  const [port, setPort]               = useState(5432);
  const [database, setDatabase]       = useState("");
  const [username, setUsername]       = useState("");
  const [password, setPassword]       = useState("");
  const [ssl, setSsl]                 = useState(false);
  const [useCustomQuery, setUseCustomQuery] = useState(false);
  const [selectedTable, setSelectedTable]   = useState("");
  const [customQuery, setCustomQuery]       = useState("");
  const [entityType, setEntityType]   = useState("people");
  const [columnMap, setColumnMap]     = useState({});

  const [testing, setTesting]         = useState(false);
  const [testResult, setTestResult]   = useState(null);
  const [tables, setTables]           = useState([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [preview, setPreview]         = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [syncResult, setSyncResult]   = useState(null);

  const isSQLite = engineType === "sqlite";

  function buildCreds(extra = {}) {
    return {
      engine_type: engineType,
      host:        isSQLite ? "" : host,
      port:        isSQLite ? null : (parseInt(port, 10) || null),
      database,
      username:    isSQLite ? "" : username,
      password:    isSQLite ? "" : password,
      ssl,
      table:       useCustomQuery ? null : selectedTable || null,
      query:       useCustomQuery ? customQuery || null : null,
      entity_type: entityType,
      column_map:  columnMap,
      ...extra,
    };
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${RAILWAY_URL}/connectors/db/test`, {
        method: "POST",
        headers: API_HEADERS,
        body: JSON.stringify(buildCreds()),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) {
        setStep("tables");
        loadTables();
      }
    } catch (e) {
      setTestResult({ ok: false, message: e.message });
    } finally {
      setTesting(false);
    }
  }

  async function loadTables() {
    setTablesLoading(true);
    try {
      const res = await fetch(`${RAILWAY_URL}/connectors/db/tables`, {
        method: "POST",
        headers: API_HEADERS,
        body: JSON.stringify(buildCreds()),
      });
      const data = await res.json();
      if (data.ok) setTables(data.tables || []);
    } catch {
      // ignore — user can still type a query manually
    } finally {
      setTablesLoading(false);
    }
  }

  async function loadPreview() {
    if (!useCustomQuery && !selectedTable) {
      toast({ title: "Select a table or enter a custom query first", variant: "destructive" });
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await fetch(`${RAILWAY_URL}/connectors/db/preview?limit=10`, {
        method: "POST",
        headers: API_HEADERS,
        body: JSON.stringify(buildCreds()),
      });
      const data = await res.json();
      if (data.ok) {
        setPreview(data);
        setStep("preview");
        // Auto-init column map from source columns
        const auto = {};
        (data.columns || []).forEach(col => { auto[col] = col; });
        setColumnMap(prev => ({ ...auto, ...prev }));
      } else {
        toast({ title: "Preview failed", description: data.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Preview failed", description: e.message, variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runSync(dryRun = false) {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(
        `${RAILWAY_URL}/connectors/db/run?company_id=${companyId}&dry_run=${dryRun}`,
        {
          method: "POST",
          headers: API_HEADERS,
          body: JSON.stringify(buildCreds()),
        }
      );
      const data = await res.json();
      setSyncResult(data);
      setStep("sync");
      if (!dryRun && data.status !== "error") {
        toast({
          title: `Sync complete — ${data.created || 0} created, ${data.updated || 0} updated`,
        });
      }
    } catch (e) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  const ENTITY_FIELD_SUGGESTIONS = {
    people:       ["external_id", "full_name", "first_name", "last_name", "email", "phone",
                   "person_type", "person_subtype", "status", "created_date", "enterprise_id"],
    enterprises:  ["external_id", "name", "enterprise_type", "enterprise_subtype",
                   "status", "operating_status", "phone", "email", "website"],
    products:     ["external_id", "name", "item_type", "item_subtype", "unit_of_measure",
                   "stock_quantity", "unit_price", "cost_price", "reorder_level", "status"],
    transactions: ["external_id", "transaction_type", "amount", "status", "currency",
                   "transaction_date", "due_date", "person_id", "enterprise_id"],
    tasks:        ["external_id", "task_type", "status", "title", "due_date",
                   "assigned_to", "enterprise_id", "person_id"],
  };
  const targetFields = ENTITY_FIELD_SUGGESTIONS[entityType] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Database className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Connect External Database</p>
              <p className="text-xs text-slate-400">{connector?.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-2">
          {["credentials", "tables", "preview", "sync"].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`text-[10px] font-semibold px-2 py-1 rounded-full capitalize ${
                step === s
                  ? "bg-indigo-100 text-indigo-700"
                  : ["credentials", "tables", "preview", "sync"].indexOf(step) > i
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-400"
              }`}>
                {s}
              </div>
              {i < 3 && <ChevronRight className="w-3 h-3 text-slate-300" />}
            </React.Fragment>
          ))}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── Step: credentials ── */}
          {(step === "credentials" || step === "tables") && (
            <>
              {/* Engine */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                  Database Engine
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {DB_ENGINES.map((eng) => {
                    const Icon = eng.icon;
                    const selected = engineType === eng.id &&
                      (eng.label.includes("RDS") ? host.includes("rds.amazonaws") || host === "" : true);
                    return (
                      <button
                        key={eng.label}
                        onClick={() => {
                          setEngineType(eng.id);
                          if (eng.port) setPort(eng.port);
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                          engineType === eng.id
                            ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {eng.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Connection fields */}
              {!isSQLite ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Host</label>
                    <input
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400"
                      placeholder="db.example.com or 10.0.0.1"
                      value={host}
                      onChange={e => setHost(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Port</label>
                    <input
                      type="number"
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400"
                      value={port}
                      onChange={e => setPort(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Database name</label>
                    <input
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400"
                      placeholder="mydb"
                      value={database}
                      onChange={e => setDatabase(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Username</label>
                    <input
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400"
                      placeholder="postgres"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Password</label>
                    <input
                      type="password"
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="ssl"
                      checked={ssl}
                      onChange={e => setSsl(e.target.checked)}
                      className="accent-indigo-600"
                    />
                    <label htmlFor="ssl" className="text-xs text-slate-600">Require SSL</label>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">File path</label>
                  <input
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400"
                    placeholder="/data/mydb.sqlite"
                    value={database}
                    onChange={e => setDatabase(e.target.value)}
                  />
                </div>
              )}

              {/* Test result */}
              {testResult && (
                <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-xs ${
                  testResult.ok
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}>
                  {testResult.ok
                    ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                  <div>
                    <p className="font-semibold">{testResult.ok ? "Connected" : "Connection failed"}</p>
                    <p className="mt-0.5 text-[11px] opacity-80">{testResult.message}</p>
                    {testResult.server_version && (
                      <p className="mt-0.5 text-[10px] opacity-60">{testResult.server_version}</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Step: tables (table/query selection + entity type) ── */}
          {step === "tables" && (
            <>
              {/* Entity type */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                  Map rows to which entity?
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {ENTITY_TYPES.map(et => (
                    <button
                      key={et.id}
                      onClick={() => setEntityType(et.id)}
                      className={`text-left px-3 py-2 rounded-xl border text-xs transition-all ${
                        entityType === et.id
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700 font-semibold"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {et.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table or custom query */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <button
                    onClick={() => setUseCustomQuery(false)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${
                      !useCustomQuery ? "bg-indigo-100 text-indigo-700" : "text-slate-500"
                    }`}
                  >
                    <Table2 className="w-3.5 h-3.5" /> Pick a table
                  </button>
                  <button
                    onClick={() => setUseCustomQuery(true)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${
                      useCustomQuery ? "bg-indigo-100 text-indigo-700" : "text-slate-500"
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" /> Custom SQL
                  </button>
                </div>

                {!useCustomQuery ? (
                  tablesLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading tables…
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {tables.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400">No tables found</p>
                      ) : tables.map(t => (
                        <button
                          key={t.name}
                          onClick={() => setSelectedTable(t.name)}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 ${
                            selectedTable === t.name ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-700"
                          }`}
                        >
                          <span>{t.name}</span>
                          <span className="text-[10px] text-slate-400 capitalize">{t.type}</span>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <textarea
                    className="w-full text-xs font-mono border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400 resize-none"
                    rows={4}
                    placeholder={"SELECT id, name, email, status\nFROM employees\nWHERE active = 1"}
                    value={customQuery}
                    onChange={e => setCustomQuery(e.target.value)}
                  />
                )}
              </div>
            </>
          )}

          {/* ── Step: preview + column mapping ── */}
          {step === "preview" && preview && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">
                  Preview — {preview.total_estimate.toLocaleString()} rows total
                </p>
                <span className="text-[10px] text-slate-400 font-mono">{preview.sql_used?.slice(0, 60)}…</span>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {preview.columns.map(col => (
                        <th key={col} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        {preview.columns.map(col => (
                          <td key={col} className="px-3 py-1.5 text-slate-700 max-w-[120px] truncate">
                            {row[col] == null ? <span className="text-slate-300">null</span> : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Column mapping */}
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  Map source columns → {entityType} fields
                </p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {preview.columns.map(col => (
                    <div key={col} className="flex items-center gap-2">
                      <span className="w-36 text-xs font-mono text-slate-600 truncate shrink-0">{col}</span>
                      <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                      <select
                        value={columnMap[col] || ""}
                        onChange={e => setColumnMap(prev => ({ ...prev, [col]: e.target.value }))}
                        className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-400 bg-white"
                      >
                        <option value="">— skip —</option>
                        <option value={col}>{col} (keep as-is)</option>
                        {targetFields.map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Step: sync result ── */}
          {step === "sync" && syncResult && (
            <div className={`rounded-xl border p-4 text-sm ${
              syncResult.status === "dry_run"
                ? "bg-amber-50 border-amber-200"
                : syncResult.status === "error"
                ? "bg-rose-50 border-rose-200"
                : "bg-emerald-50 border-emerald-200"
            }`}>
              <p className="font-bold text-slate-800 mb-2">
                {syncResult.status === "dry_run" ? "Dry run preview"
                  : syncResult.status === "error" ? "Sync failed"
                  : "Sync complete"}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {syncResult.extracted     != null && <div><span className="text-slate-500">Extracted:</span> <strong>{syncResult.extracted || syncResult.rows_extracted || 0}</strong></div>}
                {syncResult.would_load    != null && <div><span className="text-slate-500">Would load:</span> <strong>{syncResult.would_load}</strong></div>}
                {syncResult.created       != null && <div><span className="text-slate-500">Created:</span> <strong>{syncResult.created}</strong></div>}
                {syncResult.updated       != null && <div><span className="text-slate-500">Updated:</span> <strong>{syncResult.updated}</strong></div>}
                {syncResult.failed        != null && <div><span className="text-slate-500">Failed:</span> <strong>{syncResult.failed}</strong></div>}
              </div>
              {syncResult.unmapped?.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  {syncResult.unmapped.length} unmapped values — review in the Unmapped Values section below.
                </p>
              )}
              {syncResult.error && (
                <p className="mt-2 text-xs text-rose-700">{syncResult.error}</p>
              )}
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {step === "credentials" && (
              <Button
                onClick={testConnection}
                disabled={testing || (!isSQLite && !host)}
                className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs"
              >
                {testing
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Testing…</>
                  : "Test Connection"}
              </Button>
            )}

            {step === "tables" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => { setStep("credentials"); setTestResult(null); }}
                  className="rounded-xl text-xs"
                >
                  Back
                </Button>
                <Button
                  onClick={loadPreview}
                  disabled={previewLoading || (!useCustomQuery && !selectedTable) || (useCustomQuery && !customQuery)}
                  className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs"
                >
                  {previewLoading
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Loading…</>
                    : <><Eye className="w-3.5 h-3.5 mr-1.5" /> Preview Data</>}
                </Button>
              </>
            )}

            {step === "preview" && (
              <>
                <Button variant="outline" onClick={() => setStep("tables")} className="rounded-xl text-xs">
                  Back
                </Button>
                <Button
                  variant="outline"
                  onClick={() => runSync(true)}
                  disabled={syncing}
                  className="rounded-xl text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Dry Run"}
                </Button>
                <Button
                  onClick={() => runSync(false)}
                  disabled={syncing}
                  className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs"
                >
                  {syncing
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Syncing…</>
                    : <><Play className="w-3.5 h-3.5 mr-1.5" /> Sync to Base44</>}
                </Button>
              </>
            )}

            {step === "sync" && (
              <>
                <Button variant="outline" onClick={() => setStep("preview")} className="rounded-xl text-xs">
                  Back to mapping
                </Button>
                <Button
                  onClick={() => runSync(false)}
                  disabled={syncing}
                  className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Run again
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Main Connectors page ─────────────────────────────────────────────────────
export default function Connectors() {
  const [currentUser, setCurrentUser]           = useState(null);
  const [dbModalConnector, setDbModalConnector] = useState(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: catalogData = { connectors: [] }, isLoading: catalogLoading } = useQuery({
    queryKey: ["connector-catalog"],
    queryFn: async () => {
      try {
        const res = await fetch(`${RAILWAY_URL}/connectors/catalog`);
        return res.json();
      } catch {
        return { connectors: [] };
      }
    },
  });

  const connectorsByCategory = catalogData.connectors.reduce((acc, conn) => {
    const cat = conn.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(conn);
    return acc;
  }, {});

  const CATEGORY_LABELS = {
    database:     "Database / Data Warehouse",
    file:         "File Import",
    mobile_money: "Mobile Money",
    accounting:   "Accounting",
    hr_payroll:   "HR & Payroll",
    health:       "Health / EHR",
    education:    "Education",
    pos:          "Point of Sale",
    government:   "Government",
  };

  const CATEGORY_ORDER = [
    "database", "file", "mobile_money", "accounting",
    "hr_payroll", "health", "education", "pos", "government",
  ];

  const sortedCategories = CATEGORY_ORDER
    .filter(cat => connectorsByCategory[cat])
    .concat(Object.keys(connectorsByCategory).filter(cat => !CATEGORY_ORDER.includes(cat)));

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ["connector-runs", currentUser?.company_id],
    queryFn: async () => {
      if (!currentUser?.company_id) return [];
      return base44.entities.ConnectorRun.filter({ company_id: currentUser.company_id });
    },
    enabled: !!currentUser?.company_id,
  });

  const needsReviewRuns = runs.filter(r => r.status === "needs_review");

  const { data: masterData = [] } = useQuery({
    queryKey: ["master-data-options"],
    queryFn: () => base44.entities.MasterDataOption.list(),
  });

  const saveMappingMutation = useMutation({
    mutationFn: async ({ companyId, connectorId, fieldName, sourceValue, taxonomyValue, parentValue }) => {
      const existing = await base44.entities.ConnectorMapping.filter({
        company_id: companyId, connector_id: connectorId,
        field_name: fieldName, source_value: sourceValue,
      });
      if (existing.length > 0) {
        return base44.entities.ConnectorMapping.update(existing[0].id, {
          taxonomy_value: taxonomyValue, is_confirmed: true, confirmed_by: currentUser.email,
        });
      }
      return base44.entities.ConnectorMapping.create({
        company_id: companyId, connector_id: connectorId, field_name: fieldName,
        source_value: sourceValue, taxonomy_value: taxonomyValue,
        parent_value: parentValue, is_confirmed: true, confirmed_by: currentUser.email,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["connector-runs"] }),
  });

  function handleConnect(conn) {
    if (DB_CONNECTOR_IDS.has(conn.id) || conn.category === "database") {
      setDbModalConnector(conn);
    } else {
      toast({ title: `${conn.name} coming soon`, description: "This connector is not yet available." });
    }
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-12">

      {/* Database modal */}
      {dbModalConnector && (
        <DatabaseConnectModal
          connector={dbModalConnector}
          companyId={currentUser.company_id}
          onClose={() => setDbModalConnector(null)}
        />
      )}

      {/* Section 1: Available Connectors */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Available Connectors</h2>
        <p className="text-sm text-slate-500 mb-6">
          Connect any external data source. Database connectors are live — others are coming soon.
        </p>

        {catalogLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-10">
            {sortedCategories.map(category => (
              <div key={category}>
                <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-4">
                  {CATEGORY_LABELS[category] || category}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {connectorsByCategory[category].map(conn => {
                    const isDb = DB_CONNECTOR_IDS.has(conn.id) || conn.category === "database";
                    const available = conn.status === "available";
                    return (
                      <div
                        key={conn.id}
                        className={`bg-white border rounded-xl p-4 hover:shadow-lg transition-shadow ${
                          isDb ? "border-indigo-200" : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {isDb && <Database className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                              <h4 className="font-semibold text-slate-800 text-sm truncate">{conn.name}</h4>
                            </div>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                              {conn.description || "Data integration connector"}
                            </p>
                          </div>
                          {conn.sprint && (
                            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 whitespace-nowrap ml-2 shrink-0">
                              S{conn.sprint}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mb-4">
                          {available ? (
                            <>
                              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                              <span className="text-xs font-medium text-emerald-700">Available</span>
                            </>
                          ) : (
                            <>
                              <span className="w-2 h-2 bg-slate-400 rounded-full" />
                              <span className="text-xs font-medium text-slate-600">Coming Soon</span>
                            </>
                          )}
                        </div>

                        <Button
                          onClick={() => handleConnect(conn)}
                          disabled={!available}
                          className={`w-full text-xs rounded-xl ${
                            isDb && available
                              ? "bg-indigo-600 hover:bg-indigo-700"
                              : ""
                          }`}
                          variant={available ? "default" : "outline"}
                        >
                          {isDb && available ? (
                            <><Database className="w-3.5 h-3.5 mr-1.5" /> Connect Database</>
                          ) : "Connect"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Run History */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Run History</h2>
        {runsLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Plug className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No connector runs yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {["Connector","Status","Extracted","Created","Updated","Skipped","Failed","Started","Duration"].map(h => (
                    <th key={h} className={`px-4 py-3 font-semibold text-slate-700 ${h === "Connector" || h === "Status" || h === "Started" || h === "Duration" ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map(run => {
                  const startTime  = new Date(run.started_at);
                  const endTime    = run.completed_at ? new Date(run.completed_at) : new Date();
                  const durationMin = Math.floor((endTime - startTime) / 60000);
                  const statusConfig = {
                    completed:    { color: "emerald", Icon: CheckCircle2 },
                    needs_review: { color: "amber",   Icon: AlertCircle  },
                    failed:       { color: "red",     Icon: XCircle      },
                    running:      { color: "blue",    Icon: Loader2      },
                  }[run.status] || { color: "slate", Icon: null };
                  const { color, Icon } = statusConfig;

                  return (
                    <tr key={run.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-800 font-medium">{run.connector_id}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {Icon && <Icon className={`w-4 h-4 text-${color}-600 ${run.status === "running" ? "animate-spin" : ""}`} />}
                          <span className={`text-${color}-700 font-medium capitalize`}>{run.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{run.records_extracted || 0}</td>
                      <td className="px-4 py-3 text-right">{run.records_created   || 0}</td>
                      <td className="px-4 py-3 text-right">{run.records_updated   || 0}</td>
                      <td className="px-4 py-3 text-right">{run.records_skipped   || 0}</td>
                      <td className="px-4 py-3 text-right">{run.records_failed    || 0}</td>
                      <td className="px-4 py-3">{startTime.toLocaleDateString()}</td>
                      <td className="px-4 py-3">{durationMin}m</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 3: Unmapped Values Review */}
      {needsReviewRuns.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Unmapped Values Review</h2>
          <div className="space-y-6">
            {needsReviewRuns.map(run => {
              let unmappedValues = [];
              try { unmappedValues = JSON.parse(run.unmapped_values || "[]"); } catch {}
              return (
                <div key={run.id} className="bg-white border border-slate-200 rounded-xl p-6">
                  <h3 className="font-semibold text-slate-800 mb-4">
                    {run.connector_id} — {new Date(run.started_at).toLocaleDateString()}
                  </h3>
                  {unmappedValues.length === 0 ? (
                    <p className="text-sm text-slate-500">No unmapped values.</p>
                  ) : (
                    <div className="space-y-3">
                      {unmappedValues.map((item, idx) => (
                        <div key={idx} className="flex flex-col md:flex-row items-start md:items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="flex-1">
                            <p className="text-xs font-mono text-slate-600">
                              {item.field_name} = "{item.source_value}"
                            </p>
                          </div>
                          <select
                            className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white text-slate-700 flex-1 md:flex-none"
                            onChange={e => {
                              if (e.target.value) {
                                saveMappingMutation.mutate({
                                  companyId: currentUser.company_id,
                                  connectorId: run.connector_id,
                                  fieldName: item.field_name,
                                  sourceValue: item.source_value,
                                  taxonomyValue: e.target.value,
                                  parentValue: item.parent_value || null,
                                });
                              }
                            }}
                            defaultValue=""
                          >
                            <option value="">Select taxonomy value...</option>
                            {masterData.filter(opt => opt.field_name === item.field_name)
                              .map(opt => (
                                <option key={opt.id} value={opt.value}>{opt.label || opt.value}</option>
                              ))}
                          </select>
                          {saveMappingMutation.isPending && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
