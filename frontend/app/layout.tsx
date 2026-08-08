import type { Metadata } from "next";
import { Jersey_25, Inter } from "next/font/google";
import "./globals.css";

const jersey = Jersey_25({ weight: "400", subsets: ["latin"], variable: "--font-jersey" });
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "NEBULA",
  description: "Социальная сеть",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${jersey.variable} ${inter.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}