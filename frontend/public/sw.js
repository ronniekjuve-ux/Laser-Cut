const CACHE_VERSION = '2026-07-14-v1';
const CACHE_NAME = `lasercut-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Never cache API calls, auth, websocket, or admin pages
  if (event.request.url.includes('/api/') ||
      event.request.url.includes('/auth/') ||
      event.request.url.includes('/ws/') ||
      event.request.url.includes('/admin/')) {
    return;
  }

  // Network-first for HTML pages
  if (event.request.mode === 'navigate' ||
      event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request).then(response => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      }).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Always network-first for JS and CSS
  const url = new URL(event.request.url);
  if (event.request.method === 'GET' && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Cache-first for other static assets (images, icons, fonts)
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(response => {
        if (response) return response;
        return fetch(event.request).then(fetchResponse => {
          if (fetchResponse && fetchResponse.status === 200) {
            const responseClone = fetchResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return fetchResponse;
        });
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_AND_RELOAD') {
    caches.keys().then(names =>
      Promise.all(names.map(n => caches.delete(n)))
    ).then(() =>
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'CACHE_CLEARED' }));
      })
    );
  }
});
