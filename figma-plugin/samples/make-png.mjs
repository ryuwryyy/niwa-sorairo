/**
 * サンプル spec に埋め込む KV 画像（64 × 36 PNG）を作る。
 *
 *   node figma-plugin/samples/make-png.mjs              # kv.png を書き出して dataUrl を表示
 *   node figma-plugin/samples/make-png.mjs --patch-spec # 上に加えて sample-spec.json の dataUrl を差し替える
 *
 * 依存は Node 標準の zlib だけ。PNG を手で組み立てている（IHDR / IDAT / IEND + CRC32）ので、
 * プラグイン側の base64 デコーダ（figma-plugin/code.js の base64ToBytes）が
 * 本物の PNG バイト列を受け取れることをテストで確認できる。
 *
 * 絵柄は決定論的: 空色のグラデーション + 低い地平線 + にじんだ光。乱数は使わない。
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDTH = 64;
const HEIGHT = 36;

/* ---------- PNG エンコーダ ---------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** @param {(x:number,y:number)=>[number,number,number]} pixel */
function encodePng(width, height, pixel) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[p++] = clamp(r);
      raw[p++] = clamp(g);
      raw[p++] = clamp(b);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter: adaptive
  ihdr[12] = 0; // interlace: none
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const mix = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

/* ---------- 絵柄（空色の庭） ---------- */

const SKY_TOP = [70, 120, 163];
const SKY_LOW = [206, 224, 232];
const GROUND = [74, 92, 78];
const GROUND_FAR = [122, 137, 118];
const SUN = [247, 236, 214];
const HORIZON = Math.round(HEIGHT * 0.72);

function pixel(x, y) {
  if (y < HORIZON) {
    const t = y / HORIZON;
    const sky = [0, 1, 2].map((i) => mix(SKY_TOP[i], SKY_LOW[i], Math.pow(t, 0.75)));
    // にじんだ光（右上）
    const dx = (x - WIDTH * 0.74) / (WIDTH * 0.22);
    const dy = (y - HORIZON * 0.34) / (HEIGHT * 0.2);
    const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
    return [0, 1, 2].map((i) => mix(sky[i], SUN[i], glow * 0.85));
  }
  const t = (y - HORIZON) / Math.max(1, HEIGHT - HORIZON);
  // 地面: 奥ほど淡く、手前ほど濃い。横方向に緩い起伏を入れる
  const wave = Math.sin((x / WIDTH) * Math.PI * 2) * 0.06 + Math.sin((x / WIDTH) * Math.PI * 5) * 0.03;
  return [0, 1, 2].map((i) => mix(GROUND_FAR[i], GROUND[i], Math.min(1, Math.max(0, t + wave))));
}

/* ---------- JSON 整形（node 1 つが 1 行に収まるように） ---------- */

const INLINE_MAX = 200;

/** 中身がすべてプリミティブなら 1 行にまとめる */
function isSimple(value) {
  if (value === null || typeof value !== "object") return true;
  const values = Array.isArray(value) ? value : Object.values(value);
  return values.every((v) => v === null || typeof v !== "object");
}

function inlineOf(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((v) => JSON.stringify(v)).join(", ") + "]";
  return "{ " + Object.keys(value).map((k) => `${JSON.stringify(k)}: ${JSON.stringify(value[k])}`).join(", ") + " }";
}

function formatJson(value, depth = 0) {
  const pad = "  ".repeat(depth);
  const padIn = "  ".repeat(depth + 1);
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (isSimple(value)) {
    const inline = inlineOf(value);
    if (pad.length + inline.length <= INLINE_MAX) return inline;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return "[\n" + value.map((v) => padIn + formatJson(v, depth + 1)).join(",\n") + "\n" + pad + "]";
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return "{}";
  return "{\n" + keys.map((k) => `${padIn}${JSON.stringify(k)}: ${formatJson(value[k], depth + 1)}`).join(",\n") + "\n" + pad + "}";
}

/* ---------- 実行 ---------- */

const png = encodePng(WIDTH, HEIGHT, pixel);
const pngPath = join(HERE, "kv.png");
writeFileSync(pngPath, png);

const dataUrl = "data:image/png;base64," + png.toString("base64");

if (process.argv.includes("--patch-spec")) {
  const specPath = join(HERE, "sample-spec.json");
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const asset = (spec.assets || []).find((a) => a.id === "kv");
  if (!asset) throw new Error('sample-spec.json に assets の "kv" がありません。');
  asset.dataUrl = dataUrl;
  asset.width = WIDTH;
  asset.height = HEIGHT;
  writeFileSync(specPath, formatJson(spec) + "\n");
  console.log(`patched: ${specPath}`);
}

console.log(`${pngPath}  ${WIDTH}x${HEIGHT}  ${png.length} bytes`);
console.log(`dataUrl length: ${dataUrl.length}`);
if (process.argv.includes("--print")) console.log(dataUrl);
