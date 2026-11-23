// app/page-ui/log/page.tsx

// ข้อความ LINE ที่แปลงแล้วสำหรับแสดงในแชท (ยังไม่มี source)
export type ChatPartBody =
  | { kind: "text"; text: string }
  | { kind: "sticker"; url: string }
  | { kind: "image"; url: string | null }
  | { kind: "media"; label: string }
  | { kind: "flex"; contents: Json }
  | { kind: "template"; template: Json }
  | { kind: "card"; type: string; altText: string }
  | { kind: "postback"; data: string; params?: string };

// ข้อความที่แสดงในแชท + source = JSON ต้นฉบับของข้อความนั้น (แสดงใน popup ตอนคลิก)
export type ChatPart = ChatPartBody & { source: unknown };

export type ChatContent = { kind: "system"; text: string; source: unknown } | { kind: "bubble"; parts: ChatPart[] };

// payload จาก LINE (โครงสร้างไม่ตายตัว)
export type Json = Record<string, unknown>;
