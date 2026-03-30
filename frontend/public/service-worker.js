const CACHE_NAME = 'shadow-cakes-v1';
const API_CACHE_NAME = 'shadow-cakes-api-v1';
const OFFLINE_QUEUE_NAME = 'shadow-cakes-offline-queue';

// Static assets to precache (app shell)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/favicon.ico'
];

// API routes that should be cached for offline access
const CACHEABLE_API_ROUTES = [
  '/api/ingredients',
  '/api/ingredient-prices',
  '/api/packaging',
  '/api/recipes',
  '/api/component-recipes',
  '/api/settings',
  '/api/sales',
  '/api/sales/summary'
];

// ==================== INSTALL ====================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ==================== ACTIVATE ====================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== API_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ==================== INDEXEDDB HELPERS ====================
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ShadowCakesOffline', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingRequests')) {
        db.createObjectStore('pendingRequests', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueRequest(request, body) {
  const db = await openDB();
  const tx = db.transaction('pendingRequests', 'readwrite');
  const store = tx.objectStore('pendingRequests');
  store.add({
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body: body,
    timestamp: Date.now()
  });
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getPendingRequests() {
  const db = await openDB();
  const tx = db.transaction('pendingRequests', 'readonly');
  const store = tx.objectStore('pendingRequests');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearPendingRequest(id) {
  const db = await openDB();
  const tx = db.transaction('pendingRequests', 'readwrite');
  const store = tx.objectStore('pendingRequests');
  store.delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ==================== SYNC PENDING REQUESTS ====================
async function syncPendingRequests() {
  const pending = await getPendingRequests();
  for (const req of pending) {
    try {
      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body ? JSON.stringify(req.body) : undefined
      });
      if (response.ok) {
        await clearPendingRequest(req.id);
        // Notify clients about successful sync
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_COMPLETE', url: req.url });
        });
      }
    } catch (e) {
      // Still offline, leave in queue
      console.log('Sync failed for:', req.url, e);
    }
  }
}

// ==================== FETCH HANDLER ====================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET/non-API requests for cross-origin resources
  if (url.origin !== location.origin && !request.url.includes('/api/')) {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    if (request.method === 'GET') {
      // Network-first for API GET requests
      event.respondWith(networkFirstAPI(request));
    } else {
      // For mutations (POST, PUT, DELETE), try network first, queue if offline
      event.respondWith(handleMutation(request));
    }
    return;
  }

  // Handle static assets and navigation - Cache-first, then network
  event.respondWith(cacheFirstWithNetwork(request));
});

async function networkFirstAPI(request) {
  const cache = await caches.open(API_CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Cache the successful response
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    // Offline - try cache
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    // Return offline JSON response
    return new Response(
      JSON.stringify({ error: 'offline', message: 'You are offline. Data will sync when connection is restored.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function handleMutation(request) {
  let body = null;
  try {
    body = await request.clone().json();
  } catch (e) {
    // May be FormData or other body type
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      // Invalidate related API caches after successful mutation
      await invalidateAPICaches(request.url);
    }
    return response;
  } catch (e) {
    // Offline - queue the request
    if (body) {
      await queueRequest(request, body);
      // Return a synthetic success response
      return new Response(
        JSON.stringify({ 
          status: 'queued', 
          message: 'Saved offline. Will sync when you reconnect.',
          _offline: true 
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Cannot perform this action offline.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function invalidateAPICaches(mutationUrl) {
  const cache = await caches.open(API_CACHE_NAME);
  const keys = await cache.keys();
  for (const key of keys) {
    // Invalidate related caches (e.g., if we POST to /api/sales, invalidate /api/sales and /api/sales/summary)
    const keyPath = new URL(key.url).pathname;
    const mutPath = new URL(mutationUrl).pathname;
    const basePath = mutPath.split('/').slice(0, 3).join('/'); // /api/resource
    if (keyPath.startsWith(basePath)) {
      await cache.delete(key);
    }
  }
}

async function cacheFirstWithNetwork(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    // Return cached, but also update in background
    fetch(request).then((response) => {
      if (response.ok) {
        cache.put(request, response);
      }
    }).catch(() => {});
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    // For navigation requests, return the cached index.html
    if (request.mode === 'navigate') {
      const indexCache = await cache.match('/index.html');
      if (indexCache) return indexCache;
    }
    return new Response('Offline', { status: 503 });
  }
}

// ==================== BACKGROUND SYNC ====================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending') {
    event.waitUntil(syncPendingRequests());
  }
});

// ==================== ONLINE EVENT FROM CLIENTS ====================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'ONLINE') {
    syncPendingRequests();
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
