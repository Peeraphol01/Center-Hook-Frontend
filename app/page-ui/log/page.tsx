"use client";

import { useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { useInView } from "react-intersection-observer";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import clsx from "clsx";
import { CgSpinner } from "react-icons/cg";
import {
  HiChevronLeft,
  HiOutlineChatAlt2,
  HiOutlineCursorClick,
  HiOutlineExclamationCircle,
  HiOutlineFilter,
  HiOutlinePaperClip,
  HiOutlineTemplate,
} from "react-icons/hi";
import { swrFetcher } from "@/app/lib/api-fetch";
import { useAuthStore } from "@/app/lib/auth";
import { getErrorMessage } from "@/app/lib/errors";
import type {
  ConversationListItem,
  ConversationListResponse,
  ConversationLog,
  ConversationLogsResponse,
  ForwardLogSummary,
  LineProfile,
} from "@/app/types/api/forward-logs";
import type { Webhook } from "@/app/types/api/webhooks";
import type { ChatContent, ChatPart, ChatPartBody, Json } from "@/app/types/page-ui/log";
import LineMessageCard from "@/app/components/line_message_card";
import JsonDialog from "@/app/components/json_dialog";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด PAGE_SIZE จำนวนรายการที่ขอต่อครั้ง (รายการแชท / ข้อความในแชท) เลื่อนถึงท้ายแล้วค่อยขอชุดถัดไป
const PAGE_SIZE = 10;

// กำหนด DEFAULT_PROJECT ชื่อ project ที่ backend บันทึกเมื่อ event ไม่มี smm_app / ไม่ตรงกับ webhook ไหน (center-hook: webhook.service.ts DEFAULT_LOG_NAME)
const DEFAULT_PROJECT = "default";

// กำหนด SYSTEM_EVENTS ข้อความของ event ที่ไม่ใช่ข้อความ (แสดงเป็นบรรทัดระบบกลางแชท)
const SYSTEM_EVENTS: Record<string, string> = {
  follow: "Added the OA as a friend",
  unfollow: "Blocked the OA",
  join: "Invited the OA to a group",
  leave: "The OA was removed from the group",
  memberJoined: "A member joined the group",
  memberLeft: "A member left the group",
  accountLink: "Account linked",
  beacon: "Near a beacon",
  videoPlayComplete: "Finished watching a video",
  unsend: "Unsent a message",
};

// กำหนด MEDIA_LABELS ป้ายของข้อความที่ไม่ใช่ text
const MEDIA_LABELS: Record<string, string> = {
  image: "Photo",
  video: "Video",
  audio: "Voice message",
  file: "File",
  location: "Location",
  sticker: "Sticker",
};

/* -------------------------------------- Functions -------------------------------------- */

// Function แปลงค่าเป็น object (ไม่ใช่ object = {})
function asObject(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

// Function แปลงค่าเป็น string (ไม่ใช่ string หรือว่าง = null)
function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

// Function URL รูปสติกเกอร์ของ LINE
function stickerUrl(stickerId: string) {
  return `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`;
}

// Function แปลงข้อความขาเข้า (event.message) — รูป/วิดีโอ/ไฟล์ของผู้ใช้ต้องใช้ token ดึง จึงแสดงเป็นป้าย
function fromInboundMessage(message: Json): ChatPartBody {
  const type = asString(message.type) ?? "unknown";
  switch (type) {
    case "text":
      return { kind: "text", text: asString(message.text) ?? "" };
    case "sticker":
      return asString(message.stickerId) ? { kind: "sticker", url: stickerUrl(String(message.stickerId)) } : { kind: "media", label: "Sticker" };
    case "file":
      return { kind: "media", label: `File ${asString(message.fileName) ?? ""}`.trim() };
    case "location":
      return { kind: "media", label: `Location ${asString(message.title) ?? asString(message.address) ?? ""}`.trim() };
    default:
      return { kind: "media", label: MEDIA_LABELS[type] ?? `[${type}]` };
  }
}

// Function แปลงข้อความขาออก (messages ที่ project ส่งไป LINE)
function fromOutboundMessage(message: Json): ChatPartBody {
  const type = asString(message.type) ?? "unknown";
  switch (type) {
    case "text":
      return { kind: "text", text: asString(message.text) ?? "" };
    case "sticker":
      return { kind: "sticker", url: stickerUrl(String(message.stickerId)) };
    case "image":
      return { kind: "image", url: asString(message.previewImageUrl) ?? asString(message.originalContentUrl) };
    case "flex": {
      const contents = asObject(message.contents);
      return contents.type ? { kind: "flex", contents } : { kind: "card", type, altText: asString(message.altText) ?? "" };
    }
    case "template": {
      const template = asObject(message.template);
      return template.type ? { kind: "template", template } : { kind: "card", type, altText: asString(message.altText) ?? "" };
    }
    case "imagemap": {
      // รูปของ imagemap อยู่ที่ baseUrl/<ความกว้าง> (700 = ขนาดที่ LINE ใช้บนมือถือทั่วไป)
      const baseUrl = asString(message.baseUrl);
      return baseUrl ? { kind: "image", url: `${baseUrl}/700` } : { kind: "card", type, altText: asString(message.altText) ?? "" };
    }
    default:
      return { kind: "media", label: MEDIA_LABELS[type] ?? `[${type}]` };
  }
}

// Function เก็บปุ่ม postback ทุกปุ่มในข้อความขาออก (data → displayText หรือ label) ไว้แสดงว่าผู้ใช้กดปุ่มไหน
function collectPostbackLabels(value: unknown, labels: Map<string, string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectPostbackLabels(item, labels));
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as Json;
  const data = asString(node.data);
  const label = asString(node.displayText) ?? asString(node.label);
  if (node.type === "postback" && data && label) labels.set(data, label);
  Object.values(node).forEach((child) => collectPostbackLabels(child, labels));
}

// Function แปลง payload ของ log เป็นสิ่งที่แสดงในแชท (รูปแบบอ้างอิง https://developers.line.biz/en/reference/messaging-api/)
function toChatContent(log: ConversationLog): ChatContent {
  const payload = asObject(log.payload);

  if (log.direction === "OUTBOUND") {
    const messages: ChatPart[] = Array.isArray(payload.messages) ? payload.messages.map((m) => ({ ...fromOutboundMessage(asObject(m)), source: m })) : [];
    return { kind: "bubble", parts: messages.length ? messages : [{ kind: "text", text: log.content ?? "", source: log.payload }] };
  }
  if (log.event_type === "message") {
    return { kind: "bubble", parts: [{ ...fromInboundMessage(asObject(payload.message)), source: payload.message }] };
  }
  if (log.event_type === "postback") {
    const postback = asObject(payload.postback);
    // params = ค่าที่ผู้ใช้เลือกจาก datetime picker / rich menu switch (ถ้ามี)
    const params = Object.values(asObject(postback.params)).filter((v): v is string => typeof v === "string").join(" ");
    return {
      kind: "bubble",
      parts: [{ kind: "postback", data: asString(postback.data) ?? log.content ?? "", params: params || undefined, source: payload.postback }],
    };
  }

  const unblocked = log.event_type === "follow" && asObject(payload.follow).isUnblocked === true;
  return { kind: "system", text: unblocked ? "Unblocked the OA" : (SYSTEM_EVENTS[log.event_type] ?? `Event: ${log.event_type}`), source: log.payload };
}

// Function ข้อความสั้นๆ ของ log ล่าสุดในรายการแชท (ไม่มี payload จึงใช้ content)
function previewText(log: ForwardLogSummary): string {
  const prefix = log.direction === "OUTBOUND" ? "You: " : "";
  if (log.direction === "INBOUND" && log.event_type !== "message" && log.event_type !== "postback") {
    return SYSTEM_EVENTS[log.event_type] ?? `Event: ${log.event_type}`;
  }
  if (log.event_type === "postback") return `Tapped: ${log.content ?? ""}`;
  if (log.message_type && log.message_type !== "text") return prefix + (MEDIA_LABELS[log.message_type] ?? log.content ?? `[${log.message_type}]`);
  return prefix + (log.content ?? "");
}

// Function ชื่อที่แสดงของ LINE user (ไม่มี display_name = Unknown + id ย่อ)
function displayName(profile: LineProfile | undefined, lineUserId: string) {
  return profile?.display_name ?? `Unknown (${lineUserId.slice(0, 9)}…)`;
}

// Function เวลาในรายการแชทแบบ LINE: วันนี้ = เวลา, เมื่อวาน = Yesterday, ก่อนหน้านั้น = วันที่
function listTime(iso: string) {
  const date = new Date(iso);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "d MMM");
}

// Function ป้ายตัวคั่นวันในแชท: Today / Yesterday / วันที่เต็ม
function dayLabel(iso: string) {
  const date = new Date(iso);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEE, d MMM yyyy");
}

/* -------------------------------------- Components -------------------------------------- */

// Function หน้า Log — รายการแชทแยกตาม LINE user และข้อความในแชท
function Log_page() {
  // โหลดข้อมูลเมื่อ AuthGuard ตรวจ session ผ่านแล้ว (มี profile)
  const ready = useAuthStore((s) => Boolean(s.profile));

  const [project, setProject] = useState("");
  const [selected, setSelected] = useState<ConversationListItem | null>(null);
  // JSON ที่เปิดใน popup (null = ปิด) — คลิกข้อความหรือส่วนใดของการ์ดในแชทเพื่อเปิด
  const [jsonView, setJsonView] = useState<{ json: unknown } | null>(null);
  const showJson = (json: unknown) => setJsonView({ json });
  const projectParam = project || undefined;

  // ตัวเลือก project = smm_app ในตาราง webhooks + default (ไม่มีสิทธิ์ webhooks:read จะเหลือแค่ default)
  const webhooks = useSWR(ready ? ["/api/webhooks"] : null, swrFetcher<{ data: Webhook[] }>);
  const projects = [...new Set([...(webhooks.data?.data.flatMap((w) => (w.smm_app ? [w.smm_app] : [])) ?? []), DEFAULT_PROJECT])];

  // รายการแชท (โหลดเพิ่มทีละ PAGE_SIZE รายการเมื่อเลื่อนถึงท้าย)
  const conversations = useSWRInfinite<ConversationListResponse>(
    (index, prev) =>
      !ready || (prev && !prev.pagination.has_more)
        ? null
        : ["/api/forward-logs/conversations", { page: index + 1, limit: PAGE_SIZE, project: projectParam }],
    swrFetcher,
    // ไม่โหลดหน้าแรกซ้ำทุกครั้งที่โหลดหน้าเพิ่ม
    { revalidateFirstPage: false },
  );
  const conversationItems = conversations.data?.flatMap((page) => page.data) ?? [];
  const conversationsHasMore = conversations.data?.at(-1)?.pagination.has_more ?? false;
  const conversationsLoaded = conversations.data?.length ?? 0;

  // ข้อความในแชท (ใหม่ไปเก่า โหลดข้อความเก่าด้วย before_id เมื่อเลื่อนขึ้นบนสุด)
  const chat = useSWRInfinite<ConversationLogsResponse>(
    (_index, prev) =>
      !ready || !selected || (prev && !prev.has_more)
        ? null
        : [`/api/forward-logs/conversations/${encodeURIComponent(selected.line_user_id)}`, { limit: PAGE_SIZE, project: projectParam, before_id: prev?.data.at(-1)?.id }],
    swrFetcher,
    // ไม่โหลดหน้าแรกซ้ำทุกครั้งที่โหลดข้อความเก่าเพิ่ม
    { revalidateFirstPage: false },
  );
  const logs = chat.data?.flatMap((page) => page.data) ?? [];
  const chatHasMore = chat.data?.at(-1)?.has_more ?? false;
  const chatLoaded = chat.data?.length ?? 0;
  const chatProfile = chat.data?.[0]?.profile ?? selected?.profile;

  // ชื่อปุ่มที่ผู้ใช้กด — จับคู่ data ของ postback กับปุ่มในข้อความขาออกที่โหลดมาแล้ว
  const postbackLabels = new Map<string, string>();
  logs.forEach((log) => log.direction === "OUTBOUND" && collectPostbackLabels(log.payload, postbackLabels));

  // จุดสังเกตการเลื่อน — เห็นแล้วโหลดหน้าถัดไป ทีละหน้า (หน้าก่อนหน้ายังโหลดไม่เสร็จ / error = ไม่ขอเพิ่ม)
  // key ผูกกับจำนวนหน้าที่โหลดเสร็จแล้ว ให้สังเกตใหม่หลังโหลดเสร็จ (ยังเห็นอยู่ก็โหลดหน้าต่อไป)
  const { ref: moreConversationsRef } = useInView({
    onChange: (inView) =>
      inView && conversationsHasMore && conversations.size === conversationsLoaded && !conversations.error && conversations.setSize(conversationsLoaded + 1),
  });
  const { ref: olderMessagesRef } = useInView({
    onChange: (inView) => inView && chatHasMore && chat.size === chatLoaded && !chat.error && chat.setSize(chatLoaded + 1),
  });

  // รูปโปรไฟล์ LINE user (ไม่มีรูป = ตัวอักษรแรกของชื่อ)
  const avatar = (profile: LineProfile | undefined, lineUserId: string, size: string) =>
    profile?.picture_url ? (
      <img src={profile.picture_url} alt="" className={clsx(size, "shrink-0 rounded-full bg-zinc-200 object-cover dark:bg-zinc-600")} />
    ) : (
      <div className={clsx(size, "flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-zinc-300 to-zinc-400 text-sm font-semibold text-white dark:from-zinc-600 dark:to-zinc-600")}>
        {displayName(profile, lineUserId).slice(0, 1).toUpperCase()}
      </div>
    );

/* -------------------------------------- UI -------------------------------------- */

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 bg-white md:h-dvh dark:bg-zinc-900">
      {/* ---------- รายการแชท ---------- */}
      <section
        className={clsx(
          "w-full min-h-0 flex-col border-r border-zinc-200 lg:flex lg:w-80 xl:w-96 dark:border-zinc-700",
          selected ? "hidden" : "flex",
        )}
      >
        <div className="space-y-3 border-b border-zinc-200 p-4 dark:border-zinc-700">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Chats</h1>

          {/* Filter: project */}
          <div className="relative">
            <HiOutlineFilter className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              aria-label="Filter by project"
              className="block w-full cursor-pointer appearance-none rounded-lg border border-zinc-300 bg-zinc-50 py-2 pr-8 pl-9 text-sm text-zinc-900 focus:border-red-500 focus:ring-4 focus:ring-red-500/15 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
            >
              <option value="">All projects</option>
              {projects.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <HiChevronLeft className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 -rotate-90 text-zinc-400" />
          </div>
          {webhooks.error && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Project list unavailable: {getErrorMessage(webhooks.error)}</p>
          )}
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {conversations.error ? (
            <li className="p-6 text-center text-sm text-red-600 dark:text-red-400">{getErrorMessage(conversations.error)}</li>
          ) : !conversations.data ? (
            <li className="flex justify-center p-6">
              <CgSpinner className="h-6 w-6 animate-spin text-zinc-400" />
            </li>
          ) : conversationItems.length === 0 ? (
            <li className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">{project ? `No chats for ${project}` : "No chats yet"}</li>
          ) : (
            conversationItems.map((item) => (
              <li key={item.line_user_id}>
                <button
                  type="button"
                  onClick={() => setSelected(item)}
                  className={clsx(
                    "flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors",
                    selected?.line_user_id === item.line_user_id ? "bg-red-50 dark:bg-red-600/20" : "hover:bg-zinc-50 dark:hover:bg-zinc-800",
                  )}
                >
                  {avatar(item.profile, item.line_user_id, "h-12 w-12")}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                        {displayName(item.profile, item.line_user_id)}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-400">{listTime(item.last_log.created_at)}</span>
                    </div>
                    <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{previewText(item.last_log)}</p>
                    <span className="mt-1 inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                      {item.last_log.project}
                    </span>
                  </div>
                </button>
              </li>
            ))
          )}
          {conversationsHasMore && (
            <li key={conversationsLoaded} ref={moreConversationsRef} className="flex justify-center p-4">
              <CgSpinner className="h-5 w-5 animate-spin text-zinc-400" />
            </li>
          )}
        </ul>
      </section>

      {/* ---------- ห้องแชท ---------- */}
      <section className={clsx("min-h-0 min-w-0 flex-1 flex-col lg:flex", selected ? "flex" : "hidden")}>
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#8CABD9]/15 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <HiOutlineChatAlt2 className="h-12 w-12" />
            <p className="text-sm">Select a chat to view messages</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="-ml-2 cursor-pointer rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 lg:hidden dark:text-zinc-300 dark:hover:bg-zinc-700"
                aria-label="Back to chats"
              >
                <HiChevronLeft className="h-6 w-6" />
              </button>
              {avatar(chatProfile, selected.line_user_id, "h-10 w-10")}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{displayName(chatProfile, selected.line_user_id)}</p>
                <p className="truncate font-mono text-xs text-zinc-400">{selected.line_user_id}</p>
              </div>
            </header>

            {/* Messages — flex-col-reverse ให้ข้อความใหม่อยู่ล่างสุด และเลื่อนขึ้นเพื่อโหลดข้อความเก่า */}
            <div className="flex min-h-0 flex-1 flex-col-reverse gap-3 overflow-y-auto bg-[#8CABD9]/15 px-4 py-4 dark:bg-zinc-800">
              {chat.error ? (
                <p className="m-auto text-sm text-red-600 dark:text-red-400">{getErrorMessage(chat.error)}</p>
              ) : !chat.data ? (
                <CgSpinner className="m-auto h-6 w-6 animate-spin text-zinc-400" />
              ) : logs.length === 0 ? (
                <p className="m-auto text-sm text-zinc-500 dark:text-zinc-400">No messages{project && ` for ${project}`}</p>
              ) : (
                logs.map((log, index) => {
                  const content = toChatContent(log);
                  const outbound = log.direction === "OUTBOUND";
                  const older = logs[index + 1];
                  const time = format(new Date(log.created_at), "HH:mm");
                  const meta = outbound ? (log.event_type === "reply" ? "Auto reply" : `Sent by ${log.project}`) : `→ ${log.project}`;

                  return (
                    <div key={log.id} className="contents">
                      {content.kind === "system" ? (
                        <p
                          onClick={() => showJson(content.source)}
                          className="mx-auto cursor-pointer rounded-full bg-black/10 px-3 py-1 text-xs text-zinc-700 hover:bg-black/15 dark:bg-white/10 dark:text-zinc-300"
                        >
                          {content.text} · {time}
                        </p>
                      ) : (
                        <div className={clsx("flex items-end gap-2", outbound && "flex-row-reverse")}>
                          {!outbound && avatar(chatProfile, selected.line_user_id, "h-8 w-8 self-start")}

                          <div className={clsx("flex max-w-[75%] flex-col gap-1", outbound ? "items-end" : "items-start")}>
                            {content.parts.map((part, partIndex) => {
                              const key = `${log.id}-${partIndex}`;
                              const openJson = () => showJson(part.source);
                              // การ์ด Flex / Template คลิกตรงไหนก็เปิด JSON ของทั้งข้อความ
                              if (part.kind === "flex" || part.kind === "template")
                                return (
                                  <div key={key} onClick={openJson} className="max-w-full cursor-pointer rounded-2xl transition hover:brightness-95">
                                    <LineMessageCard part={part} />
                                  </div>
                                );
                              if (part.kind === "sticker")
                                return <img key={key} src={part.url} alt="Sticker" onClick={openJson} className="h-28 w-28 cursor-pointer object-contain" />;
                              if (part.kind === "image" && part.url)
                                return <img key={key} src={part.url} alt="Photo" onClick={openJson} className="max-h-60 cursor-pointer rounded-2xl object-cover" />;

                              return (
                                <div
                                  key={key}
                                  onClick={openJson}
                                  className={clsx(
                                    "cursor-pointer rounded-2xl px-3.5 py-2 text-sm shadow-sm hover:brightness-95",
                                    outbound ? "rounded-tr-sm bg-[#06C755] text-white" : "rounded-tl-sm bg-white text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100",
                                  )}
                                >
                                  {part.kind === "text" && <p className="break-words whitespace-pre-wrap">{part.text}</p>}
                                  {part.kind === "image" && (
                                    <span className="flex items-center gap-1.5 italic">
                                      <HiOutlinePaperClip className="h-4 w-4" /> Photo
                                    </span>
                                  )}
                                  {part.kind === "media" && (
                                    <span className="flex items-center gap-1.5 italic">
                                      <HiOutlinePaperClip className="h-4 w-4" /> {part.label}
                                    </span>
                                  )}
                                  {part.kind === "card" && (
                                    <span className="flex items-center gap-1.5">
                                      <HiOutlineTemplate className="h-4 w-4 shrink-0" />
                                      <span>
                                        <span className="font-medium capitalize">{part.type}</span>
                                        {part.altText && ` · ${part.altText}`}
                                      </span>
                                    </span>
                                  )}
                                  {/* ปุ่มที่ผู้ใช้กด: ชื่อปุ่ม (หาไม่เจอ = "Tapped a button") + ค่าที่เลือก — data ดูได้จาก JSON ตอนคลิก */}
                                  {part.kind === "postback" && (
                                    <span className="flex flex-col gap-0.5">
                                      <span className="flex items-center gap-1.5">
                                        <HiOutlineCursorClick className="h-4 w-4 shrink-0" />
                                        <span className="font-medium">{postbackLabels.get(part.data) ?? "Tapped a button"}</span>
                                      </span>
                                      {part.params && <span className="text-xs text-zinc-600 dark:text-zinc-300">{part.params}</span>}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* เวลา + project + สถานะการส่ง */}
                          <div className={clsx("flex shrink-0 flex-col pb-0.5 text-[10px] leading-tight text-zinc-500 dark:text-zinc-400", outbound ? "items-end" : "items-start")}>
                            {log.status === "FAILED" && (
                              <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400" title={log.error_message ?? undefined}>
                                <HiOutlineExclamationCircle className="h-3.5 w-3.5" /> Failed
                              </span>
                            )}
                            {log.status === "SKIPPED" && <span className="text-amber-600 dark:text-amber-400">Skipped</span>}
                            <span>{meta}</span>
                            <span>{time}</span>
                          </div>
                        </div>
                      )}

                      {/* ตัวคั่นวัน (อยู่เหนือข้อความแรกของแต่ละวัน) */}
                      {(!older || !isSameDay(new Date(log.created_at), new Date(older.created_at))) && (
                        <p className="mx-auto rounded-full bg-black/10 px-3 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-white/10 dark:text-zinc-300">
                          {dayLabel(log.created_at)}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
              {chatHasMore && (
                <div key={chatLoaded} ref={olderMessagesRef} className="flex justify-center py-2">
                  <CgSpinner className="h-5 w-5 animate-spin text-zinc-400" />
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <JsonDialog value={jsonView} onClose={() => setJsonView(null)} />
    </div>
  );
}

export default Log_page
