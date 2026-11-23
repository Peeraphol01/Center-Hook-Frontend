/* eslint-disable @next/next/no-img-element -- รูปใน Flex / Template มาจาก URL ของแต่ละ project */
import type { CSSProperties } from "react";
import type { ChatPart, Json } from "@/app/types/page-ui/log";

/* -------------------------------------- Config -------------------------------------- */

// กำหนด SPACING ขนาด keyword ของ spacing / margin / padding / cornerRadius (px) ตามสเปก Flex Message
const SPACING: Record<string, number> = { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 };

// กำหนด TEXT_SIZES ขนาดตัวอักษรของ text / span / icon (px)
const TEXT_SIZES: Record<string, number> = { xxs: 11, xs: 13, sm: 14, md: 16, lg: 19, xl: 22, xxl: 29, "3xl": 35, "4xl": 48, "5xl": 74 };

// กำหนด IMAGE_SIZES ความกว้างของ image (px) — "full" = เต็มความกว้าง
const IMAGE_SIZES: Record<string, number> = { xxs: 40, xs: 60, sm: 80, md: 100, lg: 120, xl: 140, xxl: 160, "3xl": 180, "4xl": 200, "5xl": 220 };

// กำหนด BORDER_WIDTHS ความหนาเส้นขอบของ box (px)
const BORDER_WIDTHS: Record<string, number> = { none: 0, light: 0.5, normal: 1, medium: 2, "semi-bold": 3, bold: 4 };

// กำหนด BUBBLE_WIDTHS ความกว้างของ bubble ตาม size (px)
const BUBBLE_WIDTHS: Record<string, number> = { nano: 120, micro: 160, deca: 220, hecto: 241, kilo: 260, mega: 300, giga: 386 };

// กำหนด BLOCK_PADDING padding เริ่มต้นของแต่ละส่วนใน bubble (hero ไม่มี padding)
const BLOCK_PADDING: Record<string, string> = { header: "20px", body: "20px", footer: "10px" };

// กำหนด POSITION แปลง keyword ตำแหน่งของ LINE เป็นค่า CSS
const POSITION: Record<string, string> = {
  start: "flex-start",
  top: "flex-start",
  "flex-start": "flex-start",
  center: "center",
  end: "flex-end",
  bottom: "flex-end",
  "flex-end": "flex-end",
  "space-between": "space-between",
  "space-around": "space-around",
  "space-evenly": "space-evenly",
};

const SEPARATOR_COLOR = "#d4d6da";

// ข้อมูลจาก box แม่ที่ลูกต้องใช้ (ทิศทาง, ลำดับ, spacing ระหว่างลูก)
type Ctx = { layout: string; index: number; spacing?: string };

/* -------------------------------------- Functions -------------------------------------- */

// Function แปลงค่าเป็น object (ไม่ใช่ object = {})
function asObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

// Function แปลงค่าเป็น array ของ object (ไม่ใช่ array = [])
function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? value.map(asObject) : [];
}

// Function แปลงค่าเป็น string (ไม่ใช่ string หรือว่าง = undefined)
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

// Function แปลงขนาดเป็นค่า CSS — keyword ใช้ตาราง, "10px" / "50%" ใช้ตามเดิม
function toSize(value: unknown, keywords?: Record<string, number>): string | undefined {
  const text = asString(value);
  if (!text) return undefined;
  if (keywords && text in keywords) return `${keywords[text]}px`;
  return /^-?\d+(\.\d+)?(px|%)$/.test(text) ? text : undefined;
}

// Function แปลง aspectRatio "W:H" เป็นค่า CSS (ไม่ระบุ = 1:1)
function toAspectRatio(value: unknown) {
  const [width, height] = (asString(value) ?? "1:1").split(":").map(Number);
  return width > 0 && height > 0 ? `${width} / ${height}` : "1 / 1";
}

// Function style ที่ทุก component ใช้ร่วม: flex, margin/spacing จากลูกก่อนหน้า, position / offset
function itemStyle(node: Json, ctx: Ctx, defaultFlex?: number): CSSProperties {
  const horizontal = ctx.layout !== "vertical";
  const grow = typeof node.flex === "number" ? node.flex : (defaultFlex ?? (horizontal ? 1 : 0));
  const gap = ctx.index > 0 ? (toSize(node.margin, SPACING) ?? ctx.spacing) : undefined;
  return {
    flex: grow > 0 ? `${grow} 1 0` : "0 0 auto",
    minWidth: 0,
    [horizontal ? "marginLeft" : "marginTop"]: gap,
    position: node.position === "absolute" ? "absolute" : "relative",
    top: toSize(node.offsetTop),
    bottom: toSize(node.offsetBottom),
    left: toSize(node.offsetStart),
    right: toSize(node.offsetEnd),
  };
}

// Function ข้อความที่แสดงเมื่อชี้ที่ปุ่ม (ปลายทางของ action)
function actionTitle(action: Json) {
  return asString(action.uri) ?? asString(action.data) ?? asString(action.text);
}

/* -------------------------------------- Components -------------------------------------- */

// Function วาด component ใน Flex ตาม type
function FlexNode({ node, ctx }: { node: Json; ctx: Ctx }) {
  switch (node.type) {
    case "box":
      return <FlexBox node={node} ctx={ctx} />;
    case "text":
      return <FlexText node={node} ctx={ctx} />;
    case "image":
      return <FlexImage node={node} ctx={ctx} />;
    case "video":
      return <FlexImage node={{ ...node, url: node.previewUrl, size: "full" }} ctx={ctx} />;
    case "icon": {
      const height = TEXT_SIZES[asString(node.size) ?? "md"] ?? 16;
      const [w, h] = (asString(node.aspectRatio) ?? "1:1").split(":").map(Number);
      return <img src={asString(node.url)} alt="" style={{ ...itemStyle(node, ctx, 0), height, width: w > 0 && h > 0 ? (height * w) / h : height }} />;
    }
    case "button":
      return <FlexButton node={node} ctx={ctx} />;
    case "separator": {
      const border = `1px solid ${asString(node.color) ?? SEPARATOR_COLOR}`;
      const vertical = ctx.layout === "vertical";
      return <div style={{ ...itemStyle(node, ctx, 0), alignSelf: "stretch", ...(vertical ? { borderTop: border } : { borderLeft: border }) }} />;
    }
    case "filler":
      return <div style={itemStyle(node, ctx, 1)} />;
    case "spacer":
      return <div style={{ flex: "0 0 auto", [ctx.layout === "vertical" ? "height" : "width"]: toSize(node.size ?? "md", SPACING) }} />;
    default:
      return null;
  }
}

// Function วาด box (layout vertical / horizontal / baseline) และลูกข้างใน
function FlexBox({ node, ctx }: { node: Json; ctx: Ctx }) {
  const layout = asString(node.layout) ?? "vertical";
  const spacing = toSize(node.spacing, SPACING);
  const radius = toSize(node.cornerRadius, SPACING);
  const borderWidth = toSize(node.borderWidth, BORDER_WIDTHS);
  const background = asObject(node.background);
  const fixedSize = node.flex === undefined && (node.width !== undefined || node.height !== undefined);
  const padding = (side: string) => toSize(node[`padding${side}`], SPACING) ?? toSize(node.paddingAll, SPACING);

  const style: CSSProperties = {
    ...itemStyle(node, ctx),
    ...(fixedSize && { flex: "0 0 auto" }),
    display: "flex",
    flexDirection: layout === "vertical" ? "column" : "row",
    alignItems: layout === "baseline" ? "baseline" : POSITION[asString(node.alignItems) ?? ""],
    justifyContent: POSITION[asString(node.justifyContent) ?? ""],
    backgroundColor: asString(node.backgroundColor),
    backgroundImage:
      background.type === "linearGradient"
        ? `linear-gradient(${asString(background.angle) ?? "0deg"}, ${asString(background.startColor)}, ${
            background.centerColor ? `${asString(background.centerColor)} ${asString(background.centerPosition) ?? "50%"}, ` : ""
          }${asString(background.endColor)})`
        : undefined,
    border: borderWidth ? `${borderWidth} solid ${asString(node.borderColor) ?? "transparent"}` : undefined,
    borderRadius: radius,
    overflow: radius ? "hidden" : undefined,
    paddingTop: padding("Top"),
    paddingBottom: padding("Bottom"),
    paddingLeft: padding("Start"),
    paddingRight: padding("End"),
    width: toSize(node.width),
    height: toSize(node.height),
    maxWidth: toSize(node.maxWidth),
    maxHeight: toSize(node.maxHeight),
  };

  return (
    <div style={style} title={actionTitle(asObject(node.action))}>
      {asArray(node.contents).map((child, index) => (
        <FlexNode key={index} node={child} ctx={{ layout, index, spacing }} />
      ))}
    </div>
  );
}

// Function วาด text (รวม span) — wrap: false = บรรทัดเดียวตัดด้วย …
function FlexText({ node, ctx }: { node: Json; ctx: Ctx }) {
  const maxLines = typeof node.maxLines === "number" && node.maxLines > 0 ? node.maxLines : undefined;
  const spans = asArray(node.contents).filter((span) => span.type === "span");
  const fontStyle = (item: Json): CSSProperties => ({
    fontSize: toSize(item.size, TEXT_SIZES),
    fontWeight: item.weight === "bold" ? 700 : undefined,
    color: asString(item.color),
    fontStyle: item.style === "italic" ? "italic" : undefined,
    textDecoration: item.decoration === "underline" || item.decoration === "line-through" ? item.decoration : undefined,
  });

  const style: CSSProperties = {
    ...itemStyle(node, ctx),
    fontSize: "16px",
    color: "#111111",
    ...fontStyle(node),
    textAlign: node.align === "center" ? "center" : node.align === "end" ? "right" : "left",
    alignSelf: POSITION[asString(node.gravity) ?? ""],
    lineHeight: toSize(node.lineSpacing) ? `calc(1.4em + ${toSize(node.lineSpacing)})` : 1.4,
    ...(node.wrap === true
      ? { whiteSpace: "pre-wrap", overflowWrap: "anywhere", ...(maxLines && { display: "-webkit-box", WebkitLineClamp: maxLines, WebkitBoxOrient: "vertical", overflow: "hidden" }) }
      : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }),
  };

  return (
    <p style={style}>
      {spans.length
        ? spans.map((span, index) => (
            <span key={index} style={fontStyle(span)}>
              {asString(span.text)}
            </span>
          ))
        : asString(node.text)}
    </p>
  );
}

// Function วาด image ตาม size / aspectRatio / aspectMode
function FlexImage({ node, ctx }: { node: Json; ctx: Ctx }) {
  const size = asString(node.size) ?? "md";
  const width = size === "full" ? "100%" : (toSize(size, IMAGE_SIZES) ?? "100px");
  return (
    <div style={{ ...itemStyle(node, ctx), display: "flex", justifyContent: POSITION[asString(node.align) ?? "center"], alignSelf: POSITION[asString(node.gravity) ?? ""] }}>
      <img
        src={asString(node.url)}
        alt=""
        style={{
          width,
          maxWidth: "100%",
          aspectRatio: toAspectRatio(node.aspectRatio),
          objectFit: node.aspectMode === "cover" ? "cover" : "contain",
          backgroundColor: asString(node.backgroundColor),
        }}
      />
    </div>
  );
}

// Function วาด button (style primary / secondary / link) — ชี้ค้างเพื่อดูปลายทางของ action
function FlexButton({ node, ctx }: { node: Json; ctx: Ctx }) {
  const action = asObject(node.action);
  const color = asString(node.color);
  const look: CSSProperties =
    node.style === "primary"
      ? { backgroundColor: color ?? "#17c950", color: "#ffffff" }
      : node.style === "secondary"
        ? { backgroundColor: color ?? "#dcdfe5", color: "#111111" }
        : { color: color ?? "#42659a" };
  return (
    <div
      title={actionTitle(action)}
      style={{
        ...itemStyle(node, ctx),
        ...look,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        alignSelf: POSITION[asString(node.gravity) ?? ""],
        height: node.height === "sm" ? 40 : 52,
        padding: "0 16px",
        borderRadius: 8,
        fontSize: 16,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
    >
      {asString(action.label)}
    </div>
  );
}

// Function วาด bubble (header / hero / body / footer)
function FlexBubble({ bubble }: { bubble: Json }) {
  const styles = asObject(bubble.styles);
  const blocks = ["header", "hero", "body", "footer"].filter((name) => bubble[name]);
  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm"
      style={{ width: BUBBLE_WIDTHS[asString(bubble.size) ?? "mega"] ?? 300, maxWidth: "100%", direction: bubble.direction === "rtl" ? "rtl" : "ltr" }}
    >
      {blocks.map((name, index) => {
        const block = asObject(bubble[name]);
        const blockStyle = asObject(styles[name]);
        return (
          <div
            key={name}
            className="flex flex-col"
            style={{
              flex: name === "body" ? "1 1 auto" : "0 0 auto",
              backgroundColor: asString(blockStyle.backgroundColor),
              borderTop: index > 0 && blockStyle.separator === true ? `1px solid ${asString(blockStyle.separatorColor) ?? SEPARATOR_COLOR}` : undefined,
            }}
          >
            {name === "hero" ? (
              <FlexNode node={block} ctx={{ layout: "vertical", index: 0 }} />
            ) : (
              <FlexBox node={{ paddingAll: BLOCK_PADDING[name], ...block }} ctx={{ layout: "vertical", index: 0 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Function วาดปุ่มของ Template Message (ตัวอักษรสีน้ำเงิน มีเส้นคั่นด้านบน)
function TemplateAction({ action }: { action: Json }) {
  return (
    <div title={actionTitle(action)} className="truncate border-t border-zinc-200 px-3 py-3 text-center text-sm text-[#42659a]">
      {asString(action.label)}
    </div>
  );
}

// Function วาด 1 ช่องของ Template Message แบบ buttons / carousel (รูป + หัวข้อ + ข้อความ + ปุ่ม)
function TemplateColumn({ column, template }: { column: Json; template: Json }) {
  const image = asString(column.thumbnailImageUrl);
  return (
    <div className="flex w-75 max-w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-white text-zinc-900 shadow-sm">
      {image && (
        <img
          src={image}
          alt=""
          style={{
            aspectRatio: template.imageAspectRatio === "square" ? "1 / 1" : "1.51 / 1",
            objectFit: template.imageSize === "contain" ? "contain" : "cover",
            backgroundColor: asString(column.imageBackgroundColor) ?? "#ffffff",
          }}
        />
      )}
      <div className="flex-1 space-y-1 px-4 py-3">
        {asString(column.title) && <p className="font-bold">{asString(column.title)}</p>}
        <p className="text-sm whitespace-pre-wrap text-zinc-700">{asString(column.text)}</p>
      </div>
      {asArray(column.actions).map((action, index) => (
        <TemplateAction key={index} action={action} />
      ))}
    </div>
  );
}

// Function วาด Template Message (buttons / confirm / carousel / image_carousel)
function TemplateCard({ template }: { template: Json }) {
  switch (template.type) {
    case "buttons":
      return <TemplateColumn column={template} template={template} />;
    case "confirm":
      return (
        <div className="w-75 max-w-full overflow-hidden rounded-2xl bg-white text-zinc-900 shadow-sm">
          <p className="px-4 py-4 text-center text-sm whitespace-pre-wrap">{asString(template.text)}</p>
          <div className="grid grid-cols-2 divide-x divide-zinc-200">
            {asArray(template.actions).map((action, index) => (
              <TemplateAction key={index} action={action} />
            ))}
          </div>
        </div>
      );
    case "carousel":
      return (
        <div className="flex max-w-full items-stretch gap-2 overflow-x-auto pb-1">
          {asArray(template.columns).map((column, index) => (
            <TemplateColumn key={index} column={column} template={template} />
          ))}
        </div>
      );
    case "image_carousel":
      return (
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {asArray(template.columns).map((column, index) => {
            const action = asObject(column.action);
            return (
              <div key={index} title={actionTitle(action)} className="relative w-48 shrink-0 overflow-hidden rounded-2xl shadow-sm">
                <img src={asString(column.imageUrl)} alt="" className="aspect-square w-full object-cover" />
                {asString(action.label) && (
                  <span className="absolute inset-x-0 bottom-3 mx-auto w-fit max-w-[90%] truncate rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                    {asString(action.label)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    default:
      return null;
  }
}

// Function วาด Flex Message (bubble / carousel) หรือ Template Message ให้หน้าตาเหมือนในแอป LINE
function LineMessageCard({ part }: { part: Extract<ChatPart, { kind: "flex" | "template" }> }) {
  if (part.kind === "template") return <TemplateCard template={part.template} />;

  if (part.contents.type === "carousel") {
    return (
      <div className="flex max-w-full items-stretch gap-2 overflow-x-auto pb-1">
        {asArray(part.contents.contents).map((bubble, index) => (
          <FlexBubble key={index} bubble={bubble} />
        ))}
      </div>
    );
  }
  return <FlexBubble bubble={part.contents} />;
}

export default LineMessageCard;
