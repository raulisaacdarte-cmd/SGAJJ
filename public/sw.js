const CACHE_NAME = 'sgajj-ajj-v1';
const SHELL_ASSETS = ['/', '/instalar', '/adesao', '/voz-juridica', '/verificar', '/pwa-192x192.png', '/pwa-512x512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'SGAJJ — AJJ', body: 'Nova atualização institucional.' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'SGAJJ — AJJ', {
      body: data.body || 'Tem uma nova notificação institucional.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
    })
  );
});
