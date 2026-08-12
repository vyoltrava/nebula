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
  self.skipWaiting(); // Заставляем новый SW сразу активироваться, не дожидаясь закрытия старых вкладок
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