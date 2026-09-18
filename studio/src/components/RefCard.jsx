/** ムードボードの 1 枚。役割・重み・画像を渡すか・原理テキストをここで編集する。 */
import { useState } from "react";
import vars from "../data/directionVars.json";
import { useStudio, uid } from "../store";
import { useBlobUrl, putBlob, delBlob, resizeImage, blobToBase64 } from "../lib/idb";
import { api, ApiError } from "../lib/api";
import { canPassPixels, attribution, LICENSE_JA, thumbSrc, refBlob, fetchExternalBlob } from "../lib/refsources";
import { useToast } from "./Toast";
import ConfirmButton from "./ConfirmButton";
import TagInput from "./TagInput";

const SOURCE_JA = {
  upload: "自前", cannes: "カンヌ", pinterest: "Pinterest", adobe: "Adobe Stock", cse: "Web 検索", url: "URL",
};

export default function RefCard({ item, index = 0, count = 1, onMove }) {
  const { dispatch, patch, project, settings } = useStudio();
  const toast = useToast();
  const blobUrl = useBlobUrl(item.blobKey);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const hasClaude = !!settings.apiStatus?.claude;
  const allowPixels = canPassPixels(item.source, item.license);
  const src = thumbSrc(item, blobUrl);

  const up = (p) => dispatch({ type: "refs/update", id: item.id, patch: p });

  const remove = async () => {
    if (item.blobKey) await delBlob(item.blobKey).catch(() => {});
    dispatch({ type: "refs/remove", id: item.id });
    toast("参照を外しました", "ok");
  };

  const importPixels = async () => {
    setErr(""); setBusy("import");
    try {
      const blob = await fetchExternalBlob(item.imageUrl || item.thumbUrl);
      const { blob: small, width, height } = await resizeImage(blob, { maxPx: 1600 });
      const key = `ref-${uid()}`;
      await putBlob(key, small || blob);
      up({ blobKey: key, width, height });
      toast("画像を端末に取り込みました", "ok");
    } catch (e) {
      setErr(e.message || "取り込みに失敗しました");
    } finally {
      setBusy("");
    }
  };

  const extract = async () => {
    setErr(""); setBusy("ai");
    try {
      const blob = await refBlob(item);
      if (!blob) throw new Error("画像を取得できませんでした（原理は手で書けます）");
      const { blob: small } = await resizeImage(blob, { maxPx: 1024 });
      const { base64, mime } = await blobToBase64(small || blob);
      const r = await api.ai("principles", { image: { base64, mime }, role: item.role, source: item.source });
      const p = {
        principles: Array.isArray(r.principles) && r.principles.length ? r.principles : item.principles,
        toneWords: Array.isArray(r.toneWords) ? r.toneWords : item.toneWords,
        palette: Array.isArray(r.palette) ? r.palette : item.palette,
      };
      if (!item.notes && r.summary) p.notes = r.summary;
      up(p);
      toast("原理を抽出しました", "ok");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : e.message || "抽出に失敗しました");
    } finally {
      setBusy("");
    }
  };

  const adoptPalette = () => {
    patch("direction.palette", (p) => ({ ...(p || {}), mode: "from_ref", colors: (item.palette || []).slice(0, 6) }));
    toast("この参照の配色を採用しました", "ok");
  };

  const passIndex = project.refs.board
    .filter((r) => r.passPixels && (r.blobKey || r.imageUrl))
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .findIndex((r) => r.id === item.id);

  return (
    <div className="refcard card">
      <div className="refcard-top">
        <div className="thumb">
          {src ? <img src={src} alt={item.title || "参照"} loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            : <div className="thumb-fallback small muted">{item.title || "画像なし"}</div>}
        </div>
        <div className="stack" style={{ gap: 6, minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="badge">{SOURCE_JA[item.source] || item.source}</span>
            {item.passPixels && <span className="badge sora">画像を渡す{passIndex >= 0 ? ` #${passIndex + 1}` : ""}</span>}
            {!item.passPixels && <span className="badge">原理のみ</span>}
            <span className="right small muted">{index + 1} / {count}</span>
          </div>
          <input
            className="input"
            value={item.title || ""}
            aria-label="参照のタイトル"
            placeholder="タイトル"
            onChange={(e) => up({ title: e.target.value })}
          />
          <div className="small muted">
            {attribution(item)}
            {item.license ? ` · ${LICENSE_JA[item.license] || item.license}` : ""}
            {item.pageUrl ? <> · <a href={item.pageUrl} target="_blank" rel="noreferrer noopener">出典</a></> : null}
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 10 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="label">役割</span>
          <select className="select" value={item.role} onChange={(e) => up({ role: e.target.value })}>
            {vars.roles.map((r) => <option key={r.id} value={r.id}>{r.ja}（{r.en}）</option>)}
          </select>
        </label>
        <div className="field" style={{ marginBottom: 0 }}>
          <span className="label">重み</span>
          <div className="segmented" role="group" aria-label="重み">
            {[1, 2, 3].map((w) => (
              <button key={w} type="button" className={`seg${item.weight === w ? " active" : ""}`} onClick={() => up({ weight: w })}>{w}</button>
            ))}
          </div>
        </div>
      </div>

      <label className="row" style={{ marginTop: 10, gap: 8 }}>
        <input
          type="checkbox"
          checked={!!item.passPixels}
          disabled={!allowPixels}
          onChange={(e) => up({ passPixels: e.target.checked })}
        />
        <span className="small">
          画像そのものをモデルに渡す
          {!allowPixels && <span className="muted"> — Adobe Stock 素材は規約により AI 利用不可</span>}
        </span>
      </label>

      {item.passPixels && item.source !== "upload" && (
        <div className="alert warn small" style={{ marginTop: 8 }}>
          自前でない画像をモデルに渡すと、権利・模倣のリスクがあります（DESIGN.md §6）。原理テキストだけ渡す方が安全です。
        </div>
      )}
      {item.passPixels && !item.blobKey && !item.imageUrl && (
        <div className="alert small" style={{ marginTop: 8 }}>画像データが無いため、この参照は生成時に送られません。</div>
      )}

      <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
        <span className="label">原理（EN の短文。プロンプトにそのまま入る）</span>
        <TagInput
          value={item.principles || []}
          onChange={(v) => up({ principles: v })}
          placeholder="例: generous negative space above the subject"
          label="原理"
        />
      </div>

      <label className="field" style={{ marginTop: 10, marginBottom: 0 }}>
        <span className="label">メモ</span>
        <textarea
          className="textarea"
          style={{ minHeight: 64 }}
          value={item.notes || ""}
          placeholder="なぜこれを選んだか"
          onChange={(e) => up({ notes: e.target.value })}
        />
      </label>

      {!!(item.palette || []).length && (
        <div className="row" style={{ marginTop: 10 }}>
          <div className="swatches">
            {item.palette.slice(0, 6).map((c, i) => <span key={`${c}-${i}`} className="swatch" style={{ background: c }} title={c} />)}
          </div>
          <button className="btn btn-sm" onClick={adoptPalette}>配色を採用</button>
        </div>
      )}
      {!!(item.toneWords || []).length && (
        <div className="chips small" style={{ marginTop: 8 }}>
          {item.toneWords.slice(0, 8).map((t) => <span key={t} className="badge">{t}</span>)}
        </div>
      )}

      {err && <div className="alert danger small" style={{ marginTop: 10 }}>{err}</div>}

      <div className="row" style={{ marginTop: 12 }}>
        {allowPixels && (
          <button className="btn btn-sm" onClick={extract} disabled={!hasClaude || !!busy}>
            {busy === "ai" ? <><span className="spinner" /> 抽出中…</> : "原理を抽出 (AI)"}
          </button>
        )}
        {!item.blobKey && (item.imageUrl || item.thumbUrl) && item.source !== "upload" && (
          <button className="btn btn-sm" onClick={importPixels} disabled={!!busy} title="プロキシ経由で取得し、端末内に保存します">
            {busy === "import" ? <><span className="spinner" /> 取り込み中…</> : "画像を取り込む"}
          </button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={() => onMove?.(index, -1)} disabled={index === 0} aria-label="上へ">↑</button>
        <button className="btn btn-sm btn-ghost" onClick={() => onMove?.(index, 1)} disabled={index === count - 1} aria-label="下へ">↓</button>
        <span className="right" />
        <ConfirmButton onConfirm={remove} confirmLabel="外す？">外す</ConfirmButton>
      </div>
      {allowPixels && !hasClaude && (
        <p className="small muted" style={{ marginTop: 6 }}>原理抽出には <code>ANTHROPIC_API_KEY</code> が要ります。手入力でも同じ効果です。</p>
      )}
    </div>
  );
}
