/**
 * Figma spec ビルダー（DESIGN.md §4.6 の契約に厳密に従う）。
 *
 * - `$color.<key>` はトークン参照。tokens.color に無いキーは書かない。
 * - node に x/y は無い。配置はすべて auto-layout（layout.mode / align / counterAlign）で作る。
 * - 決定論的。AI は後段で「微調整」するだけ（`api.ai("figmaSpec")`）。
 */
import guide from "../data/promptGuide.json" with { type: "json" };
import { assignRoles, readableOn } from "./palette.js";

export const FONT_FAMILIES = [
  "Noto Sans JP",
  "Zen Kaku Gothic New",
  "Shippori Mincho",
  "Zen Old Mincho",
  "M PLUS 1p",
  "Inter",
  "Helvetica Neue",
];

export const TYPE_RATIOS = [1.2, 1.25, 1.333, 1.5];

export const SPACE_PRESETS = {
  compact: [4, 8, 12, 16, 20, 28, 40, 56],
  normal: [4, 8, 12, 16, 24, 32, 48, 64],
  airy: [4, 8, 16, 24, 32, 48, 72, 96],
};

export const RADIUS_PRESETS = {
  sharp: [0, 2, 4, 8, 999],
  soft: [0, 4, 8, 16, 999],
  round: [0, 8, 16, 24, 999],
};

/** アスペクト比 → フレームの実寸（短辺 1080、長辺は 2560 で頭打ち） */
export function frameSize(aspect) {
  const ar = (guide.aspectRatios || []).find((a) => a.id === aspect) || { w: 16, h: 9 };
  const ratio = (ar.w || 16) / (ar.h || 9);
  const SHORT = 1080;
  const MAX_LONG = 2560;
  let w;
  let h;
  if (ratio >= 1) {
    h = SHORT;
    w = Math.round(SHORT * ratio);
    if (w > MAX_LONG) { w = MAX_LONG; h = Math.round(MAX_LONG / ratio); }
  } else {
    w = SHORT;
    h = Math.round(SHORT / ratio);
    if (h > MAX_LONG) { h = MAX_LONG; w = Math.round(MAX_LONG * ratio); }
  }
  return { w, h };
}

/** base / ratio から 6 段の書体スケールを作る */
export function typeScale(base = 16, ratio = 1.25) {
  const b = Number(base) || 16;
  const r = Number(ratio) || 1.25;
  const round = (v) => Math.max(10, Math.round(v));
  return {
    display: round(b * r ** 4),
    h1: round(b * r ** 3),
    h2: round(b * r ** 2),
    h3: round(b * r),
    body: round(b),
    caption: round(b / r),
  };
}

/**
 * 配色 + 書体設定 → spec.tokens
 * @param {object} opts { colors, palette, body, display, base, ratio, space, radius }
 */
export function buildTokens({
  colors = null,
  palette = [],
  body = "Noto Sans JP",
  display = "Shippori Mincho",
  base = 16,
  ratio = 1.25,
  space = "normal",
  radius = "soft",
  lineHeight = 1.5,
} = {}) {
  const color = colors && colors.bg ? { ...colors } : assignRoles(palette);
  if (!color.onPrimary) color.onPrimary = readableOn(color.primary);
  return {
    color,
    type: {
      family: body,
      displayFamily: display,
      scale: typeScale(base, ratio),
      lineHeight: Number(lineHeight) || 1.5,
      baseSize: Number(base) || 16,
      ratio: Number(ratio) || 1.25,
    },
    space: SPACE_PRESETS[space] || SPACE_PRESETS.normal,
    radius: RADIUS_PRESETS[radius] || RADIUS_PRESETS.soft,
  };
}

/* ---------- node helpers ---------- */

const strip = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) out[k] = v;
  return out;
};

const text = (name, value, style, color, extra = {}) =>
  strip({
    type: "text",
    name,
    size: { wMode: extra.wMode || "fill", hMode: "hug" },
    text: strip({ value, style, color, align: extra.align || "left", family: extra.family || "body" }),
  });

const frame = (name, layout, children, extra = {}) =>
  strip({
    type: "frame",
    name,
    layout,
    size: extra.size || { wMode: "hug", hMode: "hug" },
    fill: extra.fill,
    stroke: extra.stroke,
    radius: extra.radius,
    opacity: extra.opacity,
    children,
  });

const lay = (mode, padding, gap, align = "start", counterAlign = "start") => ({
  mode, padding, gap, align, counterAlign,
});

/** 見出しゾーンの位置 → auto-layout の並び */
function zoneLayout(zone, sp) {
  const pad = [sp[5], sp[5], sp[5], sp[5]];
  switch (zone) {
    case "bottom": return { mode: "vertical", padding: pad, gap: sp[4], align: "end", counterAlign: "start" };
    case "left": return { mode: "horizontal", padding: pad, gap: sp[4], align: "start", counterAlign: "center" };
    case "right": return { mode: "horizontal", padding: pad, gap: sp[4], align: "end", counterAlign: "center" };
    case "center": return { mode: "vertical", padding: pad, gap: sp[4], align: "center", counterAlign: "center" };
    case "top":
    default: return { mode: "vertical", padding: pad, gap: sp[4], align: "start", counterAlign: "start" };
  }
}

/* ---------- components ---------- */

function buttonVariant(t, variant, size) {
  const sp = t.space;
  const pad = size === "L" ? [sp[3], sp[5], sp[3], sp[5]] : [sp[1] + 2, sp[4], sp[1] + 2, sp[4]];
  const fill = variant === "Primary" ? "$color.primary" : variant === "Secondary" ? "$color.surface" : undefined;
  const label = variant === "Primary" ? "$color.onPrimary" : "$color.primary";
  const stroke = variant === "Secondary" ? { color: "$color.line", width: 1 } : undefined;
  return frame(
    `Button / ${variant} / ${size}`,
    lay("horizontal", pad, sp[1], "center", "center"),
    [text("Label", "詳しく見る", size === "L" ? "h3" : "body", label, { wMode: "hug", align: "center" })],
    { size: { wMode: "hug", hMode: "hug" }, fill, stroke, radius: t.radius[2] },
  );
}

function tagVariant(t, tone) {
  const sp = t.space;
  const fill = tone === "Accent" ? "$color.accent" : "$color.surface";
  const color = tone === "Accent" ? readableOnRef(t, "accent") : "$color.inkSoft";
  return frame(
    `Tag / ${tone}`,
    lay("horizontal", [sp[0], sp[2], sp[0], sp[2]], sp[0], "center", "center"),
    [text("Label", "タグ", "caption", color, { wMode: "hug", align: "center" })],
    {
      size: { wMode: "hug", hMode: "hug" },
      fill,
      stroke: tone === "Accent" ? undefined : { color: "$color.line", width: 1 },
      radius: t.radius[4],
    },
  );
}

/** accent の上に載せる文字色はトークンに無いので実 hex で解決する */
function readableOnRef(t, key) {
  const hex = t.color?.[key];
  return hex ? readableOn(hex) : "$color.ink";
}

function cardVariant(t, media, brief, hasAsset) {
  const sp = t.space;
  const children = [];
  if (media === "Image") {
    children.push(
      strip({
        type: hasAsset ? "image" : "rect",
        name: "Media",
        // 3:2 のメディア枠
        size: { w: 360, h: 240, wMode: "fill", hMode: "fixed" },
        fill: hasAsset ? { asset: "kv", scale: "fill" } : "$color.secondary",
        radius: t.radius[1],
      }),
    );
  }
  children.push(
    frame(
      "Body",
      lay("vertical", [sp[3], sp[3], sp[3], sp[3]], sp[1], "start", "start"),
      [
        text("Title", brief.cardTitle, "h3", "$color.ink", { family: "display" }),
        text("Text", brief.cardBody, "body", "$color.inkSoft"),
        frame("Tags", lay("horizontal", [0, 0, 0, 0], sp[0], "start", "center"), [tagVariant(t, "Default"), tagVariant(t, "Accent")], {
          size: { wMode: "fill", hMode: "hug" },
        }),
      ],
      { size: { wMode: "fill", hMode: "hug" } },
    ),
  );
  return frame(`Card / ${media}`, lay("vertical", [0, 0, 0, 0], 0, "start", "start"), children, {
    size: { w: 360, h: 0, wMode: "fixed", hMode: "hug" },
    fill: "$color.surface",
    stroke: { color: "$color.line", width: 1 },
    radius: t.radius[2],
  });
}

function heroVariant(t, layout, brief, hasAsset) {
  const sp = t.space;
  const column = frame(
    "Copy",
    lay("vertical", [sp[6], sp[6], sp[6], sp[6]], sp[3], "center", "start"),
    [
      text("Eyebrow", brief.brand || "BRAND", "caption", "$color.primary"),
      text("Headline", brief.headline, "h1", "$color.ink", { family: "display" }),
      text("Sub", brief.sub, "body", "$color.inkSoft"),
      buttonVariant(t, "Primary", "M"),
    ],
    { size: { wMode: "fill", hMode: "fill" } },
  );
  const media = strip({
    type: hasAsset ? "image" : "rect",
    name: "Media",
    size: { w: 640, h: 480, wMode: "fill", hMode: "fill" },
    fill: hasAsset ? { asset: "kv", scale: "fill" } : "$color.secondary",
  });
  const children = layout === "Image left" ? [media, column] : [column, media];
  return frame(`Hero / ${layout}`, lay("horizontal", [0, 0, 0, 0], 0, "start", "center"), children, {
    size: { w: 1200, h: 520, wMode: "fixed", hMode: "fixed" },
    fill: "$color.bg",
  });
}

function headerVariant(t, variant, brief) {
  const sp = t.space;
  const nav = frame(
    "Nav",
    lay("horizontal", [0, 0, 0, 0], sp[4], "start", "center"),
    ["特徴", "つかいかた", "お問い合わせ"].map((v, i) => text(`Nav ${i + 1}`, v, "body", "$color.inkSoft", { wMode: "hug" })),
    { size: { wMode: "hug", hMode: "hug" } },
  );
  return frame(
    `Header / ${variant}`,
    lay("horizontal", [sp[3], sp[5], sp[3], sp[5]], sp[5], "space_between", "center"),
    [
      text("Logo", brief.brand || "BRAND", "h3", "$color.ink", { wMode: "hug", family: "display" }),
      nav,
      buttonVariant(t, variant === "Transparent" ? "Ghost" : "Primary", "M"),
    ],
    {
      size: { w: 1200, h: 72, wMode: "fixed", hMode: "fixed" },
      fill: variant === "Transparent" ? undefined : "$color.surface",
      stroke: variant === "Transparent" ? undefined : { color: "$color.line", width: 1 },
    },
  );
}

/* ---------- spec ---------- */

function briefText(project) {
  const brief = project?.consult?.brief || {};
  const meta = project?.meta || {};
  // 見出しは企画のタグラインが最優先（画像には描かせず、Figma でここに載せる）。
  const core = project?.idea?.core || {};
  const headline = (core.tagline || brief.oneLiner || project?.name || "見出しをここに").trim();
  return {
    headline,
    sub: (core.oneLiner || brief.promise || brief.insight || "サブコピーをここに置きます").trim(),
    brand: (meta.brand || meta.client || project?.name || "BRAND").trim(),
    cardTitle: (brief.problem || "カードの見出し").trim().slice(0, 28),
    cardBody: (brief.insight || "カードの本文。三行ほどの説明が入ります。").trim().slice(0, 90),
  };
}

/**
 * @param {object} project store の project
 * @param {object} opts { tokens, imageDataUrl, imageWidth, imageHeight }
 * @returns {object} DESIGN.md §4.6 の spec
 */
export function buildSpec(project, { tokens, imageDataUrl = "", imageWidth = 0, imageHeight = 0 } = {}) {
  const t = tokens && tokens.color ? tokens : buildTokens({ palette: project?.handoff?.palette || [] });
  const sp = t.space;
  const d = project?.direction || {};
  const aspect = d.aspect || "16:9";
  const { w, h } = frameSize(aspect);
  const brief = briefText(project);
  const hasAsset = !!imageDataUrl;
  const zone = d.typography?.zone || "top";

  const headlineZone = frame(
    "見出しゾーン",
    lay("vertical", [sp[4], sp[4], sp[4], sp[4]], sp[2], "start", "start"),
    [
      text("Headline", brief.headline, "display", "$color.ink", { family: "display", wMode: "fill" }),
      text("Sub", brief.sub, "h3", "$color.inkSoft", { wMode: "fill" }),
      text("Brand", brief.brand, "caption", "$color.primary", { wMode: "fill" }),
    ],
    {
      size: { w: Math.round(w * (zone === "left" || zone === "right" ? 0.42 : 0.66)), h: 0, wMode: "fixed", hMode: "hug" },
      fill: "$color.surface",
      opacity: 0.9,
      radius: t.radius[2],
    },
  );

  const canvas = frame(
    "Canvas",
    zoneLayout(zone, sp),
    [headlineZone],
    strip({
      size: { w, h, wMode: "fixed", hMode: "fixed" },
      fill: hasAsset ? { asset: "kv", scale: "fill" } : "$color.secondary",
    }),
  );

  const spec = {
    version: 1,
    name: project?.name || "Sorairo",
    tokens: t,
    assets: hasAsset
      ? [{ id: "kv", kind: "image", dataUrl: imageDataUrl, width: imageWidth || w, height: imageHeight || h }]
      : [],
    frames: [
      { id: `kv-${aspect.replace(":", "x")}`, name: `KV / ${aspect}`, width: w, height: h, children: [canvas] },
    ],
    components: [
      {
        id: "button",
        name: "Button",
        props: { Variant: ["Primary", "Secondary", "Ghost"], Size: ["M", "L"] },
        variants: ["Primary", "Secondary", "Ghost"].flatMap((v) =>
          ["M", "L"].map((s) => ({ props: { Variant: v, Size: s }, node: buttonVariant(t, v, s) })),
        ),
      },
      {
        id: "tag",
        name: "Tag",
        props: { Tone: ["Default", "Accent"] },
        variants: ["Default", "Accent"].map((tone) => ({ props: { Tone: tone }, node: tagVariant(t, tone) })),
      },
      {
        id: "card",
        name: "Card",
        props: { Media: ["Image", "None"] },
        variants: ["Image", "None"].map((m) => ({ props: { Media: m }, node: cardVariant(t, m, brief, hasAsset) })),
      },
      {
        id: "hero",
        name: "Hero",
        props: { Layout: ["Image right", "Image left"] },
        variants: ["Image right", "Image left"].map((l) => ({ props: { Layout: l }, node: heroVariant(t, l, brief, hasAsset) })),
      },
      {
        id: "header",
        name: "Header",
        props: { Variant: ["Default", "Transparent"] },
        variants: ["Default", "Transparent"].map((v) => ({ props: { Variant: v }, node: headerVariant(t, v, brief) })),
      },
    ],
  };
  return spec;
}

/* ---------- 検証（AI の微調整結果もこれに通す） ---------- */

function walkNodes(node, fn) {
  if (!node || typeof node !== "object") return;
  fn(node);
  for (const c of node.children || []) walkNodes(c, fn);
}

/**
 * spec が §4.6 の契約を満たすか。
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object") return { ok: false, errors: ["spec がオブジェクトではありません"] };
  if (spec.version !== 1) errors.push("version は 1 である必要があります");
  const color = spec.tokens?.color || {};
  if (!spec.tokens?.type?.scale) errors.push("tokens.type.scale がありません");
  if (!Array.isArray(spec.tokens?.space) || !spec.tokens.space.length) errors.push("tokens.space がありません");
  if (!Array.isArray(spec.tokens?.radius) || !spec.tokens.radius.length) errors.push("tokens.radius がありません");

  const checkRef = (v, where) => {
    if (typeof v !== "string" || !v.startsWith("$color.")) return;
    const key = v.slice("$color.".length);
    if (!(key in color)) errors.push(`${where}: $color.${key} がトークンにありません`);
  };
  const assetIds = new Set((spec.assets || []).map((a) => a.id));
  const checkNode = (n, where) => {
    checkRef(n.fill, `${where}.fill`);
    checkRef(n.stroke?.color, `${where}.stroke`);
    checkRef(n.text?.color, `${where}.text`);
    if (n.fill && typeof n.fill === "object" && n.fill.asset && !assetIds.has(n.fill.asset)) {
      errors.push(`${where}: asset "${n.fill.asset}" が assets にありません`);
    }
    if (n.text && !spec.tokens?.type?.scale?.[n.text.style]) {
      errors.push(`${where}: text.style "${n.text.style}" がスケールにありません`);
    }
  };

  if (!Array.isArray(spec.frames) || !spec.frames.length) errors.push("frames が空です");
  for (const f of spec.frames || []) {
    if (!f.width || !f.height) errors.push(`frame "${f.name || f.id}" に width/height がありません`);
    for (const c of f.children || []) walkNodes(c, (n) => checkNode(n, `frame:${f.id}`));
  }

  if (!Array.isArray(spec.components) || !spec.components.length) errors.push("components が空です");
  for (const c of spec.components || []) {
    const props = c.props || {};
    const keys = Object.keys(props);
    if (!keys.length) errors.push(`component "${c.id}" に props がありません`);
    if (!Array.isArray(c.variants) || !c.variants.length) errors.push(`component "${c.id}" に variants がありません`);
    for (const v of c.variants || []) {
      for (const k of keys) {
        if (!(k in (v.props || {}))) errors.push(`component "${c.id}" の variant に prop "${k}" がありません`);
        else if (!props[k].includes(v.props[k])) errors.push(`component "${c.id}": ${k}="${v.props[k]}" は宣言外の値です`);
      }
      if (!v.node) errors.push(`component "${c.id}" の variant に node がありません`);
      else walkNodes(v.node, (n) => checkNode(n, `component:${c.id}`));
    }
  }
  return { ok: errors.length === 0, errors };
}

/** W3C Design Tokens Community Group 形式で書き出す */
export function toDtcg(tokens, name = "Sorairo") {
  const color = {};
  for (const [k, v] of Object.entries(tokens?.color || {})) color[k] = { $type: "color", $value: v };
  const fontSize = {};
  for (const [k, v] of Object.entries(tokens?.type?.scale || {})) fontSize[k] = { $type: "dimension", $value: `${v}px` };
  const spacing = {};
  (tokens?.space || []).forEach((v, i) => { spacing[`${i}`] = { $type: "dimension", $value: `${v}px` }; });
  const radius = {};
  (tokens?.radius || []).forEach((v, i) => { radius[`${i}`] = { $type: "dimension", $value: `${v}px` }; });
  return {
    $description: `${name} — Sorairo Studio が生成したデザイントークン`,
    color,
    fontFamily: {
      body: { $type: "fontFamily", $value: tokens?.type?.family || "Noto Sans JP" },
      display: { $type: "fontFamily", $value: tokens?.type?.displayFamily || "Shippori Mincho" },
    },
    fontSize,
    lineHeight: { base: { $type: "number", $value: tokens?.type?.lineHeight ?? 1.5 } },
    spacing,
    radius,
  };
}
