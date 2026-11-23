import { formatDistanceToNowStrict } from "date-fns";
import type { ApiErrorBody } from "@/app/types/api/common";

/* -------------------------------------- Config -------------------------------------- */

// กำหนดข้อความตอนถูกเครื่องอื่นเตะออก (1 บัญชีใช้ได้ 1 เครื่อง)
export const SESSION_REPLACED_MESSAGE = "You were signed out because your account was signed in on another device";

// กำหนด ERROR_MESSAGES ข้อความที่อ่านเข้าใจง่ายกว่าของ backend (code อื่นใช้ message จาก backend)
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: "Your session has expired. Please log in again",
  TOKEN_EXPIRED: "Your session has expired. Please log in again",
  INVALID_REFRESH_TOKEN: "Your session has expired. Please log in again",
  SESSION_REPLACED: SESSION_REPLACED_MESSAGE,
  RATE_LIMITED: "Too many requests. Please wait a minute and try again",
};

/* -------------------------------------- Functions -------------------------------------- */

// Class error จาก API (status ไม่ใช่ 2xx) — body คือ JSON ที่ backend ตอบ
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody | undefined,
  ) {
    super(body?.message ?? `HTTP ${status}`);
  }
}

// Function แปลง error (จาก apiFetch หรืออื่นๆ) เป็นข้อความสำหรับแสดงผล
export function getErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") return "The server took too long to respond. Please try again";
  if (error instanceof TypeError) return "Unable to connect to the server";
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : "Something went wrong";

  const body = error.body;

  // ถ้าไม่มี code ใน body (เช่น Route Handler ต่อ backend ไม่ได้ จะตอบ 5xx โดยไม่มี body) ให้แสดงข้อความตาม status
  if (!body?.code) {
    if (error.status >= 500) return `The server is unavailable. Please try again later (HTTP ${error.status})`;
    return `Something went wrong (HTTP ${error.status})`;
  }

  // ถ้า ACCOUNT_LOCKED และมี locked_until ให้แสดงเวลาที่เหลือจนกว่าจะปลดล็อก
  if (body.code === "ACCOUNT_LOCKED" && body.locked_until) {
    const remaining = formatDistanceToNowStrict(new Date(body.locked_until));
    return `This account is temporarily locked after too many failed login attempts. Try again in ${remaining}`;
  }

  // ถ้า VALIDATION_ERROR และมี validation_errors ให้รวมข้อความของแต่ละ field เป็น string เดียว
  if (body.code === "VALIDATION_ERROR" && body.validation_errors?.length) {
    return body.validation_errors.map((item) => (item.field ? `${item.field}: ${item.message}` : item.message)).join(", ");
  }

  // Return ข้อความจาก ERROR_MESSAGES (ถ้ามี) หรือ message จาก backend (ถ้าไม่มีใน ERROR_MESSAGES)
  return ERROR_MESSAGES[body.code] ?? body.message;
}
