// ============================================
// WaterApp - Service Worker Visor Ejecutivo Móvil
// ============================================

const CACHE_NAME = 'waterapp-visor-v1.0.0';

const ASSETS_TO_CACHE = [
  './visor.html',
  './manifest-visor.json',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/logo.png'
];

// Instalación
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW-Visor] Precargando recursos PWA...');
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
          if (key.startsWith('waterapp-visor-') && key !== CACHE_NAME) {
            console.log('[SW-Visor] Eliminando caché obsoleta:', key);
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

  // Estrategia Network-First para el visor.html (para tener siempre la versión más reciente en vivo)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('visor.html') || url.pathname.endsWith('/')) {
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
          // Si no hay red, carga la versión en caché
          return caches.match('./visor.html') || caches.match(event.request);
        })
    );
    return;
  }

  // Estrategia Cache-First para recursos locales (iconos, imágenes, etc.)
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
