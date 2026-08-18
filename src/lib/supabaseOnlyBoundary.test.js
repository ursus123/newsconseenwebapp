import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("frontend authentication has one Supabase initialization path", () => {
  const source = read("./AuthContext.jsx");
  assert.equal(source.includes("VITE_DATA_LAYER"), false);
  assert.match(source, /_initSupabaseAuth\(\)/);
});

test("canonical entity service has no runtime data-layer switch", () => {
  const source = read("../services/dataService.js");
  assert.equal(source.includes("VITE_DATA_LAYER"), false);
  assert.equal(source.includes("ncClient.entities"), false);
  assert.match(source, /supabaseEntities\[entityName\]/);
});

test("compatibility facade fails closed for an unmapped entity", () => {
  const source = read("../api/ncClient.js");
  assert.equal(source.includes("const DATA_LAYER"), false);
  assert.match(source, /has no canonical Supabase mapping/);
  assert.doesNotMatch(source, /return _real\.entities/);
});
