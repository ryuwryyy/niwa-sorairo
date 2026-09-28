/**
 * 「アイデアの検査」— craft.ideaTests の 10 問をチェックし、weight 付きで 100 点に換算する。
 * チェックが目的ではなく、落ちた項目が次に直すところになる。
 */
import { testScore } from "../lib/idea";

export default function IdeaTests({ tests = {}, ideaTests = [], onChange, idPrefix = "t" }) {
  const list = Array.isArray(ideaTests) ? ideaTests : [];
  const s = testScore(tests, list);

  if (!list.length) {
    return <p className="small muted" style={{ margin: 0 }}>検査項目のデータがまだありません。</p>;
  }

  const toggle = (id) => onChange({ ...tests, [id]: !tests?.[id] });

  return (
    <div className="idea-tests">
      <div className="scorebar" title="重み付きの通過率">
        <span className="k small">検査</span>
        <span className="track" role="img" aria-label={`検査 ${s.pct} 点`}>
          <span className={`fill ${s.pct >= 80 ? "s5" : s.pct >= 50 ? "s3" : "s1"}`} style={{ width: `${s.pct}%` }} />
        </span>
        <span className="v mono small">{s.pct}</span>
      </div>
      <ul className="testlist">
        {list.map((t) => (
          <li key={t.id}>
            <label className="row small" style={{ gap: 6, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                id={`${idPrefix}-${t.id}`}
                checked={!!tests?.[t.id]}
                onChange={() => toggle(t.id)}
              />
              <span>
                <strong>{t.ja}</strong>
                {t.questionJa ? <><br /><span className="muted">{t.questionJa}</span></> : null}
              </span>
              {Number(t.weight) > 1 ? <span className="badge right">×{t.weight}</span> : null}
            </label>
          </li>
        ))}
      </ul>
      <p className="help" style={{ margin: 0 }}>{s.passed}/{s.count} 項目 · 重み付き {s.pct} 点</p>
    </div>
  );
}
