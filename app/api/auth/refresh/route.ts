import { NextResponse, type NextRequest } from "next/server";
import { backendFetch, clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from "@/app/lib/auth-cookies";
import type { TokenResponse } from "@/app/types/api/auth";

/* -------------------------------------- Functions -------------------------------------- */

// POST /api/auth/refresh — ขอ token ชุดใหม่ด้วย refresh token ในคุกกี้ แล้วเขียนคุกกี้ทับ (สำเร็จตอบ 204)
// refresh ไม่ได้ (ไม่มีคุกกี้, ถูก revoke, หมดอายุ) → ลบคุกกี้แล้วส่ง error ของ backend ต่อ
export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    const response = NextResponse.json(
      { status_code: 401, code: "INVALID_REFRESH_TOKEN", message: "Invalid refresh token." },
      { status: 401 },
    );
    clearAuthCookies(response);
    return response;
  }

  const res = await backendFetch(request, "/api/auth/refresh", { body: { refresh_token: refreshToken } });
  const data = await res.json().catch(() => undefined);

  if (!res.ok) {
    const response = NextResponse.json(data ?? null, { status: res.status });
    // ลบคุกกี้เฉพาะตอน backend ปฏิเสธ token (401) — 5xx / rate limit เก็บไว้ลองใหม่ได้
    if (res.status === 401) clearAuthCookies(response);
    return response;
  }

  const response = new NextResponse(null, { status: 204 });
  setAuthCookies(response, data as TokenResponse);
  return response;
}
