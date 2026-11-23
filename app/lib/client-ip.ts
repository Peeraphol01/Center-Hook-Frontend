// ใช้ฝั่ง server เท่านั้น (proxy.ts และ Route Handler /api/auth/*) — บอก IP ผู้ใช้จริงให้ backend
// backend เชื่อ x-client-ip เฉพาะเมื่อ x-proxy-secret ตรงกับ PROXY_SHARED_SECRET ของ backend (ห้ามตั้งเป็น NEXT_PUBLIC_)
import type { NextRequest } from "next/server";

/* -------------------------------------- Config -------------------------------------- */

// กำหนดรหัสลับที่ใช้ร่วมกับ backend (ไม่ตั้ง = ไม่ส่ง backend ใช้ X-Forwarded-For ตามเดิม)
const PROXY_SHARED_SECRET = process.env.PROXY_SHARED_SECRET?.trim() || undefined;

// กำหนดชื่อ header (ค่าที่ browser ส่งมาเองถูกเขียนทับ / ลบทิ้งเสมอ)
const CLIENT_IP_HEADER = "x-client-ip";
const PROXY_SECRET_HEADER = "x-proxy-secret";

/* -------------------------------------- Functions -------------------------------------- */

// Function อ่าน IP ผู้ใช้: ค่าท้ายสุดของ X-Forwarded-For คือ IP ที่ proxy ของ platform hosting เห็นจริง (ค่าทางซ้ายผู้ใช้ใส่มาเองได้)
function readClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",").map((item) => item.trim()).filter(Boolean);
  return forwardedFor?.at(-1) || request.headers.get("x-real-ip")?.trim() || null;
}

// Function ตรวจว่าเป็น IP ภายใน (localhost / วง LAN / ของ proxy ภายใน) ซึ่งไม่ใช่ IP ผู้ใช้จริง
function isInternalIp(ip: string) {
  const v4 = ip.replace(/^::ffff:/i, "");
  return (
    ip === "::1" ||
    /^(127|10)\./.test(v4) ||
    /^192\.168\./.test(v4) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(v4) ||
    /^169\.254\./.test(v4) ||
    /^f[cd]/i.test(ip) ||
    /^fe80:/i.test(ip)
  );
}

// Function ใส่ x-client-ip / x-proxy-secret ลง header ที่จะส่ง backend (ลบค่าที่ browser ปลอมมาก่อนเสมอ)
// อ่านได้เป็น IP ภายใน (เช่น ::1 ตอนรัน dev ในเครื่อง) = ไม่ส่ง ให้ backend อ่าน X-Forwarded-For ตาม TRUST_PROXY_HOPS แทน
export function applyClientIpHeaders(request: NextRequest, headers: Headers) {
  headers.delete(CLIENT_IP_HEADER);
  headers.delete(PROXY_SECRET_HEADER);
  if (!PROXY_SHARED_SECRET) return;

  const ip = readClientIp(request);
  if (!ip || isInternalIp(ip)) return;

  headers.set(CLIENT_IP_HEADER, ip);
  headers.set(PROXY_SECRET_HEADER, PROXY_SHARED_SECRET);
}
