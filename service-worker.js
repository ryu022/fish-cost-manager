const CACHE_NAME = 'fish-cost-manager-v4';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './calc.js',
  './database.js',
  './print.js',
  './config.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isStaticAsset = STATIC_ASSETS.some((asset) => requestUrl.pathname.endsWith(asset.replace('./', '/')));
  const isManifestRequest = requestUrl.pathname.endsWith('/manifest.json');

  if (!isSameOrigin || (!isStaticAsset && !isManifestRequest)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return networkResponse;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
