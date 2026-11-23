"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด THEME_STORAGE_KEY key ใน localStorage ที่เก็บธีมที่ผู้ใช้เลือก (เก็บถาวร ไม่ล้างตอน logout)
export const THEME_STORAGE_KEY = "center-hook-theme";

/* -------------------------------------- Functions -------------------------------------- */

// Function hook คืนธีมที่ใช้อยู่ (light / dark) และ toggleTheme ไว้สลับธีม — เลือกแล้วเก็บลง localStorage
export function useThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
  return { theme, toggleTheme };
}

// Function ครอบทั้งแอป — ใส่ class "dark" บน <html> ตามค่าใน localStorage ถ้ามี ไม่มีก็อิงธีมเบราว์เซอร์ (next-themes ฝัง script กันจอกระพริบให้)
function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem storageKey={THEME_STORAGE_KEY} disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}

export default ThemeProvider;
