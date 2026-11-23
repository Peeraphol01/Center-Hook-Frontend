"use client";

import { useState } from "react";
import useSWR from "swr";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import clsx from "clsx";
import { CgSpinner } from "react-icons/cg";
import {
  HiOutlineChartBar,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineInbox,
  HiOutlineLockClosed,
  HiOutlineUsers,
  HiOutlineXCircle,
} from "react-icons/hi";
import { swrFetcher } from "@/app/lib/api-fetch";
import { useAuthStore, usePermission } from "@/app/lib/auth";
import { getErrorMessage } from "@/app/lib/errors";
import type { DashboardQuery, DashboardResponse } from "@/app/types/api/dashboard";
import type { Webhook } from "@/app/types/api/webhooks";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด TIMEZONE ให้ตรงกับ backend (center-hook DASHBOARD_CONFIG.timezone) ใช้หา "วันนี้" และแสดงเวลาในกราฟ
const TIMEZONE = "Asia/Bangkok";

// กำหนด MAX_RANGE_DAYS ช่วงยาวสุดที่ backend รับ (= อายุ forward log)
const MAX_RANGE_DAYS = 90;

// กำหนด PRESETS ช่วงเวลาสำเร็จรูป (days = จำนวนวันนับรวมวันนี้)
const PRESETS = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "custom", label: "Custom", days: 0 },
] as const;

// กำหนด STATUS_COLORS สีของแต่ละสถานะในกราฟ
const STATUS_COLORS = { success: "#10b981", failed: "#ef4444", skipped: "#9ca3af" };

// กำหนด DEFAULT_PROJECT ชื่อ project ที่ backend บันทึกเมื่อ event ไม่มี smm_app (center-hook: webhook.service.ts DEFAULT_LOG_NAME)
const DEFAULT_PROJECT = "default";

/* -------------------------------------- Functions -------------------------------------- */

// Function แสดงเวลาตามเวลาไทย
function formatInTimezone(iso: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, ...options }).format(new Date(iso));
}

// Function แสดงอัตราเป็น % (null = ยังไม่มี event ที่ส่งต่อ)
function formatRate(rate: number | null) {
  return rate === null ? "–" : `${(rate * 100).toFixed(1)}%`;
}

/* -------------------------------------- Components -------------------------------------- */

// Function หน้า Dashboard — สรุป forward log ตามช่วงวันและ project (ต้องมีสิทธิ์ forward_logs:read)
function Dashboard_page() {
  // โหลดข้อมูลเมื่อ AuthGuard ตรวจ session ผ่านแล้ว (มี profile)
  const profile = useAuthStore((s) => s.profile);
  const ready = Boolean(profile);
  const can = usePermission();

  // วันนี้ตามเวลาไทย (YYYY-MM-DD)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());

  const [preset, setPreset] = useState<(typeof PRESETS)[number]["key"]>("today");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [project, setProject] = useState("");

  // ช่วงวันที่ส่งให้ backend (preset คำนวณจากวันนี้ / custom ใช้ที่ผู้ใช้เลือก) และตรวจช่วงไม่เกิน MAX_RANGE_DAYS
  const days = PRESETS.find((item) => item.key === preset)?.days ?? 0;
  const from = preset === "custom" ? customFrom : format(addDays(parseISO(today), -(days - 1)), "yyyy-MM-dd");
  const to = preset === "custom" ? customTo : today;
  const rangeDays = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  const rangeError =
    !from || !to
      ? "Please select both dates"
      : rangeDays < 1
        ? "End date must be on or after the start date"
        : rangeDays > MAX_RANGE_DAYS
          ? `Date range must not exceed ${MAX_RANGE_DAYS} days`
          : null;

  // ข้อมูล dashboard — โหลดเมื่อช่วงวันถูกต้อง (คงข้อมูลเดิมไว้ระหว่างโหลดช่วงใหม่)
  const query: DashboardQuery = { from, to, project: project || undefined };
  const dashboard = useSWR(ready && can("forward_logs:read") && !rangeError ? ["/api/dashboard", query] : null, swrFetcher<DashboardResponse>, {
    keepPreviousData: true,
  });
  const data = dashboard.data;

  // ตัวเลือก project = smm_app ในตาราง webhooks + default + project ที่มี log ในช่วงนี้
  const webhooks = useSWR(ready && can("webhooks:read") ? ["/api/webhooks"] : null, swrFetcher<{ data: Webhook[] }>);
  const projects = [
    ...new Set([
      ...(webhooks.data?.data.flatMap((w) => (w.smm_app ? [w.smm_app] : [])) ?? []),
      DEFAULT_PROJECT,
      ...(data?.by_project.map((item) => item.project) ?? []),
      ...(project ? [project] : []),
    ]),
  ].sort();

  // ข้อมูลกราฟ (label ตามเวลาไทย: รายชั่วโมง = 14:00, รายวัน = 5 Nov)
  const chartData = (data?.timeseries ?? []).map((item) => ({
    ...item,
    label:
      data?.range.interval === "hour"
        ? formatInTimezone(item.bucket, { hour: "2-digit", minute: "2-digit", hour12: false })
        : formatInTimezone(item.bucket, { day: "numeric", month: "short" }),
  }));

  const inputClass =
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:ring-4 focus:ring-red-500/15 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-white dark:[color-scheme:dark]";

  // ไม่มีสิทธิ์ดู forward log
  if (profile && !can("forward_logs:read")) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <HiOutlineLockClosed className="h-10 w-10 text-zinc-400" />
        <p className="font-medium text-zinc-900 dark:text-white">You don&apos;t have access to the dashboard</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Requires the forward_logs:read permission.</p>
      </div>
    );
  }

  /* -------------------------------------- UI -------------------------------------- */

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      {/* ---------- หัวข้อ + ตัวกรอง ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-zinc-900 dark:text-white">
            Dashboard
            {dashboard.isValidating && <CgSpinner className="h-5 w-5 animate-spin text-zinc-400" />}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {from === to ? format(parseISO(from), "d MMM yyyy") : `${format(parseISO(from), "d MMM yyyy")} – ${format(parseISO(to), "d MMM yyyy")}`}
            {" · "}Thailand time (GMT+7)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* ช่วงเวลา */}
          <div className="flex rounded-lg border border-zinc-300 bg-white p-0.5 dark:border-zinc-600 dark:bg-zinc-800" role="group" aria-label="Date range">
            {PRESETS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  // เปลี่ยนเป็น Custom = เริ่มจากช่วงที่เลือกอยู่
                  if (item.key === "custom") {
                    setCustomFrom(from);
                    setCustomTo(to);
                  }
                  setPreset(item.key);
                }}
                aria-pressed={preset === item.key}
                className={clsx(
                  "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  preset === item.key
                    ? "bg-red-600 text-white"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Project */}
          <select value={project} onChange={(e) => setProject(e.target.value)} className={inputClass} aria-label="Project">
            <option value="">All projects</option>
            {projects.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* วันที่เอง */}
      {preset === "custom" && (
        <div className="-mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <label htmlFor="from">From</label>
          <input id="from" type="date" value={customFrom} max={today} onChange={(e) => setCustomFrom(e.target.value)} className={inputClass} />
          <label htmlFor="to">to</label>
          <input id="to" type="date" value={customTo} min={customFrom} max={today} onChange={(e) => setCustomTo(e.target.value)} className={inputClass} />
          {rangeError && <span className="text-red-600 dark:text-red-400">{rangeError}</span>}
        </div>
      )}

      {dashboard.error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400">
          <HiOutlineExclamationCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {getErrorMessage(dashboard.error)}
        </div>
      )}

      {!data ? (
        !dashboard.error && (
          <div className="flex flex-1 items-center justify-center py-20">
            <CgSpinner className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        )
      ) : (
        <div className={clsx("flex flex-col gap-6 transition-opacity", dashboard.isValidating && "opacity-60")}>
          {/* ---------- การ์ดตัวเลข ---------- */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Total events",
                value: data.totals.total.toLocaleString(),
                sub: `${data.totals.inbound.toLocaleString()} inbound · ${data.totals.outbound.toLocaleString()} outbound`,
                icon: HiOutlineChartBar,
                iconClass: "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-100",
              },
              {
                label: "Success rate",
                value: formatRate(data.totals.success_rate),
                sub: `${data.totals.success.toLocaleString()} success · avg ${data.totals.avg_duration_ms === null ? "–" : `${data.totals.avg_duration_ms.toLocaleString()} ms`}`,
                icon: HiOutlineCheckCircle,
                iconClass: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
              },
              {
                label: "Failed",
                value: data.totals.failed.toLocaleString(),
                sub: `${data.totals.skipped.toLocaleString()} skipped (no webhook)`,
                icon: HiOutlineXCircle,
                iconClass: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
              },
              {
                label: "Active LINE users",
                value: data.totals.active_line_users.toLocaleString(),
                sub: "Unique users and groups",
                icon: HiOutlineUsers,
                iconClass: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
              },
            ].map(({ label, value, sub, icon: Icon, iconClass }) => (
              <div key={label} className="flex items-start gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
                <span className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconClass)}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
                  <p className="mt-0.5 text-2xl font-semibold text-zinc-900 tabular-nums dark:text-white">{value}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ---------- กราฟตามเวลา ---------- */}
          <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-700">
              <div>
                <h2 className="font-semibold text-zinc-900 dark:text-white">Events over time</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{data.range.interval === "hour" ? "Per hour" : "Per day"}</p>
              </div>
              <div className="flex gap-4 text-xs text-zinc-600 dark:text-zinc-400">
                {(["success", "failed", "skipped"] as const).map((key) => (
                  <span key={key} className="flex items-center gap-1.5 capitalize">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS_COLORS[key] }} />
                    {key}
                  </span>
                ))}
              </div>
            </div>
            <div className="h-72 p-4 text-zinc-500 dark:text-zinc-400">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.15} />
                  <XAxis dataKey="label" tick={{ fill: "currentColor", fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={12} />
                  <YAxis allowDecimals={false} tick={{ fill: "currentColor", fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-600 dark:bg-zinc-800">
                          <p className="mb-1 font-medium text-zinc-900 dark:text-white">{label}</p>
                          {payload.map((entry) => (
                            <p key={String(entry.dataKey)} className="flex items-center gap-1.5 text-zinc-600 capitalize dark:text-zinc-300">
                              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: entry.color }} />
                              {String(entry.dataKey)}: <span className="font-medium tabular-nums">{Number(entry.value).toLocaleString()}</span>
                            </p>
                          ))}
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="success" stackId="status" fill={STATUS_COLORS.success} />
                  <Bar dataKey="failed" stackId="status" fill={STATUS_COLORS.failed} />
                  <Bar dataKey="skipped" stackId="status" fill={STATUS_COLORS.skipped} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            {/* ---------- แยกตาม project ---------- */}
            <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
              <div className="border-b border-zinc-200 p-4 dark:border-zinc-700">
                <h2 className="font-semibold text-zinc-900 dark:text-white">By project</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Click a project to filter the dashboard.</p>
              </div>
              {data.by_project.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-10 text-sm text-zinc-500 dark:text-zinc-400">
                  <HiOutlineInbox className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                  No events in this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-zinc-500 uppercase dark:text-zinc-400">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Project</th>
                        <th className="px-4 py-2.5 text-right font-medium">Events</th>
                        <th className="px-4 py-2.5 font-medium">Success rate</th>
                        <th className="px-4 py-2.5 text-right font-medium">Failed</th>
                        <th className="px-4 py-2.5 text-right font-medium">Avg time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                      {data.by_project.map((item) => (
                        <tr
                          key={item.project}
                          onClick={() => setProject(project === item.project ? "" : item.project)}
                          className={clsx(
                            "cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700/50",
                            project === item.project && "bg-red-50/60 dark:bg-red-500/10",
                          )}
                        >
                          <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">{item.project}</td>
                          <td className="px-4 py-3 text-right text-zinc-700 tabular-nums dark:text-zinc-300">{item.total.toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-600">
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(item.success_rate ?? 0) * 100}%` }} />
                              </div>
                              <span className="text-zinc-700 tabular-nums dark:text-zinc-300">{formatRate(item.success_rate)}</span>
                            </div>
                          </td>
                          <td className={clsx("px-4 py-3 text-right tabular-nums", item.failed > 0 ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-500")}>
                            {item.failed.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-zinc-700 tabular-nums dark:text-zinc-300">
                            {item.avg_duration_ms === null ? "–" : `${item.avg_duration_ms.toLocaleString()} ms`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ---------- ล้มเหลวล่าสุด ---------- */}
            <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
              <div className="border-b border-zinc-200 p-4 dark:border-zinc-700">
                <h2 className="font-semibold text-zinc-900 dark:text-white">Recent failures</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Latest events that could not be delivered.</p>
              </div>
              {data.recent_failures.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-10 text-sm text-zinc-500 dark:text-zinc-400">
                  <HiOutlineCheckCircle className="h-8 w-8 text-emerald-400" />
                  No failures in this period.
                </div>
              ) : (
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
                  {data.recent_failures.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <HiOutlineXCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          <span className="font-medium text-zinc-900 dark:text-white">{item.project}</span>
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                            {item.direction === "INBOUND" ? "Inbound" : "Outbound"} · {item.event_type}
                          </span>
                          {item.http_status !== null && (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
                              HTTP {item.http_status}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400" title={item.error_message ?? undefined}>
                          {item.error_message ?? "No error message"}
                        </p>
                      </div>
                      <time dateTime={item.created_at} className="shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                        {formatInTimezone(item.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard_page
