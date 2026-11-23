"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { format } from "date-fns";
import clsx from "clsx";
import { CgSpinner } from "react-icons/cg";
import {
  HiOutlineExclamation,
  HiOutlineExclamationCircle,
  HiOutlineLockClosed,
  HiOutlinePencil,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineUserGroup,
  HiX,
} from "react-icons/hi";
import { apiFetch } from "@/app/lib/api-fetch";
import { useAuthStore, usePermission } from "@/app/lib/auth";
import { getErrorMessage } from "@/app/lib/errors";
import type { AccountStatus, AccountWithPermissions, Permission, Role } from "@/app/types/api/auth";
import type { AdminListItem, AdminListResponse, CreateAdminBody, UpdateAdminBody } from "@/app/types/api/admins";
import type { MessageResponse } from "@/app/types/api/common";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด ROLES เรียงจากสูงไปต่ำ (ตาม center-hook permission.config.ts) — ตั้ง role ให้คนอื่นได้เฉพาะที่ต่ำกว่าตัวเอง
const ROLES: Role[] = ["owner", "manager", "admin"];

// กำหนด PERMISSION_GROUPS สิทธิ์ทั้งหมดที่ backend รู้จัก (ตาม center-hook permission.config.ts) จัดกลุ่มสำหรับแสดงในฟอร์ม
const PERMISSION_GROUPS: { label: string; items: { value: Permission; label: string }[] }[] = [
  { label: "Forward logs", items: [{ value: "forward_logs:read", label: "View" }] },
  {
    label: "Webhooks",
    items: [
      { value: "webhooks:read", label: "View" },
      { value: "webhooks:create", label: "Create" },
      { value: "webhooks:update", label: "Edit" },
      { value: "webhooks:delete", label: "Delete" },
    ],
  },
  {
    label: "Admins",
    items: [
      { value: "admins:read", label: "View" },
      { value: "admins:create", label: "Create" },
      { value: "admins:update", label: "Edit" },
      { value: "admins:delete", label: "Delete" },
    ],
  },
  { label: "Audit logs", items: [{ value: "audit_logs:read", label: "View" }] },
];

// กำหนด PERMISSION_DEPENDENCIES สิทธิ์ที่ต้องมีคู่กัน (ตาม center-hook permission.config.ts) เช่น สร้างต้องดูได้
const PERMISSION_DEPENDENCIES: Partial<Record<Permission, Permission[]>> = {
  "webhooks:create": ["webhooks:read"],
  "webhooks:update": ["webhooks:read"],
  "webhooks:delete": ["webhooks:read"],
  "admins:create": ["admins:read"],
  "admins:update": ["admins:read"],
  "admins:delete": ["admins:read"],
};

// กำหนด ROLE_STYLES สีป้าย role
const ROLE_STYLES: Record<Role, string> = {
  owner: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  manager: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  admin: "bg-zinc-100 text-zinc-700 dark:bg-zinc-600/60 dark:text-zinc-300",
};

// กำหนด SETTING_MENUS เมนูภายในหน้า Setting (เพิ่มหัวข้อตั้งค่าอื่นได้ในอนาคต)
const SETTING_MENUS = [{ key: "admins", label: "Admins", icon: HiOutlineUserGroup }] as const;

type AdminForm = CreateAdminBody;

// กำหนด EMPTY_FORM ค่าเริ่มต้นของฟอร์ม (ใช้ตอน render รอบแรก ก่อน react-hook-form ใส่ค่าจาก values)
const EMPTY_FORM: AdminForm = { username: "", password: "", full_name: "", role: "admin", status: "active", permissions: [] };

// กำหนด createSchema ฟอร์มเพิ่มบัญชี (ตาม validation ของ backend)
const createSchema: z.ZodType<AdminForm, AdminForm> = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,100}$/, "3-100 characters: a-z, A-Z, 0-9, . _ -"),
  // รหัสผ่าน: อย่างน้อย 8 ตัว + ตัวพิมพ์ใหญ่ 1 ตัว + อักขระพิเศษ 1 ตัว (backend ตรวจแค่ความยาว)
  password: z
    .string()
    .min(8, "At least 8 characters")
    .max(128)
    .regex(/[A-Z]/, "Must contain at least 1 uppercase letter (A-Z)")
    .regex(/[^A-Za-z0-9]/, "Must contain at least 1 special character (e.g. ! @ # $ %)"),
  full_name: z.string().trim().min(1, "Full name is required").max(255),
  role: z.enum(["owner", "manager", "admin"]),
  status: z.enum(["active", "inactive"]),
  permissions: z.array(z.custom<Permission>()),
});

// กำหนด editSchema ฟอร์มแก้บัญชี (แก้ username / password ไม่ได้ จึงไม่ตรวจ)
const editSchema: z.ZodType<AdminForm, AdminForm> = z.object({
  username: z.string(),
  password: z.string(),
  full_name: z.string().trim().min(1, "Full name is required").max(255),
  role: z.enum(["owner", "manager", "admin"]),
  status: z.enum(["active", "inactive"]),
  permissions: z.array(z.custom<Permission>()),
});

/* -------------------------------------- Functions -------------------------------------- */

// Function ติ๊ก/เอาออกสิทธิ์พร้อม dependency — ติ๊ก create ได้ read ด้วย / เอา read ออก สิทธิ์ที่ต้องใช้ read ออกด้วย
function togglePermission(current: Permission[], permission: Permission, checked: boolean): Permission[] {
  if (checked) return [...new Set([...current, permission, ...(PERMISSION_DEPENDENCIES[permission] ?? [])])];
  return current.filter((item) => item !== permission && !PERMISSION_DEPENDENCIES[item]?.includes(permission));
}

/* -------------------------------------- Components -------------------------------------- */

// Function หน้า Setting — จัดการบัญชีผู้ดูแล: ดู (ตาราง), เพิ่ม/แก้ไข (ฟอร์ม), ลบ (ยืนยัน)
function Setting_page() {
  const profile = useAuthStore((s) => s.profile);
  const can = usePermission();
  // role ที่ตั้งให้คนอื่นได้ = role ที่ต่ำกว่าตัวเอง
  const assignableRoles = profile ? ROLES.slice(ROLES.indexOf(profile.role) + 1) : [];

  // ฟอร์ม: null = ปิด, "new" = เพิ่ม, AdminListItem = แก้ไข
  const [formTarget, setFormTarget] = useState<AdminListItem | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminListItem | null>(null);
  const editing = formTarget !== null && formTarget !== "new" ? formTarget : null;

  // รายการบัญชี (ต้องมีสิทธิ์ admins:read)
  const admins = useSWR(can("admins:read") ? "/api/admins" : null, (path: string) => apiFetch<AdminListResponse>(path));

  // ข้อมูลบัญชีที่กำลังแก้ (รายการไม่มี permissions จึงโหลดรายละเอียดเพิ่ม)
  const detail = useSWR(editing ? `/api/admins/${editing.id}` : null, (path: string) => apiFetch<AccountWithPermissions>(path), {
    revalidateOnFocus: false,
  });

  // ค่าเริ่มต้นของฟอร์ม (เพิ่ม = ค่าว่าง / แก้ไข = ข้อมูลจาก backend)
  const formValues = useMemo<AdminForm | undefined>(() => {
    if (formTarget === "new") {
      return { ...EMPTY_FORM, role: assignableRoles.at(-1) ?? "admin" };
    }
    if (detail.data) {
      const { username, full_name, role, status, permissions } = detail.data;
      return { username, password: "", full_name, role, status, permissions };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignableRoles คำนวณจาก profile ทุก render
  }, [formTarget, detail.data, profile?.role]);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AdminForm>({ resolver: zodResolver(editing ? editSchema : createSchema), defaultValues: EMPTY_FORM, values: formValues });

  // บันทึก: เพิ่ม = POST / แก้ไข = PATCH (ไม่ส่ง username/password)
  const onSubmit = handleSubmit(async (values) => {
    try {
      if (editing) {
        const { full_name, role, status, permissions } = values;
        await apiFetch<MessageResponse>(`/api/admins/${editing.id}`, { method: "PATCH", body: { full_name, role, status, permissions } satisfies UpdateAdminBody });
      } else {
        await apiFetch<AccountWithPermissions>("/api/admins", { method: "POST", body: values satisfies CreateAdminBody });
      }
      await admins.mutate();
      setFormTarget(null);
    } catch (error) {
      setError("root", { message: getErrorMessage(error) });
    }
  });

  // ลบบัญชี
  const remove = useSWRMutation("/api/admins/delete", (_key: string, { arg: id }: { arg: number }) =>
    apiFetch<MessageResponse>(`/api/admins/${id}`, { method: "DELETE" }),
  );
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove.trigger(deleteTarget.id);
      await admins.mutate();
      setDeleteTarget(null);
    } catch {
      // error แสดงใน dialog จาก remove.error
    }
  };

  const inputClass =
    "block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/15 focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white dark:disabled:bg-zinc-700";

  /* -------------------------------------- UI -------------------------------------- */

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Setting</h1>

      {/* Menu ภายในหน้า Setting */}
      <nav aria-label="Setting menu" className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
        {SETTING_MENUS.map(({ key, label, icon: Icon }) => (
          <span key={key} aria-current="page" className="-mb-px flex items-center gap-2 border-b-2 border-red-600 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-400 dark:text-red-400">
            <Icon className="h-5 w-5" />
            {label}
          </span>
        ))}
      </nav>

      {/* ---------- Admins: ดู ---------- */}
      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-700">
          <div>
            <h2 className="font-semibold text-zinc-900 dark:text-white">Admins</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">You can manage accounts with a lower role than yours.</p>
          </div>
          {can("admins:create") && assignableRoles.length > 0 && (
            <button
              type="button"
              onClick={() => setFormTarget("new")}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <HiOutlinePlus className="h-4 w-4" />
              Add admin
            </button>
          )}
        </div>

        {!can("admins:read") ? (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-zinc-500 dark:text-zinc-400">
            <HiOutlineLockClosed className="h-5 w-5" /> You don&apos;t have permission to view admins.
          </p>
        ) : admins.error ? (
          <p className="p-8 text-center text-sm text-red-600 dark:text-red-400">{getErrorMessage(admins.error)}</p>
        ) : !admins.data ? (
          <div className="flex justify-center p-8">
            <CgSpinner className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase dark:bg-zinc-900/50 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {admins.data.data.map((admin) => {
                  const locked = admin.locked_until && new Date(admin.locked_until) > new Date();
                  return (
                    <tr key={admin.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-900 dark:text-white">
                          {admin.full_name}
                          {admin.id === profile?.id && <span className="ml-1.5 text-xs font-normal text-zinc-400">(you)</span>}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">@{admin.username}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx("rounded px-1.5 py-0.5 text-xs font-medium capitalize", ROLE_STYLES[admin.role])}>{admin.role}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={clsx(
                              "flex items-center gap-1 text-xs font-medium capitalize",
                              admin.status === "active" ? "text-green-700 dark:text-green-400" : "text-zinc-500 dark:text-zinc-400",
                            )}
                          >
                            <span className={clsx("h-1.5 w-1.5 rounded-full", admin.status === "active" ? "bg-green-500" : "bg-zinc-400")} />
                            {admin.status}
                          </span>
                          {locked && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" title={`Locked until ${format(new Date(admin.locked_until!), "d MMM yyyy HH:mm")}`}>
                              Locked
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{format(new Date(admin.created_at), "d MMM yyyy")}</td>
                      <td className="px-4 py-3">
                        {admin.can_manage && (
                          <div className="flex justify-end gap-1">
                            {can("admins:update") && (
                              <button
                                type="button"
                                onClick={() => setFormTarget(admin)}
                                className="cursor-pointer rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-red-400"
                                aria-label={`Edit ${admin.username}`}
                                title="Edit"
                              >
                                <HiOutlinePencil className="h-4 w-4" />
                              </button>
                            )}
                            {can("admins:delete") && (
                              <button
                                type="button"
                                onClick={() => {
                                  remove.reset();
                                  setDeleteTarget(admin);
                                }}
                                className="cursor-pointer rounded-md p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                                aria-label={`Delete ${admin.username}`}
                                title="Delete"
                              >
                                <HiOutlineTrash className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- Admins: เพิ่ม / แก้ไข ---------- */}
      <Dialog open={formTarget !== null} onClose={() => !isSubmitting && setFormTarget(null)} className="relative z-60">
        <DialogBackdrop transition className="fixed inset-0 bg-black/50 transition-opacity duration-200 data-closed:opacity-0" />
        <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
          <DialogPanel
            transition
            className="w-full max-w-lg rounded-xl bg-white shadow-xl transition duration-200 data-closed:scale-95 data-closed:opacity-0 dark:bg-zinc-800"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
              <DialogTitle className="font-semibold text-zinc-900 dark:text-white">{editing ? `Edit ${editing.username}` : "Add admin"}</DialogTitle>
              <button
                type="button"
                onClick={() => setFormTarget(null)}
                className="cursor-pointer rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
                aria-label="Close"
              >
                <HiX className="h-5 w-5" />
              </button>
            </div>

            {editing && !formValues ? (
              <div className="flex justify-center p-10">
                {detail.error ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{getErrorMessage(detail.error)}</p>
                ) : (
                  <CgSpinner className="h-6 w-6 animate-spin text-zinc-400" />
                )}
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate className="space-y-4 p-5">
                {errors.root && (
                  <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400">
                    <HiOutlineExclamationCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {errors.root.message}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="username" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Username</label>
                    <input id="username" autoComplete="off" disabled={Boolean(editing)} className={inputClass} {...register("username")} />
                    {errors.username && <p className="text-xs text-red-600 dark:text-red-400">{errors.username.message}</p>}
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="full_name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Full name</label>
                    <input id="full_name" autoComplete="off" className={inputClass} {...register("full_name")} />
                    {errors.full_name && <p className="text-xs text-red-600 dark:text-red-400">{errors.full_name.message}</p>}
                  </div>
                </div>

                {!editing && (
                  <div className="space-y-1">
                    <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Password</label>
                    <input id="password" type="password" autoComplete="new-password" className={inputClass} {...register("password")} />
                    {errors.password ? (
                      <p className="text-xs text-red-600 dark:text-red-400">{errors.password.message}</p>
                    ) : (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">At least 8 characters, 1 uppercase letter and 1 special character.</p>
                    )}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="role" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Role</label>
                    <select id="role" className={clsx(inputClass, "capitalize")} {...register("role")}>
                      {assignableRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="status" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Status</label>
                    <select id="status" className={inputClass} {...register("status")}>
                      {(["active", "inactive"] satisfies AccountStatus[]).map((status) => (
                        <option key={status} value={status} className="capitalize">
                          {status === "active" ? "Active" : "Inactive"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* สิทธิ์ — ให้ได้เฉพาะที่ตัวเองมี */}
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Permissions</legend>
                  <Controller
                    control={control}
                    name="permissions"
                    render={({ field }) => (
                      <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                        {PERMISSION_GROUPS.map((group) => (
                          <div key={group.label} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span className="w-28 text-sm text-zinc-600 dark:text-zinc-400">{group.label}</span>
                            {group.items.map((item) => {
                              const grantable = can(item.value);
                              return (
                                <label
                                  key={item.value}
                                  title={grantable ? undefined : "You can't grant a permission you don't have"}
                                  className={clsx("flex items-center gap-1.5 text-sm", grantable ? "cursor-pointer text-zinc-800 dark:text-zinc-200" : "cursor-not-allowed text-zinc-400")}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={!grantable}
                                    checked={(field.value ?? []).includes(item.value)}
                                    onChange={(e) => field.onChange(togglePermission(field.value ?? [], item.value, e.target.checked))}
                                    className="h-4 w-4 cursor-pointer rounded border-zinc-300 accent-red-600 disabled:cursor-not-allowed"
                                  />
                                  {item.label}
                                </label>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  />
                  {editing && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Changing role, status or permissions signs this account out of all sessions.</p>
                  )}
                </fieldset>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setFormTarget(null)}
                    className="cursor-pointer rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {isSubmitting && <CgSpinner className="h-4 w-4 animate-spin" />}
                    {editing ? "Save changes" : "Create admin"}
                  </button>
                </div>
              </form>
            )}
          </DialogPanel>
        </div>
      </Dialog>

      {/* ---------- Admins: ลบ ---------- */}
      <Dialog open={deleteTarget !== null} onClose={() => !remove.isMutating && setDeleteTarget(null)} className="relative z-60">
        <DialogBackdrop transition className="fixed inset-0 bg-black/50 transition-opacity duration-200 data-closed:opacity-0" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel
            transition
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl transition duration-200 data-closed:scale-95 data-closed:opacity-0 dark:bg-zinc-800"
          >
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                <HiOutlineExclamation className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="font-semibold text-zinc-900 dark:text-white">Delete admin?</DialogTitle>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">{deleteTarget?.full_name}</span> (@{deleteTarget?.username}) will be removed
                  and signed out immediately. This can&apos;t be undone.
                </p>
              </div>
            </div>

            {remove.error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{getErrorMessage(remove.error)}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={remove.isMutating}
                className="cursor-pointer rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={remove.isMutating}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {remove.isMutating && <CgSpinner className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}

export default Setting_page
