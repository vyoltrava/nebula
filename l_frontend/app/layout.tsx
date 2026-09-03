import type { Metadata, Viewport } from "next";
import { Jersey_25, Inter } from "next/font/google";
import { BanOverlay } from "@/components/BanOverlay";
import { AuthGuard } from "@/components/AuthGuard";
import { WebSocketProvider } from "@/components/WebSocketProvider";
import { GlobalPlayerProvider } from "@/components/GlobalPlayer";
import { UnreadCountsProvider } from "@/lib/UnreadCountsContext";
import SplashScreen from "@/components/SplashScreen";
import { ShellSwitcherGate } from "@/components/ShellSwitcherGate";
import { NebulaGate } from "@/components/NebulaGate";
import {PermissionGate} from "@/components/PermissionGate";
import PWARegister from "@/components/PWARegister";
import InstallPrompt from "@/components/InstallPrompt";
import ConnectionStatus from "@/components/ConnectionStatus";
import { NotificationPermissionPrompt } from "@/components/NotificationPermissionPrompt";
import { IconThemeInit } from "@/components/IconThemeInit";
import { AppUpdateChecker } from "@/components/AppUpdateChecker";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { ThemeModeProvider } from "@/components/ThemeModeProvider";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { AuthProvider } from "@/lib/AuthProvider";
import { ZuneThemeProvider } from "@/themes/zune";
import "@/themes/zune/styles/index.css";
import { IosThemeProvider } from "@/themes/ios";
import "@/themes/ios/styles/index.css";
import "./globals.css";
import OrbitOnboardingGate from "@/components/OrbitOnboardingGate";


const jersey = Jersey_25({ weight: "400", subsets: ["latin"], variable: "--font-jersey" });
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  applicationName: "trelod",
  title: "trelod",
  description: "Социальная сеть",
  keywords: ["trelod", "nebula", "социальная сеть", "мессенджер"],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/pwa/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
    ],
                apple: "/apple-touch-icon.png?v=3",
  },
  // Полный манифест лежит в public/manifest.json (иконки генерирует scripts/generate-icons.mjs)
  manifest: "/manifest.json",
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
    "apple-mobile-web-app-title": "trelod",
  },
};

/* 🟣 Анти-FOUC для Zune-темы: применяем класс до первой отрисовки.
   Читаем новый ключ и легаси-ключ. Если смена оболочек выключена
   (кэш флага "0" — темы в разработке), предпочтения сбрасываются
   в классику ещё до первой отрисовки. */
const zuneNoFlashScript = `try{if(localStorage.getItem("shell-switcher-enabled")==="0"){localStorage.removeItem("zune-theme-preference");localStorage.removeItem("theme-preference");localStorage.removeItem("ios-theme-preference")}var k=localStorage.getItem("zune-theme-preference")||localStorage.getItem("theme-preference");if(k==="zune")document.body.classList.add("zune-theme")}catch(e){}`;

/* 🟢 Анти-FOUC для iOS-темы: применяем класс до первой отрисовки.
   Если выбрана Old iOS — вешаем ios-theme (и снимаем zune-theme, чтобы они
   не конфликтовали до загрузки JS). При выключенной смене оболочек —
   сброс всех предпочтений в классику до первой отрисовки. */
const iosNoFlashScript = `try{if(localStorage.getItem("shell-switcher-enabled")==="0"){localStorage.removeItem("ios-theme-preference");localStorage.removeItem("zune-theme-preference");localStorage.removeItem("theme-preference")}var k=localStorage.getItem("ios-theme-preference");if(k==="ios"){document.body.classList.add("ios-theme");document.body.classList.remove("zune-theme")}}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={`${jersey.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes feed-ripple-anim {
            0% { transform: scale(1); opacity: 0.8; }
            100% { transform: scale(1.6); opacity: 0; }
          }
          .feed-ripple {
            animation: feed-ripple-anim 2s cubic-bezier(0, 0.2, 0.8, 1) infinite;
          }
          .feed-ripple-delay {
            animation: feed-ripple-anim 2s cubic-bezier(0, 0.2, 0.8, 1) infinite;
            animation-delay: 1s;
          }
        `}} />
      </head>
      <body className="font-sans">
        <script dangerouslySetInnerHTML={{ __html: zuneNoFlashScript }} />
        <script dangerouslySetInnerHTML={{ __html: iosNoFlashScript }} />
        <ThemeModeProvider>
        <AuthProvider>
        <ZuneThemeProvider>
        <IosThemeProvider>
        <ThemeProvider>
        <LanguageProvider>
        <AnimatedBackground />
        <GlobalPlayerProvider>
        <PWARegister />
        <IconThemeInit />
        <InstallPrompt />
        <ConnectionStatus />
        <AppUpdateChecker />
        <SplashScreen />
        <ShellSwitcherGate />
        <NebulaGate />
        <NotificationPermissionPrompt />
        <WebSocketProvider>
            <UnreadCountsProvider>
              <PermissionGate />
              {children}
            </UnreadCountsProvider>
            <BanOverlay />
        </WebSocketProvider>
        </GlobalPlayerProvider>
        </LanguageProvider>
        </ThemeProvider>
        </IosThemeProvider>
        </ZuneThemeProvider>
        </AuthProvider>
        </ThemeModeProvider>
      <OrbitOnboardingGate />
      </body>
    </html>
  );
}