/**
 * Newsconseen ESLint Plugin — Taxonomy Discipline Rules
 *
 * Two rules enforce the taxonomy contract documented in ARCHITECTURE.md § 13.
 *
 * ── Rule 1: newsconseen/no-legacy-type-value ─────────────────────────────────
 * ERROR — legacy person_type, enterprise_type, or item_type strings used
 * in equality / inclusion comparisons.
 *
 * These values existed before the canonical taxonomy was defined and must
 * never appear in new code.  When filtering, always go through TYPE_ALIASES.
 *
 *   ✗  if (p.person_type === "employee")
 *   ✗  ["student", "patient"].includes(p.person_type)
 *   ✓  if ((TYPE_ALIASES["staff"] || ["staff"]).includes(p.person_type))
 *
 * ── Rule 2: newsconseen/no-select-for-taxonomy-field ─────────────────────────
 * WARNING — a native <select> element is used where a taxonomy field
 * (`person_subtype`, `enterprise_subtype`, `item_subtype`, `sub_type`,
 * `task_type`) is assigned.  These fields must use <TaxonomySelect>.
 *
 *   ✗  <select onChange={e => set("person_subtype", e.target.value)}>
 *   ✗  <select name="enterprise_subtype">
 *   ✓  <TaxonomySelect fieldName="person_subtype" ... />
 *
 * How to use these rules → see eslint.config.js.
 */

// ── Canonical taxonomy values ─────────────────────────────────────────────────
// These are the values that SHOULD be used.  Everything else is legacy.
const CANONICAL_PERSON_TYPES = new Set(["staff", "client", "contact", "volunteer"]);
const CANONICAL_ENTERPRISE_TYPES = new Set(["commercial", "nonprofit", "government", "household", "cooperative", "trust"]);
const CANONICAL_ITEM_TYPES = new Set(["physical", "living", "digital", "service_package", "financial_instrument"]);

// Legacy values that must not appear in new comparisons.
// Maps: legacy_value → canonical_replacement
const LEGACY_PERSON_TYPE_MAP = {
  employee:         "staff",
  contractor:       "staff",
  freelancer:       "staff",
  worker:           "staff",
  student:          "client",
  patient:          "client",
  member:           "client",
  beneficiary:      "client",
  enrollee:         "client",
  resident:         "client",
  vendor:           "contact",
  supplier:         "contact",
  external_partner: "contact",
};

const LEGACY_ENTERPRISE_TYPE_MAP = {
  company:      "commercial",
  business:     "commercial",
  corporation:  "commercial",
  llc:          "commercial",
  ltd:          "commercial",
  ngo:          "nonprofit",
  charity:      "nonprofit",
  association:  "nonprofit",
  organization: "nonprofit",
};

const LEGACY_ITEM_TYPE_MAP = {
  livestock:  "living",
  medication: "physical",
  equipment:  "physical",
  software:   "digital",
  service:    "service_package",
};

// All legacy values combined for fast lookup
const ALL_LEGACY_VALUES = new Map([
  ...Object.entries(LEGACY_PERSON_TYPE_MAP).map(([k, v]) => [k, { canonical: v, kind: "person_type" }]),
  ...Object.entries(LEGACY_ENTERPRISE_TYPE_MAP).map(([k, v]) => [k, { canonical: v, kind: "enterprise_type" }]),
  ...Object.entries(LEGACY_ITEM_TYPE_MAP).map(([k, v]) => [k, { canonical: v, kind: "item_type" }]),
]);

// ── Taxonomy field names that must use <TaxonomySelect> ───────────────────────
const TAXONOMY_FIELD_NAMES = new Set([
  "person_subtype",
  "enterprise_subtype",
  "item_subtype",
  "sub_type",
  "task_type",
  "task_subtype",
]);

// ── Rule 1 ────────────────────────────────────────────────────────────────────
const noLegacyTypeValue = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow legacy type values in comparisons. Use TYPE_ALIASES or canonical taxonomy values.",
      url: "src/ARCHITECTURE.md#13-taxonomy-governance",
    },
    messages: {
      legacyValue:
        "Legacy type value '{{value}}' detected. Use TYPE_ALIASES['{{canonical}}'] or the canonical value '{{canonical}}' ({{kind}}). " +
        "See ARCHITECTURE.md § 13.",
    },
    schema: [],
  },

  create(context) {
    /**
     * Checks if a node is a string literal whose value is a known legacy type.
     * Handles both: === "employee" and ["employee", "patient"].includes(...)
     */
    function checkLiteral(node) {
      if (node.type !== "Literal" || typeof node.value !== "string") return;
      const entry = ALL_LEGACY_VALUES.get(node.value.toLowerCase());
      if (!entry) return;
      context.report({
        node,
        messageId: "legacyValue",
        data: { value: node.value, canonical: entry.canonical, kind: entry.kind },
      });
    }

    return {
      // Catches: x === "employee"  |  "employee" === x
      BinaryExpression(node) {
        if (node.operator !== "===" && node.operator !== "!==") return;
        checkLiteral(node.left);
        checkLiteral(node.right);
      },

      // Catches: ["employee", "patient"].includes(x)
      // Catches: ["employee"].indexOf(x)
      "CallExpression > MemberExpression"(node) {
        const methodName = node.property?.name;
        if (methodName !== "includes" && methodName !== "indexOf") return;
        const arr = node.object;
        if (arr.type !== "ArrayExpression") return;
        for (const el of arr.elements) {
          checkLiteral(el);
        }
      },
    };
  },
};

// ── Rule 2 ────────────────────────────────────────────────────────────────────
const noSelectForTaxonomyField = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn when a native <select> element is used for a taxonomy field. Use <TaxonomySelect> instead.",
      url: "src/ARCHITECTURE.md#13-taxonomy-governance",
    },
    messages: {
      usesTaxonomySelect:
        "Native <select> used for taxonomy field '{{field}}'. " +
        "Replace with <TaxonomySelect fieldName=\"{{field}}\" entityType=\"...\" parentValue={...} companyId={...} />. " +
        "See ARCHITECTURE.md § 13.",
    },
    schema: [],
  },

  create(context) {
    /**
     * Given a JSX opening element, find the first string literal in the
     * onChange / onValueChange / name / id props.  Return the first
     * taxonomy field name found, or null.
     */
    function findTaxonomyFieldInProps(jsxOpeningEl) {
      for (const attr of jsxOpeningEl.attributes) {
        if (attr.type !== "JSXAttribute") continue;

        const propName = attr.name?.name;

        // <select name="person_subtype"> or <select id="person_subtype">
        if ((propName === "name" || propName === "id") && attr.value) {
          const raw =
            attr.value.type === "Literal"
              ? attr.value.value
              : attr.value.type === "JSXExpressionContainer" &&
                attr.value.expression.type === "Literal"
              ? attr.value.expression.value
              : null;
          if (raw && TAXONOMY_FIELD_NAMES.has(raw)) return raw;
        }

        // <select onChange={e => set("person_subtype", e.target.value)}>
        if (
          (propName === "onChange" || propName === "onValueChange") &&
          attr.value?.type === "JSXExpressionContainer"
        ) {
          const expr = attr.value.expression;
          const found = findTaxonomyFieldInExpression(expr);
          if (found) return found;
        }
      }
      return null;
    }

    /**
     * Walk expression nodes looking for string literals that match a
     * taxonomy field name (e.g. set("person_subtype", ...)).
     */
    function findTaxonomyFieldInExpression(node) {
      if (!node) return null;
      if (node.type === "Literal" && TAXONOMY_FIELD_NAMES.has(node.value)) {
        return node.value;
      }
      // Arrow function body / call expression arguments
      if (node.type === "ArrowFunctionExpression") {
        return findTaxonomyFieldInExpression(node.body);
      }
      if (node.type === "BlockStatement") {
        for (const stmt of node.body) {
          const r = findTaxonomyFieldInExpression(stmt.expression || stmt);
          if (r) return r;
        }
      }
      if (node.type === "CallExpression") {
        for (const arg of node.arguments) {
          const r = findTaxonomyFieldInExpression(arg);
          if (r) return r;
        }
      }
      if (node.type === "ExpressionStatement") {
        return findTaxonomyFieldInExpression(node.expression);
      }
      return null;
    }

    return {
      JSXOpeningElement(node) {
        // Only interested in native <select> (lowercase = HTML element)
        const elName =
          node.name.type === "JSXIdentifier" ? node.name.name : null;
        if (elName !== "select") return;

        const field = findTaxonomyFieldInProps(node);
        if (!field) return;

        context.report({
          node,
          messageId: "usesTaxonomySelect",
          data: { field },
        });
      },
    };
  },
};

// ── Plugin export (ESLint 9 flat config format) ───────────────────────────────
export const newsconseenPlugin = {
  meta: { name: "newsconseen", version: "1.0.0" },
  rules: {
    "no-legacy-type-value":       noLegacyTypeValue,
    "no-select-for-taxonomy-field": noSelectForTaxonomyField,
  },
};
