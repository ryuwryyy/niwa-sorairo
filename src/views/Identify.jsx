import { useState, useRef } from "react";
import { fileToBase64Jpeg } from "../lib/image";
import { identifyPlant } from "../lib/api";
import { C, font } from "../theme";
import { Section, Tag } from "../components/Bits";

export default function Identify() {
  const [preview, setPreview] = useState(null);
  const [base64, setBase64] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const camRef = useRef(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じ写真の選び直しを可能にする
    if (!file) return;
    setResult(null); setError(null);
    try {
      const { dataUrl, base64: b64 } = await fileToBase64Jpeg(file);
      setPreview(dataUrl);
      setBase64(b64);
    } catch {
      setError(`読み込めませんでした(形式: ${file.type || "不明"})。「カメラで直接撮る」なら確実に通ります。`);
    }
  };

  const run = async () => {
    if (!base64) return;
    setBusy(true); setError(null);
    try {
      setResult(await identifyPlant(base64));
    } catch {
      setError("判定できませんでした。API接続を確認してください(公開サイトでは中継サーバーが必要です)。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p style={{ fontFamily: font.goth, fontSize: 13, lineHeight: 1.9, margin: "0 0 16px", color: C.inkSoft }}>
        葉・花・幹が写った写真から名前を判定し、剪定と手入れの方法まで一度に引きます。
      </p>

      {/* accept に .heic を含めないこと。iOSが自動でJPEGに変換してくれる */}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
        onChange={onFile} style={{ display: "none" }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment"
        onChange={onFile} style={{ display: "none" }} />

      <div onClick={() => fileRef.current?.click()} style={{
        border: `1px dashed ${C.moss}`, background: preview ? "transparent" : `${C.mossPale}55`,
        borderRadius: 4, padding: preview ? 0 : "44px 16px", textAlign: "center",
        cursor: "pointer", overflow: "hidden",
      }}>
        {preview
          ? <img src={preview} alt="対象の植物" style={{ width: "100%", display: "block", maxHeight: 320, objectFit: "cover" }} />
          : <span style={{ fontFamily: font.min, fontSize: 15, color: C.moss }}>写真を選ぶ</span>}
      </div>

      {!preview && (
        <button onClick={() => camRef.current?.click()} style={{
          fontFamily: font.goth, fontSize: 12, color: C.ai, background: "transparent",
          border: `1px solid ${C.ai}`, borderRadius: 3, padding: "9px 0",
          marginTop: 10, cursor: "pointer", width: "100%",
        }}>カメラで直接撮る(いちばん確実)</button>
      )}

      {preview && (
        <button onClick={run} disabled={busy} style={{
          fontFamily: font.min, fontSize: 15, width: "100%", marginTop: 14, padding: "14px 0",
          background: busy ? C.inkSoft : C.ai, color: C.washi, border: "none", borderRadius: 3,
          cursor: busy ? "wait" : "pointer", letterSpacing: "0.15em",
        }}>{busy ? "葉と幹を読んでいます…" : "名前を判定する"}</button>
      )}

      {error && (
        <p style={{ fontFamily: font.goth, fontSize: 13, lineHeight: 1.8, marginTop: 12, color: C.oki }}>{error}</p>
      )}

      {result && (
        <div style={{ marginTop: 20, borderTop: `2px solid ${C.ai}`, paddingTop: 16 }}>
          {result.candidates.map((c, i) => (
            <div key={i} style={{ marginBottom: i === 0 ? 14 : 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{
                  fontFamily: font.min, margin: 0, fontWeight: 600,
                  fontSize: i === 0 ? 26 : 15, color: i === 0 ? C.ai : C.inkSoft,
                }}>{c.name}</h2>
                <span style={{ fontFamily: font.goth, fontSize: 11, color: C.inkSoft }}>{c.kana}</span>
                <span style={{ fontFamily: font.goth, fontSize: 11, fontStyle: "italic", color: C.inkSoft }}>{c.sci}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <div style={{ flex: 1, height: 3, maxWidth: 160, borderRadius: 2, background: C.line }}>
                  <div style={{ width: `${c.confidence}%`, height: "100%", borderRadius: 2, background: i === 0 ? C.moss : C.line }} />
                </div>
                <span style={{ fontFamily: font.goth, fontSize: 11, color: C.inkSoft }}>{c.confidence}%</span>
              </div>
              {i === 0 && c.reason && (
                <p style={{ fontFamily: font.goth, fontSize: 12, margin: "6px 0 0", color: C.inkSoft }}>
                  決め手: {c.reason}
                </p>
              )}
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <Tag>{result.family}</Tag><Tag>{result.type}</Tag>
          </div>

          <Section label="いま" accent>{result.nowTask}</Section>
          <Section label="剪定">{`適期 — ${result.pruneSeason}。${result.pruneHow}`}</Section>
          <Section label="手入れ">{result.care}</Section>
          <Section label="病害虫">{result.pest}</Section>

          {result.features && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ fontFamily: font.min, fontSize: 13, color: C.moss, cursor: "pointer" }}>
                観察所見(AIの判定根拠)
              </summary>
              <p style={{
                fontFamily: font.goth, fontSize: 12, lineHeight: 1.9, color: C.inkSoft,
                whiteSpace: "pre-wrap", marginTop: 8, padding: 12, background: C.washi2, borderRadius: 3,
              }}>{result.features}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
