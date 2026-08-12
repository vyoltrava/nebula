import type { Metadata, Viewport } from "next";
import { Jersey_25, Inter } from "next/font/google";
import { BanOverlay } from "@/components/BanOverlay";
import { AuthGuard } from "@/components/AuthGuard";
import { WebSocketProvider } from "@/components/WebSocketProvider";
import { UnreadCountsProvider } from "@/lib/UnreadCountsContext";
import SplashScreen from "@/components/SplashScreen";
import PWARegister from "@/components/PWARegister";
import InstallPrompt from "@/components/InstallPrompt";
import { NotificationPermissionPrompt } from "@/components/NotificationPermissionPrompt";
import "./globals.css";

const jersey = Jersey_25({ weight: "400", subsets: ["latin"], variable: "--font-jersey" });
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

// 📱 Настройки для мобильных браузеров (цвет статус-бара, масштаб)
export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// 🔍 Метаданные для SEO и PWA
export const metadata: Metadata = {
  title: "trelod",
  description: "Социальная сеть",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "trelod",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={`${jersey.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="font-sans">
        {/* 📱 PWA: Регистрация Service Worker и промпт установки */}
        <PWARegister />
        <InstallPrompt />

        {/* 🔥 Сплэш-скрин (вне AuthGuard, чтобы показываться ДО проверки токена, в т.ч. на /login) */}
        <SplashScreen />

        {/* 🔔 Баннер запроса разрешения на push-уведомления */}
        <NotificationPermissionPrompt />

        {/* 🛡️ Основная обертка приложения */}
        <AuthGuard>
          <WebSocketProvider>
            <UnreadCountsProvider>
              {children}
            </UnreadCountsProvider>
          </WebSocketProvider>
          
          {/* 🚫 Оверлей блокировки (бан) */}
          <BanOverlay />
        </AuthGuard>
      </body>
    </html>
  );
}