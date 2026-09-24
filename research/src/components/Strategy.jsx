import { useState } from "react";
import { analyze, NoClaudeKeyError } from "../lib/analyze";

/**
 * 戦略シート: ペルソナ・感情マップ・仮説・インサイト・コアアイデア・課題・解決策・トンマナ・クリエイティブブリーフ。
 * 費用を抑えるため、ボタンを押したときだけ Claude を1回呼ぶ。
 * @param {{theme:string, getInput:()=>({posts:object[], notes?:string}), byId:Map, value:object|null, onChange:(v:object|null)=>void}} props
 */
export default function Strategy({ theme, getInput, byId, value, onChange }) {
  const [state, setState] = useState({ running: false, error: null });

  const run = async () => {
    const { posts, notes } = getInput();
    if (!posts.length) { setState({ running: false, error: "使える投稿がありません" }); return; }
    setState({ running: true, error: null });
    try {
      onChange(await analyze("strategy", { theme, posts, notes }));
      setState({ running: false, error: null });
    } catch (e) {
      setState({ running: false, error: e instanceof NoClaudeKeyError ? "サーバーに ANTHROPIC_API_KEY が設定されていません" : e.message });
    }
  };

  const Cite = ({ ids }) => (ids || []).map((id) => byId.get(id)).filter(Boolean).map((r) => (
    <a key={r.id} className="chip" href={r.url || undefined} target="_blank" rel="noreferrer" title={r.text} style={{ marginRight: 4 }}>{r.id}</a>
  ));
  const st = value;

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="row">
        <h2 style={{ margin: 0 }}>戦略シート</h2>
        <span className="hint">ペルソナ・感情マップ・仮説・インサイト・コアアイデア・課題・解決策・トンマナ・クリエイティブブリーフ</span>
        <span className="spacer" />
        <button className="btn small" disabled={state.running} onClick={run} title="Claude を1回呼ぶ">
          {state.running ? "作成中…" : st ? "つくり直す" : "戦略シートをつくる"}
        </button>
      </div>
      {!st && !state.running && <p className="hint">押したときだけ Claude を1回呼びます(投稿は最大120件まで渡します)。</p>}
      {state.error && <p className="hint" style={{ color: "var(--warn)" }}>{state.error}</p>}
      {st && (
        <div className="strategy">
          <div className="core">
            <div className="hint">コアアイデア</div>
            <p className="headline" style={{ margin: "4px 0" }}>{st.coreIdea.title}</p>
            <p style={{ margin: 0 }}>{st.coreIdea.statement}</p>
            <p className="hint" style={{ margin: "6px 0 0" }}>問い: {st.coreIdea.howMightWe}</p>
          </div>

          <h3>ペルソナ</h3>
          <div className="cards">
            {st.personas.map((p, i) => (
              <div className="card" key={i}>
                <b>{p.name}</b><div className="hint">{p.profile}</div>
                <p className="quote">「{p.quote}」</p>
                <dl>
                  <dt>場面</dt><dd>{p.context}</dd>
                  <dt>目的</dt><dd>{p.goals.join(" / ")}</dd>
                  <dt>不満</dt><dd>{p.frustrations.join(" / ")}</dd>
                </dl>
                <Cite ids={p.evidenceIds} />
              </div>
            ))}
          </div>

          <h3>感情マップ(推測)</h3>
          <EmotionMap stages={st.emotionMap} />
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>段階</th><th>行動</th><th>考え</th><th>気持ち</th><th>ペイン</th><th>機会</th></tr></thead>
              <tbody>
                {st.emotionMap.map((e, i) => (
                  <tr key={i}><td><b>{e.stage}</b></td><td>{e.doing}</td><td>{e.thinking}</td><td>{e.feeling}</td><td>{e.painPoint}</td><td>{e.opportunity} <Cite ids={e.evidenceIds} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid-3">
            <div>
              <h3>課題</h3>
              <ul className="insights">{st.problems.map((p, i) => <li key={i}><b>{p.problem}</b><div className="hint">誰: {p.who} · 影響: {p.impact}</div><Cite ids={p.evidenceIds} /></li>)}</ul>
            </div>
            <div>
              <h3>仮説</h3>
              <ul className="insights">{st.hypotheses.map((h, i) => <li key={i}>{h.statement}<div className="hint">根拠: {h.basis} · 確かめ方: {h.howToVerify}</div><Cite ids={h.evidenceIds} /></li>)}</ul>
            </div>
            <div>
              <h3>インサイト</h3>
              <ul className="insights">{st.insights.map((it, i) => <li key={i}>{it.text}<div className="hint">葛藤: {it.tension}</div><Cite ids={it.evidenceIds} /></li>)}</ul>
            </div>
          </div>

          <h3>解決策・サービスの提案</h3>
          <div className="cards">
            {st.solutions.map((s, i) => (
              <div className="card" key={i}>
                <span className="chip">{s.kind}</span> <b>{s.name}</b>
                <p>{s.description}</p>
                <div className="hint">解く課題: {s.solves}</div>
                <div className="hint">最初の一歩: {s.firstStep}</div>
              </div>
            ))}
          </div>

          <div className="grid-2" style={{ marginTop: 12 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>トンマナ</h3>
              <div className="row">{st.toneManner.keywords.map((k) => <span key={k} className="chip" style={{ fontSize: 13 }}>{k}</span>)}</div>
              <dl>
                <dt>話し方</dt><dd>{st.toneManner.voice}</dd>
                <dt>する</dt><dd>{st.toneManner.doList.join(" / ")}</dd>
                <dt>しない</dt><dd>{st.toneManner.dontList.join(" / ")}</dd>
                <dt>色</dt><dd>{st.toneManner.color}</dd>
                <dt>書体</dt><dd>{st.toneManner.typography}</dd>
                <dt>画</dt><dd>{st.toneManner.imagery}</dd>
              </dl>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>クリエイティブブリーフ</h3>
              <p className="headline" style={{ fontSize: 16, margin: "0 0 8px" }}>{st.creativeBrief.proposition}</p>
              <dl>
                <dt>背景</dt><dd>{st.creativeBrief.background}</dd>
                <dt>目的</dt><dd>{st.creativeBrief.objective}</dd>
                <dt>対象</dt><dd>{st.creativeBrief.target}</dd>
                <dt>本音</dt><dd>{st.creativeBrief.insight}</dd>
                <dt>信じる理由</dt><dd>{st.creativeBrief.reasonsToBelieve.join(" / ")}</dd>
                <dt>トーン</dt><dd>{st.creativeBrief.tone}</dd>
                <dt>必須</dt><dd>{st.creativeBrief.mandatories.join(" / ")}</dd>
                <dt>成果物</dt><dd>{st.creativeBrief.deliverables.join(" / ")}</dd>
                <dt>KPI</dt><dd>{st.creativeBrief.kpis.join(" / ")}</dd>
              </dl>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// 段階ごとの気持ち(-2〜2)を折れ線で。色だけに頼らず、点の横に気持ちの言葉を添える
function EmotionMap({ stages }) {
  const W = 720, H = 220, P = 36;
  const n = Math.max(1, stages.length - 1);
  const x = (i) => P + (i / n) * (W - P * 2);
  const y = (s) => P + ((2 - Math.max(-2, Math.min(2, Number(s) || 0))) / 4) * (H - P * 2);
  const d = stages.map((e, i) => `${i ? "L" : "M"}${x(i)},${y(e.score)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} className="emap" role="img" aria-label="感情マップ">
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} className="axis" />
      <text x={4} y={P + 4} className="axis-label">最高</text>
      <text x={4} y={H - P + 4} className="axis-label">最悪</text>
      <path d={d} className="emap-line" />
      {stages.map((e, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(e.score)} r={6} className={Number(e.score) >= 0 ? "emap-dot pos" : "emap-dot neg"} />
          <text x={x(i)} y={y(e.score) - 12} textAnchor="middle" className="emap-feel">{e.feeling.slice(0, 10)}</text>
          <text x={x(i)} y={H + 20} textAnchor="middle" className="axis-label">{e.stage.slice(0, 8)}</text>
        </g>
      ))}
    </svg>
  );
}
