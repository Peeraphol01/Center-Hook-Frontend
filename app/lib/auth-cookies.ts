// ใช้ฝั่ง server เท่านั้น (Route Handler /api/auth/* และ proxy.ts) — token อยู่ในคุกกี้ httpOnly ที่ JavaScript ฝั่ง browser อ่านไม่ได้
import type { NextRequest, NextResponse } from "next/server";
import type { TokenResponse } from "@/app/types/api/auth";
import { applyClientIpHeaders } from "@/app/lib/client-ip";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด API_URL ของ backend (center-hook)
export const API_URL = process.env.NEXT_PUBLIC_API_URL;

// กำหนดชื่อคุกกี้ — access ส่งไปทุก /api/*, refresh ส่งไปเฉพาะ /api/auth/refresh
export const ACCESS_COOKIE = "ch_access";
export const REFRESH_COOKIE = "ch_refresh";
const REFRESH_PATH = "/api/auth/refresh";

// กำหนดคุกกี้รหัสเครื่อง (1 บัญชีใช้ได้ 1 เครื่อง) — ส่งไปเฉพาะตอน login อายุ 1 ปี
const DEVICE_COOKIE = "ch_device";
const DEVICE_PATH = "/api/auth/login";
const DEVICE_MAX_AGE = 365 * 24 * 60 * 60;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

// กำหนดอายุคุกกี้สำรอง (วินาที) กรณีอ่าน exp จาก refresh token ไม่ได้ — ตรงกับค่า default ของ backend (24h)
const FALLBACK_MAX_AGE = 24 * 60 * 60;

const BASE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
} as const;

/* -------------------------------------- Functions -------------------------------------- */

// Function อ่านอายุที่เหลือ (วินาที) จาก exp ของ JWT (ไม่ตรวจลายเซ็น ใช้กำหนดอายุคุกกี้เท่านั้น — backend ตรวจเอง)
function secondsUntilExpiry(token: string) {
  try {
    const { exp } = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { exp?: number };
    if (typeof exp === "number") return Math.max(0, exp - Math.floor(Date.now() / 1000));
  } catch {}
  return FALLBACK_MAX_AGE;
}

// Function เก็บ token ชุดใหม่ลงคุกกี้
// ทั้ง 2 คุกกี้หมดอายุพร้อม refresh token — access ที่หมดอายุแล้วยังถูกส่งไป ให้ backend ตอบ TOKEN_EXPIRED แล้ว client ไป refresh ต่อ
export function setAuthCookies(response: NextResponse, { access_token, refresh_token }: TokenResponse) {
  const maxAge = secondsUntilExpiry(refresh_token);
  response.cookies.set(ACCESS_COOKIE, access_token, { ...BASE_OPTIONS, path: "/", maxAge });
  response.cookies.set(REFRESH_COOKIE, refresh_token, { ...BASE_OPTIONS, path: REFRESH_PATH, maxAge });
}

// Function อ่านรหัสเครื่องจากคุกกี้ ไม่มี / ผิดรูปสร้างใหม่ (isNew = ต้อง set คุกกี้กลับไป)
export function readDeviceId(request: NextRequest) {
  const current = request.cookies.get(DEVICE_COOKIE)?.value;
  if (current && DEVICE_ID_PATTERN.test(current)) return { deviceId: current, isNew: false };
  return { deviceId: crypto.randomUUID(), isNew: true };
}

// Function เก็บรหัสเครื่องลงคุกกี้ (ลบคุกกี้ token ตอน logout แต่ไม่ลบอันนี้ — เครื่องเดิมต้องจำได้ว่าเป็นเครื่องเดิม)
export function setDeviceCookie(response: NextResponse, deviceId: string) {
  response.cookies.set(DEVICE_COOKIE, deviceId, { ...BASE_OPTIONS, sameSite: "strict", path: DEVICE_PATH, maxAge: DEVICE_MAX_AGE });
}

// Function ลบคุกกี้ token ทั้งหมด (path ต้องตรงกับตอน set ถึงจะลบได้)
export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", { ...BASE_OPTIONS, path: "/", maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...BASE_OPTIONS, path: REFRESH_PATH, maxAge: 0 });
}

// Function ส่ง request ไป backend พร้อม header ที่ backend ใช้ (IP / user-agent สำหรับบันทึก session)
export function backendFetch(request: NextRequest, path: string, init: { body?: unknown; token?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  for (const name of ["user-agent", "x-forwarded-for"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  applyClientIpHeaders(request, headers);

  return fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(75_000),
  });
}
