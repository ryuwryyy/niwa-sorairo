/**
 * 企画ステージの結論（core）— コアアイデア / KV コンセプト / タグライン / 採用理由。
 *
 * ここが埋まると下流が変わる:
 * - lib/prompt.js … 方向の主題が空なら kvConcept を主題に使う。タグラインは「文字を画像に統合」のときだけ入る。
 * - lib/figmaSpec.js … 見出し = tagline、サブ = oneLiner。
 */
const TAGLINE_MAX = 15;

export default function KvConcept({ core = {}, onChange, onGoRefs, onGoDirection, editable = true }) {
  const filled = !!(core.oneLiner || "").trim();
  const tagLen = (core.tagline || "").trim().length;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className={`core-block${filled ? " filled" : ""}`}>
        <span className="k">コアアイデア</span>
        {filled ? (
          <p className="one">{core.oneLiner}</p>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>まだ採用していません。上の案から「採用」を押すとここに入ります。</p>
        )}
        {(core.tagline || "").trim() && <p className="tagline">{core.tagline}</p>}
        {(core.kvConcept || "").trim() && <p className="mono small kv">{core.kvConcept}</p>}
        {(core.rationale || "").trim() && <p className="small muted why">{core.rationale}</p>}
      </div>

      {editable && (
        <div className="grid grid-2">
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">コアアイデア（1 行）</span>
            <textarea
              className="textarea" style={{ minHeight: 56, fontFamily: "var(--font-display)", fontSize: 15 }}
              value={core.oneLiner || ""} onChange={(e) => onChange({ oneLiner: e.target.value })}
              placeholder="採用した案の一行"
            />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">KV コンセプト <span className="hint">EN・見えるものだけ。方向の主題が空ならこれが主題になる</span></span>
            <textarea
              className="textarea mono" style={{ minHeight: 56 }}
              value={core.kvConcept || ""} onChange={(e) => onChange({ kvConcept: e.target.value })}
              placeholder="A single worn wooden spoon casting a shadow shaped like a full meal."
            />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">
              タグライン <span className="hint">Figma の見出しになる（画像には描かせない）</span>
              <span className={`right mono small ${tagLen > TAGLINE_MAX ? "danger" : "muted"}`}>{tagLen}/{TAGLINE_MAX}</span>
            </span>
            <input className="input" value={core.tagline || ""} onChange={(e) => onChange({ tagline: e.target.value })} placeholder="言い切る" />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">採用理由</span>
            <textarea
              className="textarea" style={{ minHeight: 56 }}
              value={core.rationale || ""} onChange={(e) => onChange({ rationale: e.target.value })}
              placeholder="なぜこの案を選んだか"
            />
          </label>
        </div>
      )}

      <div className="row">
        <button className="btn btn-primary" onClick={onGoRefs} disabled={!filled}>参照へ（このアイデアで参考を探す）</button>
        <button className="btn" onClick={onGoDirection} disabled={!filled}>方向へ</button>
        {!filled && <span className="small muted">コアアイデアを採用すると進めます</span>}
      </div>
    </div>
  );
}
