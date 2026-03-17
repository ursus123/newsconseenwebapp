// Persistent tab store – keeps SQL editor tabs in localStorage
const KEY = "qb_tabs";
const ACTIVE_KEY = "qb_active_tab";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [{ id: "1", name: "query_1.sql", sql: "SELECT * FROM enterprises WHERE status = 'active'", savedQueryId: null }];
}

function save(tabs) {
  try { localStorage.setItem(KEY, JSON.stringify(tabs)); } catch {}
}

export const TabStore = {
  getTabs: () => load(),
  getActiveId: () => {
    try { return localStorage.getItem(ACTIVE_KEY) || load()[0]?.id || "1"; } catch { return "1"; }
  },
  setTabs: (tabs) => { save(tabs); },
  setActiveId: (id) => { try { localStorage.setItem(ACTIVE_KEY, id); } catch {} },
};