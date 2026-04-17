/**
 * formulaEngine.js
 * ─────────────────
 * Excel-like formula evaluator for SpreadsheetToolbar computed columns.
 *
 * Syntax:
 *   - Start with = (optional): =price * 1.15  or  price * 1.15
 *   - Field references: bare field name  (price, stock_quantity, status)
 *   - String literals: "hello"
 *   - Excel equality:  =  →  ===   (safe substitution away from >=, <=, <>)
 *   - Excel not-equal: <>  →  !==
 *   - All Excel functions below are available (uppercase)
 *
 * Supported functions:
 *   Logic    : IF, IFS, AND, OR, NOT, SWITCH
 *   Text     : CONCAT, CONCATENATE, UPPER, LOWER, LEN, LEFT, RIGHT, MID,
 *              TRIM, SUBSTITUTE, TEXT, VALUE, REPT, EXACT
 *   Math     : ABS, ROUND, ROUNDUP, ROUNDDOWN, FLOOR, CEILING, INT,
 *              MOD, MAX, MIN, SUM, AVERAGE, SQRT, POWER, LOG, EXP
 *   Date     : TODAY, NOW, DATEDIFF, YEAR, MONTH, DAY, DATE
 *   Null     : ISNULL, ISBLANK, COALESCE, IFNULL
 *   Format   : DOLLAR, PERCENT, FIXED
 */

// ── Built-in functions ────────────────────────────────────────────────────────

const _safe = (v) => (v == null ? "" : v);
const _num  = (v) => parseFloat(v) || 0;

const FUNCS = {
  // ── Logic ────────────────────────────────────────────────────────────────
  IF:     (cond, t, f = "") => (cond ? t : f),
  IFS:    (...args) => {
    for (let i = 0; i < args.length - 1; i += 2) if (args[i]) return args[i + 1];
    return args.length % 2 === 1 ? args[args.length - 1] : "";
  },
  SWITCH: (val, ...pairs) => {
    for (let i = 0; i < pairs.length - 1; i += 2) if (val === pairs[i]) return pairs[i + 1];
    return pairs.length % 2 === 1 ? pairs[pairs.length - 1] : "";
  },
  AND:    (...args) => args.every(Boolean),
  OR:     (...args) => args.some(Boolean),
  NOT:    (v) => !v,

  // ── Text ─────────────────────────────────────────────────────────────────
  CONCAT:       (...args) => args.map(_safe).join(""),
  CONCATENATE:  (...args) => args.map(_safe).join(""),
  UPPER:        (s) => String(_safe(s)).toUpperCase(),
  LOWER:        (s) => String(_safe(s)).toLowerCase(),
  LEN:          (s) => String(_safe(s)).length,
  LEFT:         (s, n = 1) => String(_safe(s)).slice(0, _num(n)),
  RIGHT:        (s, n = 1) => String(_safe(s)).slice(-_num(n)),
  MID:          (s, start = 1, len = 1) => String(_safe(s)).slice(_num(start) - 1, _num(start) - 1 + _num(len)),
  TRIM:         (s) => String(_safe(s)).trim(),
  SUBSTITUTE:   (s, old, newStr, instance) => {
    const src = String(_safe(s));
    if (instance == null) return src.replaceAll(old, newStr);
    let count = 0;
    return src.replace(new RegExp(String(old).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      (m) => (++count === _num(instance) ? newStr : m));
  },
  REPT:         (s, n) => String(_safe(s)).repeat(Math.max(0, _num(n))),
  EXACT:        (a, b) => String(_safe(a)) === String(_safe(b)),
  TEXT:         (v, _fmt) => String(_safe(v)),
  VALUE:        (s) => parseFloat(String(_safe(s)).replace(/[,$]/g, "")) || 0,
  PROPER:       (s) => String(_safe(s)).replace(/\b\w/g, (c) => c.toUpperCase()),

  // ── Math ─────────────────────────────────────────────────────────────────
  ABS:          (n) => Math.abs(_num(n)),
  ROUND:        (n, d = 0) => Number(_num(n).toFixed(_num(d))),
  ROUNDUP:      (n, d = 0) => { const f = Math.pow(10, _num(d)); return Math.ceil(_num(n) * f) / f; },
  ROUNDDOWN:    (n, d = 0) => { const f = Math.pow(10, _num(d)); return Math.floor(_num(n) * f) / f; },
  FLOOR:        (n, sig = 1) => Math.floor(_num(n) / _num(sig)) * _num(sig),
  CEILING:      (n, sig = 1) => Math.ceil(_num(n) / _num(sig)) * _num(sig),
  INT:          (n) => Math.trunc(_num(n)),
  MOD:          (n, d) => _num(n) % _num(d),
  MAX:          (...args) => Math.max(...args.map(_num).filter((v) => !isNaN(v))),
  MIN:          (...args) => Math.min(...args.map(_num).filter((v) => !isNaN(v))),
  SUM:          (...args) => args.map(_num).reduce((a, b) => a + b, 0),
  AVERAGE:      (...args) => { const v = args.map(_num); return v.reduce((a, b) => a + b, 0) / v.length; },
  SQRT:         (n) => Math.sqrt(_num(n)),
  POWER:        (b, e) => Math.pow(_num(b), _num(e)),
  LOG:          (n, base = 10) => Math.log(_num(n)) / Math.log(_num(base)),
  LN:           (n) => Math.log(_num(n)),
  EXP:          (n) => Math.exp(_num(n)),
  PI:           () => Math.PI,
  RAND:         () => Math.random(),

  // ── Date ─────────────────────────────────────────────────────────────────
  TODAY: () => new Date().toISOString().slice(0, 10),
  NOW:   () => new Date().toISOString(),
  DATEDIFF: (d1, d2) => {
    try {
      const a = new Date(String(d1));
      const b = d2 != null ? new Date(String(d2)) : new Date();
      if (isNaN(a) || isNaN(b)) return null;
      return Math.round((b - a) / 86400000);
    } catch { return null; }
  },
  YEAR:  (d) => { try { return new Date(String(d)).getFullYear(); } catch { return null; } },
  MONTH: (d) => { try { return new Date(String(d)).getMonth() + 1; } catch { return null; } },
  DAY:   (d) => { try { return new Date(String(d)).getDate(); } catch { return null; } },
  DATE:  (y, m, d) => new Date(_num(y), _num(m) - 1, _num(d)).toISOString().slice(0, 10),

  // ── Null / blank ─────────────────────────────────────────────────────────
  ISNULL:  (v) => v == null || v === "",
  ISBLANK: (v) => !v && v !== 0,
  COALESCE: (...args) => args.find((a) => a != null && a !== "") ?? "",
  IFNULL:  (v, def) => (v == null || v === "" ? def : v),

  // ── Formatting helpers ────────────────────────────────────────────────────
  DOLLAR:  (n, d = 2) => "$" + _num(n).toLocaleString(undefined, { minimumFractionDigits: _num(d), maximumFractionDigits: _num(d) }),
  PERCENT: (n, d = 1) => (_num(n) * 100).toFixed(_num(d)) + "%",
  FIXED:   (n, d = 2) => _num(n).toFixed(_num(d)),
};

// ── Core evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluate an Excel-like formula against a data row.
 *
 * @param {string} formula  e.g. "=ROUND(price * 1.15, 2)"
 * @param {object} row      e.g. { price: 100, status: "active", ... }
 * @returns {*}             computed value, or "#ERR: …" string on failure
 */
export function evalFormula(formula, row = {}) {
  if (!formula) return "";
  try {
    let expr = formula.trim();
    if (expr.startsWith("=")) expr = expr.slice(1);

    // 1. Extract and protect string literals
    const strings = [];
    expr = expr.replace(/"([^"]*)"/g, (_, s) => { strings.push(s); return `__S${strings.length - 1}__`; });

    // 2. Convert Excel operators → JS
    expr = expr.replace(/<>/g, " !== ");
    // = not preceded by <, >, !, = → ===   (using positive lookbehind that we don't have, use replace carefully)
    expr = expr.replace(/([^<>!=])=(?!=)/g, (_, pre) => `${pre} === `);
    expr = expr.replace(/^=(?!=)/, " === ");   // leading = edge case

    // 3. Restore string literals
    expr = expr.replace(/__S(\d+)__/g, (_, i) => JSON.stringify(strings[parseInt(i, 10)]));

    // 4. Build evaluation scope — functions + row fields
    //    Row fields shadow nothing critical; if a field name conflicts with a FUNC name
    //    the field wins (user data takes priority over built-ins with same name).
    const scopeNames  = [];
    const scopeValues = [];
    const seen = new Set();

    // Add row fields first so they shadow builtins of same name
    Object.entries(row).forEach(([k, v]) => {
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) && !seen.has(k)) {
        seen.add(k);
        scopeNames.push(k);
        scopeValues.push(v);
      }
    });
    // Add builtins
    Object.entries(FUNCS).forEach(([k, v]) => {
      if (!seen.has(k)) {
        seen.add(k);
        scopeNames.push(k);
        scopeValues.push(v);
      }
    });

    // eslint-disable-next-line no-new-func
    const fn = new Function(...scopeNames, `"use strict"; return (${expr});`);
    const result = fn(...scopeValues);
    return result ?? "";
  } catch (e) {
    return `#ERR: ${e.message.slice(0, 40)}`;
  }
}

/**
 * Validate a formula against a sample row and return a preview value.
 */
export function validateFormula(formula, sampleRow = {}) {
  try {
    const result = evalFormula(formula, sampleRow);
    if (typeof result === "string" && result.startsWith("#ERR")) {
      return { valid: false, error: result };
    }
    return { valid: true, preview: result };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// ── Example formulas shown in the formula builder ──────────────────────────

export const FORMULA_EXAMPLES = [
  { label: "Price + 15% tax",        formula: `=ROUND(price * 1.15, 2)` },
  { label: "Stock value",            formula: `=stock_quantity * unit_price` },
  { label: "Active flag",            formula: `=IF(status = "active", "✓ Active", "— Inactive")` },
  { label: "Days since created",     formula: `=DATEDIFF(created_date)` },
  { label: "Days until due",         formula: `=DATEDIFF(TODAY(), due_date)` },
  { label: "Full name",              formula: `=CONCAT(first_name, " ", last_name)` },
  { label: "Low stock warning",      formula: `=IF(stock_quantity < min_stock_level, "⚠️ Low", "OK")` },
  { label: "Overdue check",          formula: `=IF(DATEDIFF(due_date) > 0, "⚠️ Overdue", "On time")` },
  { label: "Formatted amount",       formula: `=DOLLAR(amount)` },
  { label: "City + Country",         formula: `=CONCAT(city, ", ", country)` },
  { label: "Profit margin %",        formula: `=PERCENT((unit_price - cost_price) / unit_price)` },
  { label: "First 3 chars of name",  formula: `=UPPER(LEFT(name, 3))` },
];
