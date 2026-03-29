/* ============================================================
   EMERGENCY RESPONSE — SERVICE WORKER
   Enables offline viewing for the medical dashboard.
   ============================================================ */

const CACHE_NAME = 'ems-cache-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './dashboard.html',
    './emergency.html',
    './css/style.css',
    './css/dashboard.css',
    './js/app.js',
    './js/auth.js',
    './js/storage.js',
    './js/dashboard.js',
    './js/supabase-config.js',
    'https://unpkg.com/lucide@latest',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// ─── INSTALL ───
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching critical assets...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// ─── ACTIVATE ───
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        })
    );
    self.clients.claim();
});

// ─── FETCH (Stale-While-Revalidate) ───
self.addEventListener('fetch', (event) => {
    // We only cache GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached version and update in background
                fetch(event.request).then((networkResponse) => {
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                }).catch(() => {});
                return cachedResponse;
            }
            return fetch(event.request);
        })
    );
});
