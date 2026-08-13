const CACHE_NAME = 'messenger-cache-v1';
const urlsToCache = ['/', '/logo-icon.svg', '/apple-touch-icon.png', '/default-avatar.svg'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // ✅ Кэшируем по одному: один 404 больше не убивает установку
      Promise.allSettled(urlsToCache.map((url) => cache.add(url)))
    )
  );
});

// 2. Активация и зачистка старого кэша
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Берем контроль над всеми открытыми вкладками сразу
});

// 3. Перехват сетевых запросов (Стратегия Network First)
self.addEventListener('fetch', (event) => {
  // Кэшируем только GET запросы
  if (event.request.method !== 'GET') return;

  // ❌ ВАЖНО: Не кэшируем запросы к твоему Python-бэкенду и WebSocket!
  // Замени 'api' на префикс твоего бэкенда, если он другой
  if (event.request.url.includes('/api/') || event.request.url.includes('ws://') || event.request.url.includes('wss://')) {
    return; 
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Если ответ успешный, сохраняем его копию в кэш
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Если интернет пропал, пытаемся достать из кэша
        return caches.match(event.request).then((response) => {
          return response || caches.match('/');
        });
      })
  );
});


// frontend/public/sw.js
const CACHE_NAME = 'messenger-cache-v1';

// Что кэшируем сразу при установке (база для оффлайна)
const urlsToCache = [
  '/',
  '/logo-icon.svg',
  '/apple-touch-icon.png',
  '/default-avatar.svg'
];

// 1. Установка воркера
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

// 2. Активация и зачистка старого кэша
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Перехват сетевых запросов (Стратегия Network First)
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
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((response) => {
          return response || caches.match('/');
        });
      })
  );
});

// ============================================================
// 🆕 4. PUSH-УВЕДОМЛЕНИЯ (добавил)
// ============================================================

// 4.1. Получение пуша с сервера — парсим JSON и показываем системное уведомление
self.addEventListener('push', (event) => {
  let data = { title: 'trelod', body: 'Новое уведомление', url: '/' };
  
  // Парсим payload из push-события (бэк шлёт JSON: {title, body, url})
  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch (e) {
      // Если не JSON — берём как plain text
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: '/logo-icon.svg',            // иконка в уведомлении
    badge: '/logo-icon.svg',           // маленькая иконка в статус-баре (Android)
    tag: 'trelod-' + (data.url || 'default'),  // тэг — чтобы одинаковые уведомления не дублировались
    data: { url: data.url || '/' },    // пробрасываем URL в клик
    vibrate: [200, 100, 200],          // вибрация на мобилке
    actions: [
      { action: 'open', title: 'Открыть' },
      { action: 'close', title: 'Закрыть' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 4.2. Клик по уведомлению — фокусируем/открываем нужную вкладку
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Игнорируем кнопку "Закрыть"
  if (event.action === 'close') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  const fullUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Ищем уже открытую вкладку с тем же origin
        const existingClient = clients.find(
          (c) => 'focus' in c && c.url.startsWith(self.location.origin)
        );
        
        if (existingClient) {
          // Вкладка есть — фокусируем и переходим на нужный URL
          if ('navigate' in existingClient) {
            existingClient.navigate(fullUrl);
          }
          return existingClient.focus();
        }
        
        // Вкладки нет — открываем новую
        return self.clients.openWindow(fullUrl);
      })
  );
});

// 4.3. Закрытие уведомления (для кнопок действия)
self.addEventListener('notificationclose', (event) => {
  // Можно добавить аналитику: "пользователь закрыл, не открыв"
  // Например, отправить событие на бэк
});