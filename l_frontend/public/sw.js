/* ============================================================
 * trelod / Nebula — Service Worker (v2.0.0)
 * ------------------------------------------------------------
 * Стратегии:
 *   - Навигационные запросы       → Network First (fallback: offline.html)
 *   - Статика (CSS/JS/fonts/icons) → Cache First + фоновое обновление
 *   - Изображения                 → Cache First (прогрессивная загрузка)
 *   - API GET к FastAPI           → Network First (fallback: кэш)
 *   - API мутации (POST/PUT/DELETE) → в очередь при офлайне (IndexedDB) + sync
 *   - Обновление SW               → skipWaiting + "SW_UPDATED" клиентам
 *
 * Кэши: precache, shell, api, media, fonts + очередь sync-queue
 * ============================================================ */
"use strict";

var VERSION = "2.0.1"; // 🔥 Bumped для обновления apple-touch-icon и PWA-иконок
var CACHE_PRECACHE = "nebula-precache-v" + VERSION;
var CACHE_SHELL = "nebula-shell-v" + VERSION;
var CACHE_API = "nebula-api-v" + VERSION;
var CACHE_MEDIA = "nebula-media-v" + VERSION;
var CACHE_FONTS = "nebula-fonts-v" + VERSION;

// Критические ресурсы — кэшируются при установке (precache).
// Один битый файл не ломает установку (все Promise оборачиваются в catch).
var PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.json",
  // ❌ apple-touch-icon.png НЕ кэшируем — он обновляется через ?v=
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/maskable-192.png",
  "/pwa/maskable-512.png",
  "/logo-icon.svg",
  "/logo-animation.svg",
  "/default-avatar.svg"
];

function isIgnored(url) {
  return (
    url.protocol === "ws:" ||
    url.protocol === "wss:" ||
    (url.hostname !== self.location.hostname && url.hostname !== "localhost")
  );
}

function isApiMutation(method) {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function isApiPath(url) {
  return url.pathname.indexOf("/api/") === 0;
}

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isImage(url) {
  var ext = url.pathname.split("?")[0].toLowerCase();
  return /\.(png|jpe?g|gif|webp|avif|svg|ico)$/.test(ext);
}

function isFont(url) {
  var ext = url.pathname.split("?")[0].toLowerCase();
  return /\.(woff2?|ttf|otf|eot)$/.test(ext);
}

/* -----------------------------------------------------------
 * УСТАНОВКА
 * ----------------------------------------------------------- */
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_PRECACHE)
      .then(function (cache) {
        return Promise.all(
          PRECACHE_URLS.map(function (url) {
            return cache.add(url).catch(function () {});
          })
        );
      })
      .then(function () {
        self.skipWaiting();
      })
  );
});

/* -----------------------------------------------------------
 * АКТИВАЦИЯ — чистим старые кэши + сообщаем вкладкам об обновлении
 * ----------------------------------------------------------- */
self.addEventListener("activate", function (event) {
  var expected = [CACHE_PRECACHE, CACHE_SHELL, CACHE_API, CACHE_MEDIA, CACHE_FONTS];
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) { return expected.indexOf(key) === -1; })
            .map(function (key) { return caches.delete(key); })
        );
      })
      .then(function () { return self.clients.claim(); })
      .then(function () {
        return self.clients.matchAll({ type: "window" }).then(function (clients) {
          clients.forEach(function (client) {
            client.postMessage({ type: "SW_UPDATED", version: VERSION });
          });
        });
      })
  );
});

/* -----------------------------------------------------------
 * СТРАТЕГИИ КЭШИРОВАНИЯ
 * ----------------------------------------------------------- */
function fromCache(cacheName, request) {
  return caches.match(request).then(function (hit) {
    return hit || Promise.reject(new Error("no-cache"));
  });
}

function staleWhileRevalidate(cacheName, request, opts) {
  opts = opts || {};
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var network = fetch(request)
        .then(function (response) {
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(function () {
          return cached || (opts.fallback && caches.match(opts.fallback)) || Response.error();
        });
      return cached || network;
    });
  });
}

function networkFirst(cacheName, request, opts) {
  opts = opts || {};
  return fetch(request)
    .then(function (response) {
      if (response && response.status === 200 && response.type === "basic") {
        var clone = response.clone();
        caches.open(cacheName).then(function (cache) {
          cache.put(request, clone);
        });
      }
      return response;
    })
    .catch(function () {
      return fromCache(cacheName, request).catch(function () {
        if (opts.fallback) return caches.match(opts.fallback);
        return Response.error();
      });
    });
}

function cacheFirst(cacheName, request) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (hit) {
      var fetchAndCache = function () {
        return fetch(request).then(function (response) {
          if (response && (response.status === 200 || response.type === "opaque")) {
            cache.put(request, response.clone());
          }
          return response;
        });
      };
      return hit || fetchAndCache().catch(function () { return Response.error(); });
    });
  });
}

/* -----------------------------------------------------------
 * ФОНОВАЯ СИНХРОНИЗАЦИЯ (IndexedDB очередь мутаций)
 * ----------------------------------------------------------- */
var DB_NAME = "nebula-sync";
var DB_STORE = "sync-queue";

function openSyncDb() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}

function enqueueRequest(request) {
  var clone = request.clone();
  return clone
    .json()
    .catch(function () { return {}; })
    .then(function (body) {
      var headers = {};
      try {
        request.headers.forEach(function (v, k) { headers[k] = v; });
      } catch (e) { /* noop */ }
      return openSyncDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(DB_STORE, "readwrite");
          tx.objectStore(DB_STORE).add({
            url: request.url,
            method: request.method,
            headers: headers,
            body: body,
            created: Date.now(),
            attempts: 0
          });
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    })
    .then(function () {
      if ("sync" in self.registration) {
        self.registration.sync.register("nebula-flush").catch(function () {});
      }
    });
}

self.addEventListener("sync", function (event) {
  if (event.tag === "nebula-flush") {
    event.waitUntil(flushSyncQueue());
  }
});

function flushSyncQueue() {
  return openSyncDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(DB_STORE, "readwrite");
      var store = tx.objectStore(DB_STORE);
      var all = store.getAll();
      all.onsuccess = function () {
        var items = all.result;
        var chain = Promise.resolve();
        items.forEach(function (item) {
          chain = chain
            .then(function () {
              return fetch(item.url, {
                method: item.method,
                headers: item.headers || { "Content-Type": "application/json" },
                body: JSON.stringify(item.body),
                cache: "no-store"
              });
            })
            .then(function (res) {
              if (res.ok || res.status < 500) {
                store.delete(item.id); // 2xx или 4xx — повторять нет смысла
              }
            })
            .catch(function () {
              item.attempts = (item.attempts || 0) + 1;
              store.put(item);
            });
        });
        chain.then(resolve, reject);
      };
      all.onerror = function () { reject(all.error); };
    });
  });
}

/* -----------------------------------------------------------
 * FETCH — главный обработчик
 * ----------------------------------------------------------- */
self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);

  if (request.method !== "GET" && request.method !== "HEAD") {
    // Мутации (POST/PUT/PATCH/DELETE) с пометкой X-Nebula-Queueable:
    // при офлайне складываем в очередь для фоновой синхронизации.
    if (isApiMutation(request.method) && request.headers.get("X-Nebula-Queueable") === "1") {
      event.respondWith(
        fetch(request).catch(function () {
          return enqueueRequest(request).then(function () {
            return new Response(
              JSON.stringify({ queued: true, method: request.method, url: url.pathname }),
              {
                status: 202,
                headers: { "Content-Type": "application/json" }
              }
            );
          });
        })
      );
    }
    return; // остальные мутации пропускаем мимо SW
  }

  if (isIgnored(url)) return;

  // 1) Навигация (документы) — Network First, fallback offline.html
  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(CACHE_SHELL, request, { fallback: "/offline.html" }));
    return;
  }

  // 2) API GET к FastAPI — Network First, fallback кэш / каркас
  if (isApiPath(url)) {
    event.respondWith(networkFirst(CACHE_API, request, { fallback: "/offline.html" }));
    return;
  }

  // 3) Шрифты — Cache First
  if (isFont(url)) {
    event.respondWith(cacheFirst(CACHE_FONTS, request));
    return;
  }

  // 4) Изображения — Cache First (мгновенный показ из кэша)
  if (isImage(url)) {
    event.respondWith(cacheFirst(CACHE_MEDIA, request));
    return;
  }

  // 5) Собранная статика Next.js — Cache First (хэшированные имена)
  if (url.pathname.indexOf("/_next/static/") === 0) {
    event.respondWith(cacheFirst(CACHE_PRECACHE, request));
    return;
  }

  // 6) Остальное — Stale While Revalidate
  event.respondWith(staleWhileRevalidate(CACHE_SHELL, request));
});

/* -----------------------------------------------------------
 * PUSH-УВЕДОМЛЕНИЯ
 * ----------------------------------------------------------- */
self.addEventListener("push", function (event) {
  var data = { title: "trelod", body: "Новое уведомление", url: "/" };
  if (event.data) {
    try {
      var parsed = event.data.json();
      for (var key in parsed) {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) data[key] = parsed[key];
      }
    } catch (e) { /* битые данные — используем дефолт */ }
  }
  var options = {
    body: data.body || "",
    icon: "/pwa/icon-192.png",
    badge: "/pwa/maskable-192.png",
    tag: "trelod-" + (data.url || "default"),
    data: { url: data.url || "/", date: new Date().toISOString() },
    vibrate: [200, 100, 200],
    renotify: true,
    actions: [
      { action: "open", title: "Открыть" },
      { action: "close", title: "Закрыть" }
    ]
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  if (event.action === "close") return;
  var targetUrl = (event.notification.data && event.notification.data.url) || "/";
  var fullUrl = new URL(targetUrl, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        var client = clients[i];
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(fullUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(fullUrl);
    })
  );
});

/* -----------------------------------------------------------
 * ПЕРИОДИЧЕСКАЯ ФОНОВАЯ СИНХРОНИЗАЦИЯ (где поддерживается)
 * ----------------------------------------------------------- */
self.addEventListener("periodicsync", function (event) {
  if (event.tag === "nebula-periodic-update") {
    event.waitUntil(
      fetch("/health")
        .then(function (r) {
          return caches.open(CACHE_SHELL).then(function (cache) {
            cache.put("/health", r.clone());
          });
        })
        .catch(function () {})
    );
  }
});

/* -----------------------------------------------------------
 * СООБЩЕНИЯ ОТ СТРАНИЦ
 * ----------------------------------------------------------- */
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});