/**
 * Sorairo Studio Importer — メインスレッド（Figma プラグインサンドボックス）
 *
 * spec.json（DESIGN.md §4.6）を読み、Figma のネイティブオブジェクトに戻す:
 *   tokens  → Variables（コレクション "Sorairo"）+ Paint/Text Styles
 *   assets  → figma.createImage() の imageHash
 *   frames  → 画像塗り + テキストの版面フレーム
 *   components → ComponentNode × バリアント → combineAsVariants() で ComponentSet
 *
 * 制約: バンドラ無し・import 無し・トップレベル await 無し（サンドボックスは ES2020 相当）。
 *
 * 使用 API は @figma/plugin-typings v1.138.0（plugin-api.d.ts）で確認済み:
 *   figma.showUI / figma.ui.postMessage / figma.ui.onmessage
 *   figma.setCurrentPageAsync（documentAccess: "dynamic-page" では currentPage は読み取り専用）
 *   figma.createPage / createFrame / createText / createRectangle / createEllipse / createComponent
 *   figma.combineAsVariants(nodes, parent, index?)
 *   figma.createImage(Uint8Array) → Image { hash }
 *   figma.variables.createVariableCollection / createVariable(name, collection, resolvedType)
 *   figma.variables.getLocalVariableCollectionsAsync / getLocalVariablesAsync / setBoundVariableForPaint(paint, "color", variable)
 *   figma.createPaintStyle / createTextStyle / getLocalPaintStylesAsync / getLocalTextStylesAsync
 *   node.setFillStyleIdAsync / node.setTextStyleIdAsync（dynamic-page では styleId の直接代入は不可）
 *   node.layoutSizingHorizontal / layoutSizingVertical = "FIXED" | "HUG" | "FILL"
 */

/* global figma, __html__ */

// ===== SORAIRO_VALIDATOR_BEGIN =====
/**
 * @param {any} spec
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
function validateSpec(spec) {
  var errors = [];
  var warnings = [];
  var MAX = 60;
  function err(m) { if (errors.length < MAX) errors.push(m); }
  function warn(m) { if (warnings.length < MAX) warnings.push(m); }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function isStr(v) { return typeof v === "string"; }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function inList(v, list) { for (var i = 0; i < list.length; i++) if (list[i] === v) return true; return false; }

  if (!isObj(spec)) return { ok: false, errors: ["spec がオブジェクトではありません。"], warnings: warnings };
  if (spec.version !== 1) err("version は 1 である必要があります（現在: " + JSON.stringify(spec.version) + "）。");
  if (has(spec, "name") && !isStr(spec.name)) err("name は文字列である必要があります。");

  var tokens = isObj(spec.tokens) ? spec.tokens : null;
  if (!tokens) err("tokens がありません。");

  var color = tokens && isObj(tokens.color) ? tokens.color : null;
  if (tokens && !color) err("tokens.color がオブジェクトではありません。");
  var colorKeys = color ? Object.keys(color) : [];
  if (color && colorKeys.length === 0) err("tokens.color が空です。1 つ以上の色トークンが必要です。");
  for (var ci = 0; ci < colorKeys.length; ci++) {
    var ck = colorKeys[ci];
    var cv = color[ck];
    if (!isStr(cv) || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(cv)) {
      err('tokens.color.' + ck + ' は "#RGB" / "#RRGGBB" 形式の文字列である必要があります（現在: ' + JSON.stringify(cv) + "）。");
    }
  }

  var scale = tokens && isObj(tokens.type) && isObj(tokens.type.scale) ? tokens.type.scale : null;
  if (tokens && !isObj(tokens.type)) err("tokens.type がオブジェクトではありません。");
  else if (tokens && !scale) err("tokens.type.scale がありません。");
  if (scale) {
    var sKeys = Object.keys(scale);
    if (sKeys.length === 0) err("tokens.type.scale が空です。");
    for (var si = 0; si < sKeys.length; si++) {
      if (!isNum(scale[sKeys[si]]) || scale[sKeys[si]] <= 0) err("tokens.type.scale." + sKeys[si] + " は正の数である必要があります。");
    }
    var wantStyles = ["display", "h1", "h2", "h3", "body", "caption"];
    for (var wi = 0; wi < wantStyles.length; wi++) {
      if (!has(scale, wantStyles[wi])) warn("tokens.type.scale に " + wantStyles[wi] + " がありません（テキストスタイルは作られません）。");
    }
  }
  if (tokens && isObj(tokens.type)) {
    if (has(tokens.type, "family") && !isStr(tokens.type.family)) err("tokens.type.family は文字列である必要があります。");
    if (has(tokens.type, "displayFamily") && !isStr(tokens.type.displayFamily)) err("tokens.type.displayFamily は文字列である必要があります。");
    if (has(tokens.type, "lineHeight") && !isNum(tokens.type.lineHeight)) err("tokens.type.lineHeight は数値である必要があります。");
  }

  function numArray(arr, label) {
    if (!Array.isArray(arr)) { err(label + " は配列である必要があります。"); return; }
    if (arr.length === 0) { err(label + " が空です。"); return; }
    for (var i = 0; i < arr.length; i++) {
      if (!isNum(arr[i]) || arr[i] < 0) err(label + "[" + i + "] は 0 以上の数値である必要があります。");
    }
  }
  if (tokens) numArray(tokens.space, "tokens.space");
  if (tokens) numArray(tokens.radius, "tokens.radius");

  var assetIds = {};
  if (has(spec, "assets")) {
    if (!Array.isArray(spec.assets)) err("assets は配列である必要があります。");
    else {
      for (var ai = 0; ai < spec.assets.length; ai++) {
        var a = spec.assets[ai];
        var where = "assets[" + ai + "]";
        if (!isObj(a)) { err(where + " がオブジェクトではありません。"); continue; }
        if (!isStr(a.id) || a.id === "") err(where + ".id が必要です。");
        else if (assetIds[a.id]) err(where + '.id "' + a.id + '" が重複しています。');
        else assetIds[a.id] = true;
        if (!isStr(a.dataUrl) || a.dataUrl.indexOf("data:image/") !== 0) {
          err(where + '.dataUrl は "data:image/…;base64,…" である必要があります。');
        } else if (a.dataUrl.indexOf("base64,") < 0) {
          err(where + ".dataUrl は base64 エンコードである必要があります。");
        }
        if (has(a, "width") && !isNum(a.width)) err(where + ".width は数値である必要があります。");
        if (has(a, "height") && !isNum(a.height)) err(where + ".height は数値である必要があります。");
      }
    }
  }

  var NODE_TYPES = ["frame", "text", "rect", "image", "ellipse"];
  var MODES = ["none", "horizontal", "vertical"];
  var ALIGNS = ["start", "center", "end", "space_between"];
  var COUNTER = ["start", "center", "end"];
  var SIZE_MODES = ["fixed", "hug", "fill"];
  var TEXT_ALIGNS = ["left", "center", "right"];
  var FAMILIES = ["display", "body"];

  function checkColorRef(v, where) {
    if (!isStr(v)) return;
    if (v.indexOf("$color.") === 0) {
      var key = v.slice("$color.".length);
      if (!color || !has(color, key)) err(where + ": $color." + key + " が tokens.color にありません。");
      return;
    }
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) {
      err(where + ': "' + v + '" は "#hex" でも "$color.<key>" でもありません。');
    }
  }

  function checkNode(node, where, depth) {
    if (!isObj(node)) { err(where + " がオブジェクトではありません。"); return; }
    if (depth > 24) { err(where + ": children のネストが深すぎます（24 階層まで）。"); return; }
    var type = has(node, "type") ? node.type : "frame";
    if (!inList(type, NODE_TYPES)) err(where + '.type "' + String(type) + '" は ' + NODE_TYPES.join("|") + " のいずれかである必要があります。");
    if (has(node, "name") && !isStr(node.name)) err(where + ".name は文字列である必要があります。");

    if (has(node, "layout")) {
      var L = node.layout;
      if (!isObj(L)) err(where + ".layout がオブジェクトではありません。");
      else {
        if (has(L, "mode") && !inList(L.mode, MODES)) err(where + '.layout.mode "' + String(L.mode) + '" は ' + MODES.join("|") + " のいずれかです。");
        if (has(L, "padding")) {
          if (!Array.isArray(L.padding)) err(where + ".layout.padding は配列である必要があります。");
          else {
            if (L.padding.length !== 4 && L.padding.length !== 2 && L.padding.length !== 1) {
              err(where + ".layout.padding は [上,右,下,左] の 4 要素（または 1/2 要素）である必要があります。");
            }
            for (var pi = 0; pi < L.padding.length; pi++) if (!isNum(L.padding[pi])) err(where + ".layout.padding[" + pi + "] は数値である必要があります。");
          }
        }
        if (has(L, "gap") && !isNum(L.gap)) err(where + ".layout.gap は数値である必要があります。");
        if (has(L, "align") && !inList(L.align, ALIGNS)) err(where + '.layout.align "' + String(L.align) + '" は ' + ALIGNS.join("|") + " のいずれかです。");
        if (has(L, "counterAlign") && !inList(L.counterAlign, COUNTER)) err(where + '.layout.counterAlign "' + String(L.counterAlign) + '" は ' + COUNTER.join("|") + " のいずれかです。");
        if (type !== "frame" && L.mode && L.mode !== "none") warn(where + ": layout は frame 以外では無視されます。");
      }
    }

    if (has(node, "size")) {
      var S = node.size;
      if (!isObj(S)) err(where + ".size がオブジェクトではありません。");
      else {
        if (has(S, "w") && !isNum(S.w)) err(where + ".size.w は数値である必要があります。");
        if (has(S, "h") && !isNum(S.h)) err(where + ".size.h は数値である必要があります。");
        if (has(S, "wMode") && !inList(S.wMode, SIZE_MODES)) err(where + '.size.wMode "' + String(S.wMode) + '" は ' + SIZE_MODES.join("|") + " のいずれかです。");
        if (has(S, "hMode") && !inList(S.hMode, SIZE_MODES)) err(where + '.size.hMode "' + String(S.hMode) + '" は ' + SIZE_MODES.join("|") + " のいずれかです。");
        if (S.wMode === "fixed" && !isNum(S.w)) err(where + '.size: wMode が "fixed" なら w が必要です。');
        if (S.hMode === "fixed" && !isNum(S.h)) err(where + '.size: hMode が "fixed" なら h が必要です。');
      }
    }

    if (has(node, "fill") && node.fill !== null) {
      var F = node.fill;
      if (isStr(F)) checkColorRef(F, where + ".fill");
      else if (isObj(F)) {
        if (!isStr(F.asset)) err(where + ".fill.asset（画像 ID）が必要です。");
        else if (!assetIds[F.asset]) err(where + '.fill: asset "' + F.asset + '" が assets にありません。');
        if (has(F, "scale") && !inList(F.scale, ["fill", "fit"])) err(where + '.fill.scale は "fill" か "fit" です。');
      } else err(where + '.fill は "#hex" / "$color.<key>" / { asset, scale } のいずれかです。');
    }
    if (type === "image" && !isObj(node.fill)) err(where + ': type "image" には fill: { asset, scale } が必要です。');

    if (has(node, "stroke") && node.stroke !== null) {
      if (!isObj(node.stroke)) err(where + ".stroke がオブジェクトではありません。");
      else {
        checkColorRef(node.stroke.color, where + ".stroke.color");
        if (has(node.stroke, "width") && !isNum(node.stroke.width)) err(where + ".stroke.width は数値である必要があります。");
      }
    }
    if (has(node, "radius") && node.radius !== null && !isNum(node.radius)) err(where + ".radius は数値である必要があります。");
    if (has(node, "opacity") && node.opacity !== null) {
      if (!isNum(node.opacity) || node.opacity < 0 || node.opacity > 1) err(where + ".opacity は 0〜1 の数値である必要があります。");
    }

    if (has(node, "text") && node.text !== null) {
      var T = node.text;
      if (!isObj(T)) err(where + ".text がオブジェクトではありません。");
      else {
        if (!isStr(T.value)) err(where + ".text.value（文字列）が必要です。");
        if (has(T, "style")) {
          if (!isStr(T.style)) err(where + ".text.style は文字列である必要があります。");
          else if (scale && !has(scale, T.style)) err(where + '.text.style "' + T.style + '" が tokens.type.scale にありません。');
        }
        checkColorRef(T.color, where + ".text.color");
        if (has(T, "align") && !inList(T.align, TEXT_ALIGNS)) err(where + '.text.align "' + String(T.align) + '" は ' + TEXT_ALIGNS.join("|") + " のいずれかです。");
        if (has(T, "family") && !inList(T.family, FAMILIES)) err(where + '.text.family "' + String(T.family) + '" は display か body です。');
      }
    }
    if (type === "text" && !isObj(node.text)) err(where + ': type "text" には text: { value … } が必要です。');

    if (has(node, "children") && node.children !== null) {
      if (!Array.isArray(node.children)) err(where + ".children は配列である必要があります。");
      else {
        if (type !== "frame" && node.children.length > 0) warn(where + ": frame 以外の children は無視されます。");
        for (var chi = 0; chi < node.children.length; chi++) checkNode(node.children[chi], where + ".children[" + chi + "]", depth + 1);
      }
    }
  }

  var hasFrames = Array.isArray(spec.frames) && spec.frames.length > 0;
  var hasComponents = Array.isArray(spec.components) && spec.components.length > 0;
  if (has(spec, "frames") && !Array.isArray(spec.frames)) err("frames は配列である必要があります。");
  if (has(spec, "components") && !Array.isArray(spec.components)) err("components は配列である必要があります。");
  if (!hasFrames && !hasComponents) err("frames と components がどちらも空です。生成するものがありません。");

  if (Array.isArray(spec.frames)) {
    for (var fi = 0; fi < spec.frames.length; fi++) {
      var f = spec.frames[fi];
      var fw = "frames[" + fi + "]";
      if (!isObj(f)) { err(fw + " がオブジェクトではありません。"); continue; }
      if (!isStr(f.name) && !isStr(f.id)) err(fw + " に name か id が必要です。");
      if (!isNum(f.width) || f.width <= 0) err(fw + ".width は正の数である必要があります。");
      if (!isNum(f.height) || f.height <= 0) err(fw + ".height は正の数である必要があります。");
      if (!Array.isArray(f.children)) err(fw + ".children は配列である必要があります。");
      else for (var fci = 0; fci < f.children.length; fci++) checkNode(f.children[fci], fw + ".children[" + fci + "]", 0);
    }
  }

  if (Array.isArray(spec.components)) {
    for (var mi = 0; mi < spec.components.length; mi++) {
      var c = spec.components[mi];
      var cw = "components[" + mi + "]";
      if (!isObj(c)) { err(cw + " がオブジェクトではありません。"); continue; }
      if (!isStr(c.name) && !isStr(c.id)) err(cw + " に name か id が必要です。");
      var props = isObj(c.props) ? c.props : null;
      if (!props) { err(cw + ".props がオブジェクトではありません。"); continue; }
      var propNames = Object.keys(props);
      if (propNames.length === 0) err(cw + ".props が空です。1 つ以上のプロパティが必要です。");
      for (var pn = 0; pn < propNames.length; pn++) {
        var key = propNames[pn];
        if (key.indexOf("=") >= 0 || key.indexOf(",") >= 0) err(cw + '.props: プロパティ名 "' + key + '" に = と , は使えません。');
        if (!Array.isArray(props[key]) || props[key].length === 0) { err(cw + ".props." + key + " は空でない配列である必要があります。"); continue; }
        for (var vi2 = 0; vi2 < props[key].length; vi2++) {
          if (!isStr(props[key][vi2])) err(cw + ".props." + key + "[" + vi2 + "] は文字列である必要があります。");
          else if (props[key][vi2].indexOf("=") >= 0 || props[key][vi2].indexOf(",") >= 0) {
            err(cw + '.props.' + key + ': 値 "' + props[key][vi2] + '" に = と , は使えません。');
          }
        }
      }
      if (!Array.isArray(c.variants) || c.variants.length === 0) { err(cw + ".variants が空です。"); continue; }
      var seen = {};
      for (var vi = 0; vi < c.variants.length; vi++) {
        var v = c.variants[vi];
        var vw = cw + ".variants[" + vi + "]";
        if (!isObj(v)) { err(vw + " がオブジェクトではありません。"); continue; }
        if (!isObj(v.props)) err(vw + ".props がオブジェクトではありません。");
        else {
          var sig = [];
          for (var k2 = 0; k2 < propNames.length; k2++) {
            var pk = propNames[k2];
            if (!has(v.props, pk)) { err(vw + '.props に "' + pk + '" がありません。'); sig.push("?"); continue; }
            if (!inList(v.props[pk], props[pk] || [])) err(vw + ": " + pk + '="' + String(v.props[pk]) + '" は props で宣言されていない値です。');
            sig.push(pk + "=" + String(v.props[pk]));
          }
          var sigStr = sig.join(", ");
          if (seen[sigStr]) err(cw + ": バリアント「" + sigStr + "」が重複しています。");
          seen[sigStr] = true;
        }
        if (!isObj(v.node)) err(vw + ".node がありません。");
        else checkNode(v.node, vw + ".node", 0);
      }
      var expected = 1;
      for (var k3 = 0; k3 < propNames.length; k3++) expected *= (props[propNames[k3]] || []).length;
      if (expected !== c.variants.length) {
        warn(cw + ": 組み合わせは " + expected + " 通りですが variants は " + c.variants.length + " 件です（欠けた組み合わせは Figma 上で空欄になります）。");
      }
    }
  }

  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}
// ===== SORAIRO_VALIDATOR_END =====

/* ------------------------------------------------------------------ *
 * 定数
 * ------------------------------------------------------------------ */

var COLLECTION_NAME = "Sorairo";
var STYLE_PREFIX = "Sorairo/";
var TEXT_STYLE_KEYS = ["display", "h1", "h2", "h3", "body", "caption"];
/** 各テキストスタイルの既定の書体種別（display = 見出し書体 / body = 本文書体） */
var PRIMARY_FAMILY_KIND = { display: "display", h1: "display", h2: "body", h3: "body", body: "body", caption: "body" };
/** 各テキストスタイルのウェイト */
var WEIGHT_FOR_STYLE = { display: "bold", h1: "bold", h2: "bold", h3: "medium", body: "regular", caption: "regular" };
/** フォールバック先（Figma にほぼ必ず入っている） */
var FALLBACK_FAMILY = "Inter";
var STYLE_CANDIDATES = {
  regular: ["Regular", "Book", "Normal", "Light", "Medium"],
  medium: ["Medium", "DemiBold", "SemiBold", "Semi Bold", "Regular", "Bold"],
  bold: ["Bold", "SemiBold", "Semi Bold", "DemiBold", "Black", "Medium", "Regular"]
};
var PAGE_PREFIX = "Sorairo / ";
var GAP = 120;
var VARIANT_GUTTER = 40;
var VARIANT_PAD = 24;

/* ------------------------------------------------------------------ *
 * 小物
 * ------------------------------------------------------------------ */

function isObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function isNumber(v) { return typeof v === "number" && isFinite(v); }
function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

function post(type, payload) {
  var msg = { type: type };
  if (payload) for (var k in payload) if (hasOwn(payload, k)) msg[k] = payload[k];
  try { figma.ui.postMessage(msg); } catch (e) { /* UI が閉じていても落とさない */ }
}
function progress(text, detail) { post("progress", { text: text, detail: detail || "" }); }

/** base64 → Uint8Array（サンドボックスに atob が無い前提で自前実装） */
var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var B64_MAP = null;
function base64ToBytes(b64) {
  if (B64_MAP === null) {
    B64_MAP = {};
    for (var i = 0; i < B64_CHARS.length; i++) B64_MAP[B64_CHARS.charAt(i)] = i;
    B64_MAP["-"] = 62; // URL-safe
    B64_MAP["_"] = 63;
  }
  var s = String(b64).replace(/[\s\r\n\t]/g, "");
  var end = s.length;
  while (end > 0 && s.charAt(end - 1) === "=") end--;
  s = s.substring(0, end);
  var out = new Uint8Array(Math.floor((s.length * 3) / 4));
  var acc = 0, bits = 0, p = 0;
  for (var j = 0; j < s.length; j++) {
    var ch = s.charAt(j);
    var val = B64_MAP[ch];
    if (val === undefined) throw new Error("base64 に使えない文字が含まれています: " + JSON.stringify(ch));
    acc = (acc << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[p++] = (acc >> bits) & 0xff;
    }
  }
  return p === out.length ? out : out.subarray(0, p);
}

/** "data:image/png;base64,…" → Uint8Array */
function dataUrlToBytes(dataUrl) {
  var s = String(dataUrl || "");
  var comma = s.indexOf(",");
  if (comma < 0) throw new Error("dataUrl の形式が不正です（, が見つかりません）。");
  if (s.substring(0, comma).indexOf("base64") < 0) throw new Error("base64 の dataUrl のみ読み込めます。");
  return base64ToBytes(s.substring(comma + 1));
}

/** "#RGB" / "#RRGGBB" / "#RRGGBBAA" → { r, g, b, a }（0〜1） */
function hexToRgba(hex) {
  var s = String(hex || "").replace("#", "").trim();
  if (s.length === 3 || s.length === 4) {
    var ex = "";
    for (var i = 0; i < s.length; i++) ex += s.charAt(i) + s.charAt(i);
    s = ex;
  }
  if (s.length !== 6 && s.length !== 8) return null;
  var n = parseInt(s.substring(0, 6), 16);
  if (isNaN(n)) return null;
  var a = 1;
  if (s.length === 8) {
    var av = parseInt(s.substring(6, 8), 16);
    if (!isNaN(av)) a = av / 255;
  }
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
    a: a
  };
}

function solidPaint(rgba) {
  var p = { type: "SOLID", color: { r: rgba.r, g: rgba.g, b: rgba.b } };
  if (rgba.a < 1) p.opacity = rgba.a;
  return p;
}

/** ページ内で使われていない名前を返す（"Foo" → "Foo (2)"） */
function uniqueName(page, base) {
  var taken = {};
  var kids = page && page.children ? page.children : [];
  for (var i = 0; i < kids.length; i++) taken[kids[i].name] = true;
  if (!taken[base]) return base;
  var n = 2;
  while (taken[base + " (" + n + ")"]) n++;
  return base + " (" + n + ")";
}

function normalizePadding(p) {
  if (!Array.isArray(p)) return [0, 0, 0, 0];
  if (p.length === 4) return [num(p[0]), num(p[1]), num(p[2]), num(p[3])];
  if (p.length === 2) return [num(p[0]), num(p[1]), num(p[0]), num(p[1])];
  if (p.length === 1) return [num(p[0]), num(p[0]), num(p[0]), num(p[0])];
  return [0, 0, 0, 0];
}
function num(v, dflt) { return isNumber(v) ? v : (isNumber(dflt) ? dflt : 0); }

function mapPrimaryAlign(a) {
  if (a === "center") return "CENTER";
  if (a === "end") return "MAX";
  if (a === "space_between") return "SPACE_BETWEEN";
  return "MIN";
}
function mapCounterAlign(a) {
  if (a === "center") return "CENTER";
  if (a === "end") return "MAX";
  return "MIN";
}
function mapTextAlign(a) {
  if (a === "center") return "CENTER";
  if (a === "right") return "RIGHT";
  return "LEFT";
}

/* ------------------------------------------------------------------ *
 * フォント
 * ------------------------------------------------------------------ */

var fontListCache = null;
async function availableFontList() {
  if (fontListCache !== null) return fontListCache;
  if (!figma.listAvailableFontsAsync) { fontListCache = []; return fontListCache; }
  try {
    var fonts = await figma.listAvailableFontsAsync();
    fontListCache = Array.isArray(fonts) ? fonts : [];
  } catch (e) {
    fontListCache = [];
  }
  return fontListCache;
}

/** family に存在するスタイル名の一覧（一覧 API が使えないときは null） */
async function stylesOfFamily(family) {
  var list = await availableFontList();
  if (!list.length) return null;
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var f = list[i] && list[i].fontName;
    if (f && f.family === family) out.push(f.style);
  }
  return out;
}

async function tryLoad(family, style) {
  try {
    await figma.loadFontAsync({ family: family, style: style });
    return { family: family, style: style };
  } catch (e) {
    return null;
  }
}

/** family の regular/medium/bold を解決する。ダメなら Inter に落とす。 */
async function resolveFamily(family, ctx) {
  var known = await stylesOfFamily(family);
  var result = {};
  var weights = ["regular", "medium", "bold"];
  for (var w = 0; w < weights.length; w++) {
    var weight = weights[w];
    var cands = STYLE_CANDIDATES[weight];
    var picked = null;
    for (var c = 0; c < cands.length && !picked; c++) {
      if (known && known.length && known.indexOf(cands[c]) < 0) continue;
      picked = await tryLoad(family, cands[c]);
    }
    if (!picked && known === null) {
      // 一覧 API が無い環境向けの最後の総当たり
      picked = await tryLoad(family, "Regular");
    }
    result[weight] = picked;
  }
  if (!result.regular && !result.medium && !result.bold) {
    var fb = {};
    fb.regular = await tryLoad(FALLBACK_FAMILY, "Regular");
    fb.medium = (await tryLoad(FALLBACK_FAMILY, "Medium")) || fb.regular;
    fb.bold = (await tryLoad(FALLBACK_FAMILY, "Bold")) || fb.regular;
    if (fb.regular) {
      ctx.substitutions.push(family + " → " + FALLBACK_FAMILY + "（この環境に " + family + " がありません）");
      return fb;
    }
    throw new Error("フォントを 1 つも読み込めませんでした（" + family + " も " + FALLBACK_FAMILY + " も不可）。");
  }
  // 一部ウェイトだけ無いときは、取れたもので埋める
  var fallbackWithin = result.regular || result.medium || result.bold;
  for (var w2 = 0; w2 < weights.length; w2++) {
    if (!result[weights[w2]]) result[weights[w2]] = fallbackWithin;
  }
  return result;
}

async function loadFonts(spec, ctx) {
  var type = (spec.tokens && spec.tokens.type) || {};
  var bodyFamily = typeof type.family === "string" && type.family ? type.family : "Inter";
  var displayFamily = typeof type.displayFamily === "string" && type.displayFamily ? type.displayFamily : bodyFamily;
  var body = await resolveFamily(bodyFamily, ctx);
  var display = displayFamily === bodyFamily ? body : await resolveFamily(displayFamily, ctx);
  return { body: body, display: display, bodyFamily: bodyFamily, displayFamily: displayFamily };
}

function fontFor(ctx, kind, weight) {
  var set = kind === "display" ? ctx.fonts.display : ctx.fonts.body;
  return set[weight] || set.regular || set.bold || set.medium;
}

/* ------------------------------------------------------------------ *
 * ページ
 * ------------------------------------------------------------------ */

async function ensurePage(name) {
  var pages = (figma.root && figma.root.children) || [];
  var page = null;
  for (var i = 0; i < pages.length; i++) {
    if (pages[i] && pages[i].type === "PAGE" && pages[i].name === name) { page = pages[i]; break; }
  }
  if (!page) {
    page = figma.createPage();
    page.name = name;
  }
  if (typeof page.loadAsync === "function") {
    try { await page.loadAsync(); } catch (e) { /* 既に読み込み済み */ }
  }
  if (typeof figma.setCurrentPageAsync === "function") {
    await figma.setCurrentPageAsync(page);
  } else {
    // documentAccess が dynamic-page でない古い環境向け
    figma.currentPage = page;
  }
  return page;
}

/** 既存コンテンツの右端（新しい版面をそこから右に置く） */
function rightEdgeOf(page) {
  var kids = (page && page.children) || [];
  var max = null;
  for (var i = 0; i < kids.length; i++) {
    var n = kids[i];
    if (!isNumber(n.x) || !isNumber(n.width)) continue;
    var e = n.x + n.width;
    if (max === null || e > max) max = e;
  }
  return max === null ? 0 : max + GAP;
}

/* ------------------------------------------------------------------ *
 * Variables
 * ------------------------------------------------------------------ */

async function ensureCollection(name) {
  var cols = [];
  try { cols = await figma.variables.getLocalVariableCollectionsAsync(); } catch (e) { cols = []; }
  for (var i = 0; i < cols.length; i++) if (cols[i] && cols[i].name === name) return cols[i];
  return figma.variables.createVariableCollection(name);
}

async function buildVariables(spec, ctx) {
  var collection = await ensureCollection(COLLECTION_NAME);
  ctx.collection = collection;
  var modeId = collection.defaultModeId;
  if (!modeId && collection.modes && collection.modes.length) modeId = collection.modes[0].modeId;
  if (!modeId) throw new Error("Variables コレクションのモードが取得できませんでした。");

  var existing = [];
  try { existing = await figma.variables.getLocalVariablesAsync(); } catch (e) { existing = []; }
  var byName = {};
  for (var i = 0; i < existing.length; i++) {
    var v = existing[i];
    if (v && v.variableCollectionId === collection.id) byName[v.name] = v;
  }

  function ensureVariable(name, resolvedType, scopes) {
    var v = byName[name];
    if (!v) {
      v = figma.variables.createVariable(name, collection, resolvedType);
      byName[name] = v;
      ctx.counts.variables++;
    } else {
      ctx.counts.variablesReused++;
    }
    if (scopes) { try { v.scopes = scopes; } catch (e) { /* 対応していない環境は無視 */ } }
    return v;
  }

  var color = (spec.tokens && spec.tokens.color) || {};
  var keys = Object.keys(color);
  for (var k = 0; k < keys.length; k++) {
    var rgba = hexToRgba(color[keys[k]]);
    if (!rgba) continue;
    var cv = ensureVariable("color/" + keys[k], "COLOR", ["ALL_FILLS", "STROKE_COLOR"]);
    cv.setValueForMode(modeId, { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a });
    ctx.colorVars[keys[k]] = cv;
  }

  var space = (spec.tokens && spec.tokens.space) || [];
  for (var s = 0; s < space.length; s++) {
    var sv = ensureVariable("space/" + s, "FLOAT", ["GAP", "WIDTH_HEIGHT"]);
    sv.setValueForMode(modeId, space[s]);
    ctx.spaceVars.push({ value: space[s], variable: sv });
  }

  var radius = (spec.tokens && spec.tokens.radius) || [];
  for (var r = 0; r < radius.length; r++) {
    var rv = ensureVariable("radius/" + r, "FLOAT", ["CORNER_RADIUS"]);
    rv.setValueForMode(modeId, radius[r]);
    ctx.radiusVars.push({ value: radius[r], variable: rv });
  }

  progress(
    "Variables: " + ctx.counts.variables + " 件作成" + (ctx.counts.variablesReused ? "（" + ctx.counts.variablesReused + " 件は既存を再利用）" : ""),
    'コレクション "' + COLLECTION_NAME + '"'
  );
}

/** 数値が space / radius トークンと一致すれば変数を返す */
function variableForValue(list, value) {
  if (!isNumber(value)) return null;
  for (var i = 0; i < list.length; i++) if (list[i].value === value) return list[i].variable;
  return null;
}

function bindNumber(node, field, variable, ctx) {
  if (!variable || !node || typeof node.setBoundVariable !== "function") return;
  try {
    node.setBoundVariable(field, variable);
    ctx.counts.bindings++;
  } catch (e) { /* この環境では束縛できないフィールド */ }
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

async function buildPaintStyles(spec, ctx) {
  var existing = [];
  try { existing = await figma.getLocalPaintStylesAsync(); } catch (e) { existing = []; }
  var byName = {};
  for (var i = 0; i < existing.length; i++) if (existing[i]) byName[existing[i].name] = existing[i];

  var color = (spec.tokens && spec.tokens.color) || {};
  var keys = Object.keys(color);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var rgba = hexToRgba(color[key]);
    if (!rgba) continue;
    var name = STYLE_PREFIX + key;
    var style = byName[name];
    if (!style) {
      style = figma.createPaintStyle();
      style.name = name;
      ctx.counts.styles++;
    } else {
      ctx.counts.stylesReused++;
    }
    var paint = solidPaint(rgba);
    var variable = ctx.colorVars[key];
    if (variable && figma.variables && typeof figma.variables.setBoundVariableForPaint === "function") {
      try { paint = figma.variables.setBoundVariableForPaint(paint, "color", variable); } catch (e) { /* 束縛できない環境 */ }
    }
    style.paints = [paint];
    try { style.description = key + " — " + color[key]; } catch (e) { /* description 非対応 */ }
    ctx.paintStyles[key] = style;
    byName[name] = style;
  }
  progress("Paint Styles: " + ctx.counts.styles + " 件作成", STYLE_PREFIX + "<key>");
}

/** spec 内で実際に使われている (style, 書体種別) の組を集める */
function collectTextUsage(spec) {
  var used = {};
  function walk(node) {
    if (!isObject(node)) return;
    if (isObject(node.text)) {
      var style = typeof node.text.style === "string" ? node.text.style : "body";
      var kind = node.text.family === "display" ? "display" : "body";
      used[style + "|" + kind] = { style: style, kind: kind };
    }
    var kids = node.children;
    if (Array.isArray(kids)) for (var i = 0; i < kids.length; i++) walk(kids[i]);
  }
  var frames = spec.frames || [];
  for (var f = 0; f < frames.length; f++) {
    var kids = (frames[f] && frames[f].children) || [];
    for (var c = 0; c < kids.length; c++) walk(kids[c]);
  }
  var comps = spec.components || [];
  for (var m = 0; m < comps.length; m++) {
    var vars = (comps[m] && comps[m].variants) || [];
    for (var v = 0; v < vars.length; v++) walk(vars[v] && vars[v].node);
  }
  return used;
}

function textStyleName(styleKey, kind) {
  return PRIMARY_FAMILY_KIND[styleKey] === kind || !PRIMARY_FAMILY_KIND[styleKey]
    ? STYLE_PREFIX + styleKey
    : STYLE_PREFIX + styleKey + "-" + kind;
}

async function buildTextStyles(spec, ctx) {
  var existing = [];
  try { existing = await figma.getLocalTextStylesAsync(); } catch (e) { existing = []; }
  var byName = {};
  for (var i = 0; i < existing.length; i++) if (existing[i]) byName[existing[i].name] = existing[i];

  var type = (spec.tokens && spec.tokens.type) || {};
  var scale = type.scale || {};
  var lh = isNumber(type.lineHeight) ? type.lineHeight : 1.5;
  var lhPercent = lh <= 4 ? lh * 100 : lh; // 1.5 → 150%
  var sameFamily = ctx.fonts.bodyFamily === ctx.fonts.displayFamily;

  // 既定の 6 段（display,h1 は見出し書体 / それ以外は本文書体）
  var wanted = [];
  for (var s = 0; s < TEXT_STYLE_KEYS.length; s++) {
    var key = TEXT_STYLE_KEYS[s];
    if (!isNumber(scale[key])) continue;
    wanted.push({ style: key, kind: PRIMARY_FAMILY_KIND[key] });
  }
  // spec が実際に使っている組み合わせのうち、既定に無いものを足す
  if (!sameFamily) {
    var used = collectTextUsage(spec);
    var usedKeys = Object.keys(used);
    for (var u = 0; u < usedKeys.length; u++) {
      var entry = used[usedKeys[u]];
      if (!isNumber(scale[entry.style])) continue;
      if (PRIMARY_FAMILY_KIND[entry.style] === entry.kind) continue;
      wanted.push(entry);
    }
  }

  for (var w = 0; w < wanted.length; w++) {
    var item = wanted[w];
    var name = textStyleName(item.style, item.kind);
    if (ctx.textStyles[item.style + "|" + item.kind]) continue;
    var font = fontFor(ctx, item.kind, WEIGHT_FOR_STYLE[item.style] || "regular");
    if (!font) continue;
    var style = byName[name];
    if (!style) {
      style = figma.createTextStyle();
      style.name = name;
      ctx.counts.styles++;
    } else {
      ctx.counts.stylesReused++;
    }
    style.fontName = font;
    style.fontSize = scale[item.style];
    style.lineHeight = { value: lhPercent, unit: "PERCENT" };
    try { style.description = item.style + " / " + font.family + " " + font.style + " / " + scale[item.style] + "px"; } catch (e) { /* noop */ }
    ctx.textStyles[item.style + "|" + item.kind] = { style: style, font: font, size: scale[item.style] };
    byName[name] = style;
  }
  progress("Text Styles: " + Object.keys(ctx.textStyles).length + " 件", STYLE_PREFIX + "display / h1 / h2 / h3 / body / caption");
}

/* ------------------------------------------------------------------ *
 * 画像
 * ------------------------------------------------------------------ */

function buildImages(spec, ctx) {
  var assets = spec.assets || [];
  for (var i = 0; i < assets.length; i++) {
    var a = assets[i];
    if (!a || typeof a.id !== "string") continue;
    try {
      var bytes = dataUrlToBytes(a.dataUrl);
      if (!bytes || bytes.length < 8) throw new Error("画像データが空です。");
      var image = figma.createImage(bytes);
      ctx.images[a.id] = image.hash;
      ctx.counts.images++;
    } catch (e) {
      ctx.warnings.push('画像 "' + a.id + '" を読み込めませんでした: ' + (e && e.message ? e.message : String(e)));
    }
  }
  if (assets.length) progress("画像: " + ctx.counts.images + " / " + assets.length + " 件を取り込み", "figma.createImage()");
}

/* ------------------------------------------------------------------ *
 * ノード生成
 * ------------------------------------------------------------------ */

/** fill 値 → Paint（作れないときは null） */
function resolveFill(fill, ctx, where) {
  if (fill === null || fill === undefined) return null;
  if (typeof fill === "string") {
    if (fill.indexOf("$color.") === 0) {
      var key = fill.substring("$color.".length);
      var hex = ctx.tokenColors[key];
      var rgba = hex ? hexToRgba(hex) : null;
      if (!rgba) { ctx.warnings.push(where + ": $color." + key + " を解決できませんでした。"); return null; }
      var paint = solidPaint(rgba);
      var variable = ctx.colorVars[key];
      if (variable && figma.variables && typeof figma.variables.setBoundVariableForPaint === "function") {
        try {
          paint = figma.variables.setBoundVariableForPaint(paint, "color", variable);
          ctx.counts.boundPaints++;
        } catch (e) { /* 束縛できない環境では素の色のまま */ }
      }
      return paint;
    }
    var direct = hexToRgba(fill);
    if (!direct) { ctx.warnings.push(where + ': 色 "' + fill + '" を解釈できませんでした。'); return null; }
    return solidPaint(direct);
  }
  if (isObject(fill) && typeof fill.asset === "string") {
    var hash = ctx.images[fill.asset];
    if (!hash) {
      ctx.warnings.push(where + ': 画像 "' + fill.asset + '" が無いため塗りを省略しました。');
      return null;
    }
    return { type: "IMAGE", imageHash: hash, scaleMode: fill.scale === "fit" ? "FIT" : "FILL" };
  }
  return null;
}

function isAutoLayout(node) {
  return !!node && "layoutMode" in node && node.layoutMode && node.layoutMode !== "NONE";
}

function sizeModes(spec) {
  var size = (spec && spec.size) || {};
  return {
    w: size.wMode || (isNumber(size.w) ? "fixed" : "hug"),
    h: size.hMode || (isNumber(size.h) ? "fixed" : "hug"),
    wPx: size.w,
    hPx: size.h
  };
}

/** appendChild の「後」に呼ぶこと（HUG/FILL は親子関係が決まってからでないと弾かれる） */
function applySizing(el, spec, parentIsAuto, ctx) {
  var modes = sizeModes(spec);
  var selfAuto = isAutoLayout(el);
  if (!parentIsAuto && !selfAuto) return; // auto-layout の文脈が無い場合は resize() 済みの固定サイズのまま
  var isText = el.type === "TEXT";
  function pick(mode) {
    if (mode === "fill") return parentIsAuto ? "FILL" : "FIXED";
    if (mode === "hug") return (selfAuto || (isText && parentIsAuto)) ? "HUG" : "FIXED";
    return "FIXED";
  }
  try { el.layoutSizingHorizontal = pick(modes.w); } catch (e) { ctx.warnings.push(el.name + ": 横のサイズ指定を適用できませんでした（" + modes.w + "）。"); }
  try { el.layoutSizingVertical = pick(modes.h); } catch (e) { ctx.warnings.push(el.name + ": 縦のサイズ指定を適用できませんでした（" + modes.h + "）。"); }
}

/** frame / component 共通の見た目とレイアウトを流し込む */
function applyContainer(el, spec, ctx) {
  var layout = spec.layout || {};
  var mode = layout.mode === "horizontal" ? "HORIZONTAL" : layout.mode === "vertical" ? "VERTICAL" : "NONE";
  el.layoutMode = mode;
  if (mode !== "NONE") {
    var pad = normalizePadding(layout.padding);
    el.paddingTop = pad[0];
    el.paddingRight = pad[1];
    el.paddingBottom = pad[2];
    el.paddingLeft = pad[3];
    el.itemSpacing = num(layout.gap, 0);
    el.primaryAxisAlignItems = mapPrimaryAlign(layout.align);
    el.counterAxisAlignItems = mapCounterAlign(layout.counterAlign);
    if (ctx.options.variables !== false) {
      bindNumber(el, "paddingTop", variableForValue(ctx.spaceVars, pad[0]), ctx);
      bindNumber(el, "paddingRight", variableForValue(ctx.spaceVars, pad[1]), ctx);
      bindNumber(el, "paddingBottom", variableForValue(ctx.spaceVars, pad[2]), ctx);
      bindNumber(el, "paddingLeft", variableForValue(ctx.spaceVars, pad[3]), ctx);
      bindNumber(el, "itemSpacing", variableForValue(ctx.spaceVars, num(layout.gap, 0)), ctx);
    }
  }
}

function applyPaint(el, spec, ctx, where) {
  if (el.type === "TEXT") return; // テキストの色は text.color 側で塗る
  var paint = resolveFill(spec.fill, ctx, where);
  if (paint) el.fills = [paint];
  else el.fills = []; // fill の指定が無いものは透明（Figma 既定の白にしない）
}

function applyStroke(el, spec, ctx, where) {
  var stroke = spec.stroke;
  if (!isObject(stroke)) return;
  var paint = resolveFill(stroke.color, ctx, where + ".stroke");
  if (!paint) return;
  el.strokes = [paint];
  el.strokeWeight = num(stroke.width, 1);
  try { el.strokeAlign = "INSIDE"; } catch (e) { /* noop */ }
}

function applyRadiusAndOpacity(el, spec, ctx) {
  if (isNumber(spec.radius) && "cornerRadius" in el) {
    el.cornerRadius = spec.radius;
    if (ctx.options.variables !== false) {
      var rv = variableForValue(ctx.radiusVars, spec.radius);
      if (rv && "topLeftRadius" in el) {
        bindNumber(el, "topLeftRadius", rv, ctx);
        bindNumber(el, "topRightRadius", rv, ctx);
        bindNumber(el, "bottomLeftRadius", rv, ctx);
        bindNumber(el, "bottomRightRadius", rv, ctx);
      }
    }
  }
  if (isNumber(spec.opacity) && "opacity" in el) el.opacity = spec.opacity;
}

function resizeTo(el, spec) {
  var modes = sizeModes(spec);
  if (typeof el.resize !== "function") return;
  var w = modes.w === "fixed" && isNumber(modes.wPx) && modes.wPx > 0 ? modes.wPx : el.width;
  var h = modes.h === "fixed" && isNumber(modes.hPx) && modes.hPx > 0 ? modes.hPx : el.height;
  w = Math.max(isNumber(w) ? w : 1, 0.01);
  h = Math.max(isNumber(h) ? h : 1, 0.01);
  el.resize(w, h);
}

async function buildTextNode(spec, ctx, where) {
  var t = spec.text || {};
  var kind = t.family === "display" ? "display" : "body";
  var styleKey = typeof t.style === "string" ? t.style : "body";
  var scale = (ctx.spec.tokens && ctx.spec.tokens.type && ctx.spec.tokens.type.scale) || {};
  var entry = ctx.textStyles[styleKey + "|" + kind] || null;
  var font = entry ? entry.font : fontFor(ctx, kind, WEIGHT_FOR_STYLE[styleKey] || "regular");
  if (!font) throw new Error("フォントが解決できませんでした（" + kind + " / " + styleKey + "）。");

  var el = figma.createText();
  el.name = typeof spec.name === "string" && spec.name ? spec.name : (t.value || "Text").substring(0, 24);

  // fontName → fontSize → characters の順（フォントは loadFonts() で読み込み済み）
  el.fontName = font;
  var size = isNumber(scale[styleKey]) ? scale[styleKey] : 16;
  el.fontSize = size;
  var lh = ctx.spec.tokens && ctx.spec.tokens.type && isNumber(ctx.spec.tokens.type.lineHeight) ? ctx.spec.tokens.type.lineHeight : 1.5;
  el.lineHeight = { value: lh <= 4 ? lh * 100 : lh, unit: "PERCENT" };

  // 折り返す文（幅が fixed / fill）は HEIGHT、幅を内容に合わせる文は WIDTH_AND_HEIGHT
  var modes = sizeModes(spec);
  if (modes.h === "fixed") el.textAutoResize = "NONE";
  else if (modes.w === "hug") el.textAutoResize = "WIDTH_AND_HEIGHT";
  else el.textAutoResize = "HEIGHT";

  el.characters = typeof t.value === "string" ? t.value : "";

  if (entry && entry.style) {
    try {
      if (typeof el.setTextStyleIdAsync === "function") await el.setTextStyleIdAsync(entry.style.id);
      else el.textStyleId = entry.style.id;
      ctx.counts.textStyleApplied++;
    } catch (e) {
      ctx.warnings.push(where + ": テキストスタイルを適用できませんでした。");
    }
  }

  el.textAlignHorizontal = mapTextAlign(t.align);
  var paint = resolveFill(t.color, ctx, where + ".text.color");
  if (paint) el.fills = [paint];
  return el;
}

/**
 * spec の node → Figma のノード。親への appendChild は呼び出し側が行い、
 * そのあとで applySizing() を呼ぶ（HUG / FILL の制約）。
 */
async function buildNode(spec, ctx, where) {
  var type = spec.type || "frame";
  var el;

  if (type === "text") {
    el = await buildTextNode(spec, ctx, where);
    applyStroke(el, spec, ctx, where);
    applyRadiusAndOpacity(el, spec, ctx);
    var tModes = sizeModes(spec);
    if (tModes.w === "fixed" || tModes.h === "fixed") resizeTo(el, spec);
    ctx.counts.nodes++;
    return el;
  }

  if (type === "rect" || type === "image") el = figma.createRectangle();
  else if (type === "ellipse") el = figma.createEllipse();
  else el = figma.createFrame();

  el.name = typeof spec.name === "string" && spec.name ? spec.name : type;
  if (el.type === "FRAME") applyContainer(el, spec, ctx);
  resizeTo(el, spec);
  applyPaint(el, spec, ctx, where);
  applyStroke(el, spec, ctx, where);
  applyRadiusAndOpacity(el, spec, ctx);
  ctx.counts.nodes++;

  await appendChildren(el, spec, ctx, where);
  return el;
}

async function appendChildren(parent, spec, ctx, where) {
  var kids = Array.isArray(spec.children) ? spec.children : [];
  if (!kids.length) return;
  if (typeof parent.appendChild !== "function") return;
  var parentAuto = isAutoLayout(parent);
  for (var i = 0; i < kids.length; i++) {
    var childSpec = kids[i];
    var childWhere = where + ".children[" + i + "]";
    var child;
    try {
      child = await buildNode(childSpec, ctx, childWhere);
    } catch (e) {
      ctx.warnings.push(childWhere + ": 作成に失敗しました（" + (e && e.message ? e.message : String(e)) + "）。");
      continue;
    }
    parent.appendChild(child); // ← FILL / HUG は append の後でしか設定できない
    applySizing(child, childSpec, parentAuto, ctx);
    if (!parentAuto && "constraints" in child) {
      try { child.constraints = { horizontal: "STRETCH", vertical: "STRETCH" }; } catch (e) { /* noop */ }
    }
  }
}

/* ------------------------------------------------------------------ *
 * frames
 * ------------------------------------------------------------------ */

async function buildFrames(spec, ctx) {
  var frames = spec.frames || [];
  var created = [];
  for (var i = 0; i < frames.length; i++) {
    var f = frames[i];
    var name = uniqueName(ctx.page, f.name || f.id || "Frame");
    var frame = figma.createFrame();
    frame.name = name;
    ctx.page.appendChild(frame);
    frame.layoutMode = "NONE";
    frame.resize(Math.max(num(f.width, 100), 1), Math.max(num(f.height, 100), 1));
    frame.x = ctx.cursorX;
    frame.y = ctx.cursorY;
    frame.fills = [];
    try { frame.clipsContent = true; } catch (e) { /* noop */ }
    await appendChildren(frame, f, ctx, "frames[" + i + "]");
    ctx.cursorX += frame.width + GAP;
    ctx.frameBottom = Math.max(ctx.frameBottom, ctx.cursorY + frame.height);
    ctx.counts.frames++;
    created.push(frame);
    progress("フレーム: " + name, frame.width + " × " + frame.height);
  }
  return created;
}

/* ------------------------------------------------------------------ *
 * components
 * ------------------------------------------------------------------ */

function variantName(propNames, props) {
  var parts = [];
  for (var i = 0; i < propNames.length; i++) {
    var k = propNames[i];
    parts.push(k + "=" + String(props && props[k] !== undefined ? props[k] : ""));
  }
  return parts.join(", ");
}

function describeComponent(comp, propNames) {
  var lines = [];
  for (var i = 0; i < propNames.length; i++) {
    var k = propNames[i];
    lines.push(k + ": " + (comp.props[k] || []).join(" / "));
  }
  return (comp.name || comp.id) + "\n" + lines.join("\n") + "\nSorairo Studio が spec.json から生成";
}

/** combineAsVariants の直後は全バリアントが (0,0) に重なるので、必ず並べ直す */
function layoutVariants(set, entries, propNames, comp) {
  var rowProp = propNames[0];
  var colProp = propNames.length > 1 ? propNames[1] : null;
  var rowVals = rowProp ? (comp.props[rowProp] || []) : [""];
  var colVals = colProp ? (comp.props[colProp] || []) : [""];
  var cellW = 0, cellH = 0;
  for (var i = 0; i < entries.length; i++) {
    cellW = Math.max(cellW, entries[i].node.width);
    cellH = Math.max(cellH, entries[i].node.height);
  }
  var cols = Math.max(colVals.length, 1);
  var rows = Math.max(rowVals.length, 1);
  for (var e = 0; e < entries.length; e++) {
    var props = entries[e].props || {};
    var ri = rowProp ? rowVals.indexOf(props[rowProp]) : 0;
    var cidx = colProp ? colVals.indexOf(props[colProp]) : 0;
    if (ri < 0) ri = Math.floor(e / cols);
    if (cidx < 0) cidx = e % cols;
    entries[e].node.x = VARIANT_PAD + cidx * (cellW + VARIANT_GUTTER);
    entries[e].node.y = VARIANT_PAD + ri * (cellH + VARIANT_GUTTER);
  }
  var w = VARIANT_PAD * 2 + cols * cellW + (cols - 1) * VARIANT_GUTTER;
  var h = VARIANT_PAD * 2 + rows * cellH + (rows - 1) * VARIANT_GUTTER;
  var resize = typeof set.resizeWithoutConstraints === "function" ? "resizeWithoutConstraints" : "resize";
  try { set[resize](Math.max(w, 1), Math.max(h, 1)); } catch (e2) { /* noop */ }
}

async function buildComponents(spec, ctx) {
  var comps = spec.components || [];
  var created = [];
  var x = ctx.componentX;
  for (var i = 0; i < comps.length; i++) {
    var comp = comps[i];
    var propNames = Object.keys(comp.props || {});
    var entries = [];
    for (var v = 0; v < comp.variants.length; v++) {
      var variant = comp.variants[v];
      var where = "components[" + i + "].variants[" + v + "]";
      var node = figma.createComponent();
      node.name = variantName(propNames, variant.props);
      ctx.page.appendChild(node);
      var vSpec = variant.node || {};
      applyContainer(node, vSpec, ctx);
      resizeTo(node, vSpec);
      applyPaint(node, vSpec, ctx, where);
      applyStroke(node, vSpec, ctx, where);
      applyRadiusAndOpacity(node, vSpec, ctx);
      await appendChildren(node, vSpec, ctx, where);
      applySizing(node, vSpec, false, ctx); // ルートは auto-layout フレーム自身なので HUG が効く
      entries.push({ node: node, props: variant.props || {} });
      ctx.counts.variants++;
    }
    if (!entries.length) continue;

    var nodes = [];
    for (var n = 0; n < entries.length; n++) nodes.push(entries[n].node);
    var set;
    try {
      set = figma.combineAsVariants(nodes, ctx.page);
    } catch (e) {
      ctx.warnings.push((comp.name || comp.id) + ": combineAsVariants に失敗しました（" + (e && e.message ? e.message : String(e)) + "）。単体コンポーネントとして残します。");
      continue;
    }
    set.name = uniqueName(ctx.page, comp.name || comp.id || "Component");
    try { set.description = describeComponent(comp, propNames); } catch (e) { /* noop */ }
    layoutVariants(set, entries, propNames, comp);
    set.x = x;
    set.y = ctx.componentY;
    x += set.width + GAP;
    ctx.counts.components++;
    created.push(set);
    progress("コンポーネント: " + set.name, entries.length + " バリアント");
  }
  ctx.componentX = x;
  return created;
}

/* ------------------------------------------------------------------ *
 * 実行
 * ------------------------------------------------------------------ */

function newContext(spec, options) {
  return {
    spec: spec,
    options: options || {},
    page: null,
    collection: null,
    tokenColors: (spec.tokens && spec.tokens.color) || {},
    colorVars: {},
    spaceVars: [],
    radiusVars: [],
    paintStyles: {},
    textStyles: {},
    images: {},
    fonts: null,
    cursorX: 0,
    cursorY: 0,
    frameBottom: 0,
    componentX: 0,
    componentY: 0,
    substitutions: [],
    warnings: [],
    counts: {
      variables: 0, variablesReused: 0,
      styles: 0, stylesReused: 0,
      images: 0, frames: 0, components: 0, variants: 0,
      nodes: 0, bindings: 0, boundPaints: 0, textStyleApplied: 0
    }
  };
}

async function runImport(spec, options) {
  var opts = options || {};
  var result = validateSpec(spec);
  if (!result.ok) {
    post("error", { message: "spec.json が §4.6 の形式に合っていません。", errors: result.errors });
    return null;
  }
  for (var w = 0; w < result.warnings.length; w++) progress("注意", result.warnings[w]);

  var ctx = newContext(spec, opts);
  var pageName = typeof opts.pageName === "string" && opts.pageName.trim() ? opts.pageName.trim() : PAGE_PREFIX + (spec.name || "Untitled");

  progress("ページを準備中…", pageName);
  ctx.page = await ensurePage(pageName);
  ctx.cursorX = rightEdgeOf(ctx.page);
  ctx.componentX = ctx.cursorX;

  progress("フォントを読み込み中…", ((spec.tokens && spec.tokens.type && spec.tokens.type.family) || "Inter") + " / " + ((spec.tokens && spec.tokens.type && spec.tokens.type.displayFamily) || "Inter"));
  ctx.fonts = await loadFonts(spec, ctx);
  for (var s = 0; s < ctx.substitutions.length; s++) progress("フォント代替", ctx.substitutions[s]);

  if (opts.variables !== false) await buildVariables(spec, ctx);
  if (opts.styles !== false) {
    await buildPaintStyles(spec, ctx);
    await buildTextStyles(spec, ctx);
  } else {
    // スタイルを作らない場合でも、テキストの書体・サイズは直接設定する
    progress("Styles はスキップしました", "テキストは書体とサイズを直接設定します");
  }

  if (opts.frames !== false || opts.components !== false) buildImages(spec, ctx);

  var madeFrames = [];
  if (opts.frames !== false) madeFrames = await buildFrames(spec, ctx);

  ctx.componentY = ctx.frameBottom ? ctx.frameBottom + GAP : 0;
  var madeSets = [];
  if (opts.components !== false) madeSets = await buildComponents(spec, ctx);

  var made = madeFrames.concat(madeSets);
  try {
    if (made.length) {
      ctx.page.selection = made;
      if (figma.viewport && typeof figma.viewport.scrollAndZoomIntoView === "function") figma.viewport.scrollAndZoomIntoView(made);
    }
  } catch (e) { /* 表示調整に失敗しても成果物は残る */ }

  var summary = {
    page: ctx.page.name,
    variables: ctx.counts.variables,
    variablesReused: ctx.counts.variablesReused,
    styles: ctx.counts.styles,
    stylesReused: ctx.counts.stylesReused,
    images: ctx.counts.images,
    frames: ctx.counts.frames,
    components: ctx.counts.components,
    variants: ctx.counts.variants,
    nodes: ctx.counts.nodes,
    boundPaints: ctx.counts.boundPaints,
    boundNumbers: ctx.counts.bindings,
    substitutions: ctx.substitutions,
    warnings: ctx.warnings
  };
  post("done", { summary: summary });
  return summary;
}

async function handleMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "cancel") {
    figma.closePlugin();
    return;
  }
  if (msg.type !== "import") return;
  try {
    return await runImport(msg.spec, msg.options);
  } catch (e) {
    post("error", {
      message: "生成中にエラーが発生しました: " + (e && e.message ? e.message : String(e)),
      errors: e && e.stack ? [String(e.stack).split("\n").slice(0, 4).join("\n")] : []
    });
    return null;
  }
}

figma.showUI(__html__, { width: 420, height: 560 });
figma.ui.onmessage = handleMessage;
