/**
 * spec.json の検証（DESIGN.md §4.6 の契約）。
 *
 * このファイルの `SORAIRO_VALIDATOR` ブロックは `figma-plugin/code.js` の同名ブロックと
 * **1 バイトも違わない**ことを `tests/figma/validator-sync.test.mjs` が検査する。
 * 片方だけ直すとテストが落ちるので、必ず両方を同じ内容にすること。
 *
 * プラグイン本体（code.js）は import が使えないサンドボックスで動くため、
 * モジュール化ではなく「同じ関数本体を両方に置く」方式にしている。
 */

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

export { validateSpec };
export default validateSpec;
