// AUTO-ELIMINADOR.
// La app ya NO usa service worker. Este archivo solo existe para limpiar los
// que quedaron registrados en dispositivos viejos: borra toda la caché, se
// desregistra y recarga la página. A partir de ahí la app carga siempre fresca
// de internet (como cualquier web), y NUNCA se queda pegada ni en blanco.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
    const wins = await self.clients.matchAll({ type: 'window' });
    wins.forEach(c => { try { c.navigate(c.url); } catch (_) {} });
  })());
});
// Sin manejador 'fetch': todas las peticiones van directo a la red.
