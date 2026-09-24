// 「聴く」の分類結果(kiku/v1)を FigJam に配置する。
// アフィニティ図 = 分類ごとのセクション + 付箋、行動フロー = 段階ごとのセクション + ステップ + 矢印
figma.showUI(__html__, { width: 380, height: 380 });

var STICKY_RGB = {
  red: { r: 1, g: 0.78, b: 0.74 },
  blue: { r: 0.76, g: 0.87, b: 0.98 },
  green: { r: 0.8, g: 0.93, b: 0.77 },
  yellow: { r: 1, g: 0.9, b: 0.6 },
  violet: { r: 0.89, g: 0.82, b: 0.96 },
  pink: { r: 1, g: 0.8, b: 0.9 },
  teal: { r: 0.76, g: 0.93, b: 0.91 },
  gray: { r: 0.9, g: 0.9, b: 0.88 },
};
var STEP_FILL = { r: 0.91, g: 0.93, b: 0.98 };
var PAIN_FILL = STICKY_RGB.red;

var STICKY = 240, GAP = 24, PAD = 40;

function sticky(text, rgb) {
  var s = figma.createSticky();
  s.text.characters = text;
  s.fills = [{ type: "SOLID", color: rgb }];
  s.authorVisible = false;
  return s;
}

function section(name, x, y, w, h) {
  var sec = figma.createSection();
  sec.name = name;
  sec.x = x;
  sec.y = y;
  sec.resizeWithoutConstraints(w, h);
  return sec;
}

function stars(n) {
  var out = "";
  for (var i = 0; i < 3; i++) out += i < n ? "★" : "☆";
  return out;
}

function placeAffinity(groups, x0, y0) {
  var nodes = [];
  var x = x0;
  var bottom = y0;
  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    var cols = group.items.length > 6 ? 2 : 1;
    var rows = Math.ceil(group.items.length / cols);
    var w = PAD * 2 + cols * STICKY + (cols - 1) * GAP;
    var h = PAD * 2 + 20 + rows * (STICKY + GAP);
    var sec = section(group.category + "(" + group.items.length + ")", x, y0, w, h);
    for (var i = 0; i < group.items.length; i++) {
      var it = group.items[i];
      var label = it.text + "\n\n" + stars(it.importance) + (it.speaker ? " — " + it.speaker : "");
      var s = sticky(label, STICKY_RGB[group.color] || STICKY_RGB.yellow);
      sec.appendChild(s);
      s.x = PAD + (i % cols) * (STICKY + GAP);
      s.y = PAD + 20 + Math.floor(i / cols) * (STICKY + GAP);
    }
    nodes.push(sec);
    x += w + GAP * 2;
    bottom = Math.max(bottom, y0 + h);
  }
  return { nodes: nodes, bottom: bottom };
}

function placeFlow(flow, x0, y0) {
  var nodes = [];
  var byId = {};
  var lastOfStage = [];
  var colW = 300;
  var x = x0;
  for (var si = 0; si < flow.stages.length; si++) {
    var st = flow.stages[si];
    var count = st.steps.length + st.pains.length;
    var h = PAD * 2 + 20 + count * 150;
    var sec = section(st.name, x, y0, colW, h);
    var y = PAD + 20;
    var last = null;
    for (var i = 0; i < st.steps.length; i++) {
      var step = st.steps[i];
      var shape = figma.createShapeWithText();
      shape.shapeType = "ROUNDED_RECTANGLE";
      shape.resize(colW - PAD * 2, 120);
      shape.fills = [{ type: "SOLID", color: STEP_FILL }];
      shape.text.characters = step.text;
      sec.appendChild(shape);
      shape.x = PAD;
      shape.y = y;
      y += 150;
      byId[step.id] = shape;
      last = shape;
    }
    for (var p = 0; p < st.pains.length; p++) {
      var pain = sticky("ペイン: " + st.pains[p], PAIN_FILL);
      pain.resize(colW - PAD * 2, 120);
      sec.appendChild(pain);
      pain.x = PAD;
      pain.y = y;
      y += 150;
      if (last) nodes.push(connect(last, pain, false));
    }
    lastOfStage.push(last);
    nodes.push(sec);
    x += colW + GAP * 3;
  }
  for (var e = 0; e < flow.edges.length; e++) {
    var a = byId[flow.edges[e][0]], b = byId[flow.edges[e][1]];
    if (a && b) nodes.push(connect(a, b, true));
  }
  return nodes;
}

function connect(a, b, arrow) {
  var c = figma.createConnector();
  c.connectorStart = { endpointNodeId: a.id, magnet: "AUTO" };
  c.connectorEnd = { endpointNodeId: b.id, magnet: "AUTO" };
  c.connectorEndStrokeCap = arrow ? "ARROW_LINES" : "NONE";
  if (!arrow) c.dashPattern = [8, 8];
  return c;
}

// ---- 深掘りレポート(kiku/report-v1) ----

function label(parent, chars, x, y, size, width) {
  var t = figma.createText();
  t.fontName = { family: "Inter", style: "Medium" };
  t.characters = chars;
  t.fontSize = size || 24;
  parent.appendChild(t);
  t.x = x;
  t.y = y;
  if (width) { t.resize(width, t.height); t.textAutoResize = "HEIGHT"; }
  return t;
}

function linkify(sublayer, url) {
  if (!url) return;
  try { sublayer.setRangeHyperlink(0, sublayer.characters.length, { type: "URL", value: url }); } catch (e) { /* 古いAPIでは無視 */ }
}

function card(text, w, h, rgb) {
  var s = figma.createShapeWithText();
  s.shapeType = "ROUNDED_RECTANGLE";
  s.resize(w, h);
  s.fills = [{ type: "SOLID", color: rgb }];
  s.text.characters = text;
  return s;
}

var POS = { r: 0.83, g: 0.9, b: 0.98 };
var NEG = { r: 0.99, g: 0.87, b: 0.85 };
var NEU = { r: 0.95, g: 0.95, b: 0.93 };

// 横軸 嫌悪↔好意、縦軸 少し↔めっちゃ。カードが重ならないよう格子に吸着させる
function placeQuadrant(data, x0, y0) {
  var SIZE = 2600, CW = 200, CH = 120, GX = 215, GY = 135, M = 120;
  var sec = section("4象限マップ(横: 嫌悪↔好意 / 縦: 少し↔めっちゃ)", x0, y0, SIZE, SIZE);
  var mid = SIZE / 2;
  var v = figma.createRectangle(); v.resize(4, SIZE - M * 2); v.x = mid - 2; v.y = M; v.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }]; sec.appendChild(v);
  var h = figma.createRectangle(); h.resize(SIZE - M * 2, 4); h.x = M; h.y = mid - 2; h.fills = v.fills; sec.appendChild(h);
  var names = {};
  for (var i = 0; i < data.quadrants.length; i++) names[data.quadrants[i].id] = data.quadrants[i];
  label(sec, "拒絶  " + (names.reject.reading || ""), M, M - 90, 32, mid - M - 40);
  label(sec, "熱狂  " + (names.fever.reading || ""), mid + 40, M - 90, 32, mid - M - 40);
  label(sec, "違和感  " + (names.friction.reading || ""), M, SIZE - M + 20, 32, mid - M - 40);
  label(sec, "好感  " + (names.like.reading || ""), mid + 40, SIZE - M + 20, 32, mid - M - 40);
  label(sec, "← 嫌悪", M, mid + 12, 28);
  label(sec, "好意 →", SIZE - M - 120, mid + 12, 28);
  label(sec, "↑ めっちゃ", mid + 12, M, 28);
  label(sec, "↓ 少し", mid + 12, SIZE - M - 40, 28);

  var used = {};
  var cols = Math.floor((SIZE - M * 2 - CW) / GX), rows = Math.floor((SIZE - M * 2 - CH) / GY);
  for (var p = 0; p < data.posts.length; p++) {
    var post = data.posts[p];
    var c0 = Math.round(((post.x + 1) / 2) * cols), r0 = Math.round((1 - post.y) * rows);
    // 近い空きマスを渦巻き状に探す
    var found = null;
    for (var d = 0; d <= Math.max(cols, rows) && !found; d++) {
      for (var dc = -d; dc <= d && !found; dc++) {
        for (var dr = -d; dr <= d && !found; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
          var c = c0 + dc, r = r0 + dr;
          if (c < 0 || r < 0 || c > cols || r > rows || used[c + ":" + r]) continue;
          found = [c, r];
        }
      }
    }
    if (!found) continue;
    used[found[0] + ":" + found[1]] = true;
    var k = card(post.text + (post.url ? "\n↗ 元の投稿" : ""), CW, CH, post.x >= 0 ? POS : NEG);
    k.text.fontSize = 11;
    linkify(k.text, post.url);
    sec.appendChild(k);
    k.x = M + found[0] * GX;
    k.y = M + found[1] * GY;
  }
  return sec;
}

function placeGroups(groups, x0, y0) {
  var nodes = [], x = x0, W = 3 * (STICKY + GAP) + PAD * 2;
  for (var g = 0; g < groups.length; g++) {
    var grp = groups[g];
    var rows = 1 + (grp.arc ? 1 : 0) + Math.ceil(grp.insights.length / 3) + Math.ceil(grp.quotes.length / 3);
    var sec = section(grp.label + "(" + grp.count + "件)", x, y0, W, PAD * 2 + 20 + rows * (STICKY + GAP));
    var y = PAD + 20;
    var sum = sticky(grp.summary || "(要約なし)", NEU); sum.isWideWidth = true; sec.appendChild(sum); sum.x = PAD; sum.y = y; y += STICKY + GAP;
    if (grp.arc) {
      var arc = ["きっかけ: " + grp.arc.trigger, "反応: " + grp.arc.reaction, "余韻: " + grp.arc.afterglow];
      for (var a = 0; a < 3; a++) { var s = sticky(arc[a], STICKY_RGB.violet); sec.appendChild(s); s.x = PAD + a * (STICKY + GAP); s.y = y; }
      y += STICKY + GAP;
    }
    for (var i = 0; i < grp.insights.length; i++) {
      var ins = sticky("💡 " + grp.insights[i], STICKY_RGB.yellow); sec.appendChild(ins);
      ins.x = PAD + (i % 3) * (STICKY + GAP); ins.y = y + Math.floor(i / 3) * (STICKY + GAP);
    }
    y += Math.ceil(grp.insights.length / 3) * (STICKY + GAP);
    for (var q = 0; q < grp.quotes.length; q++) {
      var quote = grp.quotes[q];
      var qs = sticky("「" + quote.text + "」" + (quote.url ? "\n↗ 元の投稿" : ""), STICKY_RGB.gray);
      linkify(qs.text, quote.url);
      sec.appendChild(qs);
      qs.x = PAD + (q % 3) * (STICKY + GAP); qs.y = y + Math.floor(q / 3) * (STICKY + GAP);
    }
    nodes.push(sec);
    x += W + GAP * 2;
  }
  return nodes;
}

function placeSynthesis(syn, x0, y0) {
  var nodes = [];
  var W = 5 * 400 + PAD * 2;
  var sec = section("一段深いUI/UXの洞察", x0, y0, W, 900);
  label(sec, syn.headline, PAD, PAD, 40, W - PAD * 2);
  for (var i = 0; i < syn.uxInsights.length; i++) {
    var u = syn.uxInsights[i];
    var k = card((i + 1) + ". " + u.insight + "\n\nなぜ: " + u.why + "\n\n示唆: " + u.designImplication, 380, 520, STICKY_RGB.yellow);
    k.text.fontSize = 14;
    sec.appendChild(k); k.x = PAD + i * 400; k.y = PAD + 100;
  }
  label(sec, "原則: " + syn.principles.join(" / "), PAD, 700, 28, W - PAD * 2);
  nodes.push(sec);

  var dW = syn.deconte.length * 420 + PAD * 2;
  var dsec = section("デコンテ(アートディレクション)", x0, y0 + 1000, dW, 820);
  for (var d = 0; d < syn.deconte.length; d++) {
    var b = syn.deconte[d];
    var frame = card(
      String(d + 1).padStart(2, "0") + " " + b.beat + "\n\n" + b.scene +
      "\n\n画: " + b.visual + "\n言葉: " + b.copyTone + "\n色と光: " + b.colorLight + "\n書体: " + b.typography + "\n動き・音: " + b.motionSound,
      400, 720, { r: 1, g: 1, b: 1 });
    frame.shapeType = "SQUARE";
    frame.text.fontSize = 14;
    frame.strokes = [{ type: "SOLID", color: { r: 0.12, g: 0.13, b: 0.15 } }];
    dsec.appendChild(frame); frame.x = PAD + d * 420; frame.y = PAD + 20;
  }
  nodes.push(dsec);
  return nodes;
}

function placeReport(data, x0, y0) {
  var all = [];
  var q = placeQuadrant(data, x0, y0);
  all.push(q);
  var y = y0 + q.height + 200;
  var g = placeGroups(data.groups, x0, y);
  all = all.concat(g);
  if (data.synthesis) {
    var maxH = 0;
    for (var i = 0; i < g.length; i++) maxH = Math.max(maxH, g[i].height);
    all = all.concat(placeSynthesis(data.synthesis, x0, y + maxH + 200));
  }
  return all;
}

figma.ui.onmessage = async function (msg) {
  if (msg.type !== "import") return;
  try {
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    var data = msg.data;
    if (data.kind === "kiku/report-v1") {
      var cc = figma.viewport.center;
      var rx = Math.round(cc.x), ry = Math.round(cc.y);
      var head = label(figma.currentPage, data.title, rx, ry, 56);
      var placed = [head].concat(placeReport(data, rx, ry + 120));
      figma.viewport.scrollAndZoomIntoView(placed);
      figma.closePlugin("配置しました");
      return;
    }
    var c = figma.viewport.center;
    var x0 = Math.round(c.x), y0 = Math.round(c.y);
    var all = [];

    var title = figma.createText();
    title.fontName = { family: "Inter", style: "Medium" };
    title.characters = data.title || "インタビュー整理";
    title.fontSize = 48;
    title.x = x0;
    title.y = y0;
    all.push(title);
    var y = y0 + 100;

    if (msg.affinity && data.affinity && data.affinity.length) {
      var aff = placeAffinity(data.affinity, x0, y);
      all = all.concat(aff.nodes);
      y = aff.bottom + 160;
    }
    if (msg.flow && data.flow && data.flow.stages && data.flow.stages.length) {
      all = all.concat(placeFlow(data.flow, x0, y));
    }
    figma.viewport.scrollAndZoomIntoView(all);
    figma.closePlugin("配置しました");
  } catch (e) {
    figma.ui.postMessage({ type: "error", message: String(e && e.message ? e.message : e) });
  }
};
