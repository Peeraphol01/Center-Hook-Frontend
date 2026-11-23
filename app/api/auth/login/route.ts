import { NextResponse, type NextRequest } from "next/server";
import { backendFetch, readDeviceId, setAuthCookies, setDeviceCookie } from "@/app/lib/auth-cookies";
import type { LoginResponse, SessionResponse } from "@/app/types/api/auth";

/* -------------------------------------- Functions -------------------------------------- */

// POST /api/auth/login — login ที่ backend แล้วเก็บ token ลงคุกกี้ httpOnly ตอบกลับเฉพาะ profile (ไม่ส่ง token ให้ JavaScript)
// แนบรหัสเครื่องจากคุกกี้ ch_device เสมอ (ทับค่าที่ browser ส่งมาเอง) — backend ใช้บังคับ 1 บัญชี 1 เครื่อง
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  const { deviceId, isNew } = readDeviceId(request);
  const res = await backendFetch(request, "/api/auth/login", { body: body && typeof body === "object" ? { ...body, device_id: deviceId } : body });
  const data = await res.json().catch(() => undefined);

  let response: NextResponse;
  if (res.ok) {
    const { profile, ...tokens } = data as LoginResponse;
    response = NextResponse.json({ profile } satisfies SessionResponse);
    setAuthCookies(response, tokens);
  } else {
    // error (รหัสผิด, บัญชีถูกล็อก, ใช้อยู่บนเครื่องอื่น ฯลฯ) ส่งต่อ status และ body ของ backend ตามเดิม
    response = NextResponse.json(data ?? null, { status: res.status });
  }

  if (isNew) setDeviceCookie(response, deviceId);
  return response;
}
