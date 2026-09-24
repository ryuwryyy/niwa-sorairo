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

figma.ui.onmessage = async function (msg) {
  if (msg.type !== "import") return;
  try {
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    var data = msg.data;
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
