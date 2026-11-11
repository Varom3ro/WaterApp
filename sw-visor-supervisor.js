// ============================================
// WaterApp - Service Worker Visor Supervisor Móvil
// ============================================

const CACHE_NAME = 'waterapp-visor-sup-v1.0.0';

const ASSETS_TO_CACHE = [
  './visor-supervisor.html',
  './manifest-visor-supervisor.json',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/logo.png'
];

// Instalación
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW-Visor-Sup] Precargando recursos PWA...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activación y limpieza de versiones previas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('waterapp-visor-sup-') && key !== CACHE_NAME) {
            console.log('[SW-Visor-Sup] Eliminando caché obsoleta:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de peticiones (Fetch)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // No interceptar peticiones a Supabase, Google Fonts o APIs externas
  if (
    url.origin !== self.location.origin ||
    url.pathname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    return;
  }

  // Estrategia Network-First para visor-supervisor.html
  if (event.request.mode === 'navigate' || url.pathname.endsWith('visor-supervisor.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          return caches.match('./visor-supervisor.html') || caches.match(event.request);
        })
    );
    return;
  }

  // Estrategia Cache-First para recursos locales (iconos, imágenes)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return networkResponse;
      });
    })
  );
});
