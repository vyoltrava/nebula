const CACHE_NAME = 'messenger-cache-v1';
const urlsToCache = ['/', '/logo-icon.svg', '/apple-touch-icon.png', '/default-avatar.svg'];

// 1. Установка — устойчива к 404 (один битый файл не ломает SW)
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(urlsToCache.map((url) => cache.add(url).catch(() => {})))
    )
  );
});

// 2. Активация — чистим старый кэш
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      )
    )
  );
  self.clients.claim();
});

// 3. Fetch — Network First
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/') ||
      event.request.url.includes('ws://') ||
      event.request.url.includes('wss://')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('/')))
  );
});

// 4. Push-уведомления
self.addEventListener('push', (event) => {
  let data = { title: 'trelod', body: 'Новое уведомление', url: '/' };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch {}
  }
  const options = {
    body: data.body,
    icon: '/logo-icon.svg',
    badge: '/logo-icon.svg',
    tag: 'trelod-' + (data.url || 'default'),
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open', title: 'Открыть' },
      { action: 'close', title: 'Закрыть' },
    ],
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// 5. Клик по уведомлению
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  const fullUrl = new URL(targetUrl, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => 'focus' in c && c.url.startsWith(self.location.origin));
      if (existing) {
        if ('navigate' in existing) existing.navigate(fullUrl);
        return existing.focus();
      }
      return self.clients.openWindow(fullUrl);
    })
  );
});

self.addEventListener('notificationclose', () => {});