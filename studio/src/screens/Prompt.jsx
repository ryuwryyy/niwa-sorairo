import { useEffect, useMemo, useState } from "react";
import guide from "../data/promptGuide.json";
import { useStudio, activePrompt } from "../store";
import { compilePrompt } from "../lib/prompt";
import { guard } from "../lib/guard";
import { api, ApiError } from "../lib/api";
import { maxRefImages } from "../lib/refsources";
import PromptBlocks from "../components/PromptBlocks";
import Collapsible from "../components/Collapsible";
import ConfirmButton from "../components/ConfirmButton";
import { useToast } from "../components/Toast";

const SOURCE_JA = { compiled: "コンパイル", ai: "AI 磨き", manual: "手編集" };
const TWO_MIN = 2 * 60 * 1000;

export default function Prompt() {
  const { project, dispatch, setStage, settings } = useStudio();
  const toast = useToast();
  const versions = [...project.prompt.versions].reverse();
  const active = activePrompt(project);
  const hasClaude = !!settings.apiStatus?.claude;

  const compiled = useMemo(() => compilePrompt(project, { maxRefImages: maxRefImages(project.direction) }), [project]);
  const [en, setEn] = useState(active?.en || "");
  const [ja, setJa] = useState(active?.ja || "");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [tpl, setTpl] = useState("");
  const [slots, setSlots] = useState({});

  useEffect(() => { setEn(active?.en || ""); setJa(active?.ja || ""); }, [active?.id]);

  const g = useMemo(() => guard(en, [project.meta.brand].filter(Boolean)), [en, project.meta.brand]);

  const addVersion = (v) => dispatch({ type: "prompt/addVersion", version: v });

  const recompile = () => {
    addVersion({ source: "compiled", en: compiled.en, ja: compiled.ja, blocks: compiled.blocks, refIds: compiled.refIds, note: "再コンパイル" });
    toast("変数から再コンパイルしました", "ok");
  };

  /** EN を編集して離れたとき: 直近 2 分以内の手編集版ならその場で更新、そうでなければ新しい版 */
  const commitText = (nextEn, nextJa, note) => {
    if (!active) {
      addVersion({ source: "manual", en: nextEn, ja: nextJa, blocks: compiled.blocks, refIds: compiled.refIds, note: note || "手編集" });
      return;
    }
    if (nextEn === active.en && nextJa === active.ja && !note) return;
    const fresh = active.source === "manual" && Date.now() - new Date(active.at).getTime() < TWO_MIN;
    if (fresh) {
      dispatch({ type: "prompt/updateVersion", id: active.id, patch: { en: nextEn, ja: nextJa, ...(note ? { note } : {}) } });
    } else {
      addVersion({ source: "manual", en: nextEn, ja: nextJa, blocks: active.blocks, refIds: active.refIds, note: note || "手編集" });
    }
  };

  const polish = async () => {
    setErr(""); setBusy("ai");
    try {
      const r = await api.ai("prompt", {
        compiled: { en: compiled.en, ja: compiled.ja, blocks: compiled.blocks },
        brief: project.consult.brief,
        direction: project.direction,
        refs: project.refs.board.map((r2) => ({ role: r2.role, weight: r2.weight, principles: r2.principles, passPixels: r2.passPixels })),
        promptGuide: {
          principles: (guide.principles || []).map((p) => p.title),
          pitfalls: (guide.pitfalls || []).map((p) => p.titleJa),
        },
      });
      if (!r.en) throw new Error("空の結果が返りました");
      addVersion({ source: "ai", en: r.en, ja: r.ja || "", blocks: Array.isArray(r.blocks) ? r.blocks : compiled.blocks, refIds: compiled.refIds, note: "Claude で磨いた版" });
      toast("磨いた版を追加しました", "ok");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : e.message || "磨けませんでした");
    } finally {
      setBusy("");
    }
  };

  const template = guide.templates.find((t) => t.id === tpl) || null;
  const prefill = (name) => {
    const d = project.direction;
    const b = project.consult.brief;
    const map = {
      subject: d.subject,
      brand: project.meta.brand,
      composition: blockText("composition"),
      lighting: blockText("light"),
      palette: blockText("palette"),
      typography: blockText("typography"),
      mood: blockText("mood"),
      technique: blockText("craft"),
      medium: d.medium,
      deliverable: project.meta.deliverable,
      constraints: blockText("constraints"),
      scene: d.scene,
      oneLiner: b.oneLiner,
    };
    return map[name] ?? "";
  };
  function blockText(key) {
    return compiled.blocks.find((b) => b.key === key)?.en || "";
  }

  const applyTemplate = () => {
    if (!template) return;
    let out = template.template;
    for (const s of template.slots) out = out.replaceAll(`{${s}}`, (slots[s] ?? prefill(s) ?? "").toString());
    addVersion({ source: "manual", en: out.replace(/\s+/g, " ").trim(), ja: `テンプレート「${template.nameJa}」から生成`, blocks: compiled.blocks, refIds: compiled.refIds, note: template.nameJa });
    toast("テンプレートから版を作りました", "ok");
    setTpl("");
    setSlots({});
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(en);
      toast("EN プロンプトをコピーしました", "ok");
    } catch {
      toast("コピーできませんでした（手動で選択してください）", "warn");
    }
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      {!hasClaude && (
        <div className="alert info">
          <strong>「Claude で磨く」は未接続です。</strong> サーバに <code>ANTHROPIC_API_KEY</code> を設定すると使えます。
          決定論的コンパイラ（変数 → 叙述文）はキー無しで動きます。
        </div>
      )}

      <div className="prompt-2col">
        <div className="card">
          <div className="card-head">
            <h2>変数から編んだ文</h2>
            <button className="btn btn-sm" onClick={recompile}>再コンパイル</button>
          </div>
          <PromptBlocks blocks={compiled.blocks} onJump={() => setStage("direction")} />
        </div>

        <div className="card">
          <div className="card-head">
            <h2>{active ? `版 ${SOURCE_JA[active.source] || active.source}` : "まだ版がありません"}</h2>
            <div className="row">
              <button className="btn btn-sm" onClick={copy} disabled={!en}>コピー</button>
              <button className="btn btn-sm" onClick={polish} disabled={!hasClaude || !!busy}>
                {busy === "ai" ? <><span className="spinner" /> 磨いています…</> : "Claude で磨く"}
              </button>
            </div>
          </div>

          {!active && <div className="empty small">「再コンパイル」を押すと最初の版ができます。</div>}

          {active && (
            <>
              <label className="field">
                <span className="label">EN 本文 <span className="hint">モデルに渡る文。編集して離れると版が残ります</span></span>
                <textarea
                  className="textarea mono"
                  style={{ minHeight: 320 }}
                  value={en}
                  onChange={(e) => setEn(e.target.value)}
                  onBlur={() => commitText(en, ja)}
                />
              </label>
              <label className="field">
                <span className="label">JA 解説 <span className="hint">人が読むための説明</span></span>
                <textarea className="textarea" style={{ minHeight: 120 }} value={ja} onChange={(e) => setJa(e.target.value)} onBlur={() => commitText(en, ja)} />
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span className="label">メモ</span>
                <input
                  className="input"
                  value={active.note || ""}
                  placeholder="この版で何を試したか"
                  onChange={(e) => dispatch({ type: "prompt/updateVersion", id: active.id, patch: { note: e.target.value } })}
                />
              </label>
            </>
          )}

          {err && <div className="alert danger" style={{ marginTop: 10 }}>{err}</div>}

          <div className="stack" style={{ marginTop: 12, gap: 8 }}>
            {g.items.map((w, i) => (
              <div key={`${w.level}-${w.term}-${i}`} className={`alert ${w.level === "block" ? "danger" : "warn"} small`}>
                <strong>{w.level === "block" ? "停止" : "注意"}</strong> — {w.message}
              </div>
            ))}
            {!g.items.length && en && <div className="alert ok small">権利ガード: 問題は見つかりませんでした。</div>}
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => setStage("generate")} disabled={!en || g.blocked}>生成へ →</button>
            {g.blocked && <span className="small danger">停止項目があるため進めません。文を書き換えてください。</span>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>テンプレートから</h2></div>
        <div className="row">
          <select className="select" style={{ maxWidth: 320 }} value={tpl} aria-label="テンプレート" onChange={(e) => { setTpl(e.target.value); setSlots({}); }}>
            <option value="">テンプレートを選ぶ…</option>
            {guide.templates.map((t) => <option key={t.id} value={t.id}>{t.nameJa}</option>)}
          </select>
          {template && <button className="btn btn-primary" onClick={applyTemplate}>この内容で版を作る</button>}
        </div>
        {template && (
          <div className="stack" style={{ marginTop: 12, gap: 10 }}>
            <p className="small muted">向いている成果物: {template.useFor.join(" / ")}</p>
            <div className="grid grid-2">
              {template.slots.map((s) => (
                <label className="field" key={s} style={{ marginBottom: 0 }}>
                  <span className="label mono">{"{" + s + "}"}</span>
                  <textarea
                    className="textarea"
                    style={{ minHeight: 56 }}
                    value={slots[s] ?? prefill(s)}
                    onChange={(e) => setSlots((v) => ({ ...v, [s]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <Collapsible title="記入例を見る">
              <p className="small mono" style={{ whiteSpace: "pre-wrap" }}>{template.exampleFilled}</p>
            </Collapsible>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h2>版の履歴</h2><span className="small muted">{versions.length} 版</span></div>
        {versions.length ? (
          <div className="stack" style={{ gap: 6 }}>
            {versions.map((v) => (
              <div key={v.id} className={`verrow${v.id === active?.id ? " active" : ""}`}>
                <button className="verrow-main" onClick={() => dispatch({ type: "prompt/setActive", id: v.id })}>
                  <span className="badge">{SOURCE_JA[v.source] || v.source}</span>
                  <span className="small">{new Date(v.at).toLocaleString("ja-JP")}</span>
                  <span className="small muted">参照 {v.refIds?.length ?? 0} 枚 · {v.en?.length ?? 0} 文字</span>
                  {v.note && <span className="small muted">— {v.note}</span>}
                </button>
                <ConfirmButton onConfirm={() => dispatch({ type: "prompt/removeVersion", id: v.id })} confirmLabel="消す？">削除</ConfirmButton>
              </div>
            ))}
          </div>
        ) : <div className="empty small">まだ版がありません。</div>}
      </div>

      <Collapsible title="プロンプトの原則 / 落とし穴" subtitle={`${guide.principles.length} 原則 · ${guide.pitfalls.length} 落とし穴`}>
        <div className="grid grid-2">
          <div className="stack" style={{ gap: 10 }}>
            <h3 className="small muted">原則</h3>
            {guide.principles.map((p) => (
              <div key={p.id} className="minicard">
                <strong className="small">{p.titleJa}</strong>
                <p className="small muted">{p.bodyJa}</p>
                {p.example && <p className="small mono" style={{ whiteSpace: "pre-wrap" }}>{p.example}</p>}
              </div>
            ))}
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <h3 className="small muted">落とし穴</h3>
            {guide.pitfalls.map((p) => (
              <div key={p.titleJa} className="minicard">
                <strong className="small">{p.titleJa}</strong>
                <p className="small muted">{p.bodyJa}</p>
              </div>
            ))}
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
