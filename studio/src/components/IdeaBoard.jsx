/**
 * 「コアアイデアを出す」— 6 案をカードで並べ、その場で書き直し、検査し、採点し、1 本を採用する。
 *
 * カードの中身は store の project.idea.ideas[] と 1:1。
 * 「変種」ボタン（反転 / 極端化 / 媒体を変える / 主語を変える）は lib/idea.js の決定的変換。
 */
import Collapsible from "./Collapsible";
import IdeaTests from "./IdeaTests";
import { DEFAULT_LENS, VARIANT_KINDS, lensTotal } from "../lib/idea";

const TAGLINE_MAX = 15;

export default function IdeaBoard({
  ideas = [],
  patterns = [],
  ideaTests = [],
  lens = null,
  onUpdate,
  onRemove,
  onAdopt,
  onVariant,
}) {
  if (!ideas.length) {
    return <div className="empty">まだ案がありません。上の「AI で 6 案」か「型から 6 案」を押してください。</div>;
  }
  const criteria = lens?.criteria?.length ? lens.criteria : DEFAULT_LENS;
  const patternJa = (id) => patterns.find((p) => p.id === id)?.ja || id;

  return (
    <div className="idea-grid">
      {ideas.map((idea, i) => (
        <IdeaCard
          key={idea.id}
          n={i + 1}
          idea={idea}
          criteria={criteria}
          ideaTests={ideaTests}
          patternJa={patternJa}
          onUpdate={(p) => onUpdate(idea.id, p)}
          onRemove={() => onRemove(idea.id)}
          onAdopt={() => onAdopt(idea)}
          onVariant={(kind) => onVariant(idea, kind)}
        />
      ))}
    </div>
  );
}

function IdeaCard({ n, idea, criteria, ideaTests, patternJa, onUpdate, onRemove, onAdopt, onVariant }) {
  const scores = idea.scores || null;
  const eff = scores || { idea: 3, execution: 3, impact: 3 };
  const keys = ["idea", "execution", "impact"];
  const total = lensTotal(eff, criteria);
  const tagLen = (idea.tagline || "").trim().length;

  const setScore = (key, v) => onUpdate({ scores: { ...eff, [key]: Number(v) } });

  return (
    <article className={`card idea-card${idea.chosen ? " chosen" : ""}`}>
      <div className="row" style={{ gap: 6 }}>
        <span className="badge mono">案 {n}</span>
        {idea.chosen && <span className="badge ok">採用中</span>}
        {(idea.patterns || []).map((p) => <span key={p} className="badge sora">{patternJa(p)}</span>)}
        {idea.source?.startsWith("variant:") && <span className="badge">変種 {idea.source.split(":")[1]}</span>}
        <button className="btn btn-sm btn-ghost right" onClick={onRemove} aria-label={`案 ${n} を削除`}>×</button>
      </div>

      <label className="field" style={{ marginTop: 8 }}>
        <span className="label">一行（何をするか）</span>
        <textarea
          className="textarea" style={{ minHeight: 60, fontFamily: "var(--font-display)", fontSize: 15 }}
          value={idea.oneLiner || ""} placeholder="この案を一文で"
          onChange={(e) => onUpdate({ oneLiner: e.target.value })}
        />
      </label>

      <label className="field">
        <span className="label">跳躍 <span className="hint">ふつうは〜。この案は〜</span></span>
        <textarea className="textarea" style={{ minHeight: 52 }} value={idea.twist || ""} onChange={(e) => onUpdate({ twist: e.target.value })} />
      </label>

      <label className="field">
        <span className="label">KV コンセプト <span className="hint">EN・一文・見えるものだけ</span></span>
        <textarea
          className="textarea mono" style={{ minHeight: 56 }} value={idea.kvConcept || ""}
          placeholder="A single worn wooden spoon casting a shadow shaped like a full meal."
          onChange={(e) => onUpdate({ kvConcept: e.target.value })}
        />
      </label>

      <label className="field">
        <span className="label">
          タグライン <span className="hint">日本語 {TAGLINE_MAX} 文字まで</span>
          <span className={`right mono small ${tagLen > TAGLINE_MAX ? "danger" : "muted"}`}>{tagLen}/{TAGLINE_MAX}</span>
        </span>
        <input className="input" value={idea.tagline || ""} onChange={(e) => onUpdate({ tagline: e.target.value })} placeholder="言い切る" />
      </label>

      <div className="grid grid-2">
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="label">なぜ効くか</span>
          <textarea className="textarea" style={{ minHeight: 52 }} value={idea.why || ""} onChange={(e) => onUpdate({ why: e.target.value })} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="label">危うさ</span>
          <textarea className="textarea" style={{ minHeight: 52 }} value={idea.risk || ""} onChange={(e) => onUpdate({ risk: e.target.value })} />
        </label>
      </div>

      <div className="stack" style={{ gap: 8, marginTop: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <strong className="small">カンヌの見方</strong>
          <span className="small muted">{criteria.map((c) => `${c.ja} ${c.weightPct}%`).join(" · ")}</span>
          <span className="right mono small">{total}/100{scores ? "" : "（未採点）"}</span>
        </div>
        {criteria.slice(0, 3).map((c, i) => {
          const key = Object.prototype.hasOwnProperty.call(eff, c.id) ? c.id : keys[i];
          return (
            <div className="axis" key={c.id || key} title={c.questionJa}>
              <span className="l">{c.ja}</span>
              <input
                className="slider" type="range" min="1" max="5" step="1"
                value={eff[key] ?? 3}
                aria-label={`${c.ja}（1〜5）`}
                onChange={(e) => setScore(key, e.target.value)}
              />
              <span className="r mono">{eff[key] ?? 3}/5</span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12 }}>
        <Collapsible title="アイデアの検査" subtitle={`${(ideaTests || []).length} 問`}>
          <IdeaTests
            tests={idea.tests || {}}
            ideaTests={ideaTests}
            idPrefix={idea.id}
            onChange={(tests) => onUpdate({ tests })}
          />
        </Collapsible>
      </div>

      <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
        <span className="label">変種 <span className="hint">1 手だけ動かした案を足す</span></span>
        <div className="chips">
          {VARIANT_KINDS.map((k) => (
            <button key={k.id} type="button" className="chip" title={k.hintJa} onClick={() => onVariant(k.id)}>{k.ja}</button>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={onAdopt} disabled={!((idea.oneLiner || "").trim())}>
          {idea.chosen ? "採用し直す" : "採用"}
        </button>
        <span className="small muted">採用するとコアアイデアに書き込まれ、プロンプトの主題になります</span>
      </div>
    </article>
  );
}
