import React, { useState, useCallback } from "react";
import { ncClient } from "@/api/ncClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import SmartImportButton from "@/components/shared/SmartImportButton";
import { RAILWAY_URL, RAILWAY_API_KEY, apiHeaders, formHeaders } from "@/config/api";
import {
  Plug, CheckCircle2, AlertCircle, XCircle, Loader2,
  Database, Cloud, HardDrive, X, ChevronRight, ChevronDown,
  Eye, Play, RefreshCw, AlertTriangle, Table2, Code2,
  Clock, Calendar, CalendarClock, KeyRound,
  Webhook, Copy, Trash2, Plus, ExternalLink, Zap,
  ArrowUpRight, ToggleLeft, ToggleRight, Shield, Activity,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const API_HEADERS = apiHeaders();

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

// Maps connector entity_type → ontology object type metadata
const ENTITY_TO_ONTOLOGY = {
  people:       { type: "Person",       color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200"   },
  enterprises:  { type: "Enterprise",   color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200"  },
  products:     { type: "Product",      color: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200"   },
  transactions: { type: "Transaction",  color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200"},
  tasks:        { type: "Task",         color: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200" },
};

const DB_CONNECTOR_IDS = new Set([
  "postgresql_db", "mysql_db", "aws_rds", "mssql_db", "sqlite_db",
]);

function ConnectorScopeSelector({
  scopeMode,
  setScopeMode,
  enterpriseId,
  setEnterpriseId,
  enterprises = [],
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Shield className="w-3.5 h-3.5 text-slate-500" />
        <p className="text-xs font-semibold text-slate-700">Ontology scope</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          ["company", "Whole company"],
          ["enterprise", "One enterprise"],
          ["infer", "Idjwi infers"],
          ["mixed", "Mixed rows"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setScopeMode(id)}
            className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
              scopeMode === id ? "border-indigo-400 bg-white text-indigo-700" : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {scopeMode === "enterprise" && (
        <select
          value={enterpriseId}
          onChange={e => setEnterpriseId(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
        >
          <option value="">Select enterprise...</option>
          {enterprises.map(e => (
            <option key={e.id} value={e.id}>{e.enterprise_name || e.name || e.id}</option>
          ))}
        </select>
      )}
      <p className="text-[10px] text-slate-400">
        Company is fixed by the signed-in tenant. This only sets operating-unit context for mapping and stamping.
      </p>
    </div>
  );
}

// Static fallback catalog — renders even when Railway is unreachable.
// All 25 connectors are implemented across Sprints 1-8.
const STATIC_CATALOG = [
  // Database
  { id: "postgresql_db",    name: "PostgreSQL",          category: "database",     description: "Connect any PostgreSQL database — on-prem, cloud, or local",       sprint: 1, status: "available", icon: "database" },
  { id: "mysql_db",         name: "MySQL / MariaDB",     category: "database",     description: "Connect MySQL or MariaDB — any version, any host",                  sprint: 1, status: "available", icon: "database" },
  { id: "aws_rds",          name: "AWS RDS / Aurora",    category: "database",     description: "Connect Amazon RDS or Aurora (PostgreSQL or MySQL engine)",          sprint: 1, status: "available", icon: "cloud" },
  { id: "mssql_db",         name: "SQL Server / Azure",  category: "database",     description: "Connect Microsoft SQL Server or Azure SQL Database",                 sprint: 1, status: "available", icon: "database" },
  { id: "sqlite_db",        name: "SQLite",              category: "database",     description: "Connect a local SQLite database file",                               sprint: 1, status: "available", icon: "hard-drive" },
  // File
  { id: "excel",            name: "Excel / CSV Import",  category: "file",         description: "Import people, enterprises, or items from Excel or CSV",             sprint: 1, status: "available", icon: "table" },
  { id: "csv",              name: "CSV Import",          category: "file",         description: "Import from CSV — same as Excel connector",                          sprint: 1, status: "available", icon: "file-text" },
  { id: "google_sheets",    name: "Google Sheets",       category: "file",         description: "Sync from a Google Sheet — live or snapshot",                       sprint: 1, status: "available", icon: "grid" },
  { id: "json_xml",         name: "JSON / XML Import",   category: "file",         description: "Import from any JSON or XML data export",                            sprint: 1, status: "available", icon: "code" },
  // Mobile Money
  { id: "mpesa",            name: "M-Pesa",              category: "mobile_money", description: "Ingest M-Pesa transaction statements via Daraja API or CSV",        sprint: 2, status: "available", icon: "smartphone" },
  { id: "mtn_momo",         name: "MTN Mobile Money",    category: "mobile_money", description: "Ingest MTN MoMo transaction data via CSV or MoMo API",              sprint: 2, status: "available", icon: "smartphone" },
  { id: "airtel_money",     name: "Airtel Money",        category: "mobile_money", description: "Ingest Airtel Money transactions (Kenya, Uganda, Tanzania)",         sprint: 2, status: "available", icon: "smartphone" },
  { id: "wave",             name: "Wave",                category: "mobile_money", description: "Ingest Wave mobile money transactions (Senegal, Côte d'Ivoire)",     sprint: 2, status: "available", icon: "smartphone" },
  { id: "stripe",           name: "Stripe",              category: "mobile_money", description: "Sync Stripe payment transactions and customers via Stripe API",      sprint: 2, status: "available", icon: "credit-card" },
  { id: "bank_statement",   name: "Bank Statement",      category: "mobile_money", description: "Import any bank statement in CSV, OFX, or QIF format",              sprint: 2, status: "available", icon: "landmark" },
  // HR & Payroll
  { id: "adp",              name: "ADP",                 category: "hr_payroll",   description: "Sync employees and departments from ADP Workforce Now",              sprint: 3, status: "available", icon: "users" },
  { id: "paychex",          name: "Paychex",             category: "hr_payroll",   description: "Sync employees and payroll from Paychex Flex",                       sprint: 3, status: "available", icon: "users" },
  { id: "bamboohr",         name: "BambooHR",            category: "hr_payroll",   description: "Sync employee records and org chart from BambooHR",                  sprint: 3, status: "available", icon: "users" },
  { id: "gusto",            name: "Gusto",               category: "hr_payroll",   description: "Sync employees, contractors, and payroll from Gusto",                sprint: 3, status: "available", icon: "users" },
  // Accounting
  { id: "quickbooks",       name: "QuickBooks Online",   category: "accounting",   description: "Sync invoices, payments, vendors, and customers from QuickBooks",    sprint: 4, status: "available", icon: "dollar-sign" },
  { id: "xero",             name: "Xero",                category: "accounting",   description: "Sync contacts, invoices, and inventory from Xero",                   sprint: 4, status: "available", icon: "dollar-sign" },
  { id: "sage",             name: "Sage",                category: "accounting",   description: "Sync contacts, invoices, and products from Sage Business Cloud",     sprint: 4, status: "available", icon: "dollar-sign" },
  { id: "wave_accounting",  name: "Wave Accounting",     category: "accounting",   description: "Sync customers and products from Wave (popular in Africa)",           sprint: 4, status: "available", icon: "dollar-sign" },
  // Health / EHR
  { id: "openmrs",          name: "OpenMRS",             category: "health",       description: "Sync patients and visits from OpenMRS (open-source EMR)",            sprint: 5, status: "available", icon: "heart" },
  { id: "therap",           name: "Therap",              category: "health",       description: "Sync service recipients and billing from Therap EHR",                sprint: 5, status: "available", icon: "heart" },
  { id: "epic_fhir",        name: "Epic (FHIR)",         category: "health",       description: "Sync patients and encounters from Epic via FHIR R4",                 sprint: 5, status: "available", icon: "heart" },
  { id: "dhis2",            name: "DHIS2",               category: "health",       description: "Sync health facility org units and indicators from DHIS2",            sprint: 5, status: "available", icon: "heart" },
  // Education
  { id: "powerschool",      name: "PowerSchool",         category: "education",    description: "Sync students, staff, and enrollment from PowerSchool",              sprint: 6, status: "available", icon: "book" },
  { id: "canvas",           name: "Canvas LMS",          category: "education",    description: "Sync students and teachers from Canvas",                             sprint: 6, status: "available", icon: "book" },
  { id: "google_classroom", name: "Google Classroom",    category: "education",    description: "Sync students and teachers from Google Classroom courses",           sprint: 6, status: "available", icon: "book" },
  // POS
  { id: "square",           name: "Square",              category: "pos",          description: "Sync customers and catalog items from Square POS",                   sprint: 7, status: "available", icon: "shopping-cart" },
  { id: "shopify",          name: "Shopify",             category: "pos",          description: "Sync customers and products from Shopify",                           sprint: 7, status: "available", icon: "shopping-cart" },
  { id: "toast",            name: "Toast POS",           category: "pos",          description: "Sync menu items and staff from Toast restaurant POS",                sprint: 7, status: "available", icon: "shopping-cart" },
  // Government
  { id: "kra",              name: "KRA (Kenya)",         category: "government",   description: "Validate business registration and tax compliance via KRA iTax",    sprint: 8, status: "available", icon: "shield" },
  { id: "ghana_gra",        name: "Ghana GRA",           category: "government",   description: "Validate business registration via Ghana Revenue Authority TIN API", sprint: 8, status: "available", icon: "shield" },
  { id: "nigeria_cac",      name: "Nigeria CAC",         category: "government",   description: "Validate business registration and directors via Nigeria CAC API",   sprint: 8, status: "available", icon: "shield" },
];

// Credential field definitions for API connectors — drives ApiConnectModal
const CREDENTIAL_SCHEMA = {
  mpesa:           [{ key: "consumer_key", label: "Consumer Key", type: "password" }, { key: "consumer_secret", label: "Consumer Secret", type: "password" }, { key: "shortcode", label: "Shortcode / Till", type: "text" }],
  mtn_momo:        [{ key: "subscription_key", label: "Subscription Key", type: "password" }, { key: "api_user", label: "API User UUID", type: "text" }, { key: "api_key", label: "API Key", type: "password" }, { key: "collection_id", label: "Collection Subscription ID", type: "text" }],
  airtel_money:    [{ key: "client_id", label: "Client ID", type: "text" }, { key: "client_secret", label: "Client Secret", type: "password" }, { key: "country", label: "Country Code (e.g. KE)", type: "text" }],
  wave:            [{ key: "api_key", label: "API Key", type: "password" }, { key: "country", label: "Country Code (SN or CI)", type: "text" }],
  stripe:          [{ key: "api_key", label: "Stripe Secret Key (sk_...)", type: "password" }],
  bank_statement:  [],  // file upload only
  adp:             [{ key: "client_id", label: "Client ID", type: "text" }, { key: "client_secret", label: "Client Secret", type: "password" }],
  paychex:         [{ key: "client_id", label: "Client ID", type: "text" }, { key: "client_secret", label: "Client Secret", type: "password" }, { key: "paychex_company_id", label: "Paychex Company ID", type: "text" }],
  bamboohr:        [{ key: "api_key", label: "API Key", type: "password" }, { key: "subdomain", label: "Company Subdomain (e.g. acme)", type: "text" }],
  gusto:           [{ key: "access_token", label: "OAuth Access Token", type: "password" }, { key: "gusto_company_id", label: "Gusto Company UUID", type: "text" }],
  quickbooks:      [{ key: "access_token", label: "OAuth Access Token", type: "password" }, { key: "realm_id", label: "Company Realm ID", type: "text" }],
  xero:            [{ key: "access_token", label: "OAuth Access Token", type: "password" }, { key: "tenant_id", label: "Tenant / Organisation ID", type: "text" }],
  sage:            [{ key: "access_token", label: "OAuth Access Token", type: "password" }],
  wave_accounting: [{ key: "access_token", label: "OAuth Access Token", type: "password" }, { key: "business_id", label: "Business ID", type: "text" }],
  openmrs:         [{ key: "base_url", label: "OpenMRS URL (e.g. https://demo.openmrs.org/openmrs)", type: "text" }, { key: "username", label: "Username", type: "text" }, { key: "password", label: "Password", type: "password" }],
  therap:          [{ key: "access_token", label: "OAuth Access Token", type: "password" }, { key: "agency_code", label: "Agency Code", type: "text" }],
  epic_fhir:       [{ key: "fhir_base_url", label: "FHIR Base URL", type: "text" }, { key: "access_token", label: "SMART Access Token", type: "password" }],
  dhis2:           [{ key: "base_url", label: "DHIS2 URL (e.g. https://play.dhis2.org/dev)", type: "text" }, { key: "username", label: "Username", type: "text" }, { key: "password", label: "Password", type: "password" }],
  powerschool:     [{ key: "base_url", label: "PowerSchool Server URL", type: "text" }, { key: "client_id", label: "Plugin Client ID", type: "text" }, { key: "client_secret", label: "Plugin Client Secret", type: "password" }],
  canvas:          [{ key: "base_url", label: "Canvas URL (e.g. https://canvas.instructure.com)", type: "text" }, { key: "api_token", label: "API Token", type: "password" }, { key: "account_id", label: "Account ID (default: 1)", type: "text" }],
  google_classroom:[{ key: "access_token", label: "Google OAuth Access Token", type: "password" }],
  square:          [{ key: "access_token", label: "Square OAuth Access Token", type: "password" }],
  shopify:         [{ key: "shop_domain", label: "Shop Domain (e.g. mystore.myshopify.com)", type: "text" }, { key: "access_token", label: "Admin API Access Token", type: "password" }],
  toast:           [{ key: "client_id", label: "Toast Client ID", type: "text" }, { key: "client_secret", label: "Toast Client Secret", type: "password" }, { key: "restaurant_guid", label: "Restaurant GUID", type: "text" }],
  kra:             [{ key: "username", label: "iTax KRA PIN / Username", type: "text" }, { key: "password", label: "iTax Password", type: "password" }, { key: "target_pin", label: "Target PIN to validate", type: "text" }],
  ghana_gra:       [{ key: "api_key", label: "GRA API Subscription Key", type: "password" }, { key: "target_tin", label: "TIN(s) to validate (comma-separated)", type: "text" }],
  nigeria_cac:     [{ key: "api_key", label: "CAC API Key", type: "password" }, { key: "target_rc", label: "RC Number(s) to validate (comma-separated)", type: "text" }],
};

// ── ApiConnectModal ─────────────────────────────────────────────────────────
// Used for all API/OAuth connectors (Stripe, ADP, QuickBooks, OpenMRS, etc.)
function ApiConnectModal({ connector, companyId, enterprises = [], onClose }) {
  const { toast } = useToast();
  const schema = CREDENTIAL_SCHEMA[connector?.id] || [];
  const [step, setStep]       = useState("credentials"); // credentials | result
  const [creds, setCreds]     = useState({});
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState(null);
  const [scopeMode, setScopeMode] = useState("company");
  const [enterpriseId, setEnterpriseId] = useState("");

  function setField(key, val) {
    setCreds(prev => ({ ...prev, [key]: val }));
  }

  async function runSync(dryRun = false) {
    setRunning(true);
    try {
      const form = new FormData();
      form.append("company_id",       companyId);
      form.append("connector_id",     connector.id);
      form.append("credentials_json", JSON.stringify(creds));
      form.append("dry_run",          dryRun ? "true" : "false");
      form.append("scope_mode",       scopeMode);
      if (enterpriseId) {
        const ent = enterprises.find(e => e.id === enterpriseId);
        form.append("enterprise_id", enterpriseId);
        form.append("enterprise_name", ent?.enterprise_name || ent?.name || "");
      }
      const res = await fetch(`${RAILWAY_URL}/connectors/run`, {
        method: "POST",
        headers: formHeaders(),
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      setResult({ ...data, _dryRun: dryRun });
      setStep("result");
      if (!dryRun && data.status !== "error") {
        toast({ title: `${connector.name} sync complete — ${data.created || 0} created, ${data.updated || 0} updated` });
      }
    } catch (e) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Plug className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{connector?.name}</p>
              <p className="text-xs text-slate-400 capitalize">{connector?.category?.replace("_", " ")} connector</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {step === "credentials" && (
            <>
              {schema.length === 0 ? (
                <p className="text-sm text-slate-500">
                  This connector uses file upload. Use the Import File button instead.
                </p>
              ) : (
                <>
                  <p className="text-xs text-slate-500">
                    Enter your {connector?.name} credentials. These are sent directly to the connector and are not stored.
                  </p>
                  <ConnectorScopeSelector
                    scopeMode={scopeMode}
                    setScopeMode={setScopeMode}
                    enterpriseId={enterpriseId}
                    setEnterpriseId={setEnterpriseId}
                    enterprises={enterprises}
                  />
                  {schema.map(field => (
                    <div key={field.key}>
                      <label className="text-xs font-semibold text-slate-600 mb-1.5 block">{field.label}</label>
                      <input
                        type={field.type === "password" ? "password" : "text"}
                        value={creds[field.key] || ""}
                        onChange={e => setField(field.key, e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-400"
                        placeholder={field.type === "password" ? "••••••••••••" : field.label}
                        autoComplete="off"
                      />
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {step === "result" && result && (
            <div className={`rounded-xl border p-4 text-sm ${
              result._dryRun          ? "bg-amber-50 border-amber-200"
              : result.status === "error" ? "bg-rose-50 border-rose-200"
              : result.status === "skipped" ? "bg-slate-50 border-slate-200"
              : "bg-emerald-50 border-emerald-200"
            }`}>
              <p className="font-bold text-slate-800 mb-2">
                {result._dryRun           ? "Dry run — no data written"
                  : result.status === "error"   ? "Sync failed"
                  : result.status === "skipped" ? "Nothing to sync"
                  : "Sync complete"}
              </p>
              {result.reason && <p className="text-xs text-slate-600 mb-2">{result.reason}</p>}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {result.extracted     != null && <div><span className="text-slate-500">Extracted:</span> <strong>{result.extracted}</strong></div>}
                {result.would_create  != null && <div><span className="text-slate-500">Would create:</span> <strong>{result.would_create}</strong></div>}
                {result.created       != null && <div><span className="text-slate-500">Created:</span> <strong>{result.created}</strong></div>}
                {result.updated       != null && <div><span className="text-slate-500">Updated:</span> <strong>{result.updated}</strong></div>}
                {result.failed        != null && <div><span className="text-slate-500">Failed:</span> <strong>{result.failed}</strong></div>}
              </div>
              {result.unmapped?.length > 0 && (
                <div className="mt-2 flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700">
                    {result.unmapped.length} unmapped values — the AI can re-map them automatically.
                  </p>
                  <SmartImportButton variant="link" label="Re-map with AI →" entityHint={connector?.name || ""} onComplete={onClose} />
                </div>
              )}
              {result.detail && <p className="mt-2 text-xs text-rose-700">{result.detail}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">
            {step === "result" ? "Close" : "Cancel"}
          </button>
          {step === "credentials" && schema.length > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => runSync(true)} disabled={running}
                className="rounded-xl text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Dry Run"}
              </Button>
              <Button onClick={() => runSync(false)} disabled={running}
                className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs">
                {running
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Syncing…</>
                  : <><Play className="w-3.5 h-3.5 mr-1.5" /> Connect & Sync</>}
              </Button>
            </div>
          )}
          {step === "result" && (
            <Button onClick={() => { setStep("credentials"); setResult(null); }}
              variant="outline" className="rounded-xl text-xs">
              Sync Again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


// ── ScheduleModal ────────────────────────────────────────────────────────────
// Lets the operator set an automatic sync schedule for any API connector.
const FREQ_OPTIONS = [
  { id: "manual",  label: "Manual only",   desc: "Run only when you click Connect & Sync" },
  { id: "hourly",  label: "Every hour",    desc: "Runs at the top of each hour (UTC)" },
  { id: "daily",   label: "Daily",         desc: "Runs once per day at the specified hour (UTC)" },
  { id: "weekly",  label: "Weekly",        desc: "Runs on the chosen weekday at the specified hour" },
  { id: "monthly", label: "Monthly",       desc: "Runs on the chosen day of the month" },
];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ScheduleModal({ connector, companyId, enterprises = [], existingSchedule, onClose, onSaved }) {
  const { toast } = useToast();
  const schema     = CREDENTIAL_SCHEMA[connector?.id] || [];
  const [frequency,  setFrequency]  = useState(existingSchedule?.frequency  || "manual");
  const [runAtHour,  setRunAtHour]  = useState(existingSchedule?.run_at_hour ?? 0);
  const [runAtDay,   setRunAtDay]   = useState(existingSchedule?.run_at_day  ?? 1);
  const [entityType, setEntityType] = useState(existingSchedule?.entity_type || "people");
  const [creds,      setCreds]      = useState({});
  const [saving,     setSaving]     = useState(false);
  const [scopeMode, setScopeMode] = useState(existingSchedule?.scope_mode || "company");
  const [enterpriseId, setEnterpriseId] = useState(existingSchedule?.enterprise_id || "");

  function setCredField(key, val) {
    setCreds(prev => ({ ...prev, [key]: val }));
  }

  async function saveSchedule() {
    setSaving(true);
    try {
      const body = {
        company_id:     companyId,
        connector_id:   connector.id,
        connector_name: connector.name,
        frequency,
        run_at_hour:    parseInt(runAtHour, 10),
        run_at_day:     parseInt(runAtDay, 10),
        entity_type:    entityType,
        scope_mode:     scopeMode,
        enterprise_id:  enterpriseId || null,
        enterprise_name: enterprises.find(e => e.id === enterpriseId)?.enterprise_name || enterprises.find(e => e.id === enterpriseId)?.name || null,
        is_active:      true,
      };
      // Only include credentials if operator filled them in
      if (schema.length > 0 && Object.values(creds).some(v => v)) {
        body.credentials = creds;
      }
      const res = await fetch(`${RAILWAY_URL}/connectors/schedule`, {
        method: "POST",
        headers: { ...API_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      toast({ title: `${connector.name} schedule saved`, description: frequency === "manual" ? "Manual sync only" : `Next run: ${data.next_run_at ? new Date(data.next_run_at).toLocaleString() : "—"}` });
      onSaved && onSaved(data);
      onClose();
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function removeSchedule() {
    if (!existingSchedule) { onClose(); return; }
    try {
      await fetch(`${RAILWAY_URL}/connectors/schedule/${connector.id}?company_id=${companyId}`, {
        method: "DELETE",
        headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
      });
      toast({ title: `${connector.name} schedule removed` });
      onSaved && onSaved(null);
      onClose();
    } catch (e) {
      toast({ title: "Remove failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
              <CalendarClock className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Schedule — {connector?.name}</p>
              <p className="text-xs text-slate-400">Automatic sync schedule</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Frequency picker */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-2 block">Sync frequency</label>
            <div className="space-y-2">
              {FREQ_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setFrequency(opt.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-colors ${
                    frequency === opt.id
                      ? "border-violet-400 bg-violet-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className={`font-semibold ${frequency === opt.id ? "text-violet-700" : "text-slate-700"}`}>{opt.label}</span>
                  <span className="text-slate-400 ml-2">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Hour picker — shown for daily/weekly/monthly */}
          {(frequency === "daily" || frequency === "weekly" || frequency === "monthly") && (
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Run at hour (UTC)</label>
              <select
                value={runAtHour}
                onChange={e => setRunAtHour(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-400 bg-white"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00 UTC</option>
                ))}
              </select>
            </div>
          )}

          {/* Weekday picker — weekly */}
          {frequency === "weekly" && (
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Day of week</label>
              <div className="flex gap-1.5 flex-wrap">
                {DOW.map((d, i) => (
                  <button
                    key={d}
                    onClick={() => setRunAtDay(i)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      runAtDay === i ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Day of month — monthly */}
          {frequency === "monthly" && (
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Day of month</label>
              <select
                value={runAtDay}
                onChange={e => setRunAtDay(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-400 bg-white"
              >
                {Array.from({ length: 28 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            </div>
          )}

          {/* Entity type */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Sync as</label>
            <select
              value={entityType}
              onChange={e => setEntityType(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-400 bg-white"
            >
              {ENTITY_TYPES.map(et => (
                <option key={et.id} value={et.id}>{et.label}</option>
              ))}
            </select>
          </div>

          {/* Credentials — only shown for non-manual schedules with API-key connectors */}
          {frequency !== "manual" && schema.length > 0 && (
            <div className="space-y-3 border border-slate-200 rounded-xl p-3 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                API credentials for automatic sync
              </p>
              <p className="text-[10px] text-slate-400">
                Stored in-memory on the server. Re-enter after each Railway redeploy.
              </p>
              {schema.map(field => (
                <div key={field.key}>
                  <label className="text-[10px] font-semibold text-slate-500 mb-1 block">{field.label}</label>
                  <input
                    type={field.type === "password" ? "password" : "text"}
                    value={creds[field.key] || ""}
                    onChange={e => setCredField(field.key, e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 bg-white"
                    placeholder={field.type === "password" ? "••••••••••••" : field.label}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-400">
            Schedules trigger automatically via Railway cron every hour.
            Credentials are never logged or returned by the API.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          {existingSchedule ? (
            <button onClick={removeSchedule} className="text-xs text-rose-500 hover:text-rose-700">
              Remove schedule
            </button>
          ) : (
            <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          )}
          <Button
            onClick={saveSchedule}
            disabled={saving}
            className="bg-violet-600 hover:bg-violet-700 rounded-xl text-xs"
          >
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</>
              : <><CalendarClock className="w-3.5 h-3.5 mr-1.5" /> Save Schedule</>}
          </Button>
        </div>
      </div>
    </div>
  );
}


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

  // Schema exploration state
  const [schema, setSchema]               = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [tableMirrorMap, setTableMirrorMap] = useState({});   // {tableName: entityType}
  const [mirroring, setMirroring]         = useState(false);
  const [mirrorResults, setMirrorResults] = useState([]);

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

  async function loadPreview(tableOverride = null) {
    const activeTable = tableOverride ?? selectedTable;
    if (!useCustomQuery && !activeTable) {
      toast({ title: "Select a table or enter a custom query first", variant: "destructive" });
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await fetch(`${RAILWAY_URL}/connectors/db/preview?limit=10`, {
        method: "POST",
        headers: API_HEADERS,
        body: JSON.stringify(buildCreds({ table: useCustomQuery ? null : activeTable })),
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

  async function loadSchema() {
    setSchemaLoading(true);
    setSchema(null);
    setMirrorResults([]);
    try {
      const res = await fetch(`${RAILWAY_URL}/connectors/db/schema`, {
        method: "POST",
        headers: API_HEADERS,
        body: JSON.stringify(buildCreds()),
      });
      const data = await res.json();
      if (data.ok) {
        setSchema(data.schema || {});
        setStep("schema");
      } else {
        toast({ title: "Schema load failed", description: data.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Schema load failed", description: e.message, variant: "destructive" });
    } finally {
      setSchemaLoading(false);
    }
  }

  async function mirrorSelected() {
    const toMirror = Object.entries(tableMirrorMap).filter(([, et]) => et);
    if (!toMirror.length) return;
    setMirroring(true);
    setMirrorResults([]);
    const results = [];
    for (const [tableName] of toMirror) {
      try {
        const res = await fetch(
          `${RAILWAY_URL}/connectors/db/mirror?company_id=${companyId}&table=${encodeURIComponent(tableName)}`,
          { method: "POST", headers: API_HEADERS, body: JSON.stringify(buildCreds()) }
        );
        const data = await res.json();
        results.push({ table: tableName, ...data });
      } catch (e) {
        results.push({ table: tableName, ok: false, error: e.message });
      }
    }
    setMirrorResults(results);
    setMirroring(false);
    const succeeded = results.filter(r => r.ok).length;
    toast({
      title: `${succeeded}/${results.length} tables mirrored to AI`,
      description: "The copilot can now query these tables with query_external_table.",
    });
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
          {["credentials", "tables", "schema", "preview", "sync"].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`text-[10px] font-semibold px-2 py-1 rounded-full capitalize ${
                step === s
                  ? "bg-indigo-100 text-indigo-700"
                  : ["credentials", "tables", "schema", "preview", "sync"].indexOf(step) > i
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-400"
              }`}>
                {s}
              </div>
              {i < 4 && <ChevronRight className="w-3 h-3 text-slate-300" />}
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

          {/* ── Step: schema exploration ── */}
          {step === "schema" && (
            <>
              {schema && Object.keys(schema).length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No tables found in this database.</p>
              )}

              {schema && Object.keys(schema).length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-700">
                      {Object.keys(schema).length} tables · select entity type to mirror to AI
                    </p>
                    {mirrorResults.length > 0 && (
                      <span className="text-[10px] text-emerald-600 font-semibold">
                        {mirrorResults.filter(r => r.ok).length} mirrored
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                    {Object.entries(schema).map(([tableName, columns]) => {
                      const mirrorResult = mirrorResults.find(r => r.table === tableName);
                      return (
                        <div key={tableName} className={`border rounded-xl overflow-hidden ${
                          mirrorResult?.ok ? "border-emerald-200" : "border-slate-200"
                        }`}>
                          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50">
                            <Table2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{tableName}</span>
                            <span className="text-[10px] text-slate-400 shrink-0">{columns.length} cols</span>

                            {mirrorResult?.ok ? (
                              <span className="text-[10px] text-emerald-600 font-semibold shrink-0">
                                ✓ {mirrorResult.rows_mirrored} rows
                              </span>
                            ) : mirrorResult?.error ? (
                              <span className="text-[10px] text-rose-500 shrink-0">failed</span>
                            ) : null}

                            <select
                              value={tableMirrorMap[tableName] || ""}
                              onChange={e => setTableMirrorMap(prev => ({ ...prev, [tableName]: e.target.value }))}
                              className="text-[10px] border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:border-indigo-400 bg-white shrink-0"
                            >
                              <option value="">— entity —</option>
                              <option value="people">People</option>
                              <option value="enterprises">Enterprises</option>
                              <option value="products">Products</option>
                              <option value="tasks">Tasks</option>
                              <option value="transactions">Transactions</option>
                              <option value="other">Other (raw only)</option>
                            </select>

                            <button
                              onClick={() => {
                                setSelectedTable(tableName);
                                setUseCustomQuery(false);
                                setEntityType(tableMirrorMap[tableName] || "people");
                                loadPreview(tableName);
                              }}
                              className="text-[10px] text-indigo-600 hover:text-indigo-700 font-semibold whitespace-nowrap shrink-0"
                            >
                              Import →
                            </button>
                          </div>

                          {/* Column type pills */}
                          <div className="px-3 py-1.5 flex flex-wrap gap-1">
                            {columns.slice(0, 10).map(col => (
                              <span key={col.name} className="text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 font-mono">
                                {col.name}
                                <span className="text-slate-400 ml-1 not-italic">{col.type}</span>
                              </span>
                            ))}
                            {columns.length > 10 && (
                              <span className="text-[10px] text-slate-400">+{columns.length - 10} more</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[10px] text-slate-400">
                    Mirroring copies up to 10,000 rows into Newsconseen&apos;s analytical layer.
                    The AI copilot can then query these tables directly with <code className="font-mono">query_external_table</code>.
                  </p>
                </div>
              )}
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
              {/* Typed ontology object badge */}
              {ENTITY_TO_ONTOLOGY[entityType] && (
                <div className="mt-3 pt-3 border-t border-black/5">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Ontology Object Type</p>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border ${ENTITY_TO_ONTOLOGY[entityType].bg} ${ENTITY_TO_ONTOLOGY[entityType].color} ${ENTITY_TO_ONTOLOGY[entityType].border}`}>
                    {ENTITY_TO_ONTOLOGY[entityType].type}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Synced records are stored as <strong>{ENTITY_TO_ONTOLOGY[entityType].type}</strong> objects in the universal ontology
                  </p>
                </div>
              )}
              {syncResult.unmapped?.length > 0 && (
                <div className="mt-2 flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700">
                    {syncResult.unmapped.length} unmapped values — the AI can re-map them automatically.
                  </p>
                  <SmartImportButton variant="link" label="Re-map with AI →" entityHint={connector?.name || ""} onComplete={onClose} />
                </div>
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
                  variant="outline"
                  onClick={loadSchema}
                  disabled={schemaLoading}
                  className="rounded-xl text-xs border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                >
                  {schemaLoading
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Loading…</>
                    : <><Database className="w-3.5 h-3.5 mr-1.5" /> Explore Full Schema</>}
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

            {step === "schema" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setStep("tables")}
                  className="rounded-xl text-xs"
                >
                  Back
                </Button>
                <Button
                  onClick={mirrorSelected}
                  disabled={mirroring || !Object.values(tableMirrorMap).some(Boolean)}
                  className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs"
                >
                  {mirroring
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Mirroring…</>
                    : <><Database className="w-3.5 h-3.5 mr-1.5" /> Mirror {Object.values(tableMirrorMap).filter(Boolean).length || ""} Tables to AI</>}
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
                    : <><Play className="w-3.5 h-3.5 mr-1.5" /> Sync to Newsconseen</>}
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


// ── FileConnectModal ─────────────────────────────────────────────────────────
// Handles excel, csv, json_xml connectors via file upload
function FileConnectModal({ connector, companyId, enterprises = [], onClose }) {
  const { toast } = useToast();
  const [step, setStep]           = useState("upload"); // upload | preview | result
  const [file, setFile]           = useState(null);
  const [entityType, setEntityType] = useState("people");
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [running, setRunning]     = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [scopeMode, setScopeMode] = useState("company");
  const [enterpriseId, setEnterpriseId] = useState("");

  const isJson = connector?.id === "json_xml";
  const accept = isJson
    ? ".json,.xml,application/json,text/xml,application/xml"
    : ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

  async function analyzeFile() {
    if (!file) return;
    setAnalyzing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("entity_type", entityType);
      form.append("connector_id", connector.id);
      const res = await fetch(`${RAILWAY_URL}/connectors/suggest-columns`, {
        method: "POST",
        headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSuggestion(data);
      setStep("preview");
    } catch (e) {
      toast({ title: "Failed to read file", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }

  async function runSync(dryRun = false) {
    if (!file) return;
    setRunning(true);
    try {
      const form = new FormData();
      form.append("company_id", companyId);
      form.append("connector_id", connector.id);
      form.append("entity_type", entityType);
      form.append("file", file);
      form.append("dry_run", dryRun ? "true" : "false");
      form.append("scope_mode", scopeMode);
      if (enterpriseId) {
        const ent = enterprises.find(e => e.id === enterpriseId);
        form.append("enterprise_id", enterpriseId);
        form.append("enterprise_name", ent?.enterprise_name || ent?.name || "");
      }
      const res = await fetch(`${RAILWAY_URL}/connectors/run`, {
        method: "POST",
        headers: formHeaders(),
        body: form,
      });
      const data = await res.json();
      setRunResult(data);
      setStep("result");
      if (!dryRun && data.status !== "error") {
        toast({ title: `Import complete — ${data.created || 0} created, ${data.updated || 0} updated` });
      }
    } catch (e) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{connector?.name}</p>
              <p className="text-xs text-slate-400">Import file into Newsconseen</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-2">
          {["upload", "preview", "result"].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`text-[10px] font-semibold px-2 py-1 rounded-full capitalize ${
                step === s ? "bg-indigo-100 text-indigo-700"
                  : ["upload", "preview", "result"].indexOf(step) > i ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-400"
              }`}>{s}</div>
              {i < 2 && <ChevronRight className="w-3 h-3 text-slate-300" />}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {step === "upload" && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">What are you importing?</label>
                <div className="grid grid-cols-2 gap-2">
                  {ENTITY_TYPES.map(et => (
                    <button key={et.id} onClick={() => setEntityType(et.id)}
                      className={`text-left px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                        entityType === et.id
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}>
                      {et.label}
                    </button>
                  ))}
                </div>
              </div>
              <ConnectorScopeSelector
                scopeMode={scopeMode}
                setScopeMode={setScopeMode}
                enterpriseId={enterpriseId}
                setEnterpriseId={setEnterpriseId}
                enterprises={enterprises}
              />
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Select file</label>
                <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl px-6 py-10 cursor-pointer transition-colors ${
                  file ? "border-emerald-400 bg-emerald-50" : "border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40"
                }`}>
                  <HardDrive className={`w-8 h-8 ${file ? "text-emerald-500" : "text-slate-400"}`} />
                  {file ? (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-emerald-700">{file.name}</p>
                      <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-600">Drop file here or click to browse</p>
                      <p className="text-xs text-slate-400 mt-1">{isJson ? "JSON or XML files" : "Excel (.xlsx, .xls) or CSV files"}</p>
                    </div>
                  )}
                  <input type="file" accept={accept} className="hidden"
                    onChange={e => setFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </>
          )}

          {step === "preview" && suggestion && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">
                  {suggestion.row_count?.toLocaleString()} rows · <span className="text-indigo-600">{suggestion.file_name}</span>
                </p>
                <span className="text-[10px] px-2 py-1 bg-slate-100 text-slate-500 rounded-full">
                  Detected: {suggestion.detected_entity}
                </span>
              </div>
              {suggestion.preview_rows?.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {suggestion.columns.slice(0, 6).map(col => (
                          <th key={col} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{col}</th>
                        ))}
                        {suggestion.columns.length > 6 && <th className="px-3 py-2 text-slate-400">+{suggestion.columns.length - 6}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {suggestion.preview_rows.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          {suggestion.columns.slice(0, 6).map(col => (
                            <td key={col} className="px-3 py-1.5 text-slate-700 max-w-[120px] truncate">
                              {row[col] == null ? <span className="text-slate-300">—</span> : String(row[col])}
                            </td>
                          ))}
                          {suggestion.columns.length > 6 && <td />}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  {Object.keys(suggestion.suggested_mappings || {}).length} columns auto-mapped
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(suggestion.suggested_mappings || {}).slice(0, 8).map(([src, tgt]) => (
                    <span key={src} className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-mono">
                      {src} → {tgt}
                    </span>
                  ))}
                  {Object.keys(suggestion.suggested_mappings || {}).length > 8 && (
                    <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                      +{Object.keys(suggestion.suggested_mappings || {}).length - 8} more
                    </span>
                  )}
                </div>
                {suggestion.unmapped_columns?.length > 0 && (
                  <p className="text-[10px] text-amber-600 mt-2">
                    {suggestion.unmapped_columns.length} unmapped: {suggestion.unmapped_columns.slice(0, 4).join(", ")}{suggestion.unmapped_columns.length > 4 ? " …" : ""}
                  </p>
                )}
              </div>
            </>
          )}

          {step === "result" && runResult && (
            <div className={`rounded-xl border p-4 text-sm ${
              runResult.status === "dry_run" ? "bg-amber-50 border-amber-200"
                : runResult.status === "error" ? "bg-rose-50 border-rose-200"
                : "bg-emerald-50 border-emerald-200"
            }`}>
              <p className="font-bold text-slate-800 mb-2">
                {runResult.status === "dry_run" ? "Dry run — no data written"
                  : runResult.status === "error" ? "Import failed"
                  : "Import complete"}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {runResult.extracted    != null && <div><span className="text-slate-500">Extracted:</span> <strong>{runResult.extracted}</strong></div>}
                {runResult.would_create != null && <div><span className="text-slate-500">Would create:</span> <strong>{runResult.would_create}</strong></div>}
                {runResult.created      != null && <div><span className="text-slate-500">Created:</span> <strong>{runResult.created}</strong></div>}
                {runResult.updated      != null && <div><span className="text-slate-500">Updated:</span> <strong>{runResult.updated}</strong></div>}
                {runResult.skipped      != null && <div><span className="text-slate-500">Skipped:</span> <strong>{runResult.skipped}</strong></div>}
              </div>
              {runResult.changes && Object.keys(runResult.changes).length > 0 && (
                <div className="mt-2 text-[11px] text-slate-600">
                  <span className="font-semibold">What changed since last sync:</span>{" "}
                  {Object.entries(runResult.changes).map(([entity, c], i) => (
                    <span key={entity}>
                      {i > 0 && " · "}
                      {entity}: +{c.added_count} new, {c.updated_count} updated, -{c.removed_count} removed
                    </span>
                  ))}
                </div>
              )}
              {runResult.detail && <p className="mt-2 text-xs text-rose-700">{runResult.detail}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          <div className="flex items-center gap-2">
            {step === "upload" && (
              <Button onClick={analyzeFile} disabled={!file || analyzing}
                className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs">
                {analyzing
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Analysing…</>
                  : <><Eye className="w-3.5 h-3.5 mr-1.5" /> Preview Data</>}
              </Button>
            )}
            {step === "preview" && (
              <>
                <Button variant="outline" onClick={() => setStep("upload")} className="rounded-xl text-xs">Back</Button>
                <Button variant="outline" onClick={() => runSync(true)} disabled={running}
                  className="rounded-xl text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
                  {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Dry Run"}
                </Button>
                <Button onClick={() => runSync(false)} disabled={running}
                  className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs">
                  {running
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Importing…</>
                    : <><Play className="w-3.5 h-3.5 mr-1.5" /> Import to Newsconseen</>}
                </Button>
              </>
            )}
            {step === "result" && (
              <>
                <Button variant="outline" onClick={() => { setStep("upload"); setFile(null); setSuggestion(null); setRunResult(null); }}
                  className="rounded-xl text-xs">
                  Import another
                </Button>
                <Button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs">Done</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// ── GoogleSheetsModal ────────────────────────────────────────────────────────
// Fetches a public Google Sheet via CSV export and imports it
function GoogleSheetsModal({ connector, companyId, enterprises = [], onClose }) {
  const { toast } = useToast();
  const [step, setStep]             = useState("url"); // url | preview | result
  const [sheetUrl, setSheetUrl]     = useState("");
  const [entityType, setEntityType] = useState("people");
  const [analyzing, setAnalyzing]   = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [fetchedFile, setFetchedFile] = useState(null);
  const [running, setRunning]       = useState(false);
  const [runResult, setRunResult]   = useState(null);
  const [scopeMode, setScopeMode] = useState("company");
  const [enterpriseId, setEnterpriseId] = useState("");

  function extractSheetId(url) {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  async function analyzeSheet() {
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      toast({ title: "Invalid URL", description: "Paste the full Google Sheets URL from your browser.", variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const csvRes = await fetch(csvUrl);
      if (!csvRes.ok) throw new Error("Could not access sheet — make sure it is shared as 'Anyone with the link can view'.");
      const csvBlob = await csvRes.blob();
      const file = new File([csvBlob], `sheet_${sheetId}.csv`, { type: "text/csv" });
      setFetchedFile(file);

      const form = new FormData();
      form.append("file", file);
      form.append("entity_type", entityType);
      form.append("connector_id", "csv");
      const res = await fetch(`${RAILWAY_URL}/connectors/suggest-columns`, {
        method: "POST",
        headers: RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {},
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSuggestion(data);
      setStep("preview");
    } catch (e) {
      toast({ title: "Could not fetch sheet", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }

  async function runSync(dryRun = false) {
    if (!fetchedFile) return;
    setRunning(true);
    try {
      const form = new FormData();
      form.append("company_id", companyId);
      form.append("connector_id", "csv");
      form.append("entity_type", entityType);
      form.append("file", fetchedFile);
      form.append("dry_run", dryRun ? "true" : "false");
      form.append("scope_mode", scopeMode);
      if (enterpriseId) {
        const ent = enterprises.find(e => e.id === enterpriseId);
        form.append("enterprise_id", enterpriseId);
        form.append("enterprise_name", ent?.enterprise_name || ent?.name || "");
      }
      const res = await fetch(`${RAILWAY_URL}/connectors/run`, {
        method: "POST",
        headers: formHeaders(),
        body: form,
      });
      const data = await res.json();
      setRunResult(data);
      setStep("result");
      if (!dryRun && data.status !== "error") {
        toast({ title: `Import complete — ${data.created || 0} created, ${data.updated || 0} updated` });
      }
    } catch (e) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Cloud className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Google Sheets</p>
              <p className="text-xs text-slate-400">Import from a public Google Sheet</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-2">
          {["Sheet URL", "Preview", "Result"].map((label, i) => {
            const s = ["url", "preview", "result"][i];
            return (
              <React.Fragment key={s}>
                <div className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                  step === s ? "bg-indigo-100 text-indigo-700"
                    : ["url", "preview", "result"].indexOf(step) > i ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-400"
                }`}>{label}</div>
                {i < 2 && <ChevronRight className="w-3 h-3 text-slate-300" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {step === "url" && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Google Sheets URL</label>
                <input type="url" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-400"
                  placeholder="https://docs.google.com/spreadsheets/d/..." />
                <p className="text-[10px] text-slate-400 mt-1">
                  Sheet must be shared as <strong>Anyone with the link can view</strong>.
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">What are you importing?</label>
                <div className="grid grid-cols-2 gap-2">
                  {ENTITY_TYPES.map(et => (
                    <button key={et.id} onClick={() => setEntityType(et.id)}
                      className={`text-left px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                        entityType === et.id ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}>
                      {et.label}
                    </button>
                  ))}
                </div>
              </div>
              <ConnectorScopeSelector
                scopeMode={scopeMode}
                setScopeMode={setScopeMode}
                enterpriseId={enterpriseId}
                setEnterpriseId={setEnterpriseId}
                enterprises={enterprises}
              />
            </>
          )}

          {step === "preview" && suggestion && (
            <>
              <p className="text-xs font-semibold text-slate-700">
                {suggestion.row_count?.toLocaleString()} rows · {suggestion.columns?.length} columns
              </p>
              {suggestion.preview_rows?.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 border-b">
                        {suggestion.columns.slice(0, 5).map(c => (
                          <th key={c} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {suggestion.preview_rows.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          {suggestion.columns.slice(0, 5).map(c => (
                            <td key={c} className="px-3 py-1.5 text-slate-700 max-w-[120px] truncate">
                              {row[c] == null ? "—" : String(row[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700 mb-1">
                  {Object.keys(suggestion.suggested_mappings || {}).length} columns auto-mapped
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(suggestion.suggested_mappings || {}).slice(0, 6).map(([src, tgt]) => (
                    <span key={src} className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-mono">
                      {src} → {tgt}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === "result" && runResult && (
            <div className={`rounded-xl border p-4 text-sm ${
              runResult.status === "dry_run" ? "bg-amber-50 border-amber-200"
                : runResult.status === "error" ? "bg-rose-50 border-rose-200"
                : "bg-emerald-50 border-emerald-200"
            }`}>
              <p className="font-bold text-slate-800 mb-2">
                {runResult.status === "dry_run" ? "Dry run — no data written"
                  : runResult.status === "error" ? "Import failed"
                  : "Import complete"}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {runResult.extracted != null && <div><span className="text-slate-500">Extracted:</span> <strong>{runResult.extracted}</strong></div>}
                {runResult.created   != null && <div><span className="text-slate-500">Created:</span> <strong>{runResult.created}</strong></div>}
                {runResult.updated   != null && <div><span className="text-slate-500">Updated:</span> <strong>{runResult.updated}</strong></div>}
              </div>
              {runResult.detail && <p className="mt-2 text-xs text-rose-700">{runResult.detail}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          <div className="flex items-center gap-2">
            {step === "url" && (
              <Button onClick={analyzeSheet} disabled={!sheetUrl || analyzing}
                className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs">
                {analyzing
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Fetching…</>
                  : <><Eye className="w-3.5 h-3.5 mr-1.5" /> Preview Sheet</>}
              </Button>
            )}
            {step === "preview" && (
              <>
                <Button variant="outline" onClick={() => setStep("url")} className="rounded-xl text-xs">Back</Button>
                <Button variant="outline" onClick={() => runSync(true)} disabled={running}
                  className="rounded-xl text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
                  {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Dry Run"}
                </Button>
                <Button onClick={() => runSync(false)} disabled={running}
                  className="bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs">
                  {running
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Importing…</>
                    : <><Play className="w-3.5 h-3.5 mr-1.5" /> Import to Newsconseen</>}
                </Button>
              </>
            )}
            {step === "result" && (
              <Button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs">Done</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Main Connectors page ─────────────────────────────────────────────────────
// ── Phase 12: Live Data Feeds — Inbound Webhooks ─────────────────────────────

const ENTITY_TYPE_LABELS = {
  people:       "People",
  enterprises:  "Enterprises",
  products:     "Products",
  transactions: "Transactions",
  tasks:        "Tasks",
};

const ENTITY_TYPE_COLORS = {
  people:       "bg-blue-100 text-blue-700",
  enterprises:  "bg-amber-100 text-amber-700",
  products:     "bg-rose-100 text-rose-700",
  transactions: "bg-emerald-100 text-emerald-700",
  tasks:        "bg-violet-100 text-violet-700",
};

function WebhookSection({ currentUser }) {
  const companyId = currentUser?.company_id;
  const { toast } = useToast();

  const [createOpen, setCreateOpen]         = useState(false);
  const [sourceName, setSourceName]         = useState("");
  const [entityType, setEntityType]         = useState("people");
  const [description, setDescription]       = useState("");
  const [creating, setCreating]             = useState(false);
  const [createdSecret, setCreatedSecret]   = useState(null); // {webhook_id, ingest_url, secret}
  const [expandedEvents, setExpandedEvents] = useState(null); // webhook_id

  const { data: webhooksData, isLoading: whLoading, refetch: refetchWebhooks } = useQuery({
    queryKey: ["webhooks", companyId],
    queryFn: async () => {
      if (!companyId) return { webhooks: [] };
      const res = await fetch(`${RAILWAY_URL}/ingest/list?company_id=${companyId}`, { headers: API_HEADERS });
      if (!res.ok) return { webhooks: [] };
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const { data: eventsData } = useQuery({
    queryKey: ["webhook-events", companyId],
    queryFn: async () => {
      if (!companyId) return { events: [] };
      const res = await fetch(`${RAILWAY_URL}/ingest/events?company_id=${companyId}&limit=50`, { headers: API_HEADERS });
      if (!res.ok) return { events: [] };
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchInterval: 30_000,
  });

  const webhooks = webhooksData?.webhooks || [];
  const events   = eventsData?.events   || [];

  const copyToClipboard = useCallback((text, label = "Copied") => {
    navigator.clipboard.writeText(text).then(() => toast({ title: label })).catch(() => {});
  }, [toast]);

  const handleCreate = async () => {
    if (!sourceName.trim()) { toast({ title: "Source name required", variant: "destructive" }); return; }
    setCreating(true);
    try {
      const res = await fetch(`${RAILWAY_URL}/ingest/register`, {
        method: "POST",
        headers: { ...API_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id:  companyId,
          source_name: sourceName.trim(),
          entity_type: entityType,
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Registration failed");
      }
      const result = await res.json();
      setCreatedSecret(result);
      setCreateOpen(false);
      setSourceName(""); setEntityType("people"); setDescription("");
      refetchWebhooks();
      toast({ title: "Webhook created" });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (webhookId) => {
    if (!window.confirm("Delete this webhook? External systems using it will stop working.")) return;
    try {
      const encoded = encodeURIComponent(webhookId);
      const res = await fetch(`${RAILWAY_URL}/ingest/config/${encoded}`, {
        method: "DELETE",
        headers: API_HEADERS,
      });
      if (!res.ok) throw new Error("Delete failed");
      refetchWebhooks();
      toast({ title: "Webhook deleted" });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Live Data Feeds</h2>
            <p className="text-sm text-slate-500">Receive real-time data from any external system via webhook</p>
          </div>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Feed
        </button>
      </div>

      {/* Secret reveal card (shown once after creation) */}
      {createdSecret && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm font-semibold text-amber-800">Webhook created — save your secret now</p>
            <button onClick={() => setCreatedSecret(null)} className="text-amber-500 hover:text-amber-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-slate-500 shrink-0">URL</span>
              <span className="flex-1 truncate text-slate-800">{createdSecret.ingest_url}</span>
              <button onClick={() => copyToClipboard(createdSecret.ingest_url, "URL copied")} className="text-indigo-500 hover:text-indigo-700 shrink-0"><Copy className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-slate-500 shrink-0">Secret</span>
              <span className="flex-1 text-slate-800 select-all">{createdSecret.secret}</span>
              <button onClick={() => copyToClipboard(createdSecret.secret, "Secret copied")} className="text-indigo-500 hover:text-indigo-700 shrink-0"><Copy className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <p className="text-xs text-amber-700 mt-2">Pass the secret as <code className="bg-amber-100 px-1 rounded">X-Webhook-Secret</code> header or <code className="bg-amber-100 px-1 rounded">?secret=</code> query param.</p>
        </div>
      )}

      {/* Webhook cards */}
      {whLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
          <Webhook className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No live feeds yet</p>
          <p className="text-xs mt-1">Create a feed to receive data from POS, LIMS, mobile apps, ERPs, or any HTTP-capable system.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {webhooks.map(wh => {
            const entityColor = ENTITY_TYPE_COLORS[wh.entity_type] || "bg-slate-100 text-slate-700";
            const entityLabel = ENTITY_TYPE_LABELS[wh.entity_type] || wh.entity_type;
            const wEvents = events.filter(e => e.webhook_id === wh.webhook_id);
            const isExpanded = expandedEvents === wh.webhook_id;

            return (
              <div key={wh.webhook_id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 text-sm">{wh.source_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entityColor}`}>{entityLabel}</span>
                    </div>
                    {wh.description && <p className="text-xs text-slate-500 mt-1">{wh.description}</p>}
                  </div>
                  <button onClick={() => handleDelete(wh.webhook_id)} className="text-slate-400 hover:text-rose-500 transition-colors shrink-0 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* URL row */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono">
                  <span className="flex-1 truncate text-slate-600">{wh.ingest_url}</span>
                  <button onClick={() => copyToClipboard(wh.ingest_url, "URL copied")} className="text-indigo-400 hover:text-indigo-600 shrink-0"><Copy className="w-3 h-3" /></button>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3" />{wh.received_count || 0} received
                  </span>
                  {wh.last_received_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />Last: {new Date(wh.last_received_at).toLocaleDateString()}
                    </span>
                  )}
                  <span className="ml-auto text-slate-400">Secret: ••••{wh.secret?.slice(-4)}</span>
                </div>

                {/* Events toggle */}
                {wEvents.length > 0 && (
                  <button
                    onClick={() => setExpandedEvents(isExpanded ? null : wh.webhook_id)}
                    className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    {wEvents.length} recent event{wEvents.length !== 1 ? "s" : ""}
                  </button>
                )}

                {isExpanded && (
                  <div className="border-t border-slate-100 pt-2 space-y-1.5">
                    {wEvents.slice(0, 8).map((ev, i) => (
                      <div key={i} className="flex items-center justify-between text-xs text-slate-600 py-0.5">
                        <span className="text-slate-400">{new Date(ev.received_at).toLocaleTimeString()}</span>
                        <span>{ev.records_in} in</span>
                        <span className="text-emerald-600">{ev.created} created</span>
                        {ev.errors > 0 && <span className="text-rose-500">{ev.errors} err</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* How it works */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs text-slate-600 space-y-2">
        <p className="font-semibold text-slate-700">How live feeds work</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Create a feed — choose source name and which entity type to receive (People, Products, etc.)</li>
          <li>Copy the ingest URL and secret to your external system (POS, LIMS, ERP, mobile app)</li>
          <li>Your system POSTs JSON to the URL with <code className="bg-slate-200 px-1 rounded">X-Webhook-Secret</code> header</li>
          <li>Newsconseen auto-maps fields, stores the record, and triggers ETL immediately</li>
        </ol>
        <p className="text-slate-500">Body can be a single JSON object or an array of objects. Unknown fields are silently ignored.</p>
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">New Live Feed</h3>
              <button onClick={() => setCreateOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Source name <span className="text-rose-500">*</span></label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="e.g. Square POS, Lab System, Mobile App"
                  value={sourceName}
                  onChange={e => setSourceName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Entity type</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={entityType}
                  onChange={e => setEntityType(e.target.value)}
                >
                  {Object.entries(ENTITY_TYPE_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description (optional)</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="e.g. Daily stock updates from warehouse"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setCreateOpen(false)}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
              >Cancel</button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Create Feed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Phase 14: Bidirectional Connectors — Write-back section ──────────────────

const WRITEBACK_CAPABLE = new Set([
  "google_sheets", "quickbooks_online", "xero",
  "outbound_webhook", "slack", "sage_pastel",
]);

const WRITEBACK_LABELS = {
  google_sheets:     { name: "Google Sheets",    desc: "Append a row on every record change" },
  quickbooks_online: { name: "QuickBooks Online", desc: "Create invoices and customers" },
  xero:              { name: "Xero",              desc: "Create invoices and contacts" },
  outbound_webhook:  { name: "Outbound Webhook",  desc: "POST JSON to any URL" },
  slack:             { name: "Slack",             desc: "Post a message to a channel" },
  sage_pastel:       { name: "Sage Pastel",       desc: "Push transactions and contacts" },
};

const CONFLICT_LABELS = {
  newsconseen_wins: "Newsconseen wins — always push our data",
  external_wins:    "External wins — log conflict, don't overwrite",
  flag_review:      "Flag for review — push + mark record for operator review",
};

const ENTITY_OPTIONS = [
  { id: "people",       label: "People" },
  { id: "enterprises",  label: "Enterprises" },
  { id: "products",     label: "Products" },
  { id: "transactions", label: "Transactions" },
  { id: "tasks",        label: "Tasks" },
];

function WritebackSection({ currentUser }) {
  const companyId = currentUser?.company_id;
  const { toast }  = useToast();

  const [configModalId, setConfigModalId] = useState(null); // connector_id being configured
  const [form, setForm] = useState({
    entity_types:    ["transactions"],
    conflict_policy: "newsconseen_wins",
    credentials:     {},
    enabled:         true,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data: wbData, isLoading, refetch } = useQuery({
    queryKey: ["writeback-configs", companyId],
    queryFn: async () => {
      if (!companyId) return { configs: [], capable: [] };
      const res = await fetch(`${RAILWAY_URL}/connectors/writeback/config?company_id=${companyId}`, { headers: API_HEADERS });
      if (!res.ok) return { configs: [], capable: [] };
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const { data: logData } = useQuery({
    queryKey: ["writeback-log", companyId],
    queryFn: async () => {
      if (!companyId) return { events: [] };
      const res = await fetch(`${RAILWAY_URL}/connectors/writeback/log?company_id=${companyId}&limit=20`, { headers: API_HEADERS });
      if (!res.ok) return { events: [] };
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchInterval: 60_000,
  });

  const configs     = wbData?.configs  || [];
  const pushLog     = logData?.events  || [];
  const configMap   = Object.fromEntries(configs.map(c => [c.connector_id, c]));
  const capable     = [...WRITEBACK_CAPABLE];

  const openConfig = (connectorId) => {
    const existing = configMap[connectorId];
    setForm(existing
      ? { entity_types: existing.entity_types, conflict_policy: existing.conflict_policy,
          credentials: {}, enabled: existing.enabled }
      : { entity_types: ["transactions"], conflict_policy: "newsconseen_wins", credentials: {}, enabled: true }
    );
    setConfigModalId(connectorId);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${RAILWAY_URL}/connectors/writeback/configure`, {
        method: "POST",
        headers: { ...API_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, connector_id: configModalId, ...form }),
      });
      if (!res.ok) throw new Error("Save failed");
      setConfigModalId(null);
      refetch();
      toast({ title: "Write-back configured" });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch(`${RAILWAY_URL}/connectors/writeback/test`, {
        method: "POST",
        headers: { ...API_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, connector_id: configModalId,
          entity_type: form.entity_types[0] || "transactions" }),
      });
      const data = await res.json();
      toast({ title: data.pushed ? "Test successful" : "Test failed",
              description: data.error || (data.dry_run ? "Dry run — no data was sent" : ""),
              variant: data.pushed ? "default" : "destructive" });
    } catch (e) {
      toast({ title: "Test error", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleDisable = async (connectorId) => {
    if (!window.confirm("Disable write-back for this connector?")) return;
    try {
      await fetch(`${RAILWAY_URL}/connectors/writeback/${connectorId}?company_id=${companyId}`, {
        method: "DELETE", headers: API_HEADERS,
      });
      refetch();
      toast({ title: "Write-back disabled" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const toggleEntityType = (id) => {
    setForm(f => ({
      ...f,
      entity_types: f.entity_types.includes(id)
        ? f.entity_types.filter(e => e !== id)
        : [...f.entity_types, id],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <ArrowUpRight className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Bidirectional Connectors</h2>
            <p className="text-sm text-slate-500">Push Newsconseen changes back to your connected systems</p>
          </div>
        </div>
      </div>

      {/* Capable connectors grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {capable.map(connId => {
          const meta       = WRITEBACK_LABELS[connId] || { name: connId, desc: "" };
          const configured = configMap[connId];
          const isActive   = configured?.enabled;

          return (
            <div key={connId} className={`bg-white border rounded-xl p-5 space-y-3 transition-all ${
              isActive ? "border-purple-200 shadow-sm" : "border-slate-200"
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{meta.name}</p>
                    {isActive && (
                      <span className="text-[9px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">ACTIVE</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{meta.desc}</p>
                </div>
                {isActive
                  ? <button onClick={() => handleDisable(connId)} className="text-slate-400 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  : null
                }
              </div>

              {configured && (
                <div className="text-xs text-slate-500 space-y-1">
                  <p>Entities: {configured.entity_types?.join(", ") || "—"}</p>
                  <p>Policy: {configured.conflict_policy?.replace(/_/g, " ")}</p>
                  {configured.last_pushed_at && (
                    <p>Last push: {new Date(configured.last_pushed_at).toLocaleString()}</p>
                  )}
                  {configured.push_count > 0 && (
                    <p className="flex items-center gap-1 text-purple-600 font-medium">
                      <Activity className="w-3 h-3" />{configured.push_count} pushes
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={() => openConfig(connId)}
                className={`w-full text-xs font-semibold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  isActive
                    ? "bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                {isActive ? "Edit Sync Back" : "Enable Sync Back ↗"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Push log */}
      {pushLog.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-500" /> Recent Pushes
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {["Connector", "Entity", "Status", "Time"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pushLog.map((ev, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-700 font-medium">{WRITEBACK_LABELS[ev.connector_id]?.name || ev.connector_id}</td>
                    <td className="px-3 py-2 text-slate-600 capitalize">{ev.entity_type}</td>
                    <td className="px-3 py-2">
                      {ev.pushed
                        ? <span className="text-emerald-600 font-medium">Pushed</span>
                        : ev.conflict
                          ? <span className="text-amber-600 font-medium">Conflict</span>
                          : <span className="text-rose-600 font-medium">Failed</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-slate-400">{ev.pushed_at ? new Date(ev.pushed_at).toLocaleTimeString() : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Config modal */}
      {configModalId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {WRITEBACK_LABELS[configModalId]?.name} — Sync Back
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{WRITEBACK_LABELS[configModalId]?.desc}</p>
              </div>
              <button onClick={() => setConfigModalId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            {/* Entity types */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">Which entity types to sync back</label>
              <div className="flex flex-wrap gap-2">
                {ENTITY_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => toggleEntityType(opt.id)}
                    className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                      form.entity_types.includes(opt.id)
                        ? "bg-purple-100 border-purple-300 text-purple-700"
                        : "bg-white border-slate-300 text-slate-600 hover:border-purple-300"
                    }`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            {/* Conflict policy */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">Conflict resolution</label>
              <div className="space-y-2">
                {Object.entries(CONFLICT_LABELS).map(([key, label]) => (
                  <label key={key} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio" name="conflict_policy" value={key}
                      checked={form.conflict_policy === key}
                      onChange={() => setForm(f => ({ ...f, conflict_policy: key }))}
                      className="mt-0.5"
                    />
                    <span className="text-xs text-slate-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Credentials */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">
                Credentials / Connection
                {configModalId === "outbound_webhook" && " — enter target URL"}
                {configModalId === "slack" && " — Slack incoming webhook URL"}
                {configModalId === "google_sheets" && " — Google API access token + spreadsheet ID"}
              </label>
              {(configModalId === "outbound_webhook" || configModalId === "slack") && (
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-400"
                  placeholder={configModalId === "slack" ? "https://hooks.slack.com/services/..." : "https://your-system.com/webhook"}
                  value={configModalId === "slack" ? (form.credentials.webhook_url || "") : (form.credentials.url || "")}
                  onChange={e => {
                    const key = configModalId === "slack" ? "webhook_url" : "url";
                    setForm(f => ({ ...f, credentials: { ...f.credentials, [key]: e.target.value } }));
                  }}
                />
              )}
              {configModalId === "google_sheets" && (
                <div className="space-y-2">
                  <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Spreadsheet ID"
                    value={form.credentials.spreadsheet_id || ""}
                    onChange={e => setForm(f => ({ ...f, credentials: { ...f.credentials, spreadsheet_id: e.target.value } }))} />
                  <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Access token"
                    value={form.credentials.access_token || ""}
                    onChange={e => setForm(f => ({ ...f, credentials: { ...f.credentials, access_token: e.target.value } }))} />
                </div>
              )}
              {(configModalId === "quickbooks_online" || configModalId === "xero") && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                  Uses credentials from your connected {WRITEBACK_LABELS[configModalId]?.name} connector.
                  Make sure the connector is connected before enabling sync back.
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={handleTest} disabled={testing}
                className="flex-1 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 flex items-center justify-center gap-1.5 disabled:opacity-50">
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                Test
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                Save & Enable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Connectors() {
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => ncClient.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [dbModalConnector, setDbModalConnector]             = useState(null);
  const [fileModalConnector, setFileModalConnector]         = useState(null);
  const [sheetsModalConnector, setSheetsModalConnector]     = useState(null);
  const [apiModalConnector, setApiModalConnector]           = useState(null);
  const [scheduleModalConnector, setScheduleModalConnector] = useState(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = currentUser?.company_id;

  const { data: enterprises = [] } = useQuery({
    queryKey: ["connector-enterprises", companyId],
    queryFn: () => ncClient.entities.Enterprise.filter({ company_id: companyId }),
    enabled: !!companyId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: catalogData = { connectors: STATIC_CATALOG }, isLoading: catalogLoading } = useQuery({
    queryKey: ["connector-catalog"],
    queryFn: async () => {
      try {
        const res = await fetch(`${RAILWAY_URL}/connectors/catalog`, { headers: API_HEADERS });
        if (!res.ok) return { connectors: STATIC_CATALOG };
        const data = await res.json();
        // Merge: API wins for connectors it returns; static covers any gaps
        const apiIds = new Set((data.connectors || []).map(c => c.id));
        const merged = [
          ...(data.connectors || []),
          ...STATIC_CATALOG.filter(c => !apiIds.has(c.id)),
        ];
        return { connectors: merged };
      } catch {
        return { connectors: STATIC_CATALOG };
      }
    },
    staleTime: 60_000,
    refetchOnMount: "always",
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
      try {
        // Try python_layer run log first (scheduled runs)
        const res = await fetch(
          `${RAILWAY_URL}/connectors/runs?company_id=${currentUser.company_id}&limit=100`,
          { headers: API_HEADERS }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.runs?.length > 0) return data.runs;
        }
      } catch {}
      // Fallback: Base44 ConnectorRun entity
      try {
        return await ncClient.entities.ConnectorRun.filter({ company_id: currentUser.company_id });
      } catch {
        return [];
      }
    },
    enabled: !!currentUser?.company_id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
  });

  const { data: failedRowsData = { failed_rows: [] }, refetch: refetchFailedRows } = useQuery({
    queryKey: ["ingestion-failed-rows", currentUser?.company_id],
    queryFn: async () => {
      if (!currentUser?.company_id) return { failed_rows: [] };
      try {
        const res = await fetch(
          `${RAILWAY_URL}/ingestion/failed-rows?company_id=${currentUser.company_id}&limit=100`,
          { headers: API_HEADERS }
        );
        return res.ok ? res.json() : { failed_rows: [] };
      } catch {
        return { failed_rows: [] };
      }
    },
    enabled: !!currentUser?.company_id,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const failedRows = failedRowsData.failed_rows || [];

  const { data: conflictsData = { conflicts: [] } } = useQuery({
    queryKey: ["connector-conflicts", currentUser?.company_id],
    queryFn: async () => {
      if (!currentUser?.company_id) return { conflicts: [] };
      try {
        const res = await fetch(
          `${RAILWAY_URL}/connectors/conflicts?company_id=${currentUser.company_id}&limit=50`,
          { headers: API_HEADERS }
        );
        return res.ok ? res.json() : { conflicts: [] };
      } catch {
        return { conflicts: [] };
      }
    },
    enabled: !!currentUser?.company_id,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const conflicts = conflictsData.conflicts || [];

  const retryFailedRowMutation = useMutation({
    mutationFn: async (rowId) => {
      const res = await fetch(`${RAILWAY_URL}/ingestion/failed-rows/${rowId}/retry`, {
        method: "POST",
        headers: API_HEADERS,
      });
      return res.json();
    },
    onSuccess: () => refetchFailedRows(),
  });

  const { data: schedulesData = { schedules: [] }, refetch: refetchSchedules } = useQuery({
    queryKey: ["connector-schedules", currentUser?.company_id],
    queryFn: async () => {
      if (!currentUser?.company_id) return { schedules: [] };
      try {
        const res = await fetch(
          `${RAILWAY_URL}/connectors/schedule?company_id=${currentUser.company_id}`,
          { headers: API_HEADERS }
        );
        if (res.ok) return res.json();
      } catch {}
      return { schedules: [] };
    },
    enabled: !!currentUser?.company_id,
    staleTime: 60_000,
    refetchOnMount: "always",
  });

  // Index schedules by connector_id for fast lookup
  const scheduleByConnector = Object.fromEntries(
    (schedulesData.schedules || []).map(s => [s.connector_id, s])
  );

  // Index last run time by connector_id
  const lastRunByConnector = runs.reduce((acc, run) => {
    const cid = run.connector_id;
    if (!acc[cid] || run.started_at > acc[cid].started_at) {
      acc[cid] = run;
    }
    return acc;
  }, {});

  const needsReviewRuns = runs.filter(r => r.status === "needs_review");

  const { data: masterData = [] } = useQuery({
    queryKey: ["master-data-options"],
    queryFn: () => ncClient.entities.MasterDataOption.list(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const saveMappingMutation = useMutation({
    mutationFn: async ({ companyId, connectorId, fieldName, sourceValue, taxonomyValue, parentValue }) => {
      const existing = await ncClient.entities.ConnectorMapping.filter({
        company_id: companyId, connector_id: connectorId,
        field_name: fieldName, source_value: sourceValue,
      });
      if (existing.length > 0) {
        return ncClient.entities.ConnectorMapping.update(existing[0].id, {
          taxonomy_value: taxonomyValue, is_confirmed: true, confirmed_by: currentUser.email,
        });
      }
      return ncClient.entities.ConnectorMapping.create({
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
    } else if (conn.id === "google_sheets") {
      setSheetsModalConnector(conn);
    } else if (conn.category === "file" && conn.status === "available") {
      setFileModalConnector(conn);
    } else if (conn.status === "available") {
      setApiModalConnector(conn);
    } else {
      toast({ title: conn.name, description: "This connector is coming soon." });
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
          enterprises={enterprises}
          onClose={() => setDbModalConnector(null)}
        />
      )}

      {/* File upload modal (excel, csv, json_xml) */}
      {fileModalConnector && (
        <FileConnectModal
          connector={fileModalConnector}
          companyId={currentUser.company_id}
          enterprises={enterprises}
          onClose={() => setFileModalConnector(null)}
        />
      )}

      {/* Google Sheets modal */}
      {sheetsModalConnector && (
        <GoogleSheetsModal
          connector={sheetsModalConnector}
          companyId={currentUser.company_id}
          enterprises={enterprises}
          onClose={() => setSheetsModalConnector(null)}
        />
      )}

      {/* API connector modal (Stripe, ADP, QuickBooks, OpenMRS, etc.) */}
      {apiModalConnector && (
        <ApiConnectModal
          connector={apiModalConnector}
          companyId={currentUser.company_id}
          enterprises={enterprises}
          onClose={() => setApiModalConnector(null)}
        />
      )}

      {/* Schedule modal */}
      {scheduleModalConnector && (
        <ScheduleModal
          connector={scheduleModalConnector}
          companyId={currentUser.company_id}
          enterprises={enterprises}
          existingSchedule={scheduleByConnector[scheduleModalConnector.id] || null}
          onClose={() => setScheduleModalConnector(null)}
          onSaved={() => { refetchSchedules(); setScheduleModalConnector(null); }}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-indigo-600" /> Source Registry Router
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Connectors manage recurring sources. Every source is profiled, scoped, mapped, reviewed, and loaded through the same ontology ingestion brain used by Add Data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
          <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">source setup</span>
          <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700">Idjwi mapping</span>
          <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">tenant scoped</span>
          <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700">review before load</span>
        </div>
      </div>

      {/* Section 1: Available Connectors */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Available Connectors</h2>
        <p className="text-sm text-slate-500 mb-6">
          Connect any external data source. All 35 connectors across 9 categories are live.
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
                    const isDb      = DB_CONNECTOR_IDS.has(conn.id) || conn.category === "database";
                    const available = conn.status === "available";
                    const isFileConn = conn.category === "file" && conn.id !== "google_sheets";
                    const isApiConn = available && !isDb && !isFileConn;
                    const lastRun   = lastRunByConnector[conn.id];
                    const schedule  = scheduleByConnector[conn.id];
                    const hasSchedule = schedule && schedule.frequency !== "manual";

                    // Format last-sync time
                    let lastSyncLabel = null;
                    if (lastRun?.started_at) {
                      const diff = Date.now() - new Date(lastRun.started_at).getTime();
                      const mins  = Math.floor(diff / 60000);
                      const hours = Math.floor(mins / 60);
                      const days  = Math.floor(hours / 24);
                      lastSyncLabel = days > 0 ? `${days}d ago`
                        : hours > 0 ? `${hours}h ago`
                        : mins > 0 ? `${mins}m ago`
                        : "just now";
                    }

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

                        {/* Status row */}
                        <div className="flex items-center gap-3 mb-3">
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
                          {lastSyncLabel && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 ml-auto">
                              <Clock className="w-3 h-3" />
                              {lastSyncLabel}
                            </span>
                          )}
                        </div>

                        {/* Schedule badge (only if a non-manual schedule is set) */}
                        {hasSchedule && (
                          <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 bg-violet-50 border border-violet-200 rounded-lg">
                            <CalendarClock className="w-3 h-3 text-violet-600 shrink-0" />
                            <span className="text-[10px] font-semibold text-violet-700 capitalize">
                              {schedule.frequency}
                            </span>
                            {schedule.has_credentials && (
                              <KeyRound className="w-3 h-3 text-emerald-500 shrink-0" title="Credentials stored" />
                            )}
                            {!schedule.has_credentials && (
                              <KeyRound className="w-3 h-3 text-amber-400 shrink-0" title="No credentials stored — add via schedule settings" />
                            )}
                            {schedule.next_run_at && (
                              <span className="text-[10px] text-violet-500 ml-auto">
                                next: {new Date(schedule.next_run_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => handleConnect(conn)}
                            disabled={!available}
                            className={`flex-1 text-xs rounded-xl ${
                              available ? "bg-indigo-600 hover:bg-indigo-700" : ""
                            }`}
                            variant={available ? "default" : "outline"}
                          >
                            {isDb && available ? (
                              <><Database className="w-3.5 h-3.5 mr-1.5" /> Connect</>
                            ) : conn.id === "google_sheets" && available ? (
                              <><Cloud className="w-3.5 h-3.5 mr-1.5" /> Connect</>
                            ) : isFileConn && available ? (
                              <><HardDrive className="w-3.5 h-3.5 mr-1.5" /> Import</>
                            ) : available ? (
                              <><Plug className="w-3.5 h-3.5 mr-1.5" /> Connect</>
                            ) : "Coming Soon"}
                          </Button>

                          {/* Schedule button — API connectors only */}
                          {isApiConn && (
                            <button
                              onClick={() => setScheduleModalConnector(conn)}
                              title={hasSchedule ? `Scheduled: ${schedule.frequency}` : "Set sync schedule"}
                              className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                                hasSchedule
                                  ? "border-violet-300 bg-violet-50 text-violet-600 hover:bg-violet-100"
                                  : "border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600"
                              }`}
                            >
                              <Calendar className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Scheduled Syncs */}
      {schedulesData.schedules.filter(s => s.frequency !== "manual").length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Scheduled Syncs</h2>
          <p className="text-sm text-slate-500 mb-6">
            Active automatic syncs — run via <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">POST /connectors/run-scheduled</code> cron.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {schedulesData.schedules
              .filter(s => s.frequency !== "manual")
              .map(sched => {
                const lastRun = lastRunByConnector[sched.connector_id];
                return (
                  <div key={sched.connector_id}
                    className="bg-white border border-violet-200 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {sched.connector_name || sched.connector_id}
                        </p>
                        <p className="text-xs text-slate-400 capitalize">{sched.entity_type}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-violet-100 text-violet-700 capitalize">
                        {sched.frequency}
                      </span>
                    </div>

                    <div className="text-xs space-y-1">
                      {sched.next_run_at && (
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <CalendarClock className="w-3 h-3" />
                          Next: {new Date(sched.next_run_at).toLocaleString()}
                        </div>
                      )}
                      {lastRun?.started_at && (
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Clock className="w-3 h-3" />
                          Last: {new Date(lastRun.started_at).toLocaleString()}
                          {" "}
                          <span className={`font-medium ${
                            lastRun.status === "completed" ? "text-emerald-600"
                              : lastRun.status === "failed" ? "text-rose-600"
                              : "text-slate-500"
                          }`}>({lastRun.status})</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        const conn = catalogData.connectors.find(c => c.id === sched.connector_id);
                        if (conn) setScheduleModalConnector(conn);
                      }}
                      className="text-xs text-violet-600 hover:text-violet-800 self-start font-medium"
                    >
                      Edit schedule
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Section 3: Run History */}
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
                          {run.status === "failed" && run.error && (
                            <span
                              className="text-rose-600 cursor-help"
                              title={run.error}
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                            </span>
                          )}
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

      {/* Section 4: Failed Rows quarantine */}
      {failedRows.length > 0 && (
        <div className="mt-10">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Failed Rows</h2>
          <p className="text-sm text-slate-500 mb-6">
            Rows that failed to write during an import or connector sync. Fix the underlying issue, then retry.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {["Source", "Entity", "Error", "Failed At", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-slate-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {failedRows.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800 font-medium">{row.source}</td>
                    <td className="px-4 py-3">{row.entity_type}</td>
                    <td className="px-4 py-3 text-rose-700 max-w-md truncate" title={row.error_message}>{row.error_message}</td>
                    <td className="px-4 py-3">{new Date(row.failed_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retryFailedRowMutation.isPending}
                        onClick={() => retryFailedRowMutation.mutate(row.id)}
                      >
                        {retryFailedRowMutation.isPending && retryFailedRowMutation.variables === row.id
                          ? "Retrying…" : "Retry"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 4b: Inbound conflicts (connector sync vs. manual edit) */}
      {conflicts.length > 0 && (
        <div className="mt-10">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Sync Conflicts</h2>
          <p className="text-sm text-slate-500 mb-6">
            Records touched by an operator since the last sync. Policy applied is shown per event —
            change a connector's schedule to adjust the policy.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {["Connector", "Entity", "External ID", "Policy Applied", "Detected At"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-slate-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conflicts.map(c => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800 font-medium">{c.connector_id}</td>
                    <td className="px-4 py-3">{c.entity_type}</td>
                    <td className="px-4 py-3 font-mono">{c.external_id}</td>
                    <td className="px-4 py-3">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        c.policy_applied === "manual_wins" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {c.policy_applied}
                      </span>
                    </td>
                    <td className="px-4 py-3">{new Date(c.detected_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 4: Unmapped Values Review */}
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

      {/* Section 5: Live Data Feeds */}
      <div>
        <WebhookSection currentUser={currentUser} />
      </div>

      {/* Section 6: Bidirectional Connectors — Sync Back */}
      <div>
        <WritebackSection currentUser={currentUser} />
      </div>
    </div>
  );
}
