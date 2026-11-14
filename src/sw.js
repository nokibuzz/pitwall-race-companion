const CACHE = 'pitwall-history-v5';
const ASSETS = ['./', './index.html', './style.css', './race-theme.css', './simple.css', './history.css', './race-car.svg', './app.mjs', './calendar.mjs', './form.mjs', './review.mjs', './strategy.mjs', './calendar.json', './history.json', './form.json', './favicon.svg', './favicon-32.png', './apple-touch-icon.png', './manifest.webmanifest', './flag-icon-192.png', './flag-icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(ASSETS.map(async (asset) => {
      const response = await fetch(asset, { cache: 'reload' });
      if (response.ok && new URL(response.url).origin === self.location.origin) await cache.put(asset, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if ((key.startsWith('pitwall-public-demo-') || key.startsWith('pitwall-history-')) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!ASSETS.some((asset) => new URL(asset, self.registration.scope).pathname === url.pathname)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && new URL(response.url).origin === self.location.origin) {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      return (await caches.match(event.request)) || Response.error();
    }
  })());
});
