/**
 * figma-plugin/code.js を node:vm の中で、偽物の `figma` グローバルを渡して動かす。
 *
 * 偽物の側で Figma 本体と同じ制約を再現している:
 *   - layoutSizingHorizontal / Vertical は auto-layout の文脈が無いと throw
 *   - FILL は auto-layout の子だけ、HUG は auto-layout フレーム自身かその TEXT の子だけ
 *   - combineAsVariants は ComponentNode の配列しか受け取らない
 *   - createVariable は コレクションのオブジェクトを要求する
 * なので「警告ゼロで完走した」= 上の規則を一度も破っていない、という強めの検査になる。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
// vm の中で作られたオブジェクトは prototype が別realmなので、構造比較は緩い deepEqual を使う
import { deepEqual as sameValues } from "node:assert";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const readRel = (rel) => readFileSync(fileURLToPath(new URL(rel, root)), "utf8");
const CODE = readRel("figma-plugin/code.js");
const SAMPLE = JSON.parse(readRel("figma-plugin/samples/sample-spec.json"));
const clone = (v) => JSON.parse(JSON.stringify(v));

const DEFAULT_FONTS = {
  "Noto Sans JP": ["Regular", "Medium", "Bold"],
  "Shippori Mincho": ["Regular", "Medium", "Bold"],
  Inter: ["Regular", "Medium", "Bold"],
};

/* ------------------------------------------------------------------ *
 * 偽 Figma
 * ------------------------------------------------------------------ */

function createFigmaMock(opts = {}) {
  const fonts = opts.fonts || DEFAULT_FONTS;
  const state = {
    seq: 0,
    ops: [],            // { op:"append"|"set", … } を時系列で
    messages: [],       // figma.ui.postMessage で飛んできたもの
    collections: [],
    variables: [],
    paintStyles: [],
    textStyles: [],
    images: [],
    boundPaints: [],
    boundNumbers: [],
    loadedFonts: [],
    showUI: null,
    closed: false,
    zoomed: null,
    currentPage: null,
  };

  const nextId = (type) => `${type}:${++state.seq}`;

  function detach(node) {
    const parent = node.parent;
    if (parent && Array.isArray(parent.children)) {
      const i = parent.children.indexOf(node);
      if (i >= 0) parent.children.splice(i, 1);
    }
    node.parent = null;
  }

  function childrenApi() {
    return {
      children: [],
      appendChild(child) {
        if (!child || !child.id) throw new Error("appendChild: node が必要です");
        if (child === this) throw new Error("appendChild: 自分自身は追加できません");
        detach(child);
        child.parent = this;
        this.children.push(child);
        state.ops.push({ op: "append", parent: this.id, child: child.id });
      },
      insertChild(index, child) {
        detach(child);
        child.parent = this;
        this.children.splice(index, 0, child);
        state.ops.push({ op: "append", parent: this.id, child: child.id });
      },
      findAll(pred) {
        const out = [];
        const walk = (n) => {
          for (const c of n.children || []) {
            if (!pred || pred(c)) out.push(c);
            if (c.children) walk(c);
          }
        };
        walk(this);
        return out;
      },
    };
  }

  // Figma と同じ値制限（skill: figma-use / gotchas.md の layoutSizing ルール）
  function assertSizing(target, prop, value) {
    if (!["FIXED", "HUG", "FILL"].includes(value)) {
      throw new Error(`in set_${prop}: expected 'FIXED' | 'HUG' | 'FILL', received '${value}'`);
    }
    const parent = target.parent;
    const parentAuto = !!(parent && parent.layoutMode && parent.layoutMode !== "NONE");
    const selfAuto = !!(target.layoutMode && target.layoutMode !== "NONE");
    if (!parentAuto && !selfAuto) {
      throw new Error(`in set_${prop}: node must be an auto-layout frame or a child of an auto-layout frame`);
    }
    if (value === "FILL" && !parentAuto) {
      throw new Error(`in set_${prop}: FILL can only be set on children of auto-layout frames`);
    }
    if (value === "HUG" && !selfAuto && !(target.type === "TEXT" && parentAuto)) {
      throw new Error(`in set_${prop}: HUG can only be set on auto-layout frames or text children of auto-layout frames`);
    }
  }

  function wrap(target) {
    return new Proxy(target, {
      set(t, prop, value) {
        if (prop === "layoutSizingHorizontal" || prop === "layoutSizingVertical") assertSizing(t, prop, value);
        if (prop === "fills" && !Array.isArray(value)) throw new Error("fills は配列である必要があります");
        state.ops.push({ op: "set", node: t.id, prop: String(prop), value });
        t[prop] = value;
        return true;
      },
    });
  }

  function makeNode(type) {
    const base = {
      id: nextId(type),
      type,
      name: type,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      opacity: 1,
      visible: true,
      fills: [],
      strokes: [],
      strokeWeight: 1,
      strokeAlign: "INSIDE",
      constraints: { horizontal: "MIN", vertical: "MIN" },
      parent: null,
      layoutSizingHorizontal: "FIXED",
      layoutSizingVertical: "FIXED",
      resize(w, h) {
        if (!(w > 0) || !(h > 0)) throw new Error(`resize: 正の値が必要です (${w} × ${h})`);
        this.width = w;
        this.height = h;
      },
      resizeWithoutConstraints(w, h) {
        this.width = w;
        this.height = h;
      },
      setBoundVariable(field, variable) {
        if (!variable || !variable.id) throw new Error("setBoundVariable: Variable オブジェクトが必要です");
        state.boundNumbers.push({ node: this.id, field, variable: variable.name });
      },
      remove() { detach(this); },
    };
    if (type === "FRAME" || type === "COMPONENT" || type === "COMPONENT_SET") {
      Object.assign(base, childrenApi(), {
        layoutMode: "NONE",
        layoutWrap: "NO_WRAP",
        paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
        itemSpacing: 0, counterAxisSpacing: null,
        primaryAxisAlignItems: "MIN", counterAxisAlignItems: "MIN",
        primaryAxisSizingMode: "FIXED", counterAxisSizingMode: "FIXED",
        clipsContent: true,
      });
    }
    if (type === "FRAME" || type === "COMPONENT" || type === "COMPONENT_SET" || type === "RECTANGLE") {
      Object.assign(base, { cornerRadius: 0, topLeftRadius: 0, topRightRadius: 0, bottomLeftRadius: 0, bottomRightRadius: 0 });
    }
    if (type === "COMPONENT" || type === "COMPONENT_SET") base.description = "";
    if (type === "TEXT") {
      Object.assign(base, {
        characters: "",
        fontName: { family: "Inter", style: "Regular" },
        fontSize: 12,
        lineHeight: { unit: "AUTO" },
        textAlignHorizontal: "LEFT",
        textAutoResize: "WIDTH_AND_HEIGHT",
        textStyleId: "",
        async setTextStyleIdAsync(id) { this.textStyleId = id; },
      });
    }
    return wrap(base);
  }

  function makePage(name) {
    return wrap(Object.assign(
      { id: nextId("PAGE"), type: "PAGE", name, parent: null, selection: [], async loadAsync() {} },
      childrenApi(),
    ));
  }

  const documentNode = wrap(Object.assign({ id: "DOCUMENT:0", type: "DOCUMENT", name: "Document", parent: null }, childrenApi()));
  const firstPage = makePage("Page 1");
  documentNode.appendChild(firstPage);
  state.currentPage = firstPage;

  const figma = {
    root: documentNode,
    currentPage: firstPage,
    mixed: Symbol("mixed"),

    showUI(html, options) { state.showUI = { html, options }; },
    closePlugin() { state.closed = true; },
    ui: {
      onmessage: undefined,
      postMessage(msg) { state.messages.push(msg); },
    },
    viewport: {
      scrollAndZoomIntoView(nodes) { state.zoomed = nodes.map((n) => n.id); },
    },

    async setCurrentPageAsync(page) {
      if (!page || page.type !== "PAGE") throw new Error("setCurrentPageAsync: PageNode が必要です");
      state.currentPage = page;
      figma.currentPage = page;
    },
    createPage() {
      const page = makePage(`Page ${documentNode.children.length + 1}`);
      documentNode.appendChild(page);
      return page;
    },

    // 生成した直後のノードは（本物と違い）どこにも属さない。
    // プラグイン側は必ず明示的に appendChild しているので、これで順序を検査できる。
    createFrame() { return makeNode("FRAME"); },
    createText() { return makeNode("TEXT"); },
    createRectangle() { return makeNode("RECTANGLE"); },
    createEllipse() { return makeNode("ELLIPSE"); },
    createComponent() { return makeNode("COMPONENT"); },

    combineAsVariants(nodes, parent) {
      if (!Array.isArray(nodes) || nodes.length === 0) throw new Error("combineAsVariants: 空でない配列が必要です");
      for (const n of nodes) {
        if (!n || n.type !== "COMPONENT") throw new Error("combineAsVariants: ComponentNode 以外は渡せません");
      }
      if (!parent || typeof parent.appendChild !== "function") throw new Error("combineAsVariants: parent が必要です");
      const set = makeNode("COMPONENT_SET");
      set.name = "Component Set";
      parent.appendChild(set);
      for (const n of nodes) {
        set.appendChild(n);
        n.x = 0;
        n.y = 0;
      }
      return set;
    },

    createImage(bytes) {
      if (!bytes || typeof bytes.length !== "number" || bytes.length < 8) throw new Error("createImage: 画像データが不正です");
      const hash = `img${++state.seq}`;
      state.images.push({ hash, bytes });
      return { hash };
    },

    async listAvailableFontsAsync() {
      const out = [];
      for (const family of Object.keys(fonts)) for (const style of fonts[family]) out.push({ fontName: { family, style } });
      return out;
    },
    async loadFontAsync(font) {
      if (!font || !font.family) throw new Error("loadFontAsync: FontName が必要です");
      const styles = fonts[font.family];
      if (!styles || (font.style && !styles.includes(font.style))) {
        throw new Error(`Cannot load font ${font.family} ${font.style}`);
      }
      state.loadedFonts.push(`${font.family} ${font.style}`);
    },

    createPaintStyle() {
      const style = { id: `PaintStyle:${++state.seq}`, type: "PAINT", name: "", paints: [], description: "" };
      state.paintStyles.push(style);
      return style;
    },
    createTextStyle() {
      const style = {
        id: `TextStyle:${++state.seq}`, type: "TEXT", name: "",
        fontName: { family: "Inter", style: "Regular" }, fontSize: 12,
        lineHeight: { unit: "AUTO" }, description: "",
      };
      state.textStyles.push(style);
      return style;
    },
    async getLocalPaintStylesAsync() { return state.paintStyles.slice(); },
    async getLocalTextStylesAsync() { return state.textStyles.slice(); },

    variables: {
      createVariableCollection(name) {
        const collection = {
          id: `VariableCollection:${++state.seq}`,
          name,
          modes: [{ modeId: "mode:1", name: "Mode 1" }],
          defaultModeId: "mode:1",
          variableIds: [],
        };
        state.collections.push(collection);
        return collection;
      },
      createVariable(name, collection, resolvedType) {
        if (typeof collection === "string") throw new Error("createVariable: コレクションのオブジェクトを渡してください（ID は非推奨）");
        if (!collection || !collection.id) throw new Error("createVariable: VariableCollection が必要です");
        if (!["COLOR", "FLOAT", "STRING", "BOOLEAN"].includes(resolvedType)) {
          throw new Error(`createVariable: 未知の resolvedType ${resolvedType}`);
        }
        const variable = {
          id: `Variable:${++state.seq}`,
          name,
          resolvedType,
          variableCollectionId: collection.id,
          scopes: ["ALL_SCOPES"],
          valuesByMode: {},
          setValueForMode(modeId, value) {
            if (!modeId) throw new Error("setValueForMode: modeId が必要です");
            if (resolvedType === "COLOR" && (typeof value !== "object" || !("a" in value))) {
              throw new Error("COLOR の値は { r, g, b, a } です");
            }
            if (resolvedType === "FLOAT" && typeof value !== "number") throw new Error("FLOAT の値は数値です");
            this.valuesByMode[modeId] = value;
          },
        };
        state.variables.push(variable);
        collection.variableIds.push(variable.id);
        return variable;
      },
      async getLocalVariableCollectionsAsync() { return state.collections.slice(); },
      async getLocalVariablesAsync() { return state.variables.slice(); },
      setBoundVariableForPaint(paint, field, variable) {
        if (!paint || paint.type !== "SOLID") throw new Error("setBoundVariableForPaint: SOLID の Paint のみ");
        if (field !== "color") throw new Error("setBoundVariableForPaint: field は 'color' のみ");
        if (!variable || !variable.id) throw new Error("setBoundVariableForPaint: Variable が必要です");
        state.boundPaints.push({ variable: variable.name, color: paint.color });
        return Object.assign({}, paint, { boundVariables: { color: { type: "VARIABLE_ALIAS", id: variable.id } } });
      },
    },
  };

  return { figma, state, documentNode };
}

function loadPlugin(mock) {
  const context = vm.createContext({ figma: mock.figma, __html__: "<html>ui</html>", console });
  vm.runInContext(CODE, context, { filename: "figma-plugin/code.js" });
  return context;
}

async function importSpec(mock, spec, options) {
  return mock.figma.ui.onmessage({ type: "import", spec, options: options || {} });
}

const pageByName = (mock, name) => mock.documentNode.children.find((p) => p.name === name);
const lastMessage = (mock, type) => [...mock.state.messages].reverse().find((m) => m.type === type);
const childrenOfType = (page, type) => page.children.filter((n) => n.type === type);

/* ------------------------------------------------------------------ *
 * テスト
 * ------------------------------------------------------------------ */

test("showUI は 420 × 560 で呼ばれ、onmessage が登録される", () => {
  const mock = createFigmaMock();
  loadPlugin(mock);
  assert.equal(mock.state.showUI.html, "<html>ui</html>");
  sameValues(mock.state.showUI.options, { width: 420, height: 560 });
  assert.equal(typeof mock.figma.ui.onmessage, "function");
});

test("サンプル spec を取り込むと Variables / Styles / フレーム / コンポーネントが揃う", async () => {
  const mock = createFigmaMock();
  loadPlugin(mock);
  const summary = await importSpec(mock, clone(SAMPLE));

  assert.ok(summary, "done が返っていない");
  const done = lastMessage(mock, "done");
  assert.ok(done, "done メッセージが飛んでいない");
  assert.equal(lastMessage(mock, "error"), undefined);
  sameValues(summary.warnings, [], "警告が出ている: " + summary.warnings.join(" / "));
  sameValues(summary.substitutions, []);

  // --- Variables ---
  const colorVars = mock.state.variables.filter((v) => v.name.startsWith("color/"));
  assert.equal(colorVars.length, 9, "COLOR 変数は 9 本");
  assert.ok(colorVars.every((v) => v.resolvedType === "COLOR"));
  assert.equal(mock.state.variables.filter((v) => v.name.startsWith("space/")).length, 8);
  assert.equal(mock.state.variables.filter((v) => v.name.startsWith("radius/")).length, 5);
  assert.equal(mock.state.collections.length, 1);
  assert.equal(mock.state.collections[0].name, "Sorairo");
  const primary = colorVars.find((v) => v.name === "color/primary");
  sameValues(primary.valuesByMode["mode:1"], { r: 0x2f / 255, g: 0x5d / 255, b: 0x7c / 255, a: 1 });
  sameValues(primary.scopes, ["ALL_FILLS", "STROKE_COLOR"]);

  // --- Styles ---
  assert.equal(mock.state.paintStyles.length, 9);
  assert.ok(mock.state.paintStyles.some((s) => s.name === "Sorairo/primary"));
  assert.ok(mock.state.textStyles.length >= 6, `テキストスタイルが ${mock.state.textStyles.length} 件`);
  for (const key of ["display", "h1", "h2", "h3", "body", "caption"]) {
    assert.ok(mock.state.textStyles.some((s) => s.name === `Sorairo/${key}`), `Sorairo/${key} が無い`);
  }
  const displayStyle = mock.state.textStyles.find((s) => s.name === "Sorairo/display");
  assert.equal(displayStyle.fontSize, 56);
  sameValues(displayStyle.lineHeight, { value: 150, unit: "PERCENT" });
  assert.equal(displayStyle.fontName.family, "Shippori Mincho");
  // 見出し書体で使う h3（Card の Title）には別のスタイルが用意される
  assert.ok(mock.state.textStyles.some((s) => s.name === "Sorairo/h3-display"));

  // --- ページと中身 ---
  const page = pageByName(mock, "Sorairo / 空色の庭");
  assert.ok(page, "ページが作られていない");
  assert.equal(mock.figma.currentPage, page);
  assert.equal(childrenOfType(page, "FRAME").length, 1);
  assert.equal(childrenOfType(page, "COMPONENT_SET").length, 5);
  sameValues(
    childrenOfType(page, "COMPONENT_SET").map((n) => n.name),
    ["Button", "Tag", "Card", "Hero", "Header"],
  );

  const frame = childrenOfType(page, "FRAME")[0];
  assert.equal(frame.name, "KV / 16:9");
  assert.equal(frame.width, 1920);
  assert.equal(frame.height, 1080);

  const button = page.children.find((n) => n.name === "Button");
  assert.equal(button.children.length, 6, "Button のバリアントは 6 つ");
  sameValues(button.children.map((c) => c.name).sort(), [
    "Variant=Ghost, Size=L",
    "Variant=Ghost, Size=M",
    "Variant=Primary, Size=L",
    "Variant=Primary, Size=M",
    "Variant=Secondary, Size=L",
    "Variant=Secondary, Size=M",
  ].sort());
  assert.match(button.description, /Variant: Primary \/ Secondary \/ Ghost/);
  assert.match(button.description, /Size: M \/ L/);

  sameValues(summary.frames, 1);
  assert.equal(summary.components, 5);
  assert.equal(summary.variants, 14);
  assert.equal(summary.images, 1);
  assert.equal(summary.page, "Sorairo / 空色の庭");
});

test("バリアントは combineAsVariants のあとグリッドに並べ直される", async () => {
  const mock = createFigmaMock();
  loadPlugin(mock);
  await importSpec(mock, clone(SAMPLE));
  const page = pageByName(mock, "Sorairo / 空色の庭");
  const button = page.children.find((n) => n.name === "Button");

  const positions = button.children.map((c) => `${c.x},${c.y}`);
  assert.equal(new Set(positions).size, 6, "バリアントが重なっている: " + positions.join(" "));
  // Variant が行、Size が列
  const byName = Object.fromEntries(button.children.map((c) => [c.name, c]));
  assert.equal(byName["Variant=Primary, Size=M"].y, byName["Variant=Primary, Size=L"].y);
  assert.ok(byName["Variant=Secondary, Size=M"].y > byName["Variant=Primary, Size=M"].y);
  assert.ok(byName["Variant=Primary, Size=L"].x > byName["Variant=Primary, Size=M"].x);
  assert.ok(button.width > 0 && button.height > 0);

  // 版面とコンポーネントセットが重ならない（フレームの下に 120px 空けて置く）
  const frame = page.children.find((n) => n.type === "FRAME");
  for (const set of page.children.filter((n) => n.type === "COMPONENT_SET")) {
    assert.ok(set.y >= frame.y + frame.height + 120, `${set.name} が版面と重なっている`);
  }
  const sets = page.children.filter((n) => n.type === "COMPONENT_SET");
  for (let i = 1; i < sets.length; i++) {
    assert.ok(sets[i].x >= sets[i - 1].x + sets[i - 1].width + 120, "コンポーネントセットが重なっている");
  }
});

test("layoutSizingHorizontal / Vertical は appendChild のあとでしか設定しない", async () => {
  const mock = createFigmaMock();
  loadPlugin(mock);
  await importSpec(mock, clone(SAMPLE));

  const firstAppend = new Map();
  let checked = 0;
  mock.state.ops.forEach((op, index) => {
    if (op.op === "append" && !firstAppend.has(op.child)) firstAppend.set(op.child, index);
    if (op.op === "set" && (op.prop === "layoutSizingHorizontal" || op.prop === "layoutSizingVertical")) {
      const appendedAt = firstAppend.get(op.node);
      assert.notEqual(appendedAt, undefined, `${op.node} は親に追加される前に ${op.prop} を設定された`);
      assert.ok(appendedAt < index, `${op.node}: ${op.prop} が appendChild より先に呼ばれている`);
      checked++;
    }
  });
  assert.ok(checked > 40, `サイズ指定の検査件数が少なすぎる: ${checked}`);
});

test("$color.* の塗りは Variable に束縛される", async () => {
  const mock = createFigmaMock();
  loadPlugin(mock);
  const summary = await importSpec(mock, clone(SAMPLE));

  const names = mock.state.boundPaints.map((b) => b.variable);
  assert.ok(names.includes("color/primary"), "color/primary が束縛されていない");
  assert.ok(names.includes("color/onPrimary"));
  assert.ok(names.includes("color/surface"));
  assert.ok(summary.boundPaints > 20, `束縛された塗りが少ない: ${summary.boundPaints}`);

  // ノード側の塗りにも boundVariables が乗っていること
  const page = pageByName(mock, "Sorairo / 空色の庭");
  const button = page.children.find((n) => n.name === "Button");
  const primaryM = button.children.find((c) => c.name === "Variant=Primary, Size=M");
  assert.equal(primaryM.fills.length, 1);
  assert.equal(primaryM.fills[0].type, "SOLID");
  assert.ok(primaryM.fills[0].boundVariables.color.id, "fill が変数に束縛されていない");

  // Paint Style も変数に束縛される
  const style = mock.state.paintStyles.find((s) => s.name === "Sorairo/accent");
  assert.ok(style.paints[0].boundVariables.color.id);

  // 余白・角丸は FLOAT 変数へ
  const bound = mock.state.boundNumbers.map((b) => `${b.field}:${b.variable}`);
  assert.ok(bound.some((b) => b.startsWith("itemSpacing:space/")), "gap が space 変数に束縛されていない");
  assert.ok(bound.some((b) => b.startsWith("paddingLeft:space/")));
  assert.ok(bound.some((b) => b.startsWith("topLeftRadius:radius/")));
});

test("dataUrl は自前の base64 デコーダで PNG バイト列に戻る", async () => {
  const mock = createFigmaMock();
  const context = loadPlugin(mock);
  await importSpec(mock, clone(SAMPLE));

  assert.equal(mock.state.images.length, 1);
  const bytes = mock.state.images[0].bytes;
  sameValues([bytes[0], bytes[1], bytes[2], bytes[3]], [0x89, 0x50, 0x4e, 0x47], "PNG シグネチャが違う");
  sameValues([bytes[4], bytes[5], bytes[6], bytes[7]], [0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(bytes.length > 1000);

  // デコーダ単体（code.js の関数はサンドボックスのグローバルに出る）
  const decoded = context.base64ToBytes("iVBORw0KGgo=");
  sameValues(Array.from(decoded), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  sameValues(Array.from(context.base64ToBytes("AAECAw==")), [0, 1, 2, 3]);
  sameValues(Array.from(context.base64ToBytes("//79")), [255, 254, 253]);
  assert.throws(() => context.base64ToBytes("!!!!"), /base64 に使えない文字/);

  // hex → RGB（0〜1）
  sameValues(context.hexToRgba("#FFFFFF"), { r: 1, g: 1, b: 1, a: 1 });
  sameValues(context.hexToRgba("#000"), { r: 0, g: 0, b: 0, a: 1 });
  assert.equal(context.hexToRgba("#FF000080").a, 128 / 255);
  assert.equal(context.hexToRgba("nope"), null);

  // 画像は IMAGE 塗りとして版面に乗る
  const page = pageByName(mock, "Sorairo / 空色の庭");
  const canvas = page.children.find((n) => n.type === "FRAME").children[0];
  assert.equal(canvas.name, "Canvas");
  sameValues(canvas.fills, [{ type: "IMAGE", imageHash: mock.state.images[0].hash, scaleMode: "FILL" }]);
});

test("テキストは書体・サイズ・行送り・折り返し方法が spec どおりになる", async () => {
  const mock = createFigmaMock();
  loadPlugin(mock);
  await importSpec(mock, clone(SAMPLE));
  const page = pageByName(mock, "Sorairo / 空色の庭");
  const zone = page.children.find((n) => n.type === "FRAME").children[0].children[0];
  assert.equal(zone.name, "見出しゾーン");
  assert.equal(zone.layoutMode, "VERTICAL");
  assert.equal(zone.paddingTop, 32);
  assert.equal(zone.itemSpacing, 12);
  assert.equal(zone.opacity, 0.92);
  assert.equal(zone.cornerRadius, 8);

  const [headline, sub, brand] = zone.children;
  assert.equal(headline.characters, "空の色から、庭の色をつくる。");
  assert.equal(headline.fontSize, 56);
  sameValues(headline.fontName, { family: "Shippori Mincho", style: "Bold" });
  sameValues(headline.lineHeight, { value: 150, unit: "PERCENT" });
  assert.equal(headline.textAlignHorizontal, "LEFT");
  assert.equal(headline.textAutoResize, "HEIGHT", "幅 fill の文は HEIGHT（WIDTH_AND_HEIGHT だと潰れる）");
  assert.equal(headline.layoutSizingHorizontal, "FILL");
  assert.ok(headline.textStyleId, "テキストスタイルが当たっていない");
  assert.equal(sub.fontSize, 20);
  sameValues(sub.fontName, { family: "Noto Sans JP", style: "Medium" });
  assert.equal(brand.fontSize, 12);
  sameValues(brand.fontName, { family: "Noto Sans JP", style: "Regular" });

  // 内容に合わせて広がる文（Button のラベル）は WIDTH_AND_HEIGHT + HUG
  const button = page.children.find((n) => n.name === "Button");
  const label = button.children[0].children[0];
  assert.equal(label.type, "TEXT");
  assert.equal(label.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.equal(label.layoutSizingHorizontal, "HUG");
  assert.equal(label.textAlignHorizontal, "CENTER");
});

test("Auto Layout の指定（align / counterAlign / padding）が写る", async () => {
  const mock = createFigmaMock();
  loadPlugin(mock);
  await importSpec(mock, clone(SAMPLE));
  const page = pageByName(mock, "Sorairo / 空色の庭");

  const header = page.children.find((n) => n.name === "Header").children[0];
  assert.equal(header.layoutMode, "HORIZONTAL");
  assert.equal(header.primaryAxisAlignItems, "SPACE_BETWEEN");
  assert.equal(header.counterAxisAlignItems, "CENTER");
  sameValues(
    [header.paddingTop, header.paddingRight, header.paddingBottom, header.paddingLeft],
    [16, 32, 16, 32],
    "padding は [上, 右, 下, 左]",
  );
  assert.equal(header.width, 1200);
  assert.equal(header.height, 72);

  const hero = page.children.find((n) => n.name === "Hero").children[0];
  const copy = hero.children.find((c) => c.name === "Copy");
  assert.equal(copy.layoutSizingHorizontal, "FILL");
  assert.equal(copy.layoutSizingVertical, "FILL");

  const card = page.children.find((n) => n.name === "Card").children[0];
  assert.equal(card.layoutSizingHorizontal, "FIXED");
  assert.equal(card.layoutSizingVertical, "HUG");
  const media = card.children[0];
  assert.equal(media.type, "RECTANGLE");
  assert.equal(media.layoutSizingHorizontal, "FILL");
  assert.equal(media.layoutSizingVertical, "FIXED");
  assert.equal(media.height, 240);
});

test("2 回流しても壊れず、ページとコレクションを再利用して (2) を足す", async () => {
  const mock = createFigmaMock();
  loadPlugin(mock);
  const first = await importSpec(mock, clone(SAMPLE));
  const second = await importSpec(mock, clone(SAMPLE));

  assert.ok(second, "2 回目が失敗している");
  sameValues(second.warnings, []);
  assert.equal(mock.documentNode.children.filter((p) => p.name === "Sorairo / 空色の庭").length, 1, "ページが増えた");
  assert.equal(mock.state.collections.length, 1, "コレクションが増えた");
  assert.equal(mock.state.variables.length, 22, "変数が二重に作られた");
  assert.equal(mock.state.paintStyles.length, 9, "Paint Style が二重に作られた");
  assert.equal(first.variables, 22);
  assert.equal(second.variables, 0, "2 回目は新規作成ゼロ");
  assert.equal(second.variablesReused, 22);

  const page = pageByName(mock, "Sorairo / 空色の庭");
  const names = page.children.map((n) => n.name);
  assert.ok(names.includes("KV / 16:9"));
  assert.ok(names.includes("KV / 16:9 (2)"), names.join(" / "));
  assert.ok(names.includes("Button"));
  assert.ok(names.includes("Button (2)"));
  assert.equal(childrenOfType(page, "COMPONENT_SET").length, 10);

  // 2 回目は既存の右隣に置かれる（重ならない）
  const frames = childrenOfType(page, "FRAME");
  assert.ok(frames[1].x >= frames[0].x + frames[0].width, "2 回目のフレームが重なっている");
});

test("無いフォントは Inter に落として代替を報告する", async () => {
  const mock = createFigmaMock({ fonts: { Inter: ["Regular", "Medium", "Bold"], "Noto Sans JP": ["Regular", "Medium", "Bold"] } });
  loadPlugin(mock);
  const summary = await importSpec(mock, clone(SAMPLE));

  assert.equal(summary.substitutions.length, 1);
  assert.match(summary.substitutions[0], /^Shippori Mincho → Inter/);
  sameValues(summary.warnings, []);
  const page = pageByName(mock, "Sorairo / 空色の庭");
  const headline = page.children.find((n) => n.type === "FRAME").children[0].children[0].children[0];
  sameValues(headline.fontName, { family: "Inter", style: "Bold" });
  assert.ok(mock.state.messages.some((m) => m.type === "progress" && m.text === "フォント代替"));
});

test("Inter しか無くても（Medium が無くても）完走する", async () => {
  const mock = createFigmaMock({ fonts: { Inter: ["Regular", "Bold"] } });
  loadPlugin(mock);
  const summary = await importSpec(mock, clone(SAMPLE));
  assert.equal(summary.substitutions.length, 2);
  sameValues(summary.warnings, []);
  const page = pageByName(mock, "Sorairo / 空色の庭");
  const sub = page.children.find((n) => n.type === "FRAME").children[0].children[0].children[1];
  sameValues(sub.fontName, { family: "Inter", style: "Regular" }); // Medium が無いので Regular で代替
});

test("オプションで作るものを絞れる", async () => {
  const mock = createFigmaMock();
  loadPlugin(mock);
  const summary = await importSpec(mock, clone(SAMPLE), {
    variables: false, styles: false, components: false, frames: true, pageName: "手で決めたページ",
  });

  assert.equal(mock.state.variables.length, 0);
  assert.equal(mock.state.paintStyles.length, 0);
  assert.equal(mock.state.textStyles.length, 0);
  assert.equal(summary.page, "手で決めたページ");
  const page = pageByName(mock, "手で決めたページ");
  assert.equal(childrenOfType(page, "FRAME").length, 1);
  assert.equal(childrenOfType(page, "COMPONENT_SET").length, 0);
  sameValues(summary.warnings, []);

  // 変数が無くても色はそのまま塗られる
  const canvasChild = page.children[0].children[0].children[0];
  assert.equal(canvasChild.fills[0].type, "SOLID");
  assert.equal(canvasChild.fills[0].boundVariables, undefined);
});

test("壊れた spec は日本語のエラーになり、何も作らない", async () => {
  const mock = createFigmaMock();
  loadPlugin(mock);
  const broken = clone(SAMPLE);
  broken.version = 3;
  broken.tokens.color = "青";
  const result = await importSpec(mock, broken);

  assert.equal(result, null);
  const error = lastMessage(mock, "error");
  assert.ok(error);
  assert.match(error.message, /§4.6/);
  assert.ok(error.errors.some((e) => e.includes("version は 1")));
  assert.ok(error.errors.some((e) => e.includes("tokens.color")));
  assert.equal(mock.state.variables.length, 0);
  assert.equal(mock.documentNode.children.length, 1, "ページを作ってしまっている");
});

test("実行時の例外は error メッセージになり、プラグインは落ちない", async () => {
  const mock = createFigmaMock();
  loadPlugin(mock);
  mock.figma.variables.createVariableCollection = () => { throw new Error("コレクションを作れません"); };
  const result = await importSpec(mock, clone(SAMPLE));
  assert.equal(result, null);
  const error = lastMessage(mock, "error");
  assert.match(error.message, /生成中にエラーが発生しました/);
  assert.match(error.message, /コレクションを作れません/);
});

test("cancel で closePlugin が呼ばれる", async () => {
  const mock = createFigmaMock();
  loadPlugin(mock);
  await mock.figma.ui.onmessage({ type: "cancel" });
  assert.equal(mock.state.closed, true);
});

test("進捗メッセージが順に飛ぶ", async () => {
  const mock = createFigmaMock();
  loadPlugin(mock);
  await importSpec(mock, clone(SAMPLE));
  const progress = mock.state.messages.filter((m) => m.type === "progress").map((m) => m.text);
  assert.ok(progress.some((t) => t.includes("ページを準備中")));
  assert.ok(progress.some((t) => t.includes("フォントを読み込み中")));
  assert.ok(progress.some((t) => t.startsWith("Variables:")));
  assert.ok(progress.some((t) => t.startsWith("Paint Styles:")));
  assert.ok(progress.some((t) => t.startsWith("Text Styles:")));
  assert.ok(progress.some((t) => t.startsWith("フレーム:")));
  assert.ok(progress.some((t) => t.startsWith("コンポーネント:")));
  assert.equal(mock.state.messages[mock.state.messages.length - 1].type, "done");
  assert.ok(Array.isArray(mock.state.zoomed) && mock.state.zoomed.length === 6);
});
