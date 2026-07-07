const CACHE = 'pos-repartidor-v3';
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
        .catch(async () => {
          const cached = await caches.match(e.request);
          if (cached && cached.ok) return cached;
          // Sin copia buena: nunca mostrar en blanco; página que se reintenta sola
          if (e.request.mode === 'navigate') {
            return new Response(
              '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="3"><body style="font-family:sans-serif;text-align:center;padding-top:60px;color:#334155"><h2>Reconectando…</h2><p>Revisa tu internet. La app se recargará sola.</p></body>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          }
          return cached || Response.error();
        })
    );
  }
});
