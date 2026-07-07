const CACHE = 'pos-repartidor-v2';
const ASSETS = ['/ruta_movil.html'];

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

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response(
      JSON.stringify({ mensaje: 'Sin conexión al servidor' }),
      { headers: { 'Content-Type': 'application/json' } }
    )));
  } else {
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
