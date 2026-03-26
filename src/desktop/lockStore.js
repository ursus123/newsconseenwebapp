import { useState, useEffect } from 'react';

const AUTO_LOCK_KEY = 'desktop_auto_lock_minutes';

// ── Singleton state ────────────────────────────────────────────────────────────
let state = {
  isLocked: false,
  lastActiveAt: Date.now(),
  autoLockMinutes: parseInt(localStorage.getItem(AUTO_LOCK_KEY) || '0', 10),
};

const listeners = new Set();

function notify() {
  listeners.forEach(fn => fn({ ...state }));
}

function lock() {
  state = { ...state, isLocked: true };
  notify();
}

function unlock() {
  state = { ...state, isLocked: false, lastActiveAt: Date.now() };
  notify();
}

function updateActivity() {
  state = { ...state, lastActiveAt: Date.now() };
}

function setAutoLockMinutes(minutes) {
  localStorage.setItem(AUTO_LOCK_KEY, String(minutes));
  state = { ...state, autoLockMinutes: minutes };
  notify();
}

// ── React hook ────────────────────────────────────────────────────────────────
export function useLockStore() {
  const [snap, setSnap] = useState({ ...state });

  useEffect(() => {
    const handler = (s) => setSnap(s);
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);

  return {
    ...snap,
    lock,
    unlock,
    updateActivity,
    setAutoLockMinutes,
  };
}