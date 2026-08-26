import type { Metadata, Viewport } from "next";
import { Jersey_25, Inter } from "next/font/google";
import { BanOverlay } from "@/components/BanOverlay";
import { AuthGuard } from "@/components/AuthGuard";
import { WebSocketProvider } from "@/components/WebSocketProvider";
import { GlobalPlayerProvider } from "@/components/GlobalPlayer";
import { UnreadCountsProvider } from "@/lib/UnreadCountsContext";
import SplashScreen from "@/components/SplashScreen";
import {PermissionGate} from "@/components/PermissionGate";
import PWARegister from "@/components/PWARegister";
import InstallPrompt from "@/components/InstallPrompt";
import { NotificationPermissionPrompt } from "@/components/NotificationPermissionPrompt";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { ThemeModeProvider } from "@/components/ThemeModeProvider";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { ZuneThemeProvider } from "@/themes/zune";
import "@/themes/zune/styles/index.css";
import "./globals.css";

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

const zuneNoFlashScript = `try{if(localStorage.getItem("theme-preference")==="zune")document.body.classList.add("zune-theme")}catch(e){}`;

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
        <ThemeModeProvider>
        <ZuneThemeProvider>
        <ThemeProvider>
        <LanguageProvider>
        <AnimatedBackground />
        <GlobalPlayerProvider>
        <PWARegister />
        <InstallPrompt />
        <SplashScreen />
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
        </ZuneThemeProvider>
        </ThemeModeProvider>
      </body>
    </html>
  );
}