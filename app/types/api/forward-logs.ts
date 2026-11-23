// /api/forward-logs — log การ forward และแชทที่จัดกลุ่มตาม LINE user (อ้างอิง center-hook src/types/log.types.ts)
export type ForwardDirection = "INBOUND" | "OUTBOUND";

export type ForwardStatus = "SUCCESS" | "FAILED" | "SKIPPED";

export interface ForwardLogSummary {
  id: number;
  direction: ForwardDirection;
  request_id: string;
  webhook_event_id: string | null;
  project: string;
  target_url: string | null;
  line_user_id: string | null;
  event_type: string;
  message_type: string | null;
  content: string | null;
  status: ForwardStatus;
  http_status: number | null;
  error_message: string | null;
  attempts: number;
  duration_ms: number;
  forwarded_at: string | null;
  created_at: string;
}

export interface LineProfile {
  // null = ดึงจาก LINE ไม่ได้ (บล็อก OA, ไม่ใช่เพื่อน, id ไม่ใช่ user/group)
  display_name: string | null;
  picture_url: string | null;
}

export interface ConversationListItem {
  line_user_id: string;
  profile: LineProfile;
  log_count: number;
  last_log: ForwardLogSummary;
}

export interface ConversationListResponse {
  data: ConversationListItem[];
  pagination: { page: number; limit: number; has_more: boolean };
}

export interface ConversationLog extends ForwardLogSummary {
  payload: unknown;
}

export interface ConversationLogsResponse {
  line_user_id: string;
  profile: LineProfile;
  // ใหม่ไปเก่า ส่ง before_id = id ตัวสุดท้ายเพื่อโหลดข้อความก่อนหน้า
  data: ConversationLog[];
  has_more: boolean;
}
