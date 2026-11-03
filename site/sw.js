// The playable game no longer lives on this site: it is a paid app on Google
// Play. Browsers that installed the old offline copy run its service worker,
// which would keep serving the cached game. This replacement takes over,
// deletes every cache, unregisters itself and reloads open tabs, so they show
// the store page instead.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) {
      client.navigate(client.url);
    }
  })());
});
