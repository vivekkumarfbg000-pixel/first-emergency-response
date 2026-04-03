/* ============================================================
   SEHAT POINT — ADVANCED SERVICE WORKER
   Enables offline clinical report viewing and fast loads.
   ============================================================ */

const CACHE_NAME = 'sehat-point-v2';
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
    './assets/icon-512.png',
    'https://unpkg.com/lucide@latest',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching Sehat Point Shell');
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

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                // Optionally cache new successful GET requests
                if (response.ok && response.type === 'basic') {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            });
        }).catch(() => {
            // Fallback for offline if not in cache (e.g. show emergency.html if available)
            if (event.request.mode === 'navigate') {
                return caches.match('./dashboard.html');
            }
        })
    );
});
