const CACHE_NAME = 'fish-cost-manager-v6';
const APP_SHELL_ASSETS = [
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

function isCacheableResponse(response) {
  return response && response.ok;
}

async function putCache(request, response) {
  if (!isCacheableResponse(response)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function networkFirst(request, fallbackUrl) {
  try {
    const networkResponse = await fetch(request);
    await putCache(request, networkResponse);
    return networkResponse;
  } catch (_error) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    if (fallbackUrl) return cache.match(fallbackUrl);
    return Response.error();
  }
}

function isAppShellRequest(request, requestUrl) {
  if (request.mode === 'navigate') return true;
  return APP_SHELL_ASSETS.some((asset) => requestUrl.pathname.endsWith(asset.replace('./', '/')));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_ASSETS))
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

  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  if (!isSameOrigin) return;
  if (!isAppShellRequest(request, requestUrl)) return;

  const fallbackUrl = request.mode === 'navigate' ? './index.html' : undefined;
  event.respondWith(networkFirst(request, fallbackUrl));
});
