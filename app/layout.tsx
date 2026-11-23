import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthGuard from "./lib/auth";
import ThemeProvider from "./lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SMM Center Hook",
  description: "SMM Center Hook by simummung",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning // next-themes เพิ่ม class "dark" / style บน <html> ก่อน React hydrate
    >
      <body className="min-h-full flex flex-col">
        {/* ThemeProvider ธีมสว่าง / มืด — localStorage ถ้ามี ไม่มีก็อิงธีมเบราว์เซอร์ */}
        <ThemeProvider>
          {/* AuthGuard ตรวจ session ทุกหน้า — ยังไม่ login จะถูกพากลับหน้าแรก (Login) */}
          <AuthGuard>{children}</AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  );
}
