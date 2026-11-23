"use client";

import { useState } from "react";
import useSWR from "swr";
import { useDebounceValue } from "usehooks-ts";
import { format, formatDistanceToNowStrict } from "date-fns";
import Bowser from "bowser";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import clsx from "clsx";
import { CgSpinner } from "react-icons/cg";
import {
  HiChevronLeft,
  HiChevronRight,
  HiOutlineBan,
  HiOutlineCode,
  HiOutlineExclamationCircle,
  HiOutlineFire,
  HiOutlineLockClosed,
  HiOutlineLogin,
  HiOutlineRefresh,
  HiOutlineShieldExclamation,
  HiX,
} from "react-icons/hi";
import { swrFetcher } from "@/app/lib/api-fetch";
import { useAuthStore, usePermission } from "@/app/lib/auth";
import { getErrorMessage } from "@/app/lib/errors";
import type { AuditAction, AuditLog, AuditLogListResponse, AuditLogQuery, AuditResult, AuditSeverity, SecuritySummaryResponse } from "@/app/types/api/audit-logs";
import JsonDialog from "@/app/components/json_dialog";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด ACTION_META ชื่อที่อ่านง่าย + ความรุนแรงตั้งต้นของแต่ละเหตุการณ์ (ตาม center-hook audit.service.ts AUDIT_DEFAULT_SEVERITY)
const ACTION_META: Record<AuditAction, { label: string; severity: AuditSeverity }> = {
  "auth.login.success": { label: "Login succeeded", severity: "info" },
  "auth.login.failed": { label: "Login failed", severity: "warning" },
  "auth.login.new_ip": { label: "Login from a new IP", severity: "warning" },
  "auth.login.blocked": { label: "Login while locked", severity: "warning" },
  "auth.login.device_conflict": { label: "Login blocked: active on another device", severity: "warning" },
  "auth.session.replaced": { label: "Other device signed out", severity: "critical" },
  "auth.account.locked": { label: "Account locked", severity: "critical" },
  "auth.logout": { label: "Logged out", severity: "info" },
  "auth.refresh.success": { label: "Session refreshed", severity: "info" },
  "auth.refresh.failed": { label: "Session refresh failed", severity: "warning" },
  "auth.refresh.reuse_detected": { label: "Refresh token reused", severity: "critical" },
  "auth.password.changed": { label: "Password changed", severity: "warning" },
  "auth.password.change_failed": { label: "Password change failed", severity: "warning" },
  "admin.create": { label: "Admin created", severity: "info" },
  "admin.update": { label: "Admin updated", severity: "info" },
  "admin.delete": { label: "Admin deleted", severity: "warning" },
  "webhook.create": { label: "Webhook created", severity: "warning" },
  "webhook.update": { label: "Webhook updated", severity: "warning" },
  "webhook.delete": { label: "Webhook deleted", severity: "warning" },
  "access.denied": { label: "Permission denied", severity: "warning" },
  "security.ip_blocked": { label: "IP blocked", severity: "warning" },
  "security.brute_force_suspected": { label: "Brute force suspected", severity: "critical" },
  "line.webhook.invalid_signature": { label: "Invalid LINE signature", severity: "warning" },
  "line.push.unauthorized": { label: "Unauthorized LINE push", severity: "warning" },
};

// กำหนด ACTION_GROUPS กลุ่มเหตุการณ์ในตัวกรอง (prefix ตรงกับชื่อ action ของ backend)
const ACTION_GROUPS = [
  { prefix: "auth.", label: "Login & session" },
  { prefix: "admin.", label: "Admin accounts" },
  { prefix: "webhook.", label: "Webhooks" },
  { prefix: "access.", label: "Access" },
  { prefix: "security.", label: "Security" },
  { prefix: "line.", label: "LINE" },
] as const;

// กำหนด SUMMARY_RANGES ช่วงเวลาของหน้าสรุป (ชั่วโมง)
const SUMMARY_RANGES = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "24 hours" },
  { hours: 24 * 7, label: "7 days" },
  { hours: 24 * 30, label: "30 days" },
] as const;

// กำหนด ACTION GROUP ของการ์ดตัวเลขในหน้าสรุป
const FAILED_LOGIN_ACTIONS: AuditAction[] = ["auth.login.failed", "auth.login.blocked"];
const BLOCKED_ACTIONS: AuditAction[] = ["access.denied", "security.ip_blocked", "line.push.unauthorized", "line.webhook.invalid_signature"];

// กำหนดสีของแต่ละความรุนแรง (ป้าย + แท่งกราฟ)
const SEVERITY_STYLES: Record<AuditSeverity, string> = {
  info: "bg-zinc-100 text-zinc-700 dark:bg-zinc-600/60 dark:text-zinc-200",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};
const SEVERITY_COLORS: Record<AuditSeverity, string> = { info: "#a1a1aa", warning: "#f59e0b", critical: "#ef4444" };

const RESULT_STYLES: Record<AuditResult, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  failure: "text-amber-600 dark:text-amber-400",
  denied: "text-red-600 dark:text-red-400",
};

// กำหนด PAGE_SIZE จำนวนแถวต่อหน้าในตาราง
const PAGE_SIZE = 25;

// กำหนด inputClass รูปแบบช่องกรอกที่ใช้ทั้งหน้า
const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:ring-4 focus:ring-red-500/15 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-white dark:[color-scheme:dark]";

/* -------------------------------------- Types -------------------------------------- */

// ตัวกรองของตาราง audit log (event = "prefix:auth." หรือ "action:auth.login.failed")
interface Filters {
  event: string;
  severity: "" | AuditSeverity;
  result: "" | AuditResult;
  username: string;
  ip: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { event: "", severity: "", result: "", username: "", ip: "", from: "", to: "" };

/* -------------------------------------- Functions -------------------------------------- */

// Function ชื่อเหตุการณ์ที่อ่านง่าย (action ที่ frontend ยังไม่รู้จักแสดงชื่อเดิม)
function actionLabel(action: string) {
  return ACTION_META[action as AuditAction]?.label ?? action;
}

// Function แปลง user agent เป็น "Chrome 131 · Windows" ด้วย bowser (อ่านไม่ออก = แสดง user agent เดิม)
function describeDevice(userAgent: string | null) {
  if (!userAgent) return "–";
  const { browser, os } = Bowser.parse(userAgent);
  const name = [browser.name, browser.version?.split(".")[0]].filter(Boolean).join(" ");
  return name ? [name, os.name].filter(Boolean).join(" · ") : userAgent;
}

// กำหนด COUNTRY_NAMES ตัวแปลงรหัสประเทศ (TH) เป็นชื่อ (Thailand)
const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

// Function ตำแหน่งโดยประมาณของ IP เช่น "Bangkok, Thailand" (ไม่มีข้อมูล = null)
function describeLocation(log: AuditLog) {
  if (!log.geo_country) return log.geo_city;
  let country = log.geo_country;
  try {
    country = COUNTRY_NAMES.of(log.geo_country) ?? log.geo_country;
  } catch {
    // รหัสที่ Intl ไม่รู้จัก แสดงรหัสเดิม
  }
  return [log.geo_city, country].filter(Boolean).join(", ");
}

// Function เวลาเต็ม (เวลาของเครื่องผู้ใช้)
function fullTime(iso: string) {
  return format(new Date(iso), "d MMM yyyy HH:mm:ss");
}

// Function แปลงค่าจากช่อง datetime-local เป็น ISO ที่ backend รับ (ว่าง = undefined)
function toIso(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

/* -------------------------------------- Components -------------------------------------- */

// Function ป้ายความรุนแรง
function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  return <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", SEVERITY_STYLES[severity])}>{severity}</span>;
}

// Function กล่องแจ้ง error ของ API
function ErrorAlert({ error }: { error: unknown }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400">
      <HiOutlineExclamationCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {getErrorMessage(error)}
    </div>
  );
}

// Function รายการอันดับ (IP / username) กดแล้วไปดู log ที่ตรงกัน
function RankingList({ title, items, empty, onSelect }: { title: string; items: { key: string; count: number }[]; empty: string; onSelect: (key: string) => void }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
      <h3 className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900 dark:border-zinc-700 dark:text-white">{title}</h3>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-700/60">
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onSelect(item.key)}
                title="Show matching audit logs"
                className="group w-full cursor-pointer px-4 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-700/40"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-mono text-zinc-800 group-hover:text-red-700 dark:text-zinc-200 dark:group-hover:text-red-400">{item.key}</span>
                  <span className="shrink-0 font-semibold text-zinc-900 tabular-nums dark:text-white">{item.count.toLocaleString()}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-700">
                  <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${(item.count / max) * 100}%` }} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Function popup รายละเอียด audit log หนึ่งรายการ (log = null คือปิด)
function AuditLogDialog({ log, onClose, onShowJson }: { log: AuditLog | null; onClose: () => void; onShowJson: (json: unknown) => void }) {
  const rows: [string, React.ReactNode][] = log
    ? [
        ["Time", fullTime(log.occurred_at)],
        ["Event", <span key="event"><span className="font-medium">{actionLabel(log.action)}</span> <span className="font-mono text-xs text-zinc-500">{log.action}</span></span>],
        ["Result", <span key="result" className={clsx("font-medium capitalize", RESULT_STYLES[log.result])}>{log.result}</span>],
        ["Severity", <SeverityBadge key="severity" severity={log.severity} />],
        ["User", log.actor_username ? `${log.actor_username}${log.actor_account_id ? ` (#${log.actor_account_id})` : ""}` : "–"],
        ["Session", log.session_id ?? "–"],
        ["Target", log.target_type ? `${log.target_type} #${log.target_id}` : "–"],
        ["IP address", <span key="ip" className="font-mono">{log.ip_address ?? "–"}</span>],
        ["Location", describeLocation(log) ?? "–"],
        ["Device", describeDevice(log.user_agent)],
        ["User agent", <span key="ua" className="font-mono text-xs break-all">{log.user_agent ?? "–"}</span>],
        ["Request", <span key="req" className="font-mono text-xs break-all">{[log.method, log.path].filter(Boolean).join(" ") || "–"}</span>],
        ["Request ID", <span key="rid" className="font-mono text-xs break-all">{log.request_id ?? "–"}</span>],
      ]
    : [];

  return (
    <Dialog open={log !== null} onClose={onClose} className="relative z-50">
      <DialogBackdrop transition className="fixed inset-0 bg-black/50 transition-opacity duration-200 data-closed:opacity-0" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl transition duration-200 data-closed:scale-95 data-closed:opacity-0 dark:bg-zinc-800"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-5 py-3 dark:border-zinc-700">
            <DialogTitle className="font-semibold text-zinc-900 dark:text-white">Audit log #{log?.id}</DialogTitle>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => log && onShowJson(log)}
                className="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <HiOutlineCode className="h-4 w-4" /> Raw JSON
              </button>
              <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700">
                <HiX className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <dl className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-700 dark:border-zinc-700">
              {rows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-3 gap-3 px-4 py-2.5">
                  <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
                  <dd className="col-span-2 text-zinc-900 dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>

            {log?.metadata && (
              <div className="mt-4">
                <h3 className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">Details</h3>
                <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

// Function หน้า Log System — สรุปความผิดปกติ + ค้นหาประวัติการใช้งาน (ต้องมีสิทธิ์ audit_logs:read)
function Log_System_page() {
  // โหลดข้อมูลเมื่อ AuthGuard ตรวจ session ผ่านแล้ว (มี profile)
  const profile = useAuthStore((s) => s.profile);
  const can = usePermission();
  const allowed = Boolean(profile) && can("audit_logs:read");

  const [tab, setTab] = useState(0);
  const [hours, setHours] = useState<number>(24);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [jsonView, setJsonView] = useState<{ json: unknown } | null>(null);

  // ช่องพิมพ์ (username / IP) รอหยุดพิมพ์ 400ms ก่อนค้นหา
  const [username] = useDebounceValue(filters.username.trim(), 400);
  const [ip] = useDebounceValue(filters.ip.trim(), 400);

  // query ของตาราง — เปลี่ยนตัวกรองแล้วกลับไปหน้า 1 (เก็บหน้าคู่กับ key ของตัวกรอง ไม่ต้องใช้ effect)
  const [eventKind, eventValue] = filters.event.split(":") as ["prefix" | "action" | "", string | undefined];
  const baseQuery: AuditLogQuery = {
    limit: PAGE_SIZE,
    action: eventKind === "action" ? (eventValue as AuditAction) : undefined,
    action_prefix: eventKind === "prefix" ? eventValue : undefined,
    severity: filters.severity || undefined,
    result: filters.result || undefined,
    actor_username: username || undefined,
    ip_address: ip || undefined,
    from: toIso(filters.from),
    to: toIso(filters.to),
  };
  const filterKey = JSON.stringify(baseQuery);
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;
  const setPage = (next: number) => setPaging({ key: filterKey, page: next });

  const logs = useSWR(allowed ? ["/api/audit-logs", { ...baseQuery, page }] : null, swrFetcher<AuditLogListResponse>, { keepPreviousData: true });
  // สรุปความผิดปกติ โหลดใหม่ทุก 60 วินาที
  const summary = useSWR(allowed ? ["/api/audit-logs/security-summary", { hours }] : null, swrFetcher<SecuritySummaryResponse>, {
    keepPreviousData: true,
    refreshInterval: 60_000,
  });

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  // จากหน้าสรุป: ไปแท็บ Audit logs พร้อมตัวกรอง
  const drillDown = (patch: Partial<Filters>) => {
    setFilters({ ...EMPTY_FILTERS, ...patch });
    setTab(1);
  };

  // ไม่มีสิทธิ์ดู audit log
  if (profile && !can("audit_logs:read")) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <HiOutlineLockClosed className="h-10 w-10 text-zinc-400" />
        <p className="font-medium text-zinc-900 dark:text-white">You don&apos;t have access to the system logs</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Requires the audit_logs:read permission.</p>
      </div>
    );
  }

  // ตัวเลขของการ์ดในหน้าสรุป
  const data = summary.data;
  const countOf = (actions: AuditAction[]) => data?.counts_by_action.filter((item) => actions.includes(item.action)).reduce((sum, item) => sum + item.count, 0) ?? 0;
  const criticalCount = data?.counts_by_action.filter((item) => ACTION_META[item.action]?.severity === "critical").reduce((sum, item) => sum + item.count, 0) ?? 0;
  const chartData = (data?.counts_by_action ?? []).map((item) => ({
    ...item,
    label: actionLabel(item.action),
    severity: ACTION_META[item.action]?.severity ?? "info",
  }));

  const pagination = logs.data?.pagination;

  /* -------------------------------------- UI -------------------------------------- */

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-zinc-900 dark:text-white">
          Log System
          {(logs.isValidating || summary.isValidating) && <CgSpinner className="h-5 w-5 animate-spin text-zinc-400" />}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Who used the system, from which IP and device, and anything that looks unusual.</p>
      </div>

      <TabGroup selectedIndex={tab} onChange={setTab} className="flex flex-col gap-6">
        <TabList className="flex w-fit rounded-lg border border-zinc-300 bg-white p-0.5 dark:border-zinc-600 dark:bg-zinc-800">
          {["Overview", "Audit logs"].map((label) => (
            <Tab
              key={label}
              className="cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none data-selected:bg-red-600 data-selected:text-white dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {label}
            </Tab>
          ))}
        </TabList>

        <TabPanels>
          {/* ---------- แท็บสรุปความผิดปกติ ---------- */}
          <TabPanel className="flex flex-col gap-6 focus:outline-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex rounded-lg border border-zinc-300 bg-white p-0.5 dark:border-zinc-600 dark:bg-zinc-800" role="group" aria-label="Time range">
                {SUMMARY_RANGES.map((item) => (
                  <button
                    key={item.hours}
                    type="button"
                    onClick={() => setHours(item.hours)}
                    aria-pressed={hours === item.hours}
                    className={clsx(
                      "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      hours === item.hours ? "bg-red-600 text-white" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {data && (
                <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <HiOutlineRefresh className="h-3.5 w-3.5" /> Auto-refreshes every minute · {fullTime(data.from)} – {fullTime(data.to)}
                </p>
              )}
            </div>

            {summary.error && <ErrorAlert error={summary.error} />}

            {!data ? (
              !summary.error && (
                <div className="flex justify-center py-20">
                  <CgSpinner className="h-8 w-8 animate-spin text-zinc-400" />
                </div>
              )
            ) : (
              <div className={clsx("flex flex-col gap-6 transition-opacity", summary.isValidating && "opacity-60")}>
                {/* การ์ดตัวเลข */}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: "Critical alerts",
                      value: criticalCount,
                      sub: "Locked accounts, token reuse, brute force",
                      icon: HiOutlineFire,
                      iconClass: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
                      onClick: () => drillDown({ severity: "critical" }),
                    },
                    {
                      label: "Failed logins",
                      value: countOf(FAILED_LOGIN_ACTIONS),
                      sub: `From ${data.top_failed_login_ips.length.toLocaleString()}${data.top_failed_login_ips.length >= 10 ? "+" : ""} IP addresses`,
                      icon: HiOutlineShieldExclamation,
                      iconClass: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
                      onClick: () => drillDown({ event: "action:auth.login.failed" }),
                    },
                    {
                      label: "Blocked requests",
                      value: countOf(BLOCKED_ACTIONS),
                      sub: "Permission denied, IP blocked, bad token/signature",
                      icon: HiOutlineBan,
                      iconClass: "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-100",
                      onClick: () => drillDown({ result: "denied" }),
                    },
                    {
                      label: "Successful logins",
                      value: countOf(["auth.login.success"]),
                      sub: `${countOf(["auth.login.new_ip"]).toLocaleString()} from a new IP`,
                      icon: HiOutlineLogin,
                      iconClass: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
                      onClick: () => drillDown({ event: "action:auth.login.success" }),
                    },
                  ].map(({ label, value, sub, icon: Icon, iconClass, onClick }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={onClick}
                      className="flex cursor-pointer items-start gap-4 rounded-xl border border-zinc-200 bg-white p-5 text-left transition-colors hover:border-red-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-red-800"
                    >
                      <span className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconClass)}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
                        <p className="mt-0.5 text-2xl font-semibold text-zinc-900 tabular-nums dark:text-white">{value.toLocaleString()}</p>
                        <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* กราฟจำนวนแต่ละเหตุการณ์ */}
                <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-700">
                    <h2 className="font-semibold text-zinc-900 dark:text-white">Events by type</h2>
                    <div className="flex gap-4 text-xs text-zinc-600 dark:text-zinc-400">
                      {(Object.keys(SEVERITY_COLORS) as AuditSeverity[]).map((key) => (
                        <span key={key} className="flex items-center gap-1.5 capitalize">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SEVERITY_COLORS[key] }} />
                          {key}
                        </span>
                      ))}
                    </div>
                  </div>
                  {chartData.length === 0 ? (
                    <p className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">No events in this period</p>
                  ) : (
                    <div className="p-4" style={{ height: Math.max(160, chartData.length * 32 + 40) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                          <CartesianGrid horizontal={false} stroke="currentColor" className="text-zinc-200 dark:text-zinc-700" />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#a1a1aa" }} />
                          <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 12, fill: "#a1a1aa" }} />
                          <Tooltip
                            cursor={{ fill: "rgba(161,161,170,0.12)" }}
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                            formatter={(value) => [Number(value).toLocaleString(), "Events"]}
                          />
                          <Bar
                            dataKey="count"
                            radius={[0, 4, 4, 0]}
                            className="cursor-pointer"
                            onClick={(entry) => drillDown({ event: `action:${(entry as unknown as { action: string }).action}` })}
                          >
                            {chartData.map((item) => (
                              <Cell key={item.action} fill={SEVERITY_COLORS[item.severity]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </section>

                {/* อันดับ IP / username */}
                <div className="grid gap-4 lg:grid-cols-3">
                  <RankingList
                    title="Failed logins by IP"
                    items={data.top_failed_login_ips.map((item) => ({ key: item.ip_address, count: item.count }))}
                    empty="No failed logins"
                    onSelect={(key) => drillDown({ ip: key, event: "prefix:auth." })}
                  />
                  <RankingList
                    title="Failed logins by username"
                    items={data.top_failed_login_usernames.map((item) => ({ key: item.username, count: item.count }))}
                    empty="No failed logins"
                    onSelect={(key) => drillDown({ username: key, event: "prefix:auth." })}
                  />
                  <RankingList
                    title="Blocked requests by IP"
                    items={data.top_denied_ips.map((item) => ({ key: item.ip_address, count: item.count }))}
                    empty="No blocked requests"
                    onSelect={(key) => drillDown({ ip: key })}
                  />
                </div>

                {/* เหตุการณ์ warning / critical ล่าสุด */}
                <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
                  <h2 className="border-b border-zinc-200 p-4 font-semibold text-zinc-900 dark:border-zinc-700 dark:text-white">Recent alerts</h2>
                  {data.recent_alerts.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Nothing unusual in this period</p>
                  ) : (
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-700/60">
                      {data.recent_alerts.map((log) => (
                        <li key={log.id}>
                          <button
                            type="button"
                            onClick={() => setSelected(log)}
                            className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700/40"
                          >
                            <SeverityBadge severity={log.severity} />
                            <span className="font-medium text-zinc-900 dark:text-white">{actionLabel(log.action)}</span>
                            <span className="text-zinc-500 dark:text-zinc-400">
                              {log.actor_username ?? "unknown user"} · <span className="font-mono">{log.ip_address ?? "no IP"}</span>
                            </span>
                            <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400" title={fullTime(log.occurred_at)}>
                              {formatDistanceToNowStrict(new Date(log.occurred_at), { addSuffix: true })}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </TabPanel>

          {/* ---------- แท็บค้นหา audit log ---------- */}
          <TabPanel className="flex flex-col gap-4 focus:outline-none">
            <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-700 dark:bg-zinc-800">
              <select value={filters.event} onChange={(e) => updateFilter("event", e.target.value)} className={inputClass} aria-label="Event">
                <option value="">All events</option>
                {ACTION_GROUPS.map((group) => (
                  <optgroup key={group.prefix} label={group.label}>
                    <option value={`prefix:${group.prefix}`}>All {group.label.toLowerCase()}</option>
                    {(Object.keys(ACTION_META) as AuditAction[])
                      .filter((action) => action.startsWith(group.prefix))
                      .map((action) => (
                        <option key={action} value={`action:${action}`}>
                          {ACTION_META[action].label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <select value={filters.severity} onChange={(e) => updateFilter("severity", e.target.value as Filters["severity"])} className={inputClass} aria-label="Severity">
                <option value="">All severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
              <select value={filters.result} onChange={(e) => updateFilter("result", e.target.value as Filters["result"])} className={inputClass} aria-label="Result">
                <option value="">All results</option>
                <option value="success">Success</option>
                <option value="failure">Failure</option>
                <option value="denied">Denied</option>
              </select>
              <input value={filters.username} onChange={(e) => updateFilter("username", e.target.value)} placeholder="Username" aria-label="Username" className={inputClass} />
              <input value={filters.ip} onChange={(e) => updateFilter("ip", e.target.value)} placeholder="IP address" aria-label="IP address" className={clsx(inputClass, "font-mono")} />
              <input type="datetime-local" value={filters.from} max={filters.to || undefined} onChange={(e) => updateFilter("from", e.target.value)} aria-label="From" className={inputClass} />
              <input type="datetime-local" value={filters.to} min={filters.from || undefined} onChange={(e) => updateFilter("to", e.target.value)} aria-label="To" className={inputClass} />
              <button
                type="button"
                disabled={!hasFilters}
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Clear filters
              </button>
            </div>

            {logs.error && <ErrorAlert error={logs.error} />}

            <div className={clsx("overflow-x-auto rounded-xl border border-zinc-200 bg-white transition-opacity dark:border-zinc-700 dark:bg-zinc-800", logs.isValidating && "opacity-60")}>
              <table className="w-full min-w-220 text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase dark:bg-zinc-900/50 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">IP address</th>
                    <th className="px-4 py-3 font-medium">Device</th>
                    <th className="px-4 py-3 font-medium">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700/60">
                  {!logs.data ? (
                    !logs.error && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center">
                          <CgSpinner className="inline h-6 w-6 animate-spin text-zinc-400" />
                        </td>
                      </tr>
                    )
                  ) : logs.data.data.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-zinc-500 dark:text-zinc-400">
                        {hasFilters ? "No audit logs match these filters" : "No audit logs yet"}
                      </td>
                    </tr>
                  ) : (
                    logs.data.data.map((log) => (
                      <tr key={log.id} onClick={() => setSelected(log)} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/40">
                        <td className="px-4 py-3 whitespace-nowrap text-zinc-600 tabular-nums dark:text-zinc-300" title={fullTime(log.occurred_at)}>
                          {format(new Date(log.occurred_at), "d MMM HH:mm:ss")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <SeverityBadge severity={log.severity} />
                            <span className="font-medium text-zinc-900 dark:text-white">{actionLabel(log.action)}</span>
                          </div>
                          <span className={clsx("text-xs capitalize", RESULT_STYLES[log.result])}>{log.result}</span>
                        </td>
                        <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">{log.actor_username ?? <span className="text-zinc-400">–</span>}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">{log.ip_address ?? "–"}</span>
                          {describeLocation(log) && <span className="block text-xs text-zinc-500 dark:text-zinc-400">{describeLocation(log)}</span>}
                        </td>
                        <td className="max-w-50 truncate px-4 py-3 text-zinc-600 dark:text-zinc-300" title={log.user_agent ?? undefined}>
                          {describeDevice(log.user_agent)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-300">{log.target_type ? `${log.target_type} #${log.target_id}` : "–"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* แบ่งหน้า */}
            {pagination && pagination.total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                <span>
                  {((pagination.page - 1) * pagination.limit + 1).toLocaleString()}–{Math.min(pagination.page * pagination.limit, pagination.total).toLocaleString()} of{" "}
                  {pagination.total.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    aria-label="Previous page"
                    className="cursor-pointer rounded-lg border border-zinc-300 p-2 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-zinc-700"
                  >
                    <HiChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-2 tabular-nums">
                    Page {page} / {pagination.total_pages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= pagination.total_pages}
                    onClick={() => setPage(page + 1)}
                    aria-label="Next page"
                    className="cursor-pointer rounded-lg border border-zinc-300 p-2 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-zinc-700"
                  >
                    <HiChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </TabPanel>
        </TabPanels>
      </TabGroup>

      <AuditLogDialog log={selected} onClose={() => setSelected(null)} onShowJson={(json) => setJsonView({ json })} />
      <JsonDialog value={jsonView} onClose={() => setJsonView(null)} />
    </div>
  );
}

export default Log_System_page
