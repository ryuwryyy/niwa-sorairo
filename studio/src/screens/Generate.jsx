import { useMemo, useState } from "react";
import { useStudio, activePrompt, uid } from "../store";
import { compilePrompt } from "../lib/prompt";
import { api, ApiError } from "../lib/api";
import { putBlob, getBlob, base64ToBlob, useBlobUrl } from "../lib/idb";
import { refToPayload, blobToPayload, maxRefImages, modelSpec, thumbSrc } from "../lib/refsources";
import GenDetail from "../components/GenDetail";
import { useToast } from "../components/Toast";

export default function Generate() {
  const { project, dispatch, patch, setStage, settings } = useStudio();
  const toast = useToast();
  const d = project.direction;
  const active = activePrompt(project);
  const hasGemini = !!settings.apiStatus?.gemini;

  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });
  const [err, setErr] = useState(null);         // { message, status, canShrink }
  const [blocked, setBlocked] = useState(null); // { reason }
  const [selectedId, setSelectedId] = useState(null);

  const compiled = useMemo(() => compilePrompt(project, { maxRefImages: maxRefImages(d) }), [project, d]);
  const sendRefs = compiled.refIds.map((id) => project.refs.board.find((r) => r.id === id)).filter(Boolean);
  const model = modelSpec(d);
  const gens = [...project.gens].reverse();
  const selected = project.gens.find((g) => g.id === selectedId) || null;

  const storeImages = async (images, meta) => {
    const ids = [];
    for (const img of images) {
      const blob = base64ToBlob(img.base64, img.mime || "image/png");
      const blobKey = `gen-${uid()}`;
      await putBlob(blobKey, blob);
      const id = uid();
      ids.push(id);
      dispatch({ type: "gens/add", gen: { id, blobKey, width: img.width || 0, height: img.height || 0, ...meta } });
    }
    return ids;
  };

  const run = async () => {
    if (!active?.en) { setErr({ message: "先にプロンプト版を作ってください" }); return; }
    setBusy(true); setErr(null); setBlocked(null);
    const n = Math.max(1, Math.min(4, d.variants || 1));
    setProgress({ done: 0, total: n, label: "参照画像を準備しています…" });
    try {
      const refs = [];
      for (const r of sendRefs) {
        const p = await refToPayload(r, { maxPx: 1024 });
        if (p) refs.push(p);
      }
      setProgress({ done: 0, total: n, label: `生成しています（0 / ${n}）` });
      const res = await api.generate({
        prompt: active.en,
        refs,
        aspect: d.aspect,
        model: d.model || undefined,
        n,
        size: model.supportsImageSize ? d.size : undefined,
      });
      if (res.blocked) {
        setBlocked({ reason: res.reason || "安全フィルタにより生成されませんでした" });
        return;
      }
      const images = res.images || [];
      if (!images.length) throw new Error("画像が返りませんでした");
      setProgress({ done: images.length, total: n, label: "保存しています…" });
      const ids = await storeImages(images, {
        promptVersionId: active.id,
        model: res.model || d.model || "",
        aspect: d.aspect,
      });
      setSelectedId(ids.at(-1) || null);
      toast(`${images.length} 枚を生成しました`, "ok");
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      const msg = e?.message || "生成に失敗しました";
      setErr({ message: msg, status, canShrink: status === 413 || /size|サイズ|too large|大き/i.test(msg) });
    } finally {
      setBusy(false);
      setProgress({ done: 0, total: 0, label: "" });
    }
  };

  const editGenerate = async (gen, instruction) => {
    if (!instruction?.trim()) return;
    setBusy(true); setErr(null); setBlocked(null);
    setProgress({ done: 0, total: 1, label: "元画像を読み込んでいます…" });
    try {
      const blob = await getBlob(gen.blobKey);
      if (!blob) throw new Error("元画像が見つかりません");
      const payload = await blobToPayload(blob, { maxPx: 1024, role: "subject" });
      setProgress({ done: 0, total: 1, label: "編集生成しています（0 / 1）" });
      const res = await api.generate({
        prompt: instruction,
        refs: [payload],
        aspect: gen.aspect || d.aspect,
        model: d.model || undefined,
        n: 1,
        size: model.supportsImageSize ? d.size : undefined,
      });
      if (res.blocked) { setBlocked({ reason: res.reason || "安全フィルタにより生成されませんでした" }); return; }
      const images = res.images || [];
      if (!images.length) throw new Error("画像が返りませんでした");
      const ids = await storeImages(images, {
        promptVersionId: gen.promptVersionId,
        model: res.model || d.model || "",
        aspect: gen.aspect || d.aspect,
        parentId: gen.id,
        editInstruction: instruction,
      });
      setSelectedId(ids[0] || null);
      toast("編集生成しました", "ok");
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setErr({ message: e?.message || "編集生成に失敗しました", status, canShrink: status === 413 });
    } finally {
      setBusy(false);
      setProgress({ done: 0, total: 0, label: "" });
    }
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      {!hasGemini && (
        <div className="alert info">
          <strong>画像生成は未接続です。</strong> サーバに <code>GEMINI_API_KEY</code> を設定すると生成できます。
          プロンプトの準備・参照の整理・Figma spec の作成はキー無しで進められます。
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>これで生成します</h2>
          <button className="btn btn-sm" onClick={() => setStage("direction")}>方向で変更</button>
        </div>

        {active ? (
          <div className="stack" style={{ gap: 8 }}>
            <p className="mono small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {expanded ? active.en : `${active.en.slice(0, 300)}${active.en.length > 300 ? "…" : ""}`}
            </p>
            {active.en.length > 300 && (
              <div><button className="btn btn-sm btn-ghost" onClick={() => setExpanded((v) => !v)}>{expanded ? "たたむ" : "全文を見る"}</button></div>
            )}
          </div>
        ) : (
          <div className="empty small">プロンプト版がありません。<button className="btn btn-sm" onClick={() => setStage("prompt")}>プロンプト画面へ</button></div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <span className="badge">{model.label || "既定モデル"}</span>
          <span className="badge">{d.aspect}</span>
          <span className="badge">{d.variants} 案</span>
          {model.supportsImageSize && <span className="badge">{d.size}</span>}
          <span className="badge">参照画像 {sendRefs.length} / {maxRefImages(d)}</span>
        </div>

        {!!sendRefs.length && (
          <div className="stack" style={{ marginTop: 10, gap: 6 }}>
            <span className="label">送る参照（重み順）</span>
            <div className="grid grid-thumbs">
              {sendRefs.map((r, i) => <SendRefThumb key={r.id} item={r} n={i + 1} />)}
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={run} disabled={!hasGemini || busy || !active?.en}>
            {busy ? <><span className="spinner" /> 生成中…</> : "生成する"}
          </button>
          {busy && progress.total > 0 && <span className="small muted">{progress.label}</span>}
        </div>

        {blocked && (
          <div className="alert warn" style={{ marginTop: 10 }}>
            <strong>生成がブロックされました。</strong> {blocked.reason}
            <br /><span className="small">人物・暴力・商標に触れる語を外すか、主題をより具体的な物に置き換えると通ることがあります。</span>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => setStage("prompt")}>プロンプトを直す</button>
            </div>
          </div>
        )}

        {err && (
          <div className="alert danger" style={{ marginTop: 10 }}>
            {err.message}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn btn-sm" onClick={run} disabled={busy}>やり直す</button>
              {err.canShrink && d.size !== "1K" && (
                <button className="btn btn-sm" onClick={() => { patch("direction.size", "1K"); toast("サイズを 1K にしました", "ok"); }}>size を 1K にする</button>
              )}
            </div>
          </div>
        )}
      </div>

      {selected && <GenDetail gen={selected} onEdit={editGenerate} onClose={() => setSelectedId(null)} />}

      <div className="card">
        <div className="card-head">
          <h2>ギャラリー</h2>
          <span className="small muted">{gens.length} 枚 · 新しい順</span>
        </div>
        {gens.length ? (
          <div className="grid grid-3 gen-grid">
            {gens.map((g) => (
              <GenTile
                key={g.id}
                gen={g}
                selected={g.id === selectedId}
                onSelect={() => setSelectedId(g.id === selectedId ? null : g.id)}
                onStar={() => dispatch({ type: "gens/update", id: g.id, patch: { starred: !g.starred } })}
              />
            ))}
          </div>
        ) : (
          <div className="empty">まだ生成がありません。</div>
        )}
      </div>
    </div>
  );
}

function SendRefThumb({ item, n }) {
  const blobUrl = useBlobUrl(item.blobKey);
  const src = thumbSrc(item, blobUrl);
  return (
    <div className="thumb" title={item.title}>
      {src ? <img src={src} alt={item.title || ""} loading="lazy" /> : null}
      <span className="ov">#{n} · {item.role} · 重み {item.weight}</span>
    </div>
  );
}

function GenTile({ gen, selected, onSelect, onStar }) {
  const url = useBlobUrl(gen.blobKey);
  return (
    <div className={`thumb gen-tile${selected ? " selected" : ""}`}>
      <button className="gen-tile-btn" onClick={onSelect} aria-label="この生成を選ぶ">
        {url ? <img src={url} alt="生成画像" loading="lazy" /> : <span className="small muted">…</span>}
      </button>
      <button className={`star${gen.starred ? " on" : ""}`} onClick={onStar} aria-label={gen.starred ? "星を外す" : "星を付ける"}>
        {gen.starred ? "★" : "☆"}
      </button>
      <span className="ov">
        {new Date(gen.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        {gen.critique ? ` · ${gen.critique.total}/30` : ""}
        {gen.parentId ? " · 編集" : ""}
      </span>
    </div>
  );
}
