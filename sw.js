const CACHE_NAME = 'aurora-audio-pwa-v2';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.svg', './icon-512.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const isNavigation = event.request.mode === 'navigate';
  event.respondWith((isNavigation ? fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
    return response;
  }).catch(() => caches.match('./index.html')) : caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html')))));
});
