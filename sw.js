// ============================================
// Tu Empresa - Service Worker (PWA Offline)
// ============================================

const CACHE_NAME = 'waterapp-cache-v2.8.32';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './img/logo.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './js/app.js',
  './js/router.js',
  './js/store.js',
  './js/utils.js',
  './js/licencia.js',
  './js/cloud-sync.js',
  './js/qrcode.min.js',
  './js/html2pdf.bundle.min.js',
  './js/components/header.js',
  './js/components/sidebar.js',
  './js/components/modal.js',
  './js/components/toast.js',
  './js/modules/cierre.js',
  './js/modules/clientes.js',
  './js/modules/configuracion.js',
  './js/modules/dashboard.js',
  './js/modules/inventario.js',
  './js/modules/reportes.js',
  './js/modules/ventas.js'
];

// Instalación: Cachear recursos estáticos y activar inmediatamente
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando recursos de la app v2.8.30');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activación: Limpiar cachés antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Eliminando caché antigua:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de peticiones: Network First para reflejar cambios frescos al instante,
// con fallback a Cache si no hay red (modo offline)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // No interceptar peticiones a Supabase u otras APIs remotas
  if (url.origin !== self.location.origin || url.pathname.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback a caché si no hay conexión o falla la red
        return caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
