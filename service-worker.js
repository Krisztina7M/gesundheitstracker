// ── Gesundheits-Tracker · Service Worker ────────────────────────────────────
// Fix: Weißer Bildschirm offline – Cache-First ohne isSameOrigin-Block
const CACHE_NAME = 'gesundheits-tracker-v4-4';

const APP_SHELL = [
  './index.html',
  './manifest.json',
  './apple-touch-icon.png'
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Install · Cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => {
        console.log('[SW] App-Shell gecacht ✓');
        return self.skipWaiting();
      })
      .catch(err => console.error('[SW] Install-Fehler:', err))
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activate · Cache:', CACHE_NAME);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Alter Cache gelöscht:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
// Strategie: Cache-First (ohne isSameOrigin-Check, der auf iOS/PWA scheitert)
// Nur GET-Requests und keine Chrome-Extensions behandeln.
self.addEventListener('fetch', event => {
  const { request } = event;

  // Nur GET
  if (request.method !== 'GET') return;

  // Chrome-interne Requests ignorieren
  if (request.url.startsWith('chrome-extension://')) return;

  // Externe Requests (andere Origins, z. B. CDN/APIs) direkt durchleiten
  const reqUrl = new URL(request.url);
  if (reqUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request)
      .then(cached => {
        // ── Cache-Hit: sofort antworten ──
        if (cached) {
          // Stale-while-revalidate: im Hintergrund neu laden
          fetch(request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(request, networkResponse.clone()));
              }
            })
            .catch(() => {});
          return cached;
        }

        // ── Cache-Miss: Netzwerk-Request ──
        return fetch(request)
          .then(networkResponse => {
            if (!networkResponse || networkResponse.status !== 200 ||
                networkResponse.type === 'opaque') {
              return networkResponse;
            }
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, networkResponse.clone()));
            return networkResponse;
          })
          .catch(() => {
            // ── Offline-Fallback ──
            console.warn('[SW] Offline – Fallback auf index.html');
            return caches.match('./index.html');
          });
      })
  );
});

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Gesundheits-Tracker';
  const options = {
    body: data.body || 'Zeit für deinen täglichen Eintrag! 🍎',
    icon: './apple-touch-icon.png',
    badge: './apple-touch-icon.png',
    tag: 'ght-reminder',
    renotify: false,
    requireInteraction: false,
    silent: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes('index.html') && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('./index.html');
        }
      })
  );
});
