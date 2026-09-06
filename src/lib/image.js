/**
 * 写真を JPEG(長辺1100px)の dataURL に正規化する。
 *
 * iPhoneのHEIC対策の要点:
 *   input の accept に .heic を書かないこと。
 *   「HEICは受け取れない」と伝えると、iOSが自動でJPEGに変換して渡してくれる。
 *   accept に .heic を含めると生のHEICが来てデコードできず失敗する。
 */

// 本番の Serverless ペイロード・応答時間を抑えるため長辺と品質を抑える
const MAX_EDGE = 900;
const QUALITY = 0.72;

function drawToJpeg(source, w, h) {
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", QUALITY);
}

/** 経路1: createImageBitmap(最も広く動く) */
async function viaBitmap(file) {
  const bmp = await createImageBitmap(file);
  const out = drawToJpeg(bmp, bmp.width, bmp.height);
  bmp.close?.();
  return out;
}

/** 経路2: FileReader → Image(blob:URLが使えない環境向け) */
function viaFileReader(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => resolve(drawToJpeg(img, img.naturalWidth || img.width, img.naturalHeight || img.height));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** 写真ファイルを base64 JPEG(ヘッダなし)に変換 */
export async function fileToBase64Jpeg(file) {
  let dataUrl;
  try {
    dataUrl = await viaBitmap(file);
  } catch {
    dataUrl = await viaFileReader(file);
  }
  return { dataUrl, base64: dataUrl.split(",")[1] };
}
