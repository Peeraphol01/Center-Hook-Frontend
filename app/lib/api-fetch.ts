import { useAuthStore } from "@/app/lib/auth";
import { ApiError, SESSION_REPLACED_MESSAGE } from "@/app/lib/errors";
import type { ApiErrorBody, ApiFetchOptions } from "@/app/types/api/common";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด refreshing เก็บ Promise ของการ refresh ที่กำลังทำอยู่ — request ที่ token หมดพร้อมกันจะรอ refresh ครั้งเดียว
// ผลคือ null = refresh สำเร็จ / string = code ของ error (เช่น SESSION_REPLACED)
let refreshing: Promise<string | null> | null = null;

// กำหนดข้อความตอนถูกพากลับหน้า login
const SESSION_EXPIRED = "Your session has expired. Please log in again";
const SESSION_REVOKED = "Your session was revoked (your role/permissions/status changed). Please log in again";

/* -------------------------------------- Functions -------------------------------------- */

// Function ขอ token ใหม่ — Route Handler /api/auth/refresh อ่าน refresh token จากคุกกี้แล้วเขียนคุกกี้ใหม่ให้ (ไม่ผ่าน JavaScript)
// ใช้ Web Locks ให้ทุกแท็บ refresh ทีละแท็บ: backend หมุน refresh token ทุกครั้ง ถ้ายิงพร้อมกันแท็บที่ช้ากว่าจะได้ INVALID_REFRESH_TOKEN
// แท็บที่รอ lock จะส่งคุกกี้ชุดใหม่ที่แท็บก่อนหน้าเพิ่ง set ไป จึง refresh ต่อได้
function refreshTokens() {
  const run = async () => {
    const res = await fetch("/api/auth/refresh", { method: "POST" });
    if (res.ok) return null;
    return ((await res.json().catch(() => undefined)) as ApiErrorBody | undefined)?.code ?? `HTTP_${res.status}`;
  };
  refreshing ??= (navigator.locks ? navigator.locks.request("center-hook-auth-refresh", run) : run()).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// Function เรียก API (คุกกี้ token ถูกแนบไปเอง และ proxy.ts แปลงเป็น header Authorization) และ refresh ให้อัตโนมัติเมื่อหมดอายุ
// status ไม่ใช่ 2xx จะ throw ApiError (refresh ไม่ได้ / session ถูก revoke จะ clear state ก่อน)
export async function apiFetch<T>(path: string, { method = "GET", body, params }: ApiFetchOptions = {}, retried = false): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const url = query.size ? `${path}?${query}` : path;

  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(75_000),
  });

  const data = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (res.ok) return data as T;

  const error = data as ApiErrorBody | undefined;
  if (res.status === 401 && error?.code === "TOKEN_EXPIRED" && !retried) {
    const refreshError = await refreshTokens();
    if (!refreshError) return apiFetch<T>(path, { method, body, params }, true);
    useAuthStore.getState().clear(refreshError === "SESSION_REPLACED" ? SESSION_REPLACED_MESSAGE : SESSION_EXPIRED);
  } else if (res.status === 401 && error?.code === "SESSION_REPLACED") {
    // ถูกเครื่องอื่นเตะออก (1 บัญชี 1 เครื่อง) — แจ้งเหตุผลแม้ยังไม่มี profile (เช่นเปิดหน้าใหม่แล้วโหลด /api/auth/me)
    useAuthStore.getState().clear(SESSION_REPLACED_MESSAGE);
  } else if (res.status === 401 && path !== "/api/auth/login" && useAuthStore.getState().profile) {
    useAuthStore.getState().clear(SESSION_REVOKED);
  }

  throw new ApiError(res.status, error);
}

// Function fetcher ของ SWR — key = [path, params] เรียกผ่าน apiFetch (แนบ token / refresh ให้เอง)
export function swrFetcher<T>([path, params]: [string, object?]) {
  return apiFetch<T>(path, { params });
}
