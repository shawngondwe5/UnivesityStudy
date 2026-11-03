const CACHE_NAME = 'study-tracker-cache-v2';
const APP_SHELL = ['/index.html', '/manifest.json', '/icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);

    // Cache the built JS and CSS files referenced by Vite's generated HTML.
    // This keeps the application shell usable after the first successful visit.
    const response = await fetch('/index.html', { cache: 'no-cache' });
    if (response.ok) {
      const html = await response.text();
      const assetUrls = [
        ...Array.from(html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g), match => match[1])
      ].filter(url => url.startsWith('/') || url.startsWith(self.location.origin))
        .map(url => new URL(url, self.location.origin).href);
      await Promise.all(assetUrls.map(async url => {
        try {
          const asset = await fetch(url);
          if (asset.ok) await cache.put(url, asset);
        } catch {
          // A failed optional asset fetch should not prevent service-worker install.
        }
      }));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('study-tracker-cache-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache cross-origin requests, API traffic, or browser extensions.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // Cache-first for same-origin build assets only. Do not return index.html for
  // missing scripts, stylesheets, PDF workers, or other non-navigation requests.
  if (['script', 'style', 'worker', 'font', 'image'].includes(request.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return Response.error();
      }
    })());
  }
});
