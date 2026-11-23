# SMM Center Hook Frontend

หน้าเว็บสำหรับผู้ดูแลระบบ [center-hook-backend](../center-hook-backend) (ตัวกลาง LINE OA ที่หลาย project ใช้ร่วมกัน) มีหน้า Dashboard สรุป forward log, ดูแชท/log แยกตาม LINE user, จัดการ webhook ของแต่ละ `smm_app` และจัดการบัญชีผู้ดูแลพร้อมสิทธิ์

## Getting Started

ต้องมี [Bun](https://bun.sh) 1.4.4 และ backend ที่รันอยู่

```bash
bun install
cp .env.example .env    # แล้วแก้ NEXT_PUBLIC_API_URL
bun dev                 # http://localhost:3000
```

| Env | ความหมาย |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL ของ backend ไม่ต้องมี `/` ท้าย เช่น `http://localhost:8080` ใช้ตอนรัน dev / build (ไม่ได้ตั้งไว้ `next.config.ts` จะ throw error) แก้ค่าแล้วต้อง restart / build ใหม่ |
| `PROXY_SHARED_SECRET` | (แนะนำตอน deploy) ค่าเดียวกับ `PROXY_SHARED_SECRET` ของ backend ให้ backend เห็น IP ผู้ใช้จริงแทน IP ของ server frontend เป็นความลับฝั่ง server เท่านั้น **ห้ามใส่ `NEXT_PUBLIC_`** ใช้ตอนรัน (ไม่ต้อง build ใหม่) |

## Scripts

| Command | Description |
| --- | --- |
| `bun dev` | เริ่ม development server |
| `bun run build` | build สำหรับ production |
| `bun start` | รัน build ที่ได้ |
| `bun lint` | ตรวจโค้ดด้วย ESLint |

## How It Works

```
Browser ──apiFetch──► /api/* (rewrites ใน next.config.ts) ──► center-hook-backend
```

- หน้าเว็บเรียก API ผ่าน `apiFetch` เท่านั้น ซึ่งแนบ access token และ refresh token ให้อัตโนมัติเมื่อหมดอายุ
- `rewrites` ใน `next.config.ts` ส่งต่อ `/api/{auth,admins,webhooks,forward-logs,dashboard,audit-logs}/*` ไป backend ตรงๆ พร้อม header เดิม (`/api/line/*` ไม่เปิด) รอได้ 75 วินาที (`proxyTimeout`)
- Token เก็บในคุกกี้ httpOnly ที่ JavaScript อ่านไม่ได้ ทุกแท็บของเบราว์เซอร์เดียวกันใช้ session ร่วมกัน (อยู่ได้จนกว่า refresh token หมดอายุ หรือ logout)
  - `app/api/auth/{login,refresh,logout}/route.ts` คุยกับ backend แล้ว set/ลบคุกกี้ (`ch_access` path `/`, `ch_refresh` path `/api/auth/refresh`)
  - `proxy.ts` แปลงคุกกี้ `ch_access` เป็น header `Authorization: Bearer` ก่อน rewrite ไป backend และบล็อก request ที่เปลี่ยนข้อมูลจาก Origin อื่น (กัน CSRF)
  - `proxy.ts` และ Route Handler แนบ `x-client-ip` (ค่าท้ายสุดของ X-Forwarded-For ที่ platform hosting ใส่ให้) + `x-proxy-secret` ไป backend (`app/lib/client-ip.ts`) ค่าที่ browser ส่ง header 2 ตัวนี้มาเองถูกลบทิ้งเสมอ
- **1 บัญชีใช้ได้ 1 เครื่อง**: `/api/auth/login` สร้างคุกกี้ `ch_device` (รหัสเครื่องสุ่ม httpOnly อายุ 1 ปี path `/api/auth/login` ไม่ลบตอน logout) และแนบเป็น `device_id` ให้ backend
  - บัญชีใช้อยู่บนเครื่องอื่น (409 `ACTIVE_ON_OTHER_DEVICE`) หน้า Login แสดง popup ข้อมูลเครื่องเดิม (browser/OS, IP, ใช้งานล่าสุด) กดยืนยันจึง login ซ้ำพร้อม `replace_session: true`
  - เครื่องเดิมได้ 401 `SESSION_REPLACED` ใน request ถัดไป ถูกพากลับหน้า Login พร้อมข้อความว่าบัญชีถูกใช้บนเครื่องอื่น
  - `apiFetch` refresh ผ่าน Web Locks ให้ทีละแท็บ เพราะ backend หมุน refresh token ทุกครั้ง
  - `profile` อยู่ใน memory (Zustand) และโหลดจาก `/api/auth/me` ทุกครั้งที่เปิดหน้า ส่วน login/logout ใช้ `BroadcastChannel` แจ้งแท็บอื่น
- `AuthGuard` ครอบทุกหน้า ตรวจ token กับ `/api/auth/me` ก่อนแสดงหน้า ยังไม่ login จะถูกพากลับหน้า Login (`/`)
- เมนูและปุ่มต่างๆ แสดงตามสิทธิ์ของผู้ใช้ (`forward_logs:read`, `webhooks:*`, `admins:*`, `audit_logs:read`) ส่วนการตรวจสิทธิ์จริงอยู่ที่ backend

## Error Monitoring

- frontend ไม่ได้ส่ง error ไปที่ไหน ใช้การแจ้งเตือนของ backend (Sentry + LINE) ดู README ของ center-hook

## Theme

- โทนแดง-ขาว (อิง Labor-Web-Centralize) ใช้สีของ Tailwind ตรงๆ: `red-*` เป็นสีหลัก, `zinc-*` เป็นสีเทา (ไม่มีสี custom ใน `@theme`)
- Dark mode เป็นโทนดำ-แดง อักษรขาว ใช้ `dark:` ของ Tailwind ซึ่งทำงานตาม class `dark` บน `<html>` (`@custom-variant dark` ใน `globals.css`)
- `next-themes` (ตั้งค่าใน `app/lib/theme.tsx`) เป็นตัวใส่ class นั้น
  - กดปุ่มพระจันทร์/พระอาทิตย์ใน Sidebar → เก็บค่าใน localStorage key `center-hook-theme` ถาวร (logout ไม่ลบ) และซิงก์ทุกแท็บ
  - ยังไม่เคยเลือก → อิงธีมของเบราว์เซอร์ และเปลี่ยนตามทันทีเมื่อธีมเบราว์เซอร์เปลี่ยน
  - ฝัง script ใน `<head>` ตั้งธีมก่อนวาดหน้า จึงไม่กระพริบสีผิด (`<html>` จึงต้องมี `suppressHydrationWarning`)
- Component ที่ต้องรู้ / สลับธีม ใช้ `useThemeToggle()` จาก `app/lib/theme.tsx`

## Project Structure

```
app/
├─ layout.tsx              root layout + ThemeProvider + AuthGuard
├─ globals.css             Tailwind + สีพื้นหลัง/ตัวอักษร (สว่าง / มืด)
├─ icon.png, apple-icon.png  favicon (โลโก้ simummung)
├─ page.tsx                หน้าแรก (/) = หน้า Login
├─ lib/
│  ├─ api-fetch.ts         เรียก API + แนบ/refresh token, swrFetcher
│  ├─ auth.tsx             store ของ session (Zustand), usePermission, AuthGuard
│  ├─ errors.ts            ApiError + แปลง error เป็นข้อความ
│  └─ theme.tsx            ThemeProvider (next-themes) + useThemeToggle
├─ components/             sidebar, pre_loading
├─ page-ui/
│  ├─ layout.tsx           ครอบทุกหน้าด้วย Sidebar
│  ├─ dashboard/           สรุป forward log ตามช่วงวัน/project
│  ├─ log/                 รายการแชทและข้อความแยกตาม LINE user
│  ├─ webhooks/            จัดการปลายทาง forward ของแต่ละ smm_app
│  ├─ log-system/          Log System: สรุปความผิดปกติ + ค้นหา audit log (ใคร ทำอะไร จาก IP/อุปกรณ์ไหน)
│  ├─ setting/             จัดการบัญชีผู้ดูแลและสิทธิ์
│  └─ login/               ฟอร์ม login (ใช้ที่ app/page.tsx)
└─ types/
   ├─ api/                 type ของ request/response แต่ละ API (อ้างอิง backend)
   └─ page-ui/             type ที่ใช้เฉพาะหน้า
```

## Tech Stack

| Technology | Version | Role |
| --- | --- | --- |
| [Next.js](https://nextjs.org) (App Router) | 16.4.6 | framework |
| [React](https://react.dev) | 19.3.1 | UI |
| [TypeScript](https://www.typescriptlang.org) | 6.0.3 | ภาษา |
| [Tailwind CSS](https://tailwindcss.com) | 4.3.5 | styling |
| [Bun](https://bun.sh) | 1.4.4 | package manager |

| Library | Purpose |
| --- | --- |
| `zustand` | เก็บ profile ผู้ใช้ที่ login อยู่ (ใน memory) |
| `swr` | โหลดข้อมูล, cache, โหลดเพิ่มทีละหน้า (infinite) |
| `react-hook-form`, `zod`, `@hookform/resolvers` | ฟอร์มและ validation |
| `@headlessui/react` | Dialog, Tab |
| `recharts` | กราฟใน Dashboard |
| `date-fns` | จัดรูปแบบวันที่ |
| `usehooks-ts`, `react-intersection-observer` | hook ทั่วไป, โหลดเพิ่มเมื่อเลื่อนถึงท้ายรายการ |
| `react-icons`, `clsx` | ไอคอน, รวม className |
| `next-themes` | ธีมสว่าง / มืด (class `dark` บน `<html>`, เก็บค่าใน localStorage, กันจอกระพริบตอนโหลด) |

Version ของ library ดูได้ใน `bun.lock`
