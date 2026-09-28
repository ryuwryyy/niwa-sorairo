/** 参照タブ「自前画像」。長辺 1600px に縮小して IndexedDB に入れる。base64 は state に入れない。 */
import { useState } from "react";
import { useStudio, newRef, uid } from "../store";
import { putBlob, resizeImage } from "../lib/idb";
import ImageDrop from "./ImageDrop";
import { useToast } from "./Toast";

export default function RefsUpload() {
  const { dispatch } = useStudio();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const take = async (files) => {
    setBusy(true); setErr("");
    const added = [];
    for (const file of files) {
      try {
        if (/\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type)) {
          throw new Error(`${file.name}: HEIC/HEIF はブラウザで開けません。JPEG か PNG に書き出してください。`);
        }
        const { blob, width, height } = await resizeImage(file, { maxPx: 1600, type: "image/jpeg", quality: 0.86 });
        if (!blob) throw new Error(`${file.name}: 画像を読み込めませんでした`);
        const blobKey = `ref-${uid()}`;
        await putBlob(blobKey, blob);
        added.push(newRef({
          source: "upload",
          blobKey,
          width,
          height,
          title: file.name.replace(/\.[^.]+$/, ""),
          passPixels: true,
          license: "user-owned",
          role: "mood",
        }));
      } catch (e) {
        setErr(e.message || "取り込めませんでした");
      }
    }
    if (added.length) {
      dispatch({ type: "refs/add", items: added });
      toast(`${added.length} 枚をボードへ追加しました`, "ok");
    }
    setBusy(false);
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="alert info small">
        自前の画像だけが、既定で<strong>画像そのものをモデルに渡せる</strong>参照です。撮影物・自社素材・ライセンス済み素材をここへ。
      </div>
      <ImageDrop onFiles={take} busy={busy} />
      {err && <div className="alert danger small">{err}</div>}
    </div>
  );
}
