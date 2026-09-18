/**
 * 画像 Blob の保存（IndexedDB）。localStorage に base64 を入れない。
 * indexedDB が使えない環境ではメモリ Map にフォールバック（リロードで消える）。
 */
import { useEffect, useState } from "react";

const DB_NAME = "sorairo-studio";
const STORE = "blobs";
const mem = new Map();
let dbPromise = null;

function open() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function putBlob(key, blob) {
  const db = await open();
  if (!db) { mem.set(key, blob); return key; }
  await tx(db, "readwrite", (s) => s.put(blob, key));
  return key;
}

export async function getBlob(key) {
  if (!key) return null;
  const db = await open();
  if (!db) return mem.get(key) || null;
  return (await tx(db, "readonly", (s) => s.get(key))) || null;
}

export async function delBlob(key) {
  const db = await open();
  if (!db) { mem.delete(key); return; }
  await tx(db, "readwrite", (s) => s.delete(key));
}

export async function listKeys() {
  const db = await open();
  if (!db) return [...mem.keys()];
  return (await tx(db, "readonly", (s) => s.getAllKeys())) || [];
}

/** blob → objectURL を返す hook。key が変わると前の URL を revoke する */
export function useBlobUrl(key) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    let u = null;
    if (!key) { setUrl(null); return undefined; }
    getBlob(key).then((b) => {
      if (!alive || !b) { if (alive) setUrl(null); return; }
      u = URL.createObjectURL(b);
      setUrl(u);
    });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [key]);
  return url;
}

/* ---------- 変換ユーティリティ ---------- */

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** → { base64, mime } */
export async function blobToBase64(blob) {
  const dataUrl = await blobToDataUrl(blob);
  const i = dataUrl.indexOf(",");
  const mime = /^data:([^;]+)/.exec(dataUrl)?.[1] || blob.type || "image/png";
  return { base64: dataUrl.slice(i + 1), mime };
}

export function dataUrlToBlob(dataUrl) {
  const [head, data] = dataUrl.split(",");
  const mime = /^data:([^;]+)/.exec(head)?.[1] || "image/png";
  const bin = atob(data);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

export function base64ToBlob(base64, mime = "image/png") {
  return dataUrlToBlob(`data:${mime};base64,${base64}`);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像を読み込めませんでした"));
    img.src = src;
  });
}

/**
 * 画像を最大 maxPx（長辺）に縮小して JPEG/PNG Blob にする。
 * モデルへ渡す参照画像・サムネイル生成に使う。
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
export async function resizeImage(source, { maxPx = 1024, type = "image/jpeg", quality = 0.9 } = {}) {
  const url = source instanceof Blob ? URL.createObjectURL(source) : source;
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (type === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, type, quality));
    return { blob, width: w, height: h };
  } finally {
    if (source instanceof Blob) URL.revokeObjectURL(url);
  }
}
