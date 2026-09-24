import { useEffect, useMemo, useState } from "react";
import { useStudio, now } from "../store";
import { getBlob, useBlobUrl, resizeImage, blobToDataUrl, blobToBase64 } from "../lib/idb";
import { extractPalette, assignRoles } from "../lib/palette";
import { buildTokens, buildSpec, validateSpec, toDtcg, frameSize, FONT_FAMILIES, TYPE_RATIOS, SPACE_PRESETS, RADIUS_PRESETS } from "../lib/figmaSpec";
import { api, ApiError } from "../lib/api";
import PaletteRoles from "../components/PaletteRoles";
import SpecPreview from "../components/SpecPreview";
import Collapsible from "../components/Collapsible";
import { useToast } from "../components/Toast";

const presetName = (arr, presets, fallback) => {
  const key = Object.keys(presets).find((k) => JSON.stringify(presets[k]) === JSON.stringify(arr));
  return key || fallback;
};

const download = (name, text, type = "application/json") => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

export default function Handoff() {
  const { project, patch, merge, settings } = useStudio();
  const toast = useToast();
  const h = project.handoff;
  const gens = [...project.gens].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || (b.at || "").localeCompare(a.at || ""));
  const selected = project.gens.find((g) => g.id === h.selectedGenId) || null;
  const hasClaude = !!settings.apiStatus?.claude;

  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [asset, setAsset] = useState(null);        // { dataUrl, width, height, bytes }
  const [aiWarn, setAiWarn] = useState("");
  const [shares, setShares] = useState([]);        // [{hex, share}] 面積比は表示用。保存は hex[] だけ（store の契約）

  const tokens = h.tokens;
  const colors = tokens?.color || null;
  const type = tokens?.type || {};
  const spacePreset = presetName(tokens?.space, SPACE_PRESETS, "normal");
  const radiusPreset = presetName(tokens?.radius, RADIUS_PRESETS, "soft");
  const frame = frameSize(project.direction.aspect);

  /* 選んだ画像を dataUrl（≤2048px）に */
  useEffect(() => {
    let alive = true;
    setAsset(null);
    if (!selected?.blobKey) return undefined;
    (async () => {
      const blob = await getBlob(selected.blobKey);
      if (!blob || !alive) return;
      const { blob: small, width, height } = await resizeImage(blob, { maxPx: 2048, type: "image/png", quality: 0.92 });
      const dataUrl = await blobToDataUrl(small || blob);
      if (alive) setAsset({ dataUrl, width, height, bytes: Math.round(dataUrl.length * 0.75) });
    })().catch(() => {});
    return () => { alive = false; };
  }, [selected?.blobKey]);

  const spec = useMemo(() => {
    if (!tokens) return null;
    return buildSpec(project, {
      tokens,
      imageDataUrl: asset?.dataUrl || "",
      imageWidth: asset?.width || 0,
      imageHeight: asset?.height || 0,
    });
  }, [project, tokens, asset]);

  // handoff.spec には画像を入れない（localStorage の上限を超えるため）。表示・書き出しの直前に付け直す。
  const aiSpec = h.spec && h.spec.$ai ? h.spec : null;
  const shownSpec = useMemo(() => {
    if (!aiSpec) return spec;
    return { ...aiSpec, assets: spec?.assets || [] };
  }, [aiSpec, spec]);

  /* ---------- 配色抽出 ---------- */
  const extract = async () => {
    if (!selected?.blobKey) return;
    setErr(""); setBusy("palette");
    try {
      const blob = await getBlob(selected.blobKey);
      if (!blob) throw new Error("画像が見つかりません");
      const pal = await extractPalette(blob, { k: 6 });
      setShares(pal);
      const next = buildTokens({
        colors: assignRoles(pal),
        body: type.family || "Noto Sans JP",
        display: type.displayFamily || "Shippori Mincho",
        base: type.baseSize || 16,
        ratio: type.ratio || 1.25,
        space: spacePreset,
        radius: radiusPreset,
      });
      patch("handoff.palette", pal.map((p) => p.hex));
      patch("handoff.tokens", next);
      toast("6 色を抽出して役割を割り当てました", "ok");
    } catch (e) {
      setErr(e.message || "色を抽出できませんでした");
    } finally {
      setBusy("");
    }
  };

  const setTypeOpt = (p) => {
    const next = buildTokens({
      colors: colors || assignRoles(h.palette || []),
      body: p.body ?? type.family ?? "Noto Sans JP",
      display: p.display ?? type.displayFamily ?? "Shippori Mincho",
      base: p.base ?? type.baseSize ?? 16,
      ratio: p.ratio ?? type.ratio ?? 1.25,
      space: p.space ?? spacePreset,
      radius: p.radius ?? radiusPreset,
    });
    patch("handoff.tokens", next);
  };

  /* ---------- AI 微調整 ---------- */
  const refine = async () => {
    if (!spec || !selected?.blobKey) return;
    setErr(""); setAiWarn(""); setBusy("ai");
    try {
      const blob = await getBlob(selected.blobKey);
      const { blob: small } = await resizeImage(blob, { maxPx: 1024 });
      const { base64, mime } = await blobToBase64(small || blob);
      const draft = { ...spec, assets: [] };   // 画像は送らない（重いので）
      const r = await api.ai("figmaSpec", {
        image: { base64, mime },
        palette: (h.palette || []).map((p) => p.hex || p),
        brief: project.consult.brief,
        deliverable: project.meta.deliverable,
        tokens,
        spec: draft,
      });
      const next = r.spec || r;
      const v = validateSpec({ ...next, assets: spec.assets });
      if (!v.ok) {
        setAiWarn(`AI の結果が契約を満たしませんでした（${v.errors.slice(0, 3).join(" / ")}）。決定論的な spec のまま進みます。`);
        return;
      }
      patch("handoff.spec", { ...next, assets: [], $ai: true });
      toast("AI が spec を微調整しました", "ok");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : e.message || "微調整できませんでした");
    } finally {
      setBusy("");
    }
  };

  /* ---------- 書き出し ---------- */
  const markExported = () => {
    patch("handoff.exportedAt", now());
    // 画像抜きの spec を残して「Figma 段階は済んだ」ことを記録する
    if (!aiSpec && shownSpec) patch("handoff.spec", { ...shownSpec, assets: [] });
  };

  const exportSpec = () => {
    if (!shownSpec) return;
    download(`${project.name || "sorairo"}.spec.json`, JSON.stringify(shownSpec, null, 2));
    markExported();
    toast("spec.json を書き出しました", "ok");
  };
  const exportTokens = () => {
    if (!tokens) return;
    download(`${project.name || "sorairo"}.tokens.dtcg.json`, JSON.stringify(toDtcg(tokens, project.name), null, 2));
    toast("tokens.dtcg.json を書き出しました", "ok");
  };
  const exportPng = async () => {
    if (!selected?.blobKey) return;
    const blob = await getBlob(selected.blobKey);
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name || "kv"}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const copySpec = async () => {
    if (!shownSpec) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(shownSpec, null, 2));
      markExported();
      toast("spec をコピーしました", "ok");
    } catch {
      toast("コピーできませんでした", "warn");
    }
  };

  const validation = shownSpec ? validateSpec(shownSpec) : null;
  const heavy = asset && asset.bytes > 3.5 * 1024 * 1024;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="card">
        <div className="card-head"><h2>画像を選ぶ</h2><span className="small muted">星付きが先頭</span></div>
        {gens.length ? (
          <div className="grid grid-thumbs">
            {gens.map((g) => <PickTile key={g.id} gen={g} selected={g.id === h.selectedGenId} onPick={() => merge("handoff", { selectedGenId: g.id })} />)}
          </div>
        ) : (
          <div className="empty">生成した画像がありません。画像が無くてもトークンと spec は作れます（背景色で代用されます）。</div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>配色を抽出する</h2>
          <button className="btn btn-sm btn-primary" onClick={extract} disabled={!selected || busy === "palette"}>
            {busy === "palette" ? <><span className="spinner" /> 抽出中…</> : "6 色を抽出"}
          </button>
        </div>
        {!tokens && <p className="small muted">画像を選んで「6 色を抽出」を押すと、色トークンが作られます。画像が無い場合は下の「トークンだけ作る」で既定色から始められます。</p>}
        {!tokens && <div className="row"><button className="btn btn-sm" onClick={() => setTypeOpt({})}>トークンだけ作る</button></div>}
        {err && <div className="alert danger small" style={{ marginTop: 8 }}>{err}</div>}
        {tokens && (
          <div style={{ marginTop: 12 }}>
            <PaletteRoles
              palette={shares.length ? shares : (h.palette || [])}
              colors={colors}
              onChange={(c) => patch("handoff.tokens", { ...tokens, color: c })}
            />
          </div>
        )}
      </div>

      {tokens && (
        <div className="card">
          <div className="card-head"><h2>書体・余白・角丸</h2></div>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">本文の書体</span>
              <select className="select" value={type.family} onChange={(e) => setTypeOpt({ body: e.target.value })}>
                {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="label">見出しの書体</span>
              <select className="select" value={type.displayFamily} onChange={(e) => setTypeOpt({ display: e.target.value })}>
                {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="label">基準サイズ <span className="hint">{type.baseSize}px</span></span>
              <input className="slider" type="range" min="14" max="18" step="1" value={type.baseSize || 16} onChange={(e) => setTypeOpt({ base: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span className="label">比率</span>
              <select className="select" value={type.ratio} onChange={(e) => setTypeOpt({ ratio: Number(e.target.value) })}>
                {TYPE_RATIOS.map((r) => <option key={r} value={r}>{r}{r === 1.25 ? "（Major Third・既定）" : ""}</option>)}
              </select>
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="label">余白</span>
              <select className="select" value={spacePreset} onChange={(e) => setTypeOpt({ space: e.target.value })}>
                {Object.keys(SPACE_PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="label">角丸</span>
              <select className="select" value={radiusPreset} onChange={(e) => setTypeOpt({ radius: e.target.value })}>
                {Object.keys(RADIUS_PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
          </div>
          <div className="scale-preview" style={{ marginTop: 12 }}>
            {Object.entries(type.scale || {}).map(([k, v]) => (
              <div key={k} className="row" style={{ gap: 10 }}>
                <span className="mono small muted" style={{ width: 70 }}>{k} {v}</span>
                <span style={{ fontSize: Math.min(v, 34), fontFamily: ["display", "h1"].includes(k) ? type.displayFamily : type.family, lineHeight: 1.2 }}>
                  空色スタジオ Aa
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {shownSpec && (
        <>
          <div className="card">
            <div className="card-head">
              <h2>spec プレビュー</h2>
              <div className="row">
                {aiSpec && <span className="badge sora">AI 微調整済み</span>}
                <button className="btn btn-sm" onClick={refine} disabled={!hasClaude || !selected || busy === "ai"}>
                  {busy === "ai" ? <><span className="spinner" /> 調整中…</> : "Claude で微調整（任意）"}
                </button>
                {aiSpec && <button className="btn btn-sm btn-ghost" onClick={() => patch("handoff.spec", null)}>決定論版に戻す</button>}
              </div>
            </div>
            {aiWarn && <div className="alert warn small" style={{ marginBottom: 10 }}>{aiWarn}</div>}
            {validation && !validation.ok && (
              <div className="alert danger small" style={{ marginBottom: 10 }}>
                spec の検証に失敗: {validation.errors.slice(0, 4).join(" / ")}
              </div>
            )}
            <p className="small muted">KV フレーム {frame.w}×{frame.h}（{project.direction.aspect}） · コンポーネント {shownSpec.components.length} 種</p>
            <SpecPreview spec={shownSpec} />
          </div>

          <div className="card">
            <div className="card-head"><h2>書き出し</h2>{h.exportedAt && <span className="small muted">最終書き出し {new Date(h.exportedAt).toLocaleString("ja-JP")}</span>}</div>
            {heavy && (
              <div className="alert warn small" style={{ marginBottom: 10 }}>
                画像を含む spec.json はおよそ {(asset.bytes / 1024 / 1024).toFixed(1)}MB あります。Figma プラグインの貼り付け欄では重いので、ファイル選択で読み込んでください。
              </div>
            )}
            <div className="row">
              <button className="btn btn-primary" onClick={exportSpec}>spec.json</button>
              <button className="btn" onClick={exportTokens}>tokens.dtcg.json</button>
              <button className="btn" onClick={exportPng} disabled={!selected}>PNG</button>
              <button className="btn" onClick={copySpec}>spec をコピー</button>
            </div>
            <p className="help" style={{ marginTop: 8 }}>
              spec.json には画像が dataURL（長辺 2048px 以下）で埋め込まれます。tokens.dtcg.json は W3C Design Tokens 形式です。
            </p>
          </div>
        </>
      )}

      <Collapsible title="Figma に流す 2 つの道" defaultOpen>
        <div className="grid grid-2">
          <div className="minicard">
            <strong className="small">A. 同梱プラグイン</strong>
            <ol className="small" style={{ paddingLeft: 18 }}>
              <li>Figma → Plugins → Development → Import plugin from manifest…</li>
              <li>このリポジトリの <code>studio-figma-plugin/manifest.json</code> を選ぶ</li>
              <li>プラグインを起動し、書き出した <code>spec.json</code> を貼るかファイルで選ぶ</li>
              <li>「生成」を押すと Variables（コレクション Sorairo）・Styles・Components・KV フレームができる</li>
            </ol>
          </div>
          <div className="minicard">
            <strong className="small">B. Claude Code + Figma MCP</strong>
            <ol className="small" style={{ paddingLeft: 18 }}>
              <li>Figma MCP を有効にした Claude Code を開く</li>
              <li>同じ <code>spec.json</code> を渡し、<code>use_figma</code> で流す</li>
              <li>手順の詳細は <code>docs/studio/figma-flow.md</code></li>
            </ol>
          </div>
        </div>
      </Collapsible>
    </div>
  );
}

function PickTile({ gen, selected, onPick }) {
  const url = useBlobUrl(gen.blobKey);
  return (
    <div className={`thumb${selected ? " selected" : ""}`}>
      <button className="gen-tile-btn" onClick={onPick} aria-label="この画像を使う">
        {url ? <img src={url} alt="生成画像" loading="lazy" /> : <span className="small muted">…</span>}
      </button>
      <span className="ov">{gen.starred ? "★ " : ""}{gen.critique ? `${gen.critique.total}/30` : new Date(gen.at).toLocaleDateString("ja-JP")}</span>
    </div>
  );
}
