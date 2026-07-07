// v4 — El HTML SIEMPRE se baja de internet (nunca desde caché) para no quedar
// pegado en una versión vieja/blanca. Al activarse, borra TODAS las cachés viejas.
const CACHE = 'pos-galletas-v4';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k))); // purga toda caché previa (incluye la envenenada)
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;

  if (req.url.includes('/api/')) {
    e.respondWith(fetch(req).catch(() => new Response(
      JSON.stringify({ mensaje: 'Sin conexión' }),
      { headers: { 'Content-Type': 'application/json' } }
    )));
    return;
  }

  // Todo lo demás (incluido el HTML): SIEMPRE red. Nunca se sirve HTML cacheado.
  e.respondWith(
    fetch(req).catch(() => {
      if (req.mode === 'navigate') {
        return new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="3"><body style="font-family:sans-serif;text-align:center;padding-top:60px;color:#334155"><h2>Reconectando…</h2><p>Revisa tu internet. La app se recargará sola.</p></body>',
          { headers: { 'Content-Type': 'text/html' } }
        );
      }
      return Response.error();
    })
  );
});
