const CACHE_PREFIX = 'jhtoolbox-';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((cacheKey) => cacheKey.startsWith(CACHE_PREFIX))
          .map((cacheKey) => caches.delete(cacheKey)),
      );

      await self.registration.unregister();

      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      await Promise.all(clients.map((client) => client.navigate(client.url)));
    })(),
  );
});
