"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import Bowser from "bowser";
import { format } from "date-fns";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { CgSpinner } from "react-icons/cg";
import {
  HiOutlineArrowRight,
  HiOutlineDesktopComputer,
  HiOutlineExclamationCircle,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlineInformationCircle,
  HiOutlineLockClosed,
  HiOutlineShieldCheck,
  HiOutlineUser,
} from "react-icons/hi";
import Image from "next/image";
import { apiFetch } from "@/app/lib/api-fetch";
import { broadcastAuth, useAuthStore } from "@/app/lib/auth";
import { ApiError, getErrorMessage } from "@/app/lib/errors";
import type { LoginBody, OtherDevice, SessionResponse } from "@/app/types/api/auth";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด loginSchema ฟอร์ม login (ตรวจแค่ว่ากรอกครบ)
const loginSchema: z.ZodType<LoginBody, LoginBody> = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

/* -------------------------------------- Functions -------------------------------------- */

// Function แปลง user-agent เป็นชื่อเครื่องที่อ่านง่าย เช่น "Chrome · Windows"
function describeDevice(userAgent: string | null) {
  if (!userAgent) return "Unknown device";
  const { browser, os } = Bowser.parse(userAgent);
  return [browser.name, os.name].filter(Boolean).join(" · ") || userAgent;
}

/* -------------------------------------- Components -------------------------------------- */

// Function หน้า Login
function Login_page() {
  const router = useRouter();
  const setProfile = useAuthStore((s) => s.setProfile);
  // เหตุผลที่ถูกพากลับมาหน้า login (เช่น session หมด)
  const signOutReason = useAuthStore((s) => s.signOutReason);
  const [showPassword, setShowPassword] = useState(false);
  // บัญชีใช้งานอยู่บนเครื่องอื่น (409) → เก็บข้อมูลที่กรอกไว้ถามก่อนเตะเครื่องเดิม
  const [conflict, setConflict] = useState<{ body: LoginBody; device: OtherDevice } | null>(null);
  const [replacing, setReplacing] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginBody>({ resolver: zodResolver(loginSchema), defaultValues: { username: "", password: "" } });

  // login สำเร็จ (token ถูกเก็บในคุกกี้แล้ว) → เก็บ profile, แจ้งแท็บอื่น แล้วไปหน้า Dashboard
  // ใช้งานอยู่บนเครื่องอื่น (409 ACTIVE_ON_OTHER_DEVICE) → เปิด popup ถามก่อนเตะเครื่องเดิม
  const signIn = async (body: LoginBody) => {
    try {
      const { profile } = await apiFetch<SessionResponse>("/api/auth/login", { method: "POST", body });
      setConflict(null);
      setProfile(profile);
      broadcastAuth("login");
      router.replace("/page-ui/dashboard");
    } catch (error) {
      setConflict(null);
      if (error instanceof ApiError && error.body?.code === "ACTIVE_ON_OTHER_DEVICE" && error.body.other_device) {
        setConflict({ body, device: error.body.other_device });
        return;
      }
      setError("root", { message: getErrorMessage(error) });
    }
  };

  const onSubmit = handleSubmit(signIn);

  // ยืนยันเตะเครื่องเดิมออก → login ซ้ำพร้อม replace_session
  const confirmReplace = async () => {
    if (!conflict) return;
    setReplacing(true);
    await signIn({ ...conflict.body, replace_session: true });
    setReplacing(false);
  };

  const inputClass =
    "block w-full rounded-lg border bg-white py-2.5 pl-10 text-sm text-zinc-900 placeholder:text-zinc-400 transition focus:ring-4 focus:outline-none dark:bg-zinc-900 dark:text-white";
  const inputState = (invalid: boolean) =>
    invalid
      ? "border-red-400 focus:border-red-500 focus:ring-red-500/15 dark:border-red-500/60"
      : "border-zinc-300 focus:border-red-500 focus:ring-red-500/15 dark:border-zinc-600 dark:focus:border-red-400";

  /* -------------------------------------- UI -------------------------------------- */

  return (
    <div className="relative flex min-h-dvh flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-900">
      {/* พื้นหลังตกแต่ง */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-96 w-96 rounded-full bg-red-400/30 blur-3xl dark:bg-red-600/20" />
        <div className="absolute -right-32 -bottom-40 h-96 w-96 rounded-full bg-red-300/30 blur-3xl dark:bg-red-800/20" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(0_0_0/0.06)_1px,transparent_0)] bg-size-[24px_24px] dark:bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.05)_1px,transparent_0)]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/simummung_icon.png" alt="Simummung" width={64} height={64} priority className="mb-4 h-16 w-16 rounded-2xl object-contain shadow-lg shadow-red-600/20" />
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Center Hook</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Sign in to the admin console</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white/80 p-8 shadow-xl shadow-zinc-200/50 backdrop-blur dark:border-zinc-700 dark:bg-zinc-800/80 dark:shadow-none">
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            {/* Error จาก API / เหตุผลที่ถูก logout */}
            {errors.root ? (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400"
              >
                <HiOutlineExclamationCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <span>{errors.root.message}</span>
              </div>
            ) : (
              signOutReason && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300">
                  <HiOutlineInformationCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>{signOutReason}</span>
                </div>
              )
            )}

            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="username" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Username
              </label>
              <div className="relative">
                <HiOutlineUser className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  placeholder="Enter your username"
                  aria-invalid={Boolean(errors.username)}
                  className={clsx(inputClass, "pr-3", inputState(Boolean(errors.username)))}
                  {...register("username")}
                />
              </div>
              {errors.username && <p className="text-xs text-red-600 dark:text-red-400">{errors.username.message}</p>}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Password
              </label>
              <div className="relative">
                <HiOutlineLockClosed className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  aria-invalid={Boolean(errors.password)}
                  className={clsx(inputClass, "pr-11", inputState(Boolean(errors.password)))}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 cursor-pointer rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <HiOutlineEyeOff className="h-5 w-5" /> : <HiOutlineEye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-600 dark:text-red-400">{errors.password.message}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-linear-to-r from-red-600 to-red-800 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-600/25 transition hover:from-red-700 hover:to-red-900 focus:ring-4 focus:ring-red-500/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? (
                <>
                  <CgSpinner className="h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <HiOutlineArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Popup: บัญชีใช้งานอยู่บนเครื่องอื่น */}
        <Dialog open={conflict !== null} onClose={() => !replacing && setConflict(null)} className="relative z-60">
          <DialogBackdrop transition className="fixed inset-0 bg-black/50 transition-opacity duration-200 data-closed:opacity-0" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <DialogPanel
              transition
              className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl transition duration-200 data-closed:scale-95 data-closed:opacity-0 dark:bg-zinc-800"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-100 p-2 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  <HiOutlineDesktopComputer className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="font-semibold text-zinc-900 dark:text-white">Signed in on another device</DialogTitle>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Each account can be used on one device at a time. Continue to sign out the other device and sign in here.
                  </p>
                </div>
              </div>

              {conflict && (
                <dl className="mt-4 space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500 dark:text-zinc-400">Device</dt>
                    <dd className="truncate text-right font-medium text-zinc-900 dark:text-white">{describeDevice(conflict.device.user_agent)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500 dark:text-zinc-400">IP address</dt>
                    <dd className="font-mono text-zinc-900 dark:text-white">{conflict.device.ip_address ?? "–"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500 dark:text-zinc-400">Last active</dt>
                    <dd className="text-zinc-900 dark:text-white">{format(new Date(conflict.device.last_active_at), "d MMM yyyy, HH:mm")}</dd>
                  </div>
                </dl>
              )}

              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">If this wasn&apos;t you, sign in and change your password right away.</p>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConflict(null)}
                  disabled={replacing}
                  className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmReplace}
                  disabled={replacing}
                  className="flex cursor-pointer items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {replacing && <CgSpinner className="h-4 w-4 animate-spin" />}
                  Sign out other device
                </button>
              </div>
            </DialogPanel>
          </div>
        </Dialog>

        {/* Footer */}
        {/* <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <HiOutlineShieldCheck className="h-4 w-4" />
          Internal use only · Contact your administrator for access
        </p> */}
      </div>
    </div>
  );
}

export default Login_page
