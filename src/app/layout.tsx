/**
 * 根版面：字體、metadata、全站 Providers（Session）。
 */
import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  adjustFontFallback: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  adjustFontFallback: true,
});

const notoSansTc = Noto_Sans_TC({
  variable: "--font-noto-tc",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: {
    default: "倉庫驗收／驗出",
    template: "%s — 倉庫驗收",
  },
  description: "倉庫驗收出貨管理系統",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`h-full antialiased ${geistSans.variable} ${geistMono.variable} ${notoSansTc.variable}`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
