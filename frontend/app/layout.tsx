import type { Metadata } from "next";
import { Jersey_25, Inter } from "next/font/google";
import { BanOverlay } from "@/components/BanOverlay";
import { AuthGuard } from "@/components/AuthGuard";
import { WebSocketProvider } from "@/components/WebSocketProvider";
import { UnreadCountsProvider } from "@/lib/UnreadCountsContext"; // 🆕
import "./globals.css";

const jersey = Jersey_25({ weight: "400", subsets: ["latin"], variable: "--font-jersey" });
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "NEBULA v 0.6",
  description: "Социальная сеть",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${jersey.variable} ${inter.variable}`}>
      <body className="font-sans">
        <AuthGuard>
          <WebSocketProvider>
            <UnreadCountsProvider>  {/* 🆕 Обёртка для счётчиков */}
              {children}
            </UnreadCountsProvider>
          </WebSocketProvider>
          <BanOverlay />
        </AuthGuard>
      </body>
    </html>
  );
}