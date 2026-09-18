import { useMemo } from "react";
import vars from "../data/directionVars.json";
import guide from "../data/promptGuide.json";
import { useStudio } from "../store";
import { compilePrompt, axisPhrase } from "../lib/prompt";
import { modelSpec, maxRefImages } from "../lib/refsources";
import Chips from "../components/Chips";
import TagInput from "../components/TagInput";
import PaletteEditor from "../components/PaletteEditor";
import PromptBlocks from "../components/PromptBlocks";
import { useToast } from "../components/Toast";

const pickRandom = (list, not = []) => {
  const pool = list.filter((x) => !not.includes(x.id));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
};
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

export default function Direction() {
  const { project, patch, merge, dispatch, setStage } = useStudio();
  const toast = useToast();
  const d = project.direction;
  const brief = project.consult.brief;

  const model = modelSpec(d);
  const compiled = useMemo(() => compilePrompt(project, { maxRefImages: maxRefImages(d) }), [project, d]);
  const aspects = (guide.aspectRatios || []).filter((a) => !model.aspectRatios || model.aspectRatios.includes(a.id));
  const deprecated = (m) => /廃止|非推奨|deprecated/i.test(m.noteJa || "");

  const ideas = useMemo(() => {
    const src = `${brief.oneLiner || ""}。${brief.insight || ""}`;
    return [...new Set(src.split(/[、。\n,]/).map((s) => s.trim()).filter((s) => s.length >= 4))].slice(0, 3);
  }, [brief.oneLiner, brief.insight]);

  const copyWords = (d.typography.copy || "").trim().split(/\s+/).filter(Boolean);
  const refsWithPalette = project.refs.board.filter((r) => (r.palette || []).length);

  /* ---------- SCAMPER ---------- */
  const scamper = {
    反転: () => {
      patch("direction.axes", (a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, clamp(100 - v)])));
      return "6 本の軸をすべて反転しました";
    },
    置換: () => {
      const cur = d.technique || [];
      const out = cur.length ? cur[Math.floor(Math.random() * cur.length)] : null;
      const inn = pickRandom(vars.technique, cur);
      if (!inn) return "入れ替える技法がありません";
      patch("direction.technique", cur.length ? cur.map((t) => (t === out ? inn : t)) : [inn]);
      const nameOf = (id) => vars.technique.find((t) => t.id === id)?.ja || id;
      return cur.length ? `技法「${nameOf(out)}」→「${nameOf(inn)}」` : `技法「${nameOf(inn)}」を入れました`;
    },
    拡大: () => {
      patch("direction.composition", "extreme_closeup");
      patch("direction.axes.quiet_loud", (v) => clamp((v ?? 40) + 25));
      return "構図を極端なクローズアップに、騒がしさを +25";
    },
    縮小: () => {
      patch("direction.composition", "negative_space");
      patch("direction.axes.minimal_maximal", (v) => clamp((v ?? 40) - 25));
      return "構図を大きな余白に、ミニマル方向へ −25";
    },
    結合: () => {
      patch("direction.technique", (t) => [...new Set([...(t || []), "double_exposure"])].slice(0, 3));
      return "技法に「多重露光」を足しました";
    },
    転用: () => {
      const m = pickRandom(vars.medium, [d.medium]);
      if (!m) return "変更できる媒体がありません";
      patch("direction.medium", m);
      return `媒体を「${vars.medium.find((x) => x.id === m)?.ja}」に変えました`;
    },
  };

  const saveVersion = () => {
    dispatch({
      type: "prompt/addVersion",
      version: { source: "compiled", en: compiled.en, ja: compiled.ja, blocks: compiled.blocks, refIds: compiled.refIds, note: "方向ステージから保存" },
    });
    toast("プロンプト版を保存しました", "ok");
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="card">
        <div className="card-head"><h2>主題とシーン</h2><span className="small muted">具体的な「モノ」を一つ決めると安定します</span></div>
        <label className="field">
          <span className="label">主題（EN 推奨）</span>
          <textarea className="textarea" style={{ minHeight: 68 }} value={d.subject} placeholder="a single unglazed stoneware cup of pale green tea on a worn wooden counter" onChange={(e) => patch("direction.subject", e.target.value)} />
        </label>
        <label className="field" style={{ marginBottom: ideas.length ? 10 : 0 }}>
          <span className="label">シーン</span>
          <textarea className="textarea" style={{ minHeight: 60 }} value={d.scene} placeholder="in a quiet old Kyoto machiya at mid-morning" onChange={(e) => patch("direction.scene", e.target.value)} />
        </label>
        {!!ideas.length && (
          <div className="field" style={{ marginBottom: 0 }}>
            <span className="label">ブリーフから拾った手がかり <span className="hint">押すと主題に足します</span></span>
            <div className="chips">
              {ideas.map((t) => (
                <button key={t} className="chip" onClick={() => patch("direction.subject", (s) => (s ? `${s} ${t}` : t))}>{t}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h2>軸</h2><span className="small muted">中央付近はプロンプトに書かれません</span></div>
        <div className="stack" style={{ gap: 12 }}>
          {vars.axes.map((a) => {
            const v = d.axes?.[a.id] ?? a.default;
            const phrase = axisPhrase(a, v);
            return (
              <div key={a.id}>
                <div className="axis">
                  <span className="l">{a.leftJa}</span>
                  <input className="slider" type="range" min="0" max="100" value={v} aria-label={`${a.leftJa} から ${a.rightJa}`} onChange={(e) => patch(`direction.axes.${a.id}`, Number(e.target.value))} />
                  <span className="r">{a.rightJa}</span>
                </div>
                <p className="small muted mono" style={{ textAlign: "center", margin: 0 }}>{phrase || "（言及しない）"}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>媒体・技法・質感</h2></div>
        <div className="field"><span className="label">媒体</span><Chips options={vars.medium} value={d.medium} onChange={(v) => patch("direction.medium", v)} allowEmpty={false} label="媒体" /></div>
        <div className="field"><span className="label">技法 <span className="hint">最大 3</span></span><Chips options={vars.technique} value={d.technique} onChange={(v) => patch("direction.technique", v)} multi max={3} label="技法" /></div>
        <div className="field" style={{ marginBottom: 0 }}><span className="label">質感 <span className="hint">最大 2</span></span><Chips options={vars.texture} value={d.texture} onChange={(v) => patch("direction.texture", v)} multi max={2} label="質感" /></div>
      </div>

      <div className="card">
        <div className="card-head"><h2>構図・光・カメラ</h2></div>
        <div className="field"><span className="label">構図</span><Chips options={vars.composition} value={d.composition} onChange={(v) => patch("direction.composition", v)} allowEmpty={false} label="構図" /></div>
        <div className="field"><span className="label">光</span><Chips options={vars.lighting} value={d.lighting} onChange={(v) => patch("direction.lighting", v)} allowEmpty={false} label="光" /></div>
        <div className="field" style={{ marginBottom: 0 }}><span className="label">カメラ</span><Chips options={vars.camera} value={d.camera} onChange={(v) => patch("direction.camera", v)} allowEmpty={false} label="カメラ" /></div>
      </div>

      <div className="card">
        <div className="card-head"><h2>配色</h2><span className="small muted">60-30-10 で役割を与える</span></div>
        <PaletteEditor
          palette={d.palette}
          onChange={(p) => patch("direction.palette", p)}
          refsWithPalette={refsWithPalette}
          onAdoptRef={(r) => { merge("direction.palette", { mode: "from_ref", colors: (r.palette || []).slice(0, 6) }); toast("参照の配色を採用しました", "ok"); }}
        />
      </div>

      <div className="card">
        <div className="card-head"><h2>文字の扱い</h2><span className="small muted">既定は「Figma で載せる」</span></div>
        <div className="stack" style={{ gap: 6 }}>
          {vars.typographyIntent.map((t) => (
            <label key={t.id} className={`radio-row${d.typography.intent === t.id ? " active" : ""}`}>
              <input type="radio" name="typo-intent" checked={d.typography.intent === t.id} onChange={() => merge("direction.typography", { intent: t.id })} />
              <span><strong className="small">{t.ja}</strong><br /><span className="small muted">{t.hint}</span></span>
            </label>
          ))}
        </div>
        {d.typography.intent === "headline_zone" && (
          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <span className="label">空けるゾーン</span>
            <Chips options={vars.zones} value={d.typography.zone} onChange={(v) => merge("direction.typography", { zone: v })} allowEmpty={false} label="ゾーン" />
          </div>
        )}
        {d.typography.intent === "integrated" && (
          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <span className="label">画像に描かせる文字</span>
            <input className="input" value={d.typography.copy} placeholder="短い語だけ（2〜3 語まで）" onChange={(e) => merge("direction.typography", { copy: e.target.value })} />
            {copyWords.length > 3 && (
              <div className="alert warn small" style={{ marginTop: 8 }}>
                {copyWords.length} 語は多すぎます。文字は語数が増えるほど破綻します（promptGuide の落とし穴）。3 語以内にするか、「見出しゾーンを空ける」に戻して Figma で載せてください。
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h2>ムード</h2><span className="small muted">最大 5。ブリーフのトーンと統合されます</span></div>
        <Chips options={vars.moodWords} value={d.mood} onChange={(v) => patch("direction.mood", v)} multi max={5} label="ムード" />
        {!!brief.tone?.length && <p className="small muted" style={{ marginTop: 8 }}>ブリーフのトーン: {brief.tone.map((t) => vars.moodWords.find((m) => m.id === t)?.ja || t).join("・")}</p>}
      </div>

      <div className="card">
        <div className="card-head"><h2>必須と禁止</h2></div>
        <div className="grid grid-2">
          <div className="field" style={{ marginBottom: 0 }}>
            <span className="label">必ず入れる</span>
            <TagInput value={d.mustInclude} onChange={(v) => patch("direction.mustInclude", v)} placeholder="例: one cup only" label="必ず入れる" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <span className="label">入れない</span>
            <TagInput value={d.mustAvoid} onChange={(v) => patch("direction.mustAvoid", v)} placeholder="例: people / teapot" label="入れない" />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>出力</h2></div>
        <div className="field">
          <span className="label">アスペクト比 <span className="hint">{model.label}で使える比率</span></span>
          <div className="chips">
            {aspects.map((a) => {
              const long = 26;
              const w = a.w >= a.h ? long : Math.round((a.w / a.h) * long);
              const h = a.h > a.w ? long : Math.round((a.h / a.w) * long);
              return (
                <button key={a.id} className={`chip${d.aspect === a.id ? " active" : ""}`} onClick={() => patch("direction.aspect", a.id)} title={a.labelJa}>
                  <span className="ar" style={{ width: w, height: h }} />
                  {a.id}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-3">
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">モデル</span>
            <select className="select" value={d.model} onChange={(e) => patch("direction.model", e.target.value)}>
              <option value="">サーバ既定</option>
              {(guide.models || []).map((m) => <option key={m.id} value={m.id}>{m.label}{deprecated(m) ? "（非推奨）" : ""}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">案の数</span>
            <select className="select" value={d.variants} onChange={(e) => patch("direction.variants", Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} 案</option>)}
            </select>
          </label>
          {model.supportsImageSize && (
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="label">サイズ</span>
              <select className="select" value={d.size} onChange={(e) => patch("direction.size", e.target.value)}>
                {(model.sizes || ["1K"]).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
        </div>
        {d.model && (
          <div className="stack" style={{ marginTop: 10, gap: 6 }}>
            {deprecated(model) && <span className="badge danger">非推奨</span>}
            <p className="help">{model.noteJa}</p>
          </div>
        )}
        {!d.model && <p className="help" style={{ marginTop: 10 }}>サーバ既定（{model.label}）を使います。参照画像は最大 {maxRefImages(d)} 枚。</p>}
      </div>

      <div className="card">
        <div className="card-head"><h2>SCAMPER</h2><span className="small muted">変数をまとめて揺らして別案を作る</span></div>
        <div className="chips">
          {Object.entries(scamper).map(([label, fn]) => (
            <button key={label} className="chip" onClick={() => toast(fn(), "ok")}>{label}</button>
          ))}
        </div>
        <p className="help" style={{ marginTop: 8 }}>反転＝軸を反転／置換＝技法を1つ入替／拡大＝寄る／縮小＝引く／結合＝多重露光を足す／転用＝媒体を変える</p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>いまのプロンプト</h2>
          <div className="row">
            <button className="btn btn-sm" onClick={() => setStage("prompt")}>プロンプト画面へ</button>
            <button className="btn btn-sm btn-primary" onClick={saveVersion}>この内容でプロンプト版を保存</button>
          </div>
        </div>
        <PromptBlocks blocks={compiled.blocks} />
        <p className="small muted" style={{ marginTop: 8 }}>
          {compiled.en.length} 文字 · 画像を渡す参照 {compiled.refIds.length} 枚
        </p>
      </div>
    </div>
  );
}
