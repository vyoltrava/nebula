import type { Metadata } from "next";
import { Jersey_25, Inter } from "next/font/google";
import { BanOverlay } from "@/components/BanOverlay";
import { AuthGuard } from "@/components/AuthGuard";
import { WebSocketProvider } from "@/components/WebSocketProvider";
import { UnreadCountsProvider } from "@/lib/UnreadCountsContext";
import SplashScreen from "@/components/SplashScreen";
import "./globals.css";

const jersey = Jersey_25({ weight: "400", subsets: ["latin"], variable: "--font-jersey" });
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "trelod",
  description: "Социальная сеть",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  themeColor: "#6366f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${jersey.variable} ${inter.variable}`}>
      <body className="font-sans">
        {/* 🔥 Сплэш ПОД AuthGuard: покажется на ЛЮБОЙ странице, включая /login */}
        <SplashScreen />

        <AuthGuard>
          <WebSocketProvider>
            <UnreadCountsProvider>
              {children}
            </UnreadCountsProvider>
          </WebSocketProvider>
          <BanOverlay />
        </AuthGuard>
      </body>
    </html>
  );
}