// /api/audit-logs — ประวัติการใช้งานและสรุปความผิดปกติ (อ้างอิง center-hook audit.types.ts)

export type AuditAction =
  | "auth.login.success"
  | "auth.login.failed"
  | "auth.login.new_ip"
  | "auth.login.blocked"
  | "auth.login.device_conflict"
  | "auth.session.replaced"
  | "auth.account.locked"
  | "auth.logout"
  | "auth.refresh.success"
  | "auth.refresh.failed"
  | "auth.refresh.reuse_detected"
  | "auth.password.changed"
  | "auth.password.change_failed"
  | "admin.create"
  | "admin.update"
  | "admin.delete"
  | "webhook.create"
  | "webhook.update"
  | "webhook.delete"
  | "access.denied"
  | "security.ip_blocked"
  | "security.brute_force_suspected"
  | "line.webhook.invalid_signature"
  | "line.push.unauthorized";

export type AuditResult = "success" | "failure" | "denied";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditLog {
  // BIGINT ส่งมาเป็น string
  id: string;
  occurred_at: string;
  action: AuditAction;
  result: AuditResult;
  severity: AuditSeverity;
  actor_account_id: number | null;
  actor_username: string | null;
  session_id: number | null;
  target_type: string | null;
  target_id: string | null;
  ip_address: string | null;
  // ตำแหน่งโดยประมาณของ IP จาก backend (MaxMind GeoLite2) ประเทศเป็น ISO 3166-1 alpha-2 เช่น TH — null = หาไม่เจอ (IP ภายใน / localhost)
  geo_country: string | null;
  geo_city: string | null;
  user_agent: string | null;
  request_id: string | null;
  method: string | null;
  path: string | null;
  // เช่น { before, after } ของการแก้ไข หรือ { reason } ของ login ผิด
  metadata: Record<string, unknown> | null;
}

// query ของ GET /api/audit-logs (ค่าว่าง/undefined ไม่ส่ง)
export interface AuditLogQuery {
  page?: number;
  limit?: number;
  action?: AuditAction;
  // ขึ้นต้นด้วย เช่น auth. = ทุกเหตุการณ์ของ login/session
  action_prefix?: string;
  result?: AuditResult;
  severity?: AuditSeverity;
  actor_username?: string;
  ip_address?: string;
  from?: string;
  to?: string;
}

export interface AuditLogListResponse {
  data: AuditLog[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

// GET /api/audit-logs/security-summary?hours=&top=
export interface SecuritySummaryResponse {
  from: string;
  to: string;
  counts_by_action: { action: AuditAction; count: number }[];
  top_failed_login_ips: { ip_address: string; count: number }[];
  top_failed_login_usernames: { username: string; count: number }[];
  top_denied_ips: { ip_address: string; count: number }[];
  recent_alerts: AuditLog[];
}
