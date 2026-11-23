"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { format } from "date-fns";
import { CgSpinner } from "react-icons/cg";
import {
  HiOutlineExclamation,
  HiOutlineExclamationCircle,
  HiOutlineLockClosed,
  HiOutlinePencil,
  HiOutlinePlus,
  HiOutlineTrash,
  HiX,
} from "react-icons/hi";
import { apiFetch } from "@/app/lib/api-fetch";
import { usePermission } from "@/app/lib/auth";
import { getErrorMessage } from "@/app/lib/errors";
import type { MessageResponse } from "@/app/types/api/common";
import type { CreateWebhookBody, UpdateWebhookBody, Webhook, WebhookListResponse } from "@/app/types/api/webhooks";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด DEFAULT_PATH ชื่อใน path ที่หมายถึง webhook default (smm_app = null) — ห้ามใช้เป็น smm_app (ตาม center-hook webhook.schema.ts)
const DEFAULT_PATH = "default";

type WebhookForm = { is_default: boolean; smm_app: string; webhook_url: string };

// กำหนด EMPTY_FORM ค่าเริ่มต้นของฟอร์ม (ใช้ตอน render รอบแรก ก่อน react-hook-form ใส่ค่าจาก values)
const EMPTY_FORM: WebhookForm = { is_default: false, smm_app: "", webhook_url: "" };

// กำหนด webhookSchema ฟอร์ม webhook (ตาม validation ของ backend — ติ๊ก Default ไม่ต้องกรอก smm_app)
const webhookSchema: z.ZodType<WebhookForm, WebhookForm> = z
  .object({
    is_default: z.boolean(),
    smm_app: z.string().trim(),
    webhook_url: z.url({ protocol: /^https?$/, error: "Must be a valid http(s) URL" }).max(1024),
  })
  .superRefine((form, ctx) => {
    if (form.is_default) return;
    if (!/^[a-z0-9_-]{1,50}$/.test(form.smm_app)) {
      ctx.addIssue({ code: "custom", path: ["smm_app"], message: "1-50 characters: a-z, 0-9, _ -" });
    } else if (form.smm_app === DEFAULT_PATH) {
      ctx.addIssue({ code: "custom", path: ["smm_app"], message: `"${DEFAULT_PATH}" is reserved. Tick "Insight webhook" instead` });
    }
  });

/* -------------------------------------- Functions -------------------------------------- */

// Function สร้าง path ของ webhook ใน API (webhook default ใช้ /default)
function webhookPath(webhook: Webhook) {
  return `/api/webhooks/${webhook.smm_app ?? DEFAULT_PATH}`;
}

/* -------------------------------------- Components -------------------------------------- */

// Function หน้า Webhooks — ดู (ตาราง), เพิ่ม/แก้ไข (ฟอร์ม), ลบ (ยืนยัน) ปลายทาง forward ของแต่ละ project
function Webhooks_Page() {
  const can = usePermission();

  // ฟอร์ม: null = ปิด, "new" = เพิ่ม, Webhook = แก้ไข
  const [formTarget, setFormTarget] = useState<Webhook | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);
  const editing = formTarget !== null && formTarget !== "new" ? formTarget : null;

  // รายการ webhook (ต้องมีสิทธิ์ webhooks:read)
  const webhooks = useSWR(can("webhooks:read") ? "/api/webhooks" : null, (path: string) => apiFetch<WebhookListResponse>(path));
  // webhook default มีได้แถวเดียว — มีอยู่แล้ว (และไม่ใช่ตัวที่กำลังแก้) ตั้งเพิ่มไม่ได้
  const defaultWebhook = webhooks.data?.data.find((webhook) => webhook.smm_app === null);
  const canSetDefault = !defaultWebhook || defaultWebhook.id === editing?.id;

  // ค่าเริ่มต้นของฟอร์ม (เพิ่ม = ค่าว่าง / แก้ไข = ข้อมูลของแถวนั้น)
  const formValues = useMemo<WebhookForm | undefined>(() => {
    if (formTarget === "new") return EMPTY_FORM;
    if (formTarget) return { is_default: formTarget.smm_app === null, smm_app: formTarget.smm_app ?? "", webhook_url: formTarget.webhook_url };
    return undefined;
  }, [formTarget]);

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<WebhookForm>({ resolver: zodResolver(webhookSchema), defaultValues: EMPTY_FORM, values: formValues });
  // ติ๊ก Default แล้วปิดช่อง smm_app
  const isDefault = useWatch({ control, name: "is_default" });

  // บันทึก: เพิ่ม = POST / แก้ไข = PATCH เฉพาะ field ที่เปลี่ยน
  const onSubmit = handleSubmit(async (values) => {
    const body: CreateWebhookBody = { smm_app: values.is_default ? null : values.smm_app.trim(), webhook_url: values.webhook_url };
    try {
      if (editing) {
        const changes: UpdateWebhookBody = {};
        if (body.smm_app !== editing.smm_app) changes.smm_app = body.smm_app;
        if (body.webhook_url !== editing.webhook_url) changes.webhook_url = body.webhook_url;
        if (Object.keys(changes).length) await apiFetch<Webhook>(webhookPath(editing), { method: "PATCH", body: changes });
      } else {
        await apiFetch<Webhook>("/api/webhooks", { method: "POST", body });
      }
      await webhooks.mutate();
      setFormTarget(null);
    } catch (error) {
      setError("root", { message: getErrorMessage(error) });
    }
  });

  // ลบ webhook
  const remove = useSWRMutation("/api/webhooks/delete", (_key: string, { arg: webhook }: { arg: Webhook }) =>
    apiFetch<MessageResponse>(webhookPath(webhook), { method: "DELETE" }),
  );
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove.trigger(deleteTarget);
      await webhooks.mutate();
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
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Webhooks</h1>

      {/* ---------- ดู ---------- */}
      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-700">
          <div>
            <h2 className="font-semibold text-zinc-900 dark:text-white">Destinations</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              LINE events are forwarded to the webhook of their project. Events with no matching project go to the Insight webhook.
            </p>
          </div>
          {can("webhooks:create") && (
            <button
              type="button"
              onClick={() => setFormTarget("new")}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <HiOutlinePlus className="h-4 w-4" />
              Add webhook
            </button>
          )}
        </div>

        {!can("webhooks:read") ? (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-zinc-500 dark:text-zinc-400">
            <HiOutlineLockClosed className="h-5 w-5" /> You don&apos;t have permission to view webhooks.
          </p>
        ) : webhooks.error ? (
          <p className="p-8 text-center text-sm text-red-600 dark:text-red-400">{getErrorMessage(webhooks.error)}</p>
        ) : !webhooks.data ? (
          <div className="flex justify-center p-8">
            <CgSpinner className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : webhooks.data.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">No webhooks yet. Events won&apos;t be forwarded until you add one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase dark:bg-zinc-900/50 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Project (smm_app)</th>
                  <th className="px-4 py-3 font-medium">Webhook URL</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {webhooks.data.data.map((webhook) => (
                  <tr key={webhook.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                    <td className="px-4 py-3">
                      {webhook.smm_app === null ? (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">Insight</span>
                      ) : (
                        <span className="font-mono font-medium text-zinc-900 dark:text-white">{webhook.smm_app}</span>
                      )}
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <span className="block truncate font-mono text-xs text-zinc-600 dark:text-zinc-300" title={webhook.webhook_url}>
                        {webhook.webhook_url}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">{format(new Date(webhook.updated_at), "d MMM yyyy HH:mm")}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {can("webhooks:update") && (
                          <button
                            type="button"
                            onClick={() => setFormTarget(webhook)}
                            className="cursor-pointer rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-red-400"
                            aria-label={`Edit ${webhook.smm_app ?? "Insight webhook"}`}
                            title="Edit"
                          >
                            <HiOutlinePencil className="h-4 w-4" />
                          </button>
                        )}
                        {can("webhooks:delete") && (
                          <button
                            type="button"
                            onClick={() => {
                              remove.reset();
                              setDeleteTarget(webhook);
                            }}
                            className="cursor-pointer rounded-md p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                            aria-label={`Delete ${webhook.smm_app ?? "Insight webhook"}`}
                            title="Delete"
                          >
                            <HiOutlineTrash className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- เพิ่ม / แก้ไข ---------- */}
      <Dialog open={formTarget !== null} onClose={() => !isSubmitting && setFormTarget(null)} className="relative z-60">
        <DialogBackdrop transition className="fixed inset-0 bg-black/50 transition-opacity duration-200 data-closed:opacity-0" />
        <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
          <DialogPanel
            transition
            className="w-full max-w-lg rounded-xl bg-white shadow-xl transition duration-200 data-closed:scale-95 data-closed:opacity-0 dark:bg-zinc-800"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
              <DialogTitle className="font-semibold text-zinc-900 dark:text-white">{editing ? "Edit webhook" : "Add webhook"}</DialogTitle>
              <button
                type="button"
                onClick={() => setFormTarget(null)}
                className="cursor-pointer rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
                aria-label="Close"
              >
                <HiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={onSubmit} noValidate className="space-y-4 p-5">
              {errors.root && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400">
                  <HiOutlineExclamationCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {errors.root.message}
                </div>
              )}

              {/* Default webhook — มีได้แถวเดียว */}
              <label className={canSetDefault ? "flex cursor-pointer items-start gap-2" : "flex cursor-not-allowed items-start gap-2 opacity-60"}>
                <input type="checkbox" disabled={!canSetDefault} className="mt-0.5 h-4 w-4 cursor-pointer accent-red-600 disabled:cursor-not-allowed" {...register("is_default")} />
                <span className="text-sm">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">Insight webhook</span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                    {canSetDefault ? "Receives events with no project or an unknown project." : "An Insight webhook already exists. Edit that one instead."}
                  </span>
                </span>
              </label>

              <div className="space-y-1">
                <label htmlFor="smm_app" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Project (smm_app)</label>
                <input id="smm_app" autoComplete="off" placeholder="e.g. newlabor" disabled={isDefault} className={`${inputClass} font-mono`} {...register("smm_app")} />
                {errors.smm_app && !isDefault && <p className="text-xs text-red-600 dark:text-red-400">{errors.smm_app.message}</p>}
              </div>

              <div className="space-y-1">
                <label htmlFor="webhook_url" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Webhook URL</label>
                <input id="webhook_url" type="url" autoComplete="off" placeholder="https://example.com/api/line/webhook" className={`${inputClass} font-mono`} {...register("webhook_url")} />
                {errors.webhook_url && <p className="text-xs text-red-600 dark:text-red-400">{errors.webhook_url.message}</p>}
              </div>

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
                  {editing ? "Save changes" : "Add webhook"}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>

      {/* ---------- ลบ ---------- */}
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
                <DialogTitle className="font-semibold text-zinc-900 dark:text-white">Delete webhook?</DialogTitle>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {deleteTarget?.smm_app === null ? (
                    <>Events with no matching project will no longer be forwarded (they will be logged as SKIPPED).</>
                  ) : (
                    <>
                      Events of <span className="font-mono font-medium text-zinc-700 dark:text-zinc-200">{deleteTarget?.smm_app}</span> will go to the Insight
                      webhook instead, and this project can no longer send messages through center-hook.
                    </>
                  )}
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

export default Webhooks_Page
