import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// 🛡️ CSP: connect-src только для доверенных API/WS-хостов (можно расширить через env)
const apiHost = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_API_URL || "").host; } catch { return ""; }
})();
const connectSrc = [
  "'self'",
  apiHost ? `https://${apiHost}` : "https:",
  apiHost ? `wss://${apiHost}` : "wss:",
].join(" ");

const nextConfig: NextConfig = {
  transpilePackages: ["@noble/curves", "@noble/ciphers"],
  // 🖼 Оптимизация изображений: разрешаем внешние источники (аватары Cloudinary/Google,
  // медиа с backend). '*' внизу — чтобы не сломать кастомные домены медиа-хранилища.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "lh4.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "lh5.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "lh6.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "**" },
    ],
  },
  compiler: {
    // 🚀 Убираем console.log/warn в production-бандле (console.error оставляем)
    removeConsole: isDev ? false : { exclude: ["error"] },
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  },

  async rewrites() {
    return {
      afterFiles: [
        {
          // Любой путь на корне (кроме существующих страниц) → в профиль
          source: "/:username",
          destination: "/user/:username",
        },
      ],
    };
  },

  // 👇 ДОБАВЛЕНО: Заголовки безопасности для защиты от распространенных атак
  async headers() {
    if (isDev) return [];
    return [
      {
        // Применяем ко всем маршрутам приложения
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload", // Принудительный HTTPS (HSTS)
          },
          {
            key: "X-Frame-Options",
            value: "DENY", // Запрещает встраивание сайта в iframe (защита от Clickjacking)
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff", // Запрещает браузеру угадывать MIME-тип файлов
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block", // Базовая защита от XSS (устаревает, но сканеры её любят)
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin", // Контролирует передачу URL в заголовке Referer
          },
          {
            key: "Permissions-Policy",
            value: "camera=self, microphone=self, geolocation=()", // камера и микрофон разрешены на своём домене
          },
          // Content-Security-Policy. Настроен под Next.js (RSC + инлайновые стили).
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src ${connectSrc}; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'`,
          },
        ],
      },
      // SW всегда должен проверять обновления — не кэшируем на HTTP-уровне
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // Манифест — свежий, но без жёсткого no-store
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      // Иконки PWA и offline-страница — кэшируем надолго
      {
        source: "/pwa/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      // Иконка apple-touch-icon — НЕ кэшировать, чтобы iOS всегда брало актуальную
      {
        source: "/apple-touch-icon.png",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
      // Собранная статика Next.js — хэшированные имена, кэшируем навсегда
      {
        source: "/_next/static/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;