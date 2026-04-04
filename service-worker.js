/* ============================================================
   SEHAT POINT — ADVANCED SERVICE WORKER
   Enables offline clinical report viewing and fast loads.
   ============================================================ */

const CACHE_NAME = 'sehat-point-v5-pro-v4-update';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './dashboard.html',
    './emergency.html',
    './login.html',
    './register.html',
    './css/style.css',
    './js/auth.js',
    './js/storage.js',
    './js/dashboard.js',
    './js/supabase-config.js',
    './assets/icon-192.png',
    './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching Professional Shell');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

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

// NETWORK-FIRST STRATEGY (Functional Fix for "No Changes on Mobile")
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // If network works, clone and update cache
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(() => {
                // If network fails (Offline), fallback to cache
                return caches.match(event.request).then((cached) => {
                    if (cached) return cached;
                    // For navigation, fallback to index
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});
