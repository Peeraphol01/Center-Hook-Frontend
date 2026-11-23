"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEventListener } from "usehooks-ts";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSWRConfig } from "swr";
import useSWRMutation from "swr/mutation";
import clsx from "clsx";
import { CgSpinner } from "react-icons/cg";
import {
  HiOutlineCheckCircle,
  HiOutlineChevronRight,
  HiOutlineCog,
  HiOutlineDocumentText,
  HiOutlineExclamationCircle,
  HiOutlineKey,
  HiOutlineLink,
  HiOutlineLogout,
  HiOutlineMenuAlt2,
  HiOutlineMoon,
  HiOutlineShieldCheck,
  HiOutlineSun,
  HiOutlineUserCircle,
  HiOutlineViewGrid,
  HiX,
} from "react-icons/hi";
import { apiFetch } from "@/app/lib/api-fetch";
import { broadcastAuth, useAuthStore } from "@/app/lib/auth";
import { getErrorMessage } from "@/app/lib/errors";
import { useThemeToggle } from "@/app/lib/theme";
import type { ChangePasswordBody, Role } from "@/app/types/api/auth";
import type { MessageResponse } from "@/app/types/api/common";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด menuItems รายการเมนูใน Sidebar
const menuItems = [
  { href: "/page-ui/dashboard", label: "Dashboard", icon: HiOutlineViewGrid },
  { href: "/page-ui/log", label: "Log", icon: HiOutlineDocumentText },
  { href: "/page-ui/webhooks", label: "Webhooks", icon: HiOutlineLink },
  { href: "/page-ui/log-system", label: "Log System", icon: HiOutlineShieldCheck },
  { href: "/page-ui/setting", label: "Setting", icon: HiOutlineCog },
];

// กำหนด ROLE_STYLES สีป้าย role (owner > manager > admin)
const ROLE_STYLES: Record<Role, string> = {
  owner: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  manager: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  admin: "bg-zinc-100 text-zinc-700 dark:bg-zinc-600/60 dark:text-zinc-300",
};

// กำหนด passwordSchema ฟอร์มเปลี่ยนรหัสผ่าน (ตาม center-hook auth.schema.ts: รหัสใหม่ 8-128 ตัว, ไม่ซ้ำรหัสเดิม และยืนยันให้ตรงกัน)
const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Please enter your current password"),
    new_password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password must be at most 128 characters"),
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password !== v.current_password, { message: "New password must be different from the current password", path: ["new_password"] })
  .refine((v) => v.confirm_password === v.new_password, { message: "Passwords do not match", path: ["confirm_password"] });

/* -------------------------------------- Components -------------------------------------- */

// Function Sidebar — เมนูหลัก, ข้อมูลผู้ใช้ (Profile / Reset password) และปุ่ม Logout
function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // ข้อมูลผู้ใช้ที่ login อยู่ (AuthGuard โหลดจาก /api/auth/me ไว้แล้ว)
  const profile = useAuthStore((s) => s.profile);
  const clear = useAuthStore((s) => s.clear);
  const { mutate } = useSWRConfig();

  // Logout: revoke session ที่ backend และลบคุกกี้ แล้วล้าง session ฝั่งนี้ + แจ้งแท็บอื่น (backend ตอบ error ก็ล้าง) → AuthGuard พากลับหน้า Login
  const logout = useSWRMutation("/api/auth/logout", (path: string) => apiFetch<MessageResponse>(path, { method: "POST" }), {
    throwOnError: false,
    onSuccess: () => signOut(),
    onError: () => signOut(),
  });
  const signOut = () => {
    closeMenu();
    clear();
    broadcastAuth("logout");
    // ล้าง cache ข้อมูลของผู้ใช้เดิม (แชท, me ฯลฯ) ไม่ให้ค้างไปถึงคนที่ login ถัดไป
    mutate(() => true, undefined, { revalidate: false });
  };
  const initials = profile?.full_name.trim().slice(0, 2).toUpperCase() || "?";

  // ธีม สว่าง / มืด (ค่าที่เลือกเก็บใน localStorage — ดู app/lib/theme.tsx)
  const { theme, toggleTheme } = useThemeToggle();

  // Popup ข้อมูลผู้ใช้ (เมนู Profile / Reset password)
  const [profileOpen, setProfileOpen] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });
  // ปิด popup แล้วล้างฟอร์มรหัสผ่าน (ปิดไม่ได้ระหว่างกำลังส่ง)
  const closeProfile = () => {
    if (isSubmitting) return;
    setProfileOpen(false);
    reset();
  };

  // เปลี่ยนรหัสผ่าน: PATCH /api/auth/me/password สำเร็จแล้วล้างช่องกรอก (session ปัจจุบันใช้ต่อได้)
  const onChangePassword = handleSubmit(async ({ current_password, new_password }) => {
    try {
      await apiFetch<MessageResponse>("/api/auth/me/password", { method: "PATCH", body: { current_password, new_password } satisfies ChangePasswordBody });
      reset(undefined, { keepIsSubmitSuccessful: true });
    } catch (error) {
      setError("root", { message: getErrorMessage(error) });
    }
  });

  // เปิด/ปิดเมนู (mobile) — Dialog ล็อกการเลื่อนหน้าและปิดด้วย ESC / กดนอกเมนูให้เอง
  const openMenu = () => setOpen(true);
  const closeMenu = () => setOpen(false);

  // ปิดเมนูเมื่อขยายจอเป็น desktop
  useEventListener("resize", () => {
    if (open && window.innerWidth >= 768) closeMenu();
  });

  // เนื้อหา Sidebar — ใช้ร่วมกันทั้ง desktop (แสดงตลอด) และ mobile (อยู่ใน Dialog)
  const navContent = (
    <nav aria-label="เมนูหลัก" className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-16 items-center justify-between border-b border-zinc-200 px-6 dark:border-zinc-700">
        {/* Logo */}
        <Link href="/" onClick={closeMenu} className="flex items-center gap-2.5 text-xl font-semibold text-red-700 dark:text-white">
          <Image src="/simummung_icon.png" alt="" width={36} height={36} className="h-9 w-9 rounded-lg object-contain" />
          Center Hook
        </Link>

        {/* ปุ่มปิด — แสดงเฉพาะ mobile */}
        <button
          type="button"
          onClick={closeMenu}
          className="-mr-2 cursor-pointer rounded-md p-2 text-zinc-600 hover:bg-zinc-100 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-700"
          aria-label="ปิดเมนู"
        >
          <HiX className="h-6 w-6" />
        </button>
      </div>

      {/* Menu */}
      <ul className="flex-1 space-y-1 overflow-y-auto p-4">
        {menuItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={closeMenu}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-red-50 text-red-700 dark:bg-red-600 dark:text-white"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Profile (กดเพื่อปิดเมนู mobile แล้วเปิด popup ข้อมูลผู้ใช้กลางจอ) + ปุ่ม Logout */}
      {profile && (
        <div className="flex items-center gap-1 border-t border-zinc-200 p-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => {
              closeMenu();
              setProfileOpen(true);
            }}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 dark:hover:bg-zinc-700"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-red-600 to-red-800 text-sm font-semibold text-white">
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-zinc-900 dark:text-white">{profile.full_name}</span>
              <span className="block truncate text-xs text-zinc-500 capitalize dark:text-zinc-400">{profile.role}</span>
            </span>
            <HiOutlineChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="shrink-0 cursor-pointer rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-white"
          >
            {theme === "dark" ? <HiOutlineSun className="h-5 w-5" /> : <HiOutlineMoon className="h-5 w-5" />}
          </button>

          <button
            type="button"
            onClick={() => logout.trigger()}
            disabled={logout.isMutating}
            title="Sign out"
            aria-label="Sign out"
            className="shrink-0 cursor-pointer rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            {logout.isMutating ? <CgSpinner className="h-5 w-5 animate-spin" /> : <HiOutlineLogout className="h-5 w-5" />}
          </button>
        </div>
      )}
    </nav>
  );

/* -------------------------------------- UI -------------------------------------- */

  return (
    <>
      {/* ปุ่ม Hamburger — แสดงเฉพาะ mobile */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center border-b border-zinc-200 bg-white/90 px-4 backdrop-blur md:hidden dark:border-zinc-700 dark:bg-zinc-900/90">
        <button
          type="button"
          onClick={openMenu}
          className="-ml-2 cursor-pointer rounded-md p-2 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
          aria-label="เปิดเมนู"
          aria-expanded={open}
        >
          <HiOutlineMenuAlt2 className="h-6 w-6" />
        </button>
        <Link href="/" className="ml-2 flex items-center gap-2 text-base font-semibold text-red-700 dark:text-white">
          <Image src="/simummung_icon.png" alt="" width={28} height={28} className="h-7 w-7 rounded-md object-contain" />
          Center Hook
        </Link>
      </header>

      {/* Sidebar desktop — แสดงตลอด */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-zinc-200 bg-white md:flex dark:border-zinc-700 dark:bg-zinc-800">
        {navContent}
      </aside>

      {/* Sidebar mobile — เลื่อนออกมาจากซ้ายใน Dialog */}
      <Dialog open={open} onClose={closeMenu} className="relative z-50 md:hidden">
        <DialogBackdrop transition className="fixed inset-0 bg-black/50 transition-opacity duration-300 data-closed:opacity-0" />
        <DialogPanel
          transition
          className="fixed inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col border-r border-zinc-200 bg-white shadow-xl transition-transform duration-300 ease-out data-closed:-translate-x-full dark:border-zinc-700 dark:bg-zinc-800"
        >
          {navContent}
        </DialogPanel>
      </Dialog>

      {/* Popup ข้อมูลผู้ใช้กลางจอ — เมนู Profile / Reset password */}
      {profile && (
        <Dialog open={profileOpen} onClose={closeProfile} className="relative z-60">
          <DialogBackdrop transition className="fixed inset-0 bg-black/50 transition-opacity duration-200 data-closed:opacity-0" />
          <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
            <DialogPanel
              transition
              className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl transition duration-200 data-closed:scale-95 data-closed:opacity-0 dark:bg-zinc-800"
            >
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
                <DialogTitle className="font-semibold text-zinc-900 dark:text-white">Account</DialogTitle>
                <button
                  type="button"
                  onClick={closeProfile}
                  className="cursor-pointer rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  aria-label="Close"
                >
                  <HiX className="h-5 w-5" />
                </button>
              </div>

              <TabGroup vertical className="flex flex-col sm:min-h-96 sm:flex-row">
                {/* เมนู: ช่องแรก Profile / ถัดมา Reset password */}
                <div className="flex flex-col border-b border-zinc-200 p-3 sm:w-52 sm:border-r sm:border-b-0 dark:border-zinc-700">
                  <TabList className="flex gap-1 sm:flex-col">
                    {[
                      { label: "Profile", icon: HiOutlineUserCircle },
                      { label: "Reset password", icon: HiOutlineKey },
                    ].map(({ label, icon: Icon }) => (
                      <Tab
                        key={label}
                        className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none data-focus:ring-2 data-focus:ring-red-500/40 data-selected:bg-red-50 data-selected:text-red-700 sm:flex-none dark:text-zinc-200 dark:hover:bg-zinc-700 dark:data-selected:bg-zinc-700 dark:data-selected:text-red-400"
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {label}
                      </Tab>
                    ))}
                  </TabList>

                  <button
                    type="button"
                    onClick={() => logout.trigger()}
                    disabled={logout.isMutating}
                    className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 sm:mt-auto dark:text-red-400 dark:hover:bg-red-500/10"
                  >
                    {logout.isMutating ? <CgSpinner className="h-5 w-5 animate-spin" /> : <HiOutlineLogout className="h-5 w-5" />}
                    Sign out
                  </button>
                </div>

                <TabPanels className="flex-1 p-5">
                  {/* ---------- Profile ---------- */}
                  <TabPanel className="space-y-5 focus:outline-none">
                    <div className="flex items-center gap-4">
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-red-600 to-red-800 text-xl font-semibold text-white">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-zinc-900 dark:text-white">{profile.full_name}</p>
                        <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">@{profile.username}</p>
                        <span className={clsx("mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium capitalize", ROLE_STYLES[profile.role])}>
                          {profile.role}
                        </span>
                      </div>
                    </div>

                    <dl className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-700 dark:border-zinc-700">
                      {[
                        { label: "Full name", value: profile.full_name },
                        { label: "Username", value: profile.username },
                        { label: "Role", value: profile.role },
                        { label: "Status", value: profile.status },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                          <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
                          <dd className={clsx("truncate font-medium text-zinc-900 dark:text-white", (label === "Role" || label === "Status") && "capitalize")}>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </TabPanel>

                  {/* ---------- Reset password ---------- */}
                  <TabPanel className="focus:outline-none">
                    <form onSubmit={onChangePassword} noValidate className="space-y-4">
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">You will stay signed in after changing your password.</p>

                      {errors.root && (
                        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400">
                          <HiOutlineExclamationCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          {errors.root.message}
                        </div>
                      )}
                      {isSubmitSuccessful && (
                        <div role="status" className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-400">
                          <HiOutlineCheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          Password changed successfully.
                        </div>
                      )}

                      {(
                        [
                          { name: "current_password", label: "Current password", autoComplete: "current-password" },
                          { name: "new_password", label: "New password", autoComplete: "new-password" },
                          { name: "confirm_password", label: "Confirm new password", autoComplete: "new-password" },
                        ] as const
                      ).map(({ name, label, autoComplete }) => (
                        <div key={name} className="space-y-1">
                          <label htmlFor={name} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
                          <input
                            id={name}
                            type="password"
                            autoComplete={autoComplete}
                            aria-invalid={Boolean(errors[name])}
                            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/15 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
                            {...register(name)}
                          />
                          {errors[name] && <p className="text-xs text-red-600 dark:text-red-400">{errors[name].message}</p>}
                        </div>
                      ))}

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {isSubmitting && <CgSpinner className="h-4 w-4 animate-spin" />}
                          Change password
                        </button>
                      </div>
                    </form>
                  </TabPanel>
                </TabPanels>
              </TabGroup>
            </DialogPanel>
          </div>
        </Dialog>
      )}
    </>
  );
}

export default Sidebar
