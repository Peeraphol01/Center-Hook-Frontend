// /api/webhooks — ปลายทาง forward ของแต่ละ smm_app (smm_app = ชื่อ project ใน forward log)

export interface Webhook {
  id: number;
  // null = webhook default
  smm_app: string | null;
  webhook_url: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookListResponse {
  data: Webhook[];
}

// body ของ POST /api/webhooks (smm_app: null = webhook default)
export interface CreateWebhookBody {
  smm_app: string | null;
  webhook_url: string;
}

// body ของ PATCH /api/webhooks/:smm_app (ส่งเฉพาะ field ที่เปลี่ยน)
export type UpdateWebhookBody = Partial<CreateWebhookBody>;
