import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE } from "@/app/lib/auth-cookies";
import { applyClientIpHeaders } from "@/app/lib/client-ip";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด SAFE_METHODS method ที่ไม่เปลี่ยนข้อมูล (ไม่ต้องตรวจ Origin)
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const config = {
  matcher: "/api/:path*",
};

/* -------------------------------------- Functions -------------------------------------- */

// Function ทำงานก่อนทุก /api/* — กัน CSRF, แนบ IP ผู้ใช้จริง (x-client-ip) และ access token จากคุกกี้เป็น header Authorization ก่อนส่งต่อ backend (rewrites ใน next.config.ts)
export function proxy(request: NextRequest) {
  // กัน CSRF: คุกกี้ถูกแนบไปกับทุก request อัตโนมัติ จึงรับ request ที่เปลี่ยนข้อมูลเฉพาะที่มาจากหน้าเว็บนี้เอง
  if (!SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.split(",")[0].trim();
    if (!origin || !host || new URL(origin).host !== host) {
      return NextResponse.json({ status_code: 403, code: "FORBIDDEN_ORIGIN", message: "Cross-site request blocked." }, { status: 403 });
    }
  }

  const headers = new Headers(request.headers);
  applyClientIpHeaders(request, headers);

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);
  return NextResponse.next({ request: { headers } });
}
