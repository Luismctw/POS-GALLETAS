const CACHE = 'pos-galletas-v2';
const ASSETS = [
  '/dashboard.html',
  '/css/dashboard.css',
  '/js/dashboard.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network first para el API, cache first para assets estáticos
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) {
    // API: siempre red, sin cache
    e.respondWith(fetch(e.request).catch(() => new Response(
      JSON.stringify({ mensaje: 'Sin conexión' }),
      { headers: { 'Content-Type': 'application/json' } }
    )));
  } else {
    // Assets: red primero, cache como respaldo
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Solo cachear respuestas correctas (evita guardar páginas 503/error de despliegues)
          if (res && res.ok && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
