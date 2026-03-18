// Singleton store for notebooks (API connections + Python scripts)
// Persists to localStorage so DataModels page can read them

const STORAGE_KEY = "nb44_notebooks";

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const subscribers = [];

export const NotebookStore = {
  getAll() { return load(); },

  get(id) { return load()[id] || null; },

  set(id, notebook) {
    const all = load();
    all[id] = notebook;
    save(all);
    subscribers.forEach((fn) => fn(all));
  },

  remove(id) {
    const all = load();
    delete all[id];
    save(all);
    subscribers.forEach((fn) => fn(all));
  },

  subscribe(fn) {
    subscribers.push(fn);
    return () => { const i = subscribers.indexOf(fn); if (i > -1) subscribers.splice(i, 1); };
  },
};