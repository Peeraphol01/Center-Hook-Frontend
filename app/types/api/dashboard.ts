// /api/dashboard — สรุป forward log ตามช่วงวัน (อ้างอิง center-hook src/docs/openapi/dashboard.yaml)
import type { ForwardDirection } from "@/app/types/api/forward-logs";

export interface DashboardStatusCounts {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

// query ของ GET /api/dashboard (from/to = YYYY-MM-DD เวลาไทย, ไม่ส่ง to = วันเดียวกับ from)
export interface DashboardQuery {
  from: string;
  to: string;
  project?: string;
}

export interface DashboardResponse {
  // start/end = ขอบเวลา UTC ของช่วง | interval: 1 วัน = hour, มากกว่านั้น = day
  range: { from: string; to: string; timezone: string; interval: "hour" | "day"; start: string; end: string };
  // success_rate / avg_duration_ms = null เมื่อยังไม่มี event ที่ส่งต่อ
  totals: DashboardStatusCounts & {
    success_rate: number | null;
    inbound: number;
    outbound: number;
    active_line_users: number;
    avg_duration_ms: number | null;
  };
  timeseries: (DashboardStatusCounts & { bucket: string })[];
  by_project: (DashboardStatusCounts & { project: string; success_rate: number | null; avg_duration_ms: number | null })[];
  recent_failures: {
    id: number;
    project: string;
    direction: ForwardDirection;
    event_type: string;
    line_user_id: string | null;
    http_status: number | null;
    error_message: string | null;
    created_at: string;
  }[];
}
