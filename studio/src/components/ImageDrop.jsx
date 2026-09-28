/** ドラッグ&ドロップ + ファイル選択 + クリップボード貼り付けの投入口。 */
import { useEffect, useId, useRef, useState } from "react";

const ACCEPT = "image/jpeg,image/png,image/webp";

export default function ImageDrop({ onFiles, accept = ACCEPT, busy = false, note = "" }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const id = useId();

  const take = (fileList) => {
    const files = [...(fileList || [])].filter((f) => f && f.type && f.type.startsWith("image/"));
    if (files.length) onFiles?.(files);
  };

  useEffect(() => {
    const onPaste = (e) => {
      const items = [...(e.clipboardData?.items || [])];
      const files = items.filter((i) => i.kind === "file" && i.type.startsWith("image/")).map((i) => i.getAsFile());
      if (files.length) {
        e.preventDefault();
        take(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  return (
    <div
      className={`dropzone${over ? " over" : ""}${busy ? " busy" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer?.files); }}
    >
      <label className="label" htmlFor={id} style={{ justifyContent: "center" }}>画像を投入する</label>
      <p className="small muted">
        ここにドラッグ＆ドロップ、または <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()}>ファイルを選ぶ</button>
        <br />画面上で <span className="kbd">Ctrl/⌘ + V</span> でも貼り付けられます。
      </p>
      <p className="small muted">JPEG / PNG / WebP。<strong>HEIC は不可</strong>（書き出してから投入してください）。長辺 1600px に縮小して端末内（IndexedDB）に保存します。</p>
      {note ? <p className="small muted">{note}</p> : null}
      {busy && <div className="row" style={{ justifyContent: "center" }}><span className="spinner" /><span className="small muted">取り込み中…</span></div>}
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        style={{ display: "none" }}
        onChange={(e) => { take(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}
