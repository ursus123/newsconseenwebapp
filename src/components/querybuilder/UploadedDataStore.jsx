// In-memory store for uploaded datasets (survives re-renders via module singleton)
let store = {}; // { tableName: { rows: [], columns: [], uploadedAt: Date } }
let listeners = [];

export const UploadedDataStore = {
  get: (name) => store[name],
  getAll: () => ({ ...store }),
  set: (name, data) => {
    store[name] = data;
    listeners.forEach((fn) => fn({ ...store }));
  },
  remove: (name) => {
    delete store[name];
    listeners.forEach((fn) => fn({ ...store }));
  },
  updateRow: (tableName, rowIndex, updates) => {
    if (!store[tableName]) return;
    store[tableName].rows[rowIndex] = { ...store[tableName].rows[rowIndex], ...updates };
    listeners.forEach((fn) => fn({ ...store }));
  },
  addRow: (tableName, row) => {
    if (!store[tableName]) return;
    store[tableName].rows.push(row);
    listeners.forEach((fn) => fn({ ...store }));
  },
  deleteRow: (tableName, rowIndex) => {
    if (!store[tableName]) return;
    store[tableName].rows.splice(rowIndex, 1);
    listeners.forEach((fn) => fn({ ...store }));
  },
  subscribe: (fn) => {
    listeners.push(fn);
    return () => { listeners = listeners.filter((l) => l !== fn); };
  },
};