import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@noble/curves", "@noble/ciphers"],

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
          // ⚠️ Content-Security-Policy (CSP) часто ломает внешние скрипты/шрифты/картинки.
          // Раскомментируйте и настройте его под себя, если используете внешние ресурсы (аналитика, шрифты Google и т.д.)
          // {
          //   key: "Content-Security-Policy",
          //   value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;",
          // },
        ],
      },
    ];
  },
};

export default nextConfig;