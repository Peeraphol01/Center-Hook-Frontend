import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, backendFetch, clearAuthCookies } from "@/app/lib/auth-cookies";

/* -------------------------------------- Functions -------------------------------------- */

// POST /api/auth/logout — revoke session ที่ backend แล้วลบคุกกี้เสมอ (backend error / ต่อไม่ได้ ก็ลบ)
export async function POST(request: NextRequest) {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const res = token ? await backendFetch(request, "/api/auth/logout", { token }).catch(() => null) : null;
  const data = await res?.json().catch(() => undefined);

  const response = res?.ok ? NextResponse.json(data) : NextResponse.json({ message: "Logged out." });
  clearAuthCookies(response);
  return response;
}
