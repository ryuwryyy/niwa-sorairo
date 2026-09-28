/** 生成 1 枚の詳細：批評・修正指示・編集生成・書き出し。 */
import { useState } from "react";
import { useStudio, activePrompt } from "../store";
import { useBlobUrl, getBlob, delBlob, resizeImage, blobToBase64 } from "../lib/idb";
import { api, ApiError } from "../lib/api";
import ScoreBars from "./ScoreBars";
import ConfirmButton from "./ConfirmButton";
import { useToast } from "./Toast";

export default function GenDetail({ gen, onEdit, onClose }) {
  const { project, dispatch, patch, setStage, settings } = useStudio();
  const toast = useToast();
  const url = useBlobUrl(gen.blobKey);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [instruction, setInstruction] = useState("");
  const hasClaude = !!settings.apiStatus?.claude;
  const version = project.prompt.versions.find((v) => v.id === gen.promptVersionId) || activePrompt(project);

  const critique = async () => {
    setErr(""); setBusy("critique");
    try {
      const blob = await getBlob(gen.blobKey);
      if (!blob) throw new Error("画像が見つかりません");
      const { blob: small } = await resizeImage(blob, { maxPx: 1024 });
      const { base64, mime } = await blobToBase64(small || blob);
      const r = await api.ai("critique", {
        image: { base64, mime },
        brief: project.consult.brief,
        prompt: version?.en || "",
        direction: project.direction,
      });
      dispatch({ type: "gens/update", id: gen.id, patch: { critique: r } });
      toast(`批評しました（${r.total ?? "—"}/30）`, "ok");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : e.message || "批評できませんでした");
    } finally {
      setBusy("");
    }
  };

  const download = async () => {
    const blob = await getBlob(gen.blobKey);
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name || "kv"}-${gen.id}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const toPrompt = (rev) => {
    const base = version?.en || "";
    dispatch({
      type: "prompt/addVersion",
      version: {
        source: "manual",
        en: `${base}\n\n${rev.promptPatch || rev.editInstruction || ""}`.trim(),
        ja: version?.ja || "",
        blocks: version?.blocks || [],
        refIds: version?.refIds || [],
        note: rev.title || "批評からの修正",
      },
    });
    toast("プロンプトに反映しました（新しい版）", "ok");
    setStage("prompt");
  };

  const remove = async () => {
    if (gen.blobKey) await delBlob(gen.blobKey).catch(() => {});
    dispatch({ type: "gens/remove", id: gen.id });
    onClose?.();
    toast("生成を削除しました", "warn");
  };

  const c = gen.critique;

  return (
    <div className="card">
      <div className="card-head">
        <h2>生成 {new Date(gen.at).toLocaleString("ja-JP")}</h2>
        <div className="row">
          <button className="btn btn-sm" onClick={() => dispatch({ type: "gens/update", id: gen.id, patch: { starred: !gen.starred } })}>
            {gen.starred ? "★ 星を外す" : "☆ 星を付ける"}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="閉じる">×</button>
        </div>
      </div>

      <div className="gen-detail">
        <div className="gen-big" style={{ aspectRatio: aspectCss(gen.aspect) }}>
          {url ? <img src={url} alt="生成画像" /> : <div className="small muted">読み込み中…</div>}
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <div className="small muted">
            モデル {gen.model || "既定"} · 比率 {gen.aspect} · {gen.width || "?"}×{gen.height || "?"}
            {gen.parentId && <> · 親から編集生成</>}
          </div>
          {gen.editInstruction && <p className="small mono">{gen.editInstruction}</p>}
          <div className="row">
            <button className="btn btn-sm btn-primary" onClick={critique} disabled={!hasClaude || !!busy}>
              {busy === "critique" ? <><span className="spinner" /> 批評中…</> : "批評 (AI)"}
            </button>
            <button className="btn btn-sm" onClick={download}>PNG をダウンロード</button>
            <button className="btn btn-sm" onClick={() => { patch("handoff.selectedGenId", gen.id); setStage("handoff"); }}>Figma へ渡す</button>
            <ConfirmButton onConfirm={remove} confirmLabel="削除する？">削除</ConfirmButton>
          </div>
          {!hasClaude && <p className="small muted"><code>ANTHROPIC_API_KEY</code> を設定すると 6 基準の批評が使えます。</p>}
          {err && <div className="alert danger small">{err}</div>}
        </div>
      </div>

      {c && (
        <div className="stack" style={{ marginTop: 14, gap: 12 }}>
          <ScoreBars scores={c.scores || {}} total={c.total} />
          {!!(c.notes || []).length && (
            <ul className="small stack" style={{ gap: 4, paddingLeft: 18 }}>
              {c.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
          {!!(c.revisions || []).length && (
            <div className="stack" style={{ gap: 8 }}>
              <h3 className="small muted">修正案</h3>
              {c.revisions.map((r, i) => (
                <div className="minicard" key={i}>
                  <strong className="small">{r.title}</strong>
                  {r.editInstruction && <p className="small mono" style={{ whiteSpace: "pre-wrap" }}>{r.editInstruction}</p>}
                  {r.promptPatch && <p className="small muted" style={{ whiteSpace: "pre-wrap" }}>プロンプト追記: {r.promptPatch}</p>}
                  <div className="row">
                    <button className="btn btn-sm" onClick={() => onEdit?.(gen, r.editInstruction || r.promptPatch)} disabled={!r.editInstruction && !r.promptPatch}>この指示で編集生成</button>
                    <button className="btn btn-sm" onClick={() => toPrompt(r)}>プロンプトに反映</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <span className="label">編集指示 <span className="hint">この画像を参照にして 1 枚だけ作り直します</span></span>
        <textarea
          className="textarea mono"
          style={{ minHeight: 72 }}
          value={instruction}
          placeholder="Using the provided image, … （1 回に 1 箇所だけ直すのがコツ）"
          onChange={(e) => setInstruction(e.target.value)}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn btn-primary" onClick={() => { onEdit?.(gen, instruction); setInstruction(""); }} disabled={!instruction.trim()}>この指示で編集生成</button>
        </div>
      </div>
    </div>
  );
}

function aspectCss(aspect) {
  const [w, h] = String(aspect || "16:9").split(":").map(Number);
  return w && h ? `${w} / ${h}` : "16 / 9";
}
