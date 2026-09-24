/**
 * 参照ソースの正規化。
 *
 * - 検索結果（正規化済み ReferenceItem）→ store の newRef()
 * - ref → モデルに渡す base64 ペイロード（blob は IndexedDB、外部画像はプロキシ経由）
 *
 * 権利の扱い（docs/studio/research-reference-sources.md §F-1）:
 *   user-owned(自前)        → 画像を渡してよい
 *   adobe-stock-preview     → 表示のみ。AI 利用不可（passPixels を立てさせない）
 *   pinterest-tos / unknown → 既定 OFF（ユーザーが責任の上で ON にできる）
 */
import { newRef } from "../store";
import guide from "../data/promptGuide.json" with { type: "json" };
import { api } from "./api";
import { getBlob, blobToBase64, resizeImage } from "./idb";

/** direction.model（空ならサーバ既定）→ promptGuide のモデル定義 */
export function modelSpec(direction = {}) {
  const models = guide.models || [];
  return models.find((m) => m.id === direction.model) || models.find((m) => m.default) || models[0] || { maxRefImages: 3 };
}

/** そのモデルに渡せる参照画像の上限 */
export function maxRefImages(direction = {}) {
  return modelSpec(direction).maxRefImages || 3;
}

/** AI に画像そのものを渡してよいソースか（Adobe は規約により恒久的に不可） */
export function canPassPixels(source, license) {
  if (source === "adobe" || license === "adobe-stock-preview") return false;
  return true;
}

/** 既定の passPixels（自前画像だけ ON） */
export function defaultPassPixels(source) {
  return source === "upload";
}

export const LICENSE_JA = {
  "user-owned": "自分の画像",
  "adobe-stock-preview": "Adobe Stock プレビュー（表示のみ・AI 利用不可）",
  "pinterest-tos": "Pinterest（出典リンク必須・AI 学習不可）",
  unknown: "権利者不明（表示のみ）",
};

/** 参照カードに出す帰属表記 */
export function attribution(ref) {
  if (!ref) return "";
  if (ref.source === "adobe") return `${ref.author || "作者不明"} / Adobe Stock`;
  if (ref.author) return ref.author;
  return "";
}

/**
 * 検索結果 1 件 → 新しい ref。
 * @param {object} item 正規化された ReferenceItem
 * @param {object} extra role など上書きしたい項目
 */
export function itemToRef(item = {}, extra = {}) {
  const source = item.source || "cse";
  const pass = canPassPixels(source, item.license) ? defaultPassPixels(source) : false;
  return newRef({
    source,
    title: item.title || "",
    thumbUrl: item.thumbUrl || item.imageUrl || "",
    imageUrl: item.imageUrl || item.thumbUrl || "",
    pageUrl: item.pageUrl || "",
    width: item.width || 0,
    height: item.height || 0,
    author: item.author || "",
    license: item.license || "unknown",
    passPixels: pass,
    externalId: item.id || "",
    ...extra,
    // extra で passPixels を渡されても Adobe は必ず false
    ...(canPassPixels(source, item.license) ? {} : { passPixels: false }),
  });
}

/** 検索結果の重複判定キー（追加済みバッジ用） */
export function itemKey(item = {}) {
  return String(item.id || item.pageUrl || item.imageUrl || item.thumbUrl || "");
}

export function refKey(ref = {}) {
  return String(ref.externalId || ref.pageUrl || ref.imageUrl || ref.thumbUrl || "");
}

/** 表示用サムネイル URL。外部画像は必ずプロキシ経由（CORS / ホットリンク対策）。 */
export function thumbSrc(ref, blobUrl) {
  if (blobUrl) return blobUrl;
  const u = ref?.thumbUrl || ref?.imageUrl;
  if (!u) return "";
  if (ref.source === "upload") return u;
  return api.proxied(u);
}

/** 外部画像をプロキシ経由で Blob として取り込む */
export async function fetchExternalBlob(url) {
  if (!url) throw new Error("画像 URL がありません");
  const res = await fetch(api.proxied(url));
  if (!res.ok) throw new Error(`画像を取得できませんでした（${res.status}）`);
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) throw new Error("画像ではありません");
  return blob;
}

/** ref から元 Blob を得る（IndexedDB → 外部プロキシの順） */
export async function refBlob(ref) {
  if (ref?.blobKey) {
    const b = await getBlob(ref.blobKey);
    if (b) return b;
  }
  const url = ref?.imageUrl || ref?.thumbUrl;
  if (!url) return null;
  return fetchExternalBlob(url);
}

/**
 * ref → モデルに渡す { base64, mime, role }。渡せない参照は null を返す。
 * @param {object} ref
 * @param {object} opts { maxPx }
 */
export async function refToPayload(ref, { maxPx = 1024 } = {}) {
  if (!canPassPixels(ref?.source, ref?.license)) return null;
  const blob = await refBlob(ref);
  if (!blob) return null;
  const { blob: small } = await resizeImage(blob, { maxPx });
  const { base64, mime } = await blobToBase64(small || blob);
  return { base64, mime, role: ref.role || "mood" };
}

/** 生成画像の Blob → 編集生成用のペイロード */
export async function blobToPayload(blob, { maxPx = 1024, role = "subject" } = {}) {
  if (!blob) return null;
  const { blob: small } = await resizeImage(blob, { maxPx });
  const { base64, mime } = await blobToBase64(small || blob);
  return { base64, mime, role };
}
