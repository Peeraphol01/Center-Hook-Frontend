"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { create } from "zustand";
import useSWR, { useSWRConfig } from "swr";
import { useIsClient } from "usehooks-ts";
import { apiFetch } from "@/app/lib/api-fetch";
import { ApiError, getErrorMessage } from "@/app/lib/errors";
import type { AccountWithPermissions, AuthState, Permission } from "@/app/types/api/auth";
import PreLoading from "@/app/components/pre_loading";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด useAuthStore เก็บ profile ผู้ใช้และเหตุผลที่ถูก logout ใน memory
// token อยู่ในคุกกี้ httpOnly (app/lib/auth-cookies.ts) ทุกแท็บใช้ร่วมกัน — เปิดแท็บใหม่ AuthGuard โหลด profile จาก /api/auth/me เอง
export const useAuthStore = create<AuthState>()((set) => ({
  profile: null,
  signOutReason: null,
  setProfile: (profile) => set({ profile, signOutReason: null }),
  clear: (reason) => set({ profile: null, signOutReason: reason ?? null }),
}));

// กำหนด authChannel แจ้งแท็บอื่นของเบราว์เซอร์เดียวกันเมื่อ login / logout (ส่งข้อความเท่านั้น ไม่เก็บข้อมูล)
type AuthMessage = "login" | "logout";
const authChannel = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("center-hook-auth") : null;

/* -------------------------------------- Functions -------------------------------------- */

// Function แจ้งแท็บอื่นว่า login / logout แล้ว (แท็บที่ส่งไม่ได้รับข้อความของตัวเอง)
export function broadcastAuth(message: AuthMessage) {
  authChannel?.postMessage(message);
}

// Function hook คืน can() ไว้เช็กว่าผู้ใช้ที่ login อยู่มีสิทธิ์นั้นหรือไม่
export function usePermission() {
  const permissions = useAuthStore((s) => s.profile?.permissions);
  return (permission: Permission) => permissions?.includes(permission) ?? false;
}

// Function ครอบทุกหน้า — ตรวจ session (คุกกี้) กับ backend, โหลดบัญชี/สิทธิ์ล่าสุด และ redirect ตามสถานะ login
function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isClient = useIsClient(); // ตรวจ session ฝั่ง browser จึงต้องรอ render ฝั่ง client ก่อน (กัน hydration mismatch)
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const clear = useAuthStore((s) => s.clear);
  const { mutate } = useSWRConfig();

  // ตรวจคุกกี้กับ backend และโหลดข้อมูลบัญชี/สิทธิ์ล่าสุด (ไม่มีคุกกี้ / token ใช้ไม่ได้ → 401 = ยังไม่ login)
  const me = useSWR(isClient ? "/api/auth/me" : null, (path: string) => apiFetch<AccountWithPermissions>(path), {
    onSuccess: setProfile,
    // error อื่นที่ไม่ใช่ 401 (server ล่ม, timeout ฯลฯ) → ล้าง session พร้อมเหตุผล → ถูก redirect กลับหน้า Login
    onError: (error) => {
      if (!(error instanceof ApiError && error.status === 401)) clear(getErrorMessage(error));
    },
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });
  const checking = !profile && (!isClient || me.isLoading);
  const revalidateMe = me.mutate;

  // แท็บอื่น login → โหลด profile ใหม่ / แท็บอื่น logout → ล้าง session และ cache ของแท็บนี้ด้วย
  useEffect(() => {
    if (!authChannel) return;
    const onMessage = ({ data }: MessageEvent<AuthMessage>) => {
      if (data === "login") revalidateMe();
      if (data === "logout") {
        clear();
        mutate(() => true, undefined, { revalidate: false });
      }
    };
    authChannel.addEventListener("message", onMessage);
    return () => authChannel.removeEventListener("message", onMessage);
  }, [revalidateMe, clear, mutate]);

  // หน้าเดียวที่เข้าได้โดยไม่ต้อง login คือหน้าแรก (Login)
  const isPublic = pathname === "/";
  // ยังไม่ login → หน้า Login / login แล้วแต่อยู่หน้า Login → Dashboard (ใช้ replace ไม่ให้กด Back กลับมา)
  const redirectTo = checking ? null : !profile && !isPublic ? "/" : profile && isPublic ? "/page-ui/dashboard" : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  // ระหว่างรอ client / ตรวจ session / redirect แสดง PreLoading แทนเนื้อหาของหน้า
  if (checking || redirectTo) {
    return (
      <div className="flex min-h-dvh flex-1">
        <PreLoading />
      </div>
    );
  }

  return children;
}

export default AuthGuard
