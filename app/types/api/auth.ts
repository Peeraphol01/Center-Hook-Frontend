// /api/auth — บัญชี สิทธิ์ และ token

export type Role = "owner" | "manager" | "admin";

export type AccountStatus = "active" | "inactive";

export type Permission =
  | "forward_logs:read"
  | "webhooks:read"
  | "webhooks:create"
  | "webhooks:update"
  | "webhooks:delete"
  | "admins:read"
  | "admins:create"
  | "admins:update"
  | "admins:delete"
  | "audit_logs:read";

export interface Account {
  id: number;
  username: string;
  role: Role;
  status: AccountStatus;
  full_name: string;
  locked_until: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface AccountWithPermissions extends Account {
  permissions: Permission[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
}

export interface LoginResponse extends TokenResponse {
  profile: AccountWithPermissions;
}

export interface LoginBody {
  username: string;
  password: string;
  // true = ยืนยันเตะเครื่องเดิมออก (ส่งหลังได้ 409 ACTIVE_ON_OTHER_DEVICE)
  replace_session?: boolean;
}

// ข้อมูลเครื่องที่บัญชีใช้งานอยู่ (มากับ 409 ACTIVE_ON_OTHER_DEVICE)
export interface OtherDevice {
  user_agent: string | null;
  ip_address: string | null;
  last_active_at: string;
}

// body ที่ Route Handler POST /api/auth/login ตอบหน้าเว็บ (token อยู่ในคุกกี้ httpOnly ไม่ส่งมาใน body)
export interface SessionResponse {
  profile: AccountWithPermissions;
}

// ข้อมูล login ที่เก็บใน memory (app/lib/auth.tsx) — ไม่เก็บใน storage, เปิดหน้าใหม่โหลดจาก /api/auth/me
export interface AuthState {
  profile: AccountWithPermissions | null;
  // เหตุผลที่ถูกพากลับหน้า login (แสดงที่หน้า login จนกว่าจะ login ใหม่)
  signOutReason: string | null;
  setProfile: (profile: AccountWithPermissions) => void;
  clear: (reason?: string) => void;
}

// body ของ PATCH /api/auth/me/password (รหัสใหม่ 8-128 ตัว และต้องไม่ซ้ำรหัสเดิม)
export interface ChangePasswordBody {
  current_password: string;
  new_password: string;
}
