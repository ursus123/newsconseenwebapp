/**
 * supabaseEntityClient.js
 *
 * Drop-in replacement for ncClient.entities.* usage inside dataService.js.
 * Every entity wrapper exposes the same four methods Base44 does:
 *   .create(data)              → supabase insert
 *   .filter(filters, sort)     → supabase select + eq filters
 *   .list(sort)                → supabase select all
 *   .update(id, data)          → supabase update by id
 *   .delete(id)                → supabase delete by id
 *
 * Sort strings follow the Base44 convention: "-created_date" means DESC.
 * "created_date" is mapped to the Supabase column "created_at" for backward compat.
 * Every returned row gets a synthetic "created_date" and "updated_date" field so
 * callers that read those fields still work without change.
 *
 * Auth shim:
 *   supabaseAuth.me()  →  mirrors ncClient.auth.me()
 *   supabaseAuth.logout() → signs out of Supabase session
 *
 * Env vars required in .env.local:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Guard: if env vars are absent (e.g. VITE_DATA_LAYER=ncClient), create a no-op
// client so the import itself never crashes the Base44 build path.
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient("https://placeholder.supabase.co", "placeholder-key");

// ── Column name map — Base44 field names → Supabase column names ──────────────
// Applied on filter keys and sort strings. Does NOT rename payload fields on
// insert/update — use FIELD_ALIASES per entity for that.
const COL_MAP = {
  created_date:   "created_at",
  updated_date:   "updated_at",
  scheduled_date: "due_date",   // Task pages use scheduled_date; schema has due_date
};

// ── Per-entity field aliases applied on create/update payloads ────────────────
// Key: Supabase table name. Value: { frontendField: supabaseColumn }
const FIELD_ALIASES = {
  products: {
    name:           "product_name",  // many callers use .name; schema requires product_name
    item_name:      "product_name",  // item_name is also used as an alias in some pages
    internal_notes: "description",   // products has description, not notes/internal_notes
  },
  tasks: {
    scheduled_date: "due_date",      // Tasks form uses scheduled_date in some flows
    internal_notes: "notes",
  },
  persons: {
    internal_notes: "notes",
  },
  enterprises: {
    internal_notes: "notes",
  },
  transactions: {
    internal_notes:  "notes",
    primary_person:  "person_name",
  },
  relationships: {
    internal_notes: "notes",
  },
  addresses: {
    internal_notes: "notes",
    state_region:   "region",
  },
  services: {
    internal_notes: "notes",
  },
};

// ── Column whitelists — strips unknown columns before insert/update ────────────
// PostgREST rejects unknown columns with PGRST204. Whitelists derived from 001_supabase_schema.sql.
// Tables without an entry are not filtered (pass-through).
const TABLE_COLUMNS = {
  persons: new Set([
    "first_name","last_name","preferred_name","person_type","person_subtype",
    "primary_role","engagement_model","status","availability_status",
    "start_date","end_date","phone","email","address","city","region","country",
    "latitude","longitude","notes","photo_url","company_id","created_by",
  ]),
  enterprises: new Set([
    "enterprise_name","enterprise_type","enterprise_subtype","sic_sector_id","sic_sector_name",
    "enterprise_tier","parent_enterprise_id","status","operating_status",
    "phone","email","website","address","city","region","country","latitude","longitude",
    "brand_name","brand_logo_url","brand_primary_color","brand_secondary_color",
    "brand_accent_color","brand_tagline","brand_hide_newsconseen","brand_favicon_url",
    "brand_support_email","notes","company_id","created_by",
  ]),
  products: new Set([
    "product_name","item_name","item_type","item_subtype","item_class",
    "item_brand","item_variant","unit_of_measure","stock_quantity","reorder_level",
    "expiry_date","price","cost","sku","barcode","description","image_url",
    "enterprise_id","company_id","created_by",
  ]),
  tasks: new Set([
    "title","description","task_type","status","priority","due_date","scheduled_time",
    "completed_at","assigned_to_email","assigned_to_name","enterprise_id","enterprise",
    "related_person","related_person_id","outcome","outcome_notes","notes",
    "company_id","created_by",
  ]),
  transactions: new Set([
    "reference_number","description","transaction_type","status","payment_status",
    "amount","amount_paid","net_amount","currency","date","due_date",
    "enterprise_id","enterprise","person_id","person_name","product_id","product_name",
    "line_items","notes","company_id","created_by",
  ]),
  relationships: new Set([
    "relationship_type","person_id","person_name","person","secondary_person_id","secondary_person",
    "enterprise_id","enterprise_name","enterprise","secondary_enterprise_id","secondary_enterprise",
    "item_id","item_name","service_id","service_name","role","status","start_date","end_date",
    "notes","company_id","created_by",
  ]),
  addresses: new Set([
    "address_line1","address_line2","city","region","country","postal_code",
    "latitude","longitude","address_type","entity_ref_type","entity_ref_id",
    "is_primary","notes","company_id","created_by",
  ]),
  services: new Set([
    "name","service_name","description","service_type","service_subtype","price",
    "unit_of_measure","duration_minutes","is_active","enterprise_id","company_id","created_by",
  ]),
};

function filterToSchema(table, data) {
  const allowed = TABLE_COLUMNS[table];
  if (!allowed || !data) return data;
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

function applyFieldAliases(table, data) {
  const aliases = FIELD_ALIASES[table];
  if (!aliases || !data) return data;
  const out = { ...data };
  for (const [from, to] of Object.entries(aliases)) {
    if (from in out && !(to in out)) {
      out[to] = out[from];
      delete out[from];
    }
  }
  return out;
}

function mapCol(col) {
  return COL_MAP[col] || col;
}

// ── Parse "-created_date" → { column: "created_at", ascending: false } ────────
function parseSort(sort) {
  if (!sort) return { column: "created_at", ascending: false };
  const descending = sort.startsWith("-");
  const raw = descending ? sort.slice(1) : sort;
  return { column: mapCol(raw), ascending: !descending };
}

// ── Add backward-compat aliases so callers using created_date still work ───────
function addAliases(row) {
  if (!row) return row;
  return {
    ...row,
    created_date: row.created_at ?? row.created_date,
    updated_date: row.updated_at ?? row.updated_date,
  };
}

// ── Core entity wrapper factory ───────────────────────────────────────────────
function entityWrapper(table) {
  return {
    /**
     * create(data) — inserts one row, returns the created record.
     * Strips any incoming "id" field so Supabase generates the UUID.
     */
    async create(data) {
      const payload = filterToSchema(table, applyFieldAliases(table, { ...data }));
      delete payload.id;

      const { data: row, error } = await supabase
        .from(table)
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error(`[supabase] create ${table}:`, error.message);
        throw new Error(error.message);
      }

      return addAliases(row);
    },

    /**
     * get(id) — fetch a single row by primary key.
     */
    async get(id) {
      const { data: row, error } = await supabase
        .from(table)
        .select()
        .eq("id", id)
        .single();

      if (error) {
        console.error(`[supabase] get ${table} id=${id}:`, error.message);
        throw new Error(error.message);
      }

      return addAliases(row);
    },

    /**
     * filter(filters, sort, limit?) — selects rows matching all key=value pairs.
     * filters: plain object { company_id: "x", person_type: "staff" }
     * sort:    Base44-style string e.g. "-created_date"
     * limit:   optional integer cap on result count
     */
    async filter(filters = {}, sort = "-created_at", limit) {
      const { column, ascending } = parseSort(sort);

      let query = supabase.from(table).select();

      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== "") {
          query = query.eq(mapCol(key), value);
        }
      }

      query = query.order(column, { ascending });
      if (limit) query = query.limit(limit);

      const { data: rows, error } = await query;

      if (error) {
        console.error(`[supabase] filter ${table}:`, error.message);
        throw new Error(error.message);
      }

      return (rows || []).map(addAliases);
    },

    /**
     * list(sort, limit?) — returns all rows the current user can see (RLS-scoped).
     */
    async list(sort = "-created_at", limit) {
      const { column, ascending } = parseSort(sort);

      let query = supabase.from(table).select().order(column, { ascending });
      if (limit) query = query.limit(limit);

      const { data: rows, error } = await query;

      if (error) {
        console.error(`[supabase] list ${table}:`, error.message);
        throw new Error(error.message);
      }

      return (rows || []).map(addAliases);
    },

    /**
     * bulkCreate(rows) — insert multiple rows in one call, returns created records.
     */
    async bulkCreate(rows) {
      if (!rows?.length) return [];
      const payload = rows.map(r => { const c = filterToSchema(table, applyFieldAliases(table, { ...r })); delete c.id; return c; });

      const { data, error } = await supabase
        .from(table)
        .insert(payload)
        .select();

      if (error) {
        console.error(`[supabase] bulkCreate ${table}:`, error.message);
        throw new Error(error.message);
      }

      return (data || []).map(addAliases);
    },

    /**
     * update(id, data) — patches a row by primary key, returns updated record.
     */
    async update(id, data) {
      const { data: row, error } = await supabase
        .from(table)
        .update({ ...filterToSchema(table, applyFieldAliases(table, data)), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error(`[supabase] update ${table} id=${id}:`, error.message);
        throw new Error(error.message);
      }

      return addAliases(row);
    },

    /**
     * delete(id) — deletes a row by primary key.
     */
    async delete(id) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", id);

      if (error) {
        console.error(`[supabase] delete ${table} id=${id}:`, error.message);
        throw new Error(error.message);
      }

      return { id };
    },

    /**
     * subscribe(callback) — listen for INSERT/UPDATE/DELETE on this table.
     * Mirrors the Base44 entity.subscribe() API.
     * Returns an unsubscribe function.
     */
    subscribe(callback) {
      const channel = supabase
        .channel(`${table}_realtime`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          callback,
        )
        .subscribe();

      return () => supabase.removeChannel(channel);
    },
  };
}

// ── Entity registry — mirrors every entity in Base44 ─────────────────────────
// Key: the name used on ncClient.entities.* (PascalCase)
// Value: the Supabase table name (snake_case, plural)

export const supabaseEntities = {
  // Core 7
  Person:           entityWrapper("persons"),
  Enterprise:       entityWrapper("enterprises"),
  Product:          entityWrapper("products"),
  Task:             entityWrapper("tasks"),
  Transaction:      entityWrapper("transactions"),
  Relationship:     entityWrapper("relationships"),
  Address:          entityWrapper("addresses"),

  // Taxonomy
  MasterDataOption: entityWrapper("master_data_options"),

  // Service entity
  Service:          entityWrapper("services"),

  // Phase 9 — operational extensions
  Document:         entityWrapper("documents"),
  Schedule:         entityWrapper("schedules"),
  Signal:           entityWrapper("signals"),
  Channel:          entityWrapper("channels"),
  Territory:        entityWrapper("territories"),

  // Phase 10 — domain-native
  Animal:           entityWrapper("animals"),
  Plot:             entityWrapper("plots"),
  Observation:      entityWrapper("observations"),

  // Intelligence layer
  Insight:          entityWrapper("insights"),
  Recommendation:   entityWrapper("recommendations"),
  Decision:         entityWrapper("decisions"),
  Risk:             entityWrapper("risks"),
  Opportunity:      entityWrapper("opportunities"),
  MetricDefinition: entityWrapper("metric_definitions"),
};

// ── Auth shim — mirrors ncClient.auth.me() ─────────────────────────────────────
export const supabaseAuth = {
  /**
   * me() — returns a user object with the same shape that ncClient.auth.me() returns.
   * company_id and role are read from app_metadata (set server-side on provisioning).
   */
  async me() {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) throw new Error("Not authenticated");

    return {
      id:         user.id,
      email:      user.email,
      full_name:  user.user_metadata?.full_name || user.email,
      company_id: user.app_metadata?.company_id || user.user_metadata?.company_id || null,
      role:       user.app_metadata?.role       || user.user_metadata?.role       || "user",
    };
  },

  async logout() {
    await supabase.auth.signOut();
  },

  /**
   * onAuthStateChange — mirrors ncClient session listener pattern.
   * Returns an unsubscribe function.
   */
  onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN"  && session?.user) callback("authenticated", session.user);
        if (event === "SIGNED_OUT")                  callback("unauthenticated", null);
      }
    );
    return () => subscription.unsubscribe();
  },
};
