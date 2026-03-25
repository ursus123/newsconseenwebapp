// Newsconseen OS — Service Worker
// Handles: static caching, API response caching, background sync, push notifications

const APP_CACHE    = "newsconseen-app-v1";
const DATA_CACHE   = "newsconseen-data-v1";
const SYNC_TAG     = "newsconseen-sync";

// Static assets to pre-cache on install
const STATIC_ASSETS = [
  "/",
  "/Desktop",
  "/index.html",
  "/src/main.jsx",
];

// API paths whose GET responses we cache for offline use
const CACHEABLE_API_PATTERNS = [
  /\/api\/entities\/Enterprise/,
  /\/api\/entities\/Person/,
  /\/api\/entities\/Task/,
  /\/api\/entities\/Transaction/,
  /\/api\/entities\/Relationship/,
  /\/api\/entities\/Product/,
  /\/api\/entities\/Service/,
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => {
      // Pre-cache what we can; ignore failures for dynamic paths
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(k => k !== APP_CACHE && k !== DATA_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests for caching
  if (request.method !== "GET") {
    // Queue POST/PATCH/DELETE for background sync when offline
    if (!navigator.onLine) {
      event.respondWith(
        queueOfflineRequest(request).then(() =>
          new Response(JSON.stringify({ queued: true, offline: true }), {
            headers: { "Content-Type": "application/json" },
          })
        )
      );
    }
    return;
  }

  // API data: stale-while-revalidate
  const isApiCall = CACHEABLE_API_PATTERNS.some(p => p.test(url.pathname + url.search));
  if (isApiCall) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  // Navigation requests: network-first, fall back to cached index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html").then(r => r || caches.match("/"))
      )
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(cacheFirst(request, APP_CACHE));
});

// ── Strategies ────────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || (await fetchPromise) || new Response(
    JSON.stringify({ error: "offline", cached: false }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}

// ── Offline request queue (IndexedDB) ─────────────────────────────────────────
const DB_NAME    = "newsconseen-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending-requests";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function queueOfflineRequest(request) {
  const db = await openDB();
  const body = await request.clone().text();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.add({
      url:       request.url,
      method:    request.method,
      headers:   Object.fromEntries(request.headers.entries()),
      body,
      timestamp: Date.now(),
    });
    tx.oncomplete = resolve;
    tx.onerror    = reject;
  });
}

async function flushOfflineQueue() {
  const db = await openDB();
  const tx    = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const items = await new Promise((res, rej) => {
    const req = store.getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = rej;
  });

  for (const item of items) {
    try {
      await fetch(item.url, {
        method:  item.method,
        headers: item.headers,
        body:    item.body || undefined,
      });
      // On success, remove from queue
      await new Promise((res, rej) => {
        const del = store.delete(item.id);
        del.onsuccess = res;
        del.onerror   = rej;
      });
    } catch {
      // Keep in queue; will retry next sync
    }
  }
}

// ── Background Sync ───────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flushOfflineQueue());
  }
});

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = { title: "Newsconseen", body: "You have a new notification.", appId: "system" };
  try { data = { ...data, ...event.data.json() }; } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    "https://placehold.co/192x192/0a0f1e/10b981?text=N",
      badge:   "https://placehold.co/96x96/0a0f1e/10b981?text=N",
      tag:     data.appId || "system",
      data:    { url: "/Desktop", appId: data.appId },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/Desktop";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find(c => c.url.includes("/Desktop"));
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
