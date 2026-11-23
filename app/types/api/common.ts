// type กลางที่ใช้กับทุก API (body ที่ backend ตอบ) และตัวเลือกของ apiFetch (app/lib/api-fetch.ts)
import type { OtherDevice, Permission } from "@/app/types/api/auth";

// body ที่ backend ตอบเมื่อสำเร็จแต่ไม่มีข้อมูลอื่น
export interface MessageResponse {
  message: string;
}

// body ที่ backend ตอบเมื่อ error (ทุก route)
export interface ApiErrorBody {
  status_code: number;
  code: string;
  message: string;
  request_id?: string;
  validation_errors?: { field: string | null; message: string }[];
  required_permissions?: Permission[];
  permissions?: Permission[];
  locked_until?: string;
  other_device?: OtherDevice;
  retry_after_seconds?: number;
}

// ตัวเลือกของ apiFetch
export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  // ส่งเป็น JSON
  body?: unknown;
  // ต่อเป็น query string (ค่าว่าง/undefined/null ไม่ส่ง)
  params?: object;
}
