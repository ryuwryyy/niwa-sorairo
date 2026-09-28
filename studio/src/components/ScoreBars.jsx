/** 批評スコア（6 基準 × 5 点）。DESIGN.md §8 のルーブリック。 */
const CRITERIA = [
  { key: "concept", ja: "コンセプト", q: "ブリーフの約束が一目で伝わるか" },
  { key: "composition", ja: "構図", q: "視線誘導と余白" },
  { key: "hierarchy", ja: "階層", q: "見出しゾーン / 情報の順序" },
  { key: "color", ja: "配色", q: "60-30-10 と参照配色との整合" },
  { key: "craft", ja: "仕上げ", q: "破綻（手・文字・パース）の無さ" },
  { key: "brand", ja: "ブランド適合", q: "トーン語との一致" },
];

export { CRITERIA };

export default function ScoreBars({ scores = {}, total = null }) {
  const sum = total ?? CRITERIA.reduce((a, c) => a + (Number(scores[c.key]) || 0), 0);
  return (
    <div className="scorebars">
      {CRITERIA.map((c) => {
        const v = Math.max(0, Math.min(5, Number(scores[c.key]) || 0));
        return (
          <div className="scorebar" key={c.key} title={c.q}>
            <span className="k small">{c.ja}</span>
            <span className="track" role="img" aria-label={`${c.ja} ${v} / 5`}>
              <span className={`fill s${Math.round(v)}`} style={{ width: `${(v / 5) * 100}%` }} />
            </span>
            <span className="v mono small">{v}</span>
          </div>
        );
      })}
      <div className="scorebar total">
        <span className="k small">合計</span>
        <span className="track"><span className="fill" style={{ width: `${(sum / 30) * 100}%` }} /></span>
        <span className="v mono small">{sum}/30</span>
      </div>
    </div>
  );
}
