import { base44 } from "@/api/base44Client";
import { UploadedDataStore } from "./UploadedDataStore";

export const MASTER_TABLES = {
  enterprises:        { entity: "Enterprise",        label: "Enterprises" },
  people:             { entity: "Person",             label: "People" },
  products:           { entity: "Product",            label: "Products" },
  services:           { entity: "Service",            label: "Services" },
  addresses:          { entity: "Address",            label: "Addresses" },
  relationships:      { entity: "Relationship",       label: "Relationships" },
  tasks:              { entity: "Task",               label: "Tasks" },
  transactions:       { entity: "Transaction",        label: "Transactions" },
  medication_profiles:{ entity: "MedicationProfile",  label: "Medication Profiles" },
  reports:            { entity: "Report",             label: "Reports" },
  clients:            { entity: "Client",             label: "Clients" },
};

export const PROTECTED_TABLES = new Set(["enterprises", "people", "products", "services", "addresses"]);

export const MASTER_SCHEMA = {
  enterprises: [
    { col: "id", type: "VARCHAR" }, { col: "enterprise_name", type: "VARCHAR" },
    { col: "short_name", type: "VARCHAR" }, { col: "status", type: "ENUM" },
    { col: "enterprise_type", type: "ENUM" }, { col: "city", type: "VARCHAR" },
    { col: "country", type: "VARCHAR" }, { col: "phone", type: "VARCHAR" },
    { col: "email", type: "VARCHAR" }, { col: "created_date", type: "DATETIME" },
  ],
  people: [
    { col: "id", type: "VARCHAR" }, { col: "first_name", type: "VARCHAR" },
    { col: "last_name", type: "VARCHAR" }, { col: "person_type", type: "ENUM" },
    { col: "status", type: "ENUM" }, { col: "primary_role", type: "VARCHAR" },
    { col: "email", type: "VARCHAR" }, { col: "phone", type: "VARCHAR" },
    { col: "start_date", type: "DATE" }, { col: "created_date", type: "DATETIME" },
  ],
  products: [
    { col: "id", type: "VARCHAR" }, { col: "name", type: "VARCHAR" },
    { col: "sku", type: "VARCHAR" }, { col: "status", type: "ENUM" },
    { col: "item_type", type: "ENUM" }, { col: "stock_quantity", type: "INT" },
    { col: "unit_price", type: "FLOAT" }, { col: "cost_price", type: "FLOAT" },
    { col: "category", type: "ENUM" }, { col: "created_date", type: "DATETIME" },
  ],
  services: [
    { col: "id", type: "VARCHAR" }, { col: "name", type: "VARCHAR" },
    { col: "status", type: "ENUM" }, { col: "category", type: "ENUM" },
    { col: "price", type: "FLOAT" }, { col: "pricing_model", type: "ENUM" },
    { col: "created_date", type: "DATETIME" },
  ],
  addresses: [
    { col: "id", type: "VARCHAR" }, { col: "label", type: "VARCHAR" },
    { col: "address_line1", type: "VARCHAR" }, { col: "city", type: "VARCHAR" },
    { col: "country", type: "VARCHAR" }, { col: "status", type: "ENUM" },
    { col: "created_date", type: "DATETIME" },
  ],
  relationships: [
    { col: "id", type: "VARCHAR" }, { col: "relationship_type", type: "ENUM" },
    { col: "person_name", type: "VARCHAR" }, { col: "enterprise_name", type: "VARCHAR" },
    { col: "status", type: "ENUM" }, { col: "start_date", type: "DATE" },
    { col: "created_date", type: "DATETIME" },
  ],
  tasks: [
    { col: "id", type: "VARCHAR" }, { col: "title", type: "VARCHAR" },
    { col: "task_type", type: "ENUM" }, { col: "status", type: "ENUM" },
    { col: "priority", type: "ENUM" }, { col: "assigned_to_email", type: "VARCHAR" },
    { col: "scheduled_date", type: "DATE" }, { col: "due_date", type: "DATE" },
    { col: "created_date", type: "DATETIME" },
  ],
  transactions: [
    { col: "id", type: "VARCHAR" }, { col: "transaction_type", type: "ENUM" },
    { col: "status", type: "ENUM" }, { col: "date", type: "DATE" },
    { col: "amount", type: "FLOAT" }, { col: "payment_status", type: "ENUM" },
    { col: "primary_person", type: "VARCHAR" }, { col: "enterprise", type: "VARCHAR" },
    { col: "created_date", type: "DATETIME" },
  ],
  medication_profiles: [
    { col: "id", type: "VARCHAR" }, { col: "client_name", type: "VARCHAR" },
    { col: "medication_name", type: "VARCHAR" }, { col: "strength", type: "VARCHAR" },
    { col: "route", type: "ENUM" }, { col: "frequency", type: "VARCHAR" },
    { col: "status", type: "ENUM" }, { col: "prescriber", type: "VARCHAR" },
    { col: "start_date", type: "DATE" }, { col: "created_date", type: "DATETIME" },
  ],
  reports: [
    { col: "id", type: "VARCHAR" }, { col: "title", type: "VARCHAR" },
    { col: "type", type: "ENUM" }, { col: "status", type: "ENUM" },
    { col: "date_range_start", type: "DATE" }, { col: "date_range_end", type: "DATE" },
    { col: "created_date", type: "DATETIME" },
  ],
  clients: [
    { col: "id", type: "VARCHAR" }, { col: "business_name", type: "VARCHAR" },
    { col: "contact_person", type: "VARCHAR" }, { col: "email", type: "VARCHAR" },
    { col: "industry", type: "ENUM" }, { col: "status", type: "ENUM" },
    { col: "monthly_revenue", type: "FLOAT" }, { col: "created_date", type: "DATETIME" },
  ],
};

function applyWhere(rows, sql) {
  const whereMatch = sql.match(/WHERE\s+(.+)$/i);
  if (!whereMatch) return rows;
  const conditions = whereMatch[1].split(/\s+AND\s+/i);
  return rows.filter((row) =>
    conditions.every((cond) => {
      const m = cond.trim().match(/^(\w+)\s*(=|!=|<>|<=|>=|<|>|LIKE)\s*'?([^']*)'?$/i);
      if (!m) return true;
      const [, field, op, val] = m;
      const rowVal = row[field];
      const numVal = parseFloat(val), rowNum = parseFloat(rowVal);
      switch (op.toUpperCase()) {
        case "=":    return String(rowVal ?? "").toLowerCase() === val.toLowerCase();
        case "!=": case "<>": return String(rowVal ?? "").toLowerCase() !== val.toLowerCase();
        case "<":   return !isNaN(rowNum) && rowNum < numVal;
        case ">":   return !isNaN(rowNum) && rowNum > numVal;
        case "<=":  return !isNaN(rowNum) && rowNum <= numVal;
        case ">=":  return !isNaN(rowNum) && rowNum >= numVal;
        case "LIKE": return String(rowVal ?? "").toLowerCase().includes(val.replace(/%/g, "").toLowerCase());
        default:    return true;
      }
    })
  );
}

export async function executeSQL(sql, uploadedTables) {
  const s = sql.trim().replace(/\s+/g, " ");
  const upper = s.toUpperCase();

  if (upper.startsWith("SELECT")) {
    // Extract table name (support optional alias: FROM table t)
    const fromMatch = s.match(/FROM\s+(\w+)/i);
    if (!fromMatch) throw new Error("Missing FROM clause.");
    const tableName = fromMatch[1].toLowerCase();

    // Extract ORDER BY before stripping for WHERE
    const orderMatch = s.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT\s+\d+)?$/i);
    const orderBy = orderMatch ? orderMatch[1].trim() : null;

    // Extract LIMIT
    const limitMatch = s.match(/LIMIT\s+(\d+)/i);
    const limitN = limitMatch ? parseInt(limitMatch[1], 10) : null;

    let rows;
    if (Object.prototype.hasOwnProperty.call(uploadedTables, tableName)) {
      rows = uploadedTables[tableName].rows.map((r) => ({ ...r }));
    } else if (MASTER_TABLES[tableName]) {
      rows = await base44.entities[MASTER_TABLES[tableName].entity].list("-created_date", 2000);
    } else {
      throw new Error(`Unknown table "${tableName}".`);
    }

    // Parse SELECT columns with AS alias support
    // Strip ORDER BY / LIMIT from the SQL before matching cols
    const sqlForCols = s.replace(/\s+ORDER\s+BY\s+.+$/i, "").replace(/\s+LIMIT\s+\d+/i, "");
    const colsMatch = sqlForCols.match(/SELECT\s+(.+?)\s+FROM/i);
    const colStr = colsMatch ? colsMatch[1].trim() : "*";

    if (colStr !== "*") {
      // Parse each col segment: could be "field AS alias", "field alias", or just "field"
      const colDefs = colStr.split(",").map((c) => {
        const asMatch = c.trim().match(/^(\S+)\s+AS\s+(\S+)$/i);
        if (asMatch) return { field: asMatch[1].trim(), alias: asMatch[2].trim() };
        // handle unquoted alias (field alias)
        const spaceMatch = c.trim().match(/^(\S+)\s+(\S+)$/);
        if (spaceMatch) return { field: spaceMatch[1].trim(), alias: spaceMatch[2].trim() };
        return { field: c.trim(), alias: c.trim() };
      });
      rows = rows.map((r) => {
        const o = {};
        colDefs.forEach(({ field, alias }) => {
          // Support COUNT(*), COUNT(field) aggregates on single-row level (applied after)
          if (/^COUNT\s*\(/i.test(field)) { o[alias] = 1; return; }
          o[alias] = r[field] !== undefined ? r[field] : r[field.toLowerCase()] ?? null;
        });
        return o;
      });

      // Apply WHERE on raw rows BEFORE projection (so original field names work)
      rows = applyWhere(rows, s);

      // Handle simple aggregates: COUNT(*), SUM(field), AVG(field), MAX(field), MIN(field)
      const hasAggregate = colDefs.some(({ field }) => /^(COUNT|SUM|AVG|MAX|MIN)\s*\(/i.test(field));
      if (hasAggregate) {
        const aggRow = {};
        colDefs.forEach(({ field, alias }) => {
          const aggMatch = field.match(/^(COUNT|SUM|AVG|MAX|MIN)\s*\(\s*\*?\s*(\w+)?\s*\)/i);
          if (!aggMatch) { aggRow[alias] = null; return; }
          const [, fn, col] = aggMatch;
          switch (fn.toUpperCase()) {
            case "COUNT": aggRow[alias] = rows.length; break;
            case "SUM":   aggRow[alias] = rows.reduce((s, r) => s + (parseFloat(r[col]) || 0), 0); break;
            case "AVG":   aggRow[alias] = rows.length ? rows.reduce((s, r) => s + (parseFloat(r[col]) || 0), 0) / rows.length : 0; break;
            case "MAX":   aggRow[alias] = Math.max(...rows.map((r) => parseFloat(r[col]) || 0)); break;
            case "MIN":   aggRow[alias] = Math.min(...rows.map((r) => parseFloat(r[col]) || 0)); break;
          }
        });
        return { type: "select", rows: [aggRow], message: `1 row(s) returned.` };
      }

      // Project columns (after WHERE so raw field names resolve correctly)
      rows = rows.map((r) => {
        const o = {};
        colDefs.forEach(({ field, alias }) => { o[alias] = r[field] !== undefined ? r[field] : r[field.toLowerCase()] ?? null; });
        return o;
      });
    } else {
      rows = applyWhere(rows, s);
    }

    // ORDER BY
    if (orderBy) {
      const [obCol, obDir] = orderBy.split(/\s+/);
      const desc = obDir && obDir.toUpperCase() === "DESC";
      rows.sort((a, b) => {
        const av = a[obCol], bv = b[obCol];
        if (av == null) return 1; if (bv == null) return -1;
        const n = parseFloat(av), m = parseFloat(bv);
        const cmp = !isNaN(n) && !isNaN(m) ? n - m : String(av).localeCompare(String(bv));
        return desc ? -cmp : cmp;
      });
    }

    if (limitN !== null) rows = rows.slice(0, limitN);

    return { type: "select", rows, message: `${rows.length} row(s) returned.` };
  }

  if (upper.startsWith("INSERT") && upper.includes("SELECT")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s+SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
    if (!m) throw new Error("Invalid INSERT...SELECT syntax.");
    const [, destTable, colStr, srcTable, whereClause] = m;
    const dest = destTable.toLowerCase(), src = srcTable.toLowerCase();
    if (!MASTER_TABLES[dest]) throw new Error("INSERT destination must be a master table.");
    if (!uploadedTables[src]) throw new Error(`Source table "${src}" not found.`);
    const cols = colStr.trim() === "*" ? uploadedTables[src].columns : colStr.split(",").map((c) => c.trim());
    let srcRows = [...uploadedTables[src].rows];
    if (whereClause) srcRows = applyWhere(srcRows, `SELECT * FROM x WHERE ${whereClause}`);
    const entity = base44.entities[MASTER_TABLES[dest].entity];
    let inserted = 0;
    for (const row of srcRows) {
      const payload = {};
      cols.forEach((c) => { if (row[c] !== undefined) payload[c] = row[c]; });
      await entity.create(payload);
      inserted++;
    }
    return { type: "mutation", rows: [], message: `✓ Inserted ${inserted} row(s) into ${dest}.` };
  }

  if (upper.startsWith("INSERT")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!m) throw new Error("Invalid INSERT syntax.");
    const [, tableName, colsStr, valsStr] = m;
    const dest = tableName.toLowerCase();
    const cols = colsStr.split(",").map((c) => c.trim());
    const vals = valsStr.split(",").map((v) => v.trim().replace(/^['"]|['"]$/g, ""));
    const payload = {}; cols.forEach((c, i) => { payload[c] = vals[i] ?? ""; });
    if (MASTER_TABLES[dest]) {
      const created = await base44.entities[MASTER_TABLES[dest].entity].create(payload);
      return { type: "mutation", rows: [created], message: `✓ Inserted 1 row into ${dest}.` };
    } else {
      UploadedDataStore.addRow(dest, payload);
      return { type: "mutation", rows: [], message: `✓ Inserted 1 row into "${dest}".` };
    }
  }

  if (upper.startsWith("UPDATE")) {
    const m = s.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
    if (!m) throw new Error("Invalid UPDATE syntax.");
    const [, tableName, setStr, whereStr] = m;
    const tbl = tableName.toLowerCase();
    const updates = {};
    setStr.split(",").forEach((part) => {
      const eq = part.match(/^\s*(\w+)\s*=\s*'?([^']*)'?\s*$/);
      if (eq) updates[eq[1].trim()] = eq[2].trim();
    });
    if (MASTER_TABLES[tbl]) {
      const entity = base44.entities[MASTER_TABLES[tbl].entity];
      const allRows = await entity.list("-created_date", 2000);
      const matched = applyWhere(allRows, `SELECT * FROM x WHERE ${whereStr}`);
      if (!matched.length) return { type: "mutation", rows: [], message: "No rows matched." };
      for (const row of matched) await entity.update(row.id, updates);
      return { type: "mutation", rows: [], message: `✓ Updated ${matched.length} row(s) in ${tbl}.` };
    } else if (uploadedTables[tbl]) {
      const rows = uploadedTables[tbl].rows;
      const matched = applyWhere(rows.map((r, i) => ({ ...r, _idx: i })), `SELECT * FROM x WHERE ${whereStr}`);
      matched.forEach((r) => UploadedDataStore.updateRow(tbl, r._idx, updates));
      return { type: "mutation", rows: [], message: `✓ Updated ${matched.length} row(s) in "${tbl}".` };
    }
    throw new Error(`Unknown table "${tbl}".`);
  }

  if (upper.startsWith("DELETE")) {
    const m = s.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
    if (!m) throw new Error("Invalid DELETE syntax.");
    const [, tableName, whereStr] = m;
    const tbl = tableName.toLowerCase();
    if (PROTECTED_TABLES.has(tbl)) throw new Error(`❌ DELETE blocked on protected table "${tbl}".`);
    if (MASTER_TABLES[tbl]) {
      const entity = base44.entities[MASTER_TABLES[tbl].entity];
      const allRows = await entity.list("-created_date", 2000);
      const matched = whereStr ? applyWhere(allRows, `SELECT * FROM x WHERE ${whereStr}`) : allRows;
      for (const row of matched) await entity.delete(row.id);
      return { type: "mutation", rows: [], message: `✓ Deleted ${matched.length} row(s) from ${tbl}.` };
    } else if (uploadedTables[tbl]) {
      if (whereStr) {
        const rows = uploadedTables[tbl].rows;
        const matched = applyWhere(rows.map((r, i) => ({ ...r, _idx: i })), `SELECT * FROM x WHERE ${whereStr}`);
        matched.reverse().forEach((r) => UploadedDataStore.deleteRow(tbl, r._idx));
        return { type: "mutation", rows: [], message: `✓ Deleted ${matched.length} row(s) from "${tbl}".` };
      } else {
        const count = uploadedTables[tbl].rows.length;
        UploadedDataStore.set(tbl, { ...uploadedTables[tbl], rows: [] });
        return { type: "mutation", rows: [], message: `✓ Deleted all ${count} row(s) from "${tbl}".` };
      }
    }
    throw new Error(`Unknown table "${tbl}".`);
  }

  throw new Error("Unsupported SQL. Supported: SELECT, INSERT, UPDATE, DELETE.");
}

// ── Mutation detector ─────────────────────────────────────────────────────
// Returns null for SELECT, or { type, tableName, cols } for write ops
export function detectMutation(sql) {
  const s = sql.trim().replace(/\s+/g, " ");
  const upper = s.toUpperCase();
  if (upper.startsWith("INSERT") && upper.includes("SELECT")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s+SELECT/i);
    return m ? { type: "INSERT_SELECT", tableName: m[1].toLowerCase(), cols: [] } : null;
  }
  if (upper.startsWith("INSERT")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
    return m ? { type: "INSERT", tableName: m[1].toLowerCase(), cols: m[2].split(",").map((c) => c.trim()) } : null;
  }
  if (upper.startsWith("UPDATE")) {
    const m = s.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE/i);
    if (!m) return null;
    const setCols = m[2].split(",").map((p) => { const eq = p.match(/(\w+)\s*=/); return eq ? eq[1].trim() : ""; }).filter(Boolean);
    return { type: "UPDATE", tableName: m[1].toLowerCase(), cols: setCols };
  }
  if (upper.startsWith("DELETE")) {
    const m = s.match(/DELETE\s+FROM\s+(\w+)/i);
    return m ? { type: "DELETE", tableName: m[1].toLowerCase(), cols: [] } : null;
  }
  return null;
}

// ── Column validation ─────────────────────────────────────────────────────
// Returns array of error strings (empty = valid)
export function validateMutation(sql, uploadedTables) {
  const mutation = detectMutation(sql);
  if (!mutation) return [];
  const { type, tableName, cols } = mutation;
  const errors = [];

  // Check table exists
  const isKnownMaster = !!MASTER_TABLES[tableName];
  const isKnownUploaded = !!uploadedTables[tableName];
  if (!isKnownMaster && !isKnownUploaded && type !== "INSERT") {
    errors.push(`Table "${tableName}" does not exist. Create it first with INSERT or upload a file.`);
    return errors;
  }

  // For INSERT into master, validate columns against schema
  if ((type === "INSERT" || type === "UPDATE") && isKnownMaster) {
    const knownCols = new Set((MASTER_SCHEMA[tableName] || []).map((f) => f.col));
    // Add all entity fields (schema may not list all)
    cols.forEach((col) => {
      if (col && !knownCols.has(col) && knownCols.size > 0) {
        errors.push(`Column "${col}" does not exist on table "${tableName}". Known columns: ${[...knownCols].join(", ")}.`);
      }
    });
  }

  // DELETE on protected tables
  if (type === "DELETE" && PROTECTED_TABLES.has(tableName)) {
    errors.push(`DELETE is blocked on protected table "${tableName}" (master data). Use UPDATE status='archived' instead.`);
  }

  return errors;
}

export function exportCSV(rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "query_results.csv"; a.click();
  URL.revokeObjectURL(url);
}

export function inferType(values) {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
  if (!nonEmpty.length) return "TEXT";
  if (nonEmpty.every((v) => !isNaN(Number(v)) && !isNaN(parseFloat(v)))) {
    return nonEmpty.every((v) => Number.isInteger(Number(v))) ? "INT" : "FLOAT";
  }
  if (nonEmpty.every((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v)))) return "DATE";
  return "TEXT";
}

export function getUploadedSchema(rows) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((col) => ({ col, type: inferType(rows.map((r) => r[col])) }));
}