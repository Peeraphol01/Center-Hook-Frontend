import type { NextConfig } from "next";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด API_URL ของ backend (center-hook) — ใช้ตอน build จึงต้องมีใน .env ก่อนรัน dev / build
const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL is not set in .env");

// กำหนด API_PATHS กลุ่ม path ของ backend ที่หน้าเว็บเรียกได้ (ไม่เปิด /api/line/* ที่ใช้กับ LINE และ project)
const API_PATHS = "auth|admins|webhooks|forward-logs|dashboard|audit-logs";

const nextConfig: NextConfig = {
  // ส่งต่อ /api/<API_PATHS>/... ไป backend ตรงๆ (header เช่น authorization, x-forwarded-for ส่งไปตามเดิม)
  async rewrites() {
    return [{ source: `/api/:group(${API_PATHS})/:path*`, destination: `${API_URL}/api/:group/:path*` }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // รอ backend ได้นานเท่ากับ timeout ของ apiFetch (ค่าเริ่มต้น 30 วินาที ไม่พอตอน backend cold start)
    proxyTimeout: 75_000,
    instantInsights: {
      // ตรวจ instant navigation เฉพาะหน้าที่ประกาศ `export const instant` เอง
      // (ค่าเริ่มต้นตรวจทุกหน้า แต่ทุกหน้าในเว็บนี้รอ AuthGuard เช็ก login ฝั่ง browser ก่อน จึงเตือน dropped segment ตลอด)
      validationLevel: "manual-warning",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
