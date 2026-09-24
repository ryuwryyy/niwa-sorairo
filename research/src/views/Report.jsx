import { useMemo, useState } from "react";
import {
  DEFAULT_THEME, DEFAULT_KEYWORDS, xSearchUrl, igTagUrl, xApiQuery,
  screeningQuestions, tagQuestion, postState, selectTop, topTags, usefulness,
  coordinates, quadrantOf, QUADRANTS, FEELINGS, INTENSITY, literalWords,
  toFigJamReport, toMarkdown, parsePastedPosts, dedupe,
} from "../lib/report";
import { analyze, forClaude, NoClaudeKeyError } from "../lib/analyze";
import { parseCSV, guessColumns, toCSV, download } from "../lib/csv";
import { useClassifier, NoKeyBanner, DemoBanner, Progress, Level, useToast, copyText } from "../components/Bits";

const STEPS = ["ふるい分け", "カテゴリーとタグ", "グループの要約", "洞察とデコンテ"];

export default function Report() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [keywordsText, setKeywordsText] = useState(DEFAULT_KEYWORDS.join("\n"));
  const [mode, setMode] = useState("csv");
  const [paste, setPaste] = useState("");
  const [csv, setCsv] = useState(null);
  const [keep, setKeep] = useState(100);

  const [screened, setScreened] = useState(null); // 全件のJev結果
  const [rows, setRows] = useState(null);         // 選んだ上位N件
  const [categories, setCategories] = useState(null);
  const [analyses, setAnalyses] = useState({});   // 感情語 → Claudeの要約
  const [synthesis, setSynthesis] = useState(null);
  const [step, setStep] = useState(null);
  const [error, setError] = useState(null);
  const [noClaude, setNoClaude] = useState(false);
  const [picked, setPicked] = useState(null);

  const clf = useClassifier();
  const [toastEl, toast] = useToast();
  const keywords = keywordsText.split(/\n/).map((k) => k.trim()).filter(Boolean);

  const posts = useMemo(() => {
    let list = [];
    if (mode === "paste") list = parsePastedPosts(paste);
    else if (csv) {
      const c = csv.cols;
      list = csv.rows.map((r) => ({ text: (r[c.text] || "").trim(), url: c.url >= 0 ? r[c.url] : null, author: c.author >= 0 ? r[c.author] : "", date: c.date >= 0 ? r[c.date] : "" }));
    }
    return dedupe(list.filter((p) => p.text.length >= 4)).map((p, i) => ({ ...p, id: `p${i + 1}` }));
  }, [mode, paste, csv]);

  const onFile = async (file) => {
    if (!file) return;
    const table = parseCSV(await file.text());
    if (table.length < 2) { toast("CSVに行がありません"); return; }
    const [header, ...body] = table;
    setCsv({ name: file.name, header, rows: body, cols: guessColumns(header) });
  };

  const fail = (e) => {
    if (e instanceof NoClaudeKeyError) setNoClaude(true);
    else setError(e.message);
    setStep(null);
    return null;
  };

  // 1. Jevで全件をふるい分け、上位N件を選ぶ
  const runScreening = async (forceDemo) => {
    setError(null); setStep(0);
    setRows(null); setCategories(null); setAnalyses({}); setSynthesis(null);
    const out = await clf.run(posts.map((p) => ({ id: p.id, state: postState(p, theme) })), screeningQuestions(theme), { forceDemo });
    if (!out) { setStep(null); return null; }
    const all = posts.map((p) => {
      const a = out.answers.get(p.id);
      if (!a) return null;
      return {
        ...p, usable: a.usable.noul, depth: a.depth.score,
        feeling: a.feeling.choice, feelingConf: a.feeling.confidence, feelingProbs: a.feeling.probabilities,
        intensity: a.intensity.score, literal: literalWords(p.text),
      };
    }).filter(Boolean);
    const top = selectTop(all, keep).map((r) => {
      const coord = coordinates(r);
      return { ...r, coord, quadrant: quadrantOf(coord).id, tags: [] };
    });
    setScreened(all);
    setRows(top);
    setStep(null);
    return top;
  };

  // 2. Claudeでカテゴリーをつくり、Jevでタグをつける
  const runCategories = async (base = rows, forceDemo) => {
    setError(null); setStep(1);
    let cats;
    try { cats = (await analyze("categories", { theme, posts: forClaude(base) })).categories; }
    catch (e) { return fail(e); }
    setCategories(cats);
    const out = await clf.run(base.map((r) => ({ id: r.id, state: postState(r, theme) })), tagQuestion(cats), { forceDemo });
    if (!out) { setStep(null); return null; }
    const tagged = base.map((r) => {
      const a = out.answers.get(r.id);
      return a ? { ...r, tags: topTags(a.category.probabilities) } : r;
    });
    setRows(tagged);
    setStep(null);
    return tagged;
  };

  const groupsOf = (list) => Object.keys(FEELINGS)
    .map((label) => ({ label, rows: list.filter((r) => r.feeling === label).sort((a, b) => usefulness(b) - usefulness(a)) }))
    .filter((g) => g.rows.length)
    .sort((a, b) => b.rows.length - a.rows.length);

  // 3. 感情語グループごとにClaudeで要約(並列)
  const runGroups = async (base = rows) => {
    setError(null); setStep(2);
    const next = {};
    try {
      await Promise.all(groupsOf(base).filter((g) => g.rows.length >= 2).map(async (g) => {
        next[g.label] = await analyze("group", { theme, group: g.label, posts: forClaude(g.rows) });
        setAnalyses((a) => ({ ...a, [g.label]: next[g.label] }));
      }));
    } catch (e) { return fail(e); }
    setStep(null);
    return next;
  };

  // 4. 全体の洞察とデコンテ
  const runSynthesis = async (base = rows, groupAnalyses = analyses) => {
    setError(null); setStep(3);
    try {
      const groups = groupsOf(base).map((g) => ({ label: g.label, count: g.rows.length, summary: groupAnalyses[g.label]?.summary || "" }));
      const quadrants = QUADRANTS.map((q) => ({ name: q.name, count: base.filter((r) => r.quadrant === q.id).length }));
      const sample = [...base].sort((a, b) => usefulness(b) - usefulness(a)).slice(0, 60);
      setSynthesis(await analyze("synthesis", { theme, groups, quadrants, posts: forClaude(sample) }));
    } catch (e) { return fail(e); }
    setStep(null);
    return true;
  };

  const runAll = async (forceDemo) => {
    const top = await runScreening(forceDemo);
    if (!top?.length) return;
    const tagged = await runCategories(top, forceDemo);
    if (!tagged) return;
    const g = await runGroups(tagged);
    if (!g) return;
    await runSynthesis(tagged, g);
  };

  const groups = useMemo(() => (rows ? groupsOf(rows).map((g) => ({ ...g, analysis: analyses[g.label] })) : []), [rows, analyses]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map((rows || []).map((r) => [r.id, r])), [rows]);
  const stats = screened && { total: screened.length, usable: screened.filter((r) => r.usable >= 0.5).length };
  const busy = step !== null || clf.running;

  const exportMd = () => download(`social-deepdive-${new Date().toISOString().slice(0, 10)}.md`,
    toMarkdown({ theme, rows, categories, groups, synthesis, stats }), "text/markdown;charset=utf-8");
  const exportCsv = () => download(`social-deepdive-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(
    ["id", "本文", "URL", "感情語", "強さ(0-3)", "象限", "タグ", "使える度", "本文中の言葉"],
    rows.map((r) => [r.id, r.text, r.url || "", r.feeling, r.intensity.toFixed(2), QUADRANTS.find((q) => q.id === r.quadrant).name, (r.tags || []).join("/"), usefulness(r).toFixed(2), r.literal.join("/")]),
  ));
  const exportFigJam = () => copyText(JSON.stringify(toFigJamReport({ theme, rows, groups, synthesis })), toast, "FigJam用データ");

  const Cite = ({ ids }) => (ids || []).map((id) => byId.get(id)).filter(Boolean).map((r) => (
    <a key={r.id} className="chip" href={r.url || undefined} target="_blank" rel="noreferrer" title={r.text} style={{ marginRight: 4 }}>{r.id}</a>
  ));

  return (
    <>
      {clf.noKey && <NoKeyBanner onDemo={() => { clf.enableDemo(); runAll(true); }} />}
      {clf.demo && <DemoBanner />}
      {noClaude && (
        <div className="banner warn">
          サーバーに <code>ANTHROPIC_API_KEY</code> が設定されていないため、カテゴリー作成・要約・洞察(Claude)は動きません。
          Jevでのふるい分けと4象限マップまでは使えます。
        </div>
      )}

      <div className="grid-2">
        <section className="panel">
          <h2>0. 投稿を集める</h2>
          <label className="field">
            <span>調査テーマ</span>
            <input type="text" value={theme} onChange={(e) => setTheme(e.target.value)} />
          </label>
          <label className="field">
            <span>検索キーワード(1行1語。関連語を足して広げる)</span>
            <textarea rows={5} value={keywordsText} onChange={(e) => setKeywordsText(e.target.value)} />
          </label>
          <details>
            <summary>キーワードごとの検索リンクと X API のクエリ</summary>
            <table className="list" style={{ marginTop: 8 }}>
              <tbody>
                {keywords.map((k) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td><a href={xSearchUrl(k)} target="_blank" rel="noreferrer">X(最新)</a></td>
                    <td><a href={igTagUrl(k)} target="_blank" rel="noreferrer">Instagram #タグ</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">X API(recent search)の query:</p>
            <pre className="code">{xApiQuery(keywords)}</pre>
            <p className="hint">
              X・Instagram は規約で自動収集(スクレイピング)を禁じています。公式API、ソーシャルリスニングツールの書き出し、
              または手で集めたものをCSVにして読み込んでください。本文と元投稿のURLの列があれば、リンク付きで最後まで引き継ぎます。
            </p>
          </details>

          <div className="row" style={{ margin: "14px 0 10px" }}>
            <div className="seg-toggle" role="group" aria-label="入力方法">
              <button aria-pressed={mode === "csv"} onClick={() => setMode("csv")}>CSV</button>
              <button aria-pressed={mode === "paste"} onClick={() => setMode("paste")}>貼り付け</button>
            </div>
          </div>
          {mode === "csv" ? (
            <div className="field">
              <input type="file" accept=".csv,.tsv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
              {csv && (
                <div className="row" style={{ marginTop: 8 }}>
                  {["text", "url", "author", "date"].map((k) => (
                    <label key={k} style={{ fontSize: 12 }}>
                      {{ text: "本文", url: "元投稿URL", author: "投稿者", date: "日時" }[k]}
                      <select value={csv.cols[k]} onChange={(e) => setCsv({ ...csv, cols: { ...csv.cols, [k]: Number(e.target.value) } })}>
                        <option value={-1}>—</option>
                        {csv.header.map((h, i) => <option key={i} value={i}>{h || `列${i + 1}`}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <label className="field">
              <span>1行1投稿(空行区切りも可)。行の中の https://… は元投稿のリンクとして使います</span>
              <textarea rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} />
            </label>
          )}
          <div className="row">
            <span className="hint num">{posts.length} 件(重複除去後)</span>
            <span className="spacer" />
            <label className="hint">残す件数 <input type="number" min={20} max={150} value={keep} onChange={(e) => setKeep(Math.max(20, Math.min(150, Number(e.target.value) || 100)))} style={{ width: 64 }} /></label>
            <button className="btn primary" disabled={!posts.length || busy} onClick={() => runAll()}>
              {busy ? `${STEPS[step] ?? "判定"}中…` : "まとめて分析する"}
            </button>
          </div>
          <Progress progress={clf.progress} onCancel={clf.cancel} />
          {(error || clf.error) && <p className="hint" style={{ color: "var(--warn)" }}>{error || clf.error}</p>}
        </section>

        <section className="panel">
          <h2>流れ</h2>
          <ol className="steps">
            <li className={screened ? "done" : ""}><b>ふるい分け(Jev)</b> — 全件に「使えるか・具体性・感情語・強さ」を問い、使える上位{keep}件を残す{stats && <span className="hint num"> · {stats.total}件中 使える{stats.usable}件 → {rows?.length}件</span>}</li>
            <li className={categories ? "done" : ""}><b>カテゴリー(Claude)とタグ(Jev)</b> — 残った投稿からカテゴリー体系をつくり、1件ずつタグ付け
              {rows && <button className="btn small ghost" disabled={busy} onClick={() => runCategories()}>やり直す</button>}</li>
            <li className={Object.keys(analyses).length ? "done" : ""}><b>感情語グループ</b> — 好き・いい・最高・感動・やばい・悪い・嫌い・最悪・くそ に分け、強さ(少し〜めっちゃ)を添えて、グループごとに要約・感情の動き・インサイト(Claude)
              {rows && <button className="btn small ghost" disabled={busy} onClick={() => runGroups()}>やり直す</button>}</li>
            <li className={rows ? "done" : ""}><b>4象限マップ</b> — 横軸 嫌悪↔好意、縦軸 少し↔めっちゃ</li>
            <li className={synthesis ? "done" : ""}><b>洞察とデコンテ(Claude)</b> — 一段深いUI/UXの洞察と、アートディレクションの絵コンテ
              {rows && <button className="btn small ghost" disabled={busy} onClick={() => runSynthesis()}>やり直す</button>}</li>
          </ol>
          {rows && (
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn small" onClick={exportFigJam} title="figma-plugin/ のプラグインに貼り付け">FigJamへ(コピー)</button>
              <button className="btn small" onClick={exportMd}>レポート(Markdown)</button>
              <button className="btn small" onClick={exportCsv}>CSV</button>
            </div>
          )}
        </section>
      </div>

      {rows && (
        <>
          {synthesis && (
            <section className="panel" style={{ marginTop: 20 }}>
              <p className="headline">{synthesis.headline}</p>
            </section>
          )}

          <div className="grid-2" style={{ marginTop: 16 }}>
            <section className="panel">
              <h2>4象限マップ</h2>
              <QuadrantMap rows={rows} picked={picked} onPick={setPicked} readings={synthesis?.quadrantReading} />
              {picked && byId.get(picked) && <PostCard r={byId.get(picked)} />}
            </section>
            <section className="panel">
              <h2>カテゴリー</h2>
              {categories ? categories.map((c) => {
                const n = rows.filter((r) => r.tags?.includes(c.label)).length;
                return (
                  <div key={c.label} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                    <div className="row"><b>{c.label}</b><span className="spacer" /><span className="hint num">{n}件</span></div>
                    <div className="hint">{c.description}</div>
                  </div>
                );
              }) : <p className="hint">カテゴリーはまだありません。</p>}
            </section>
          </div>

          <section className="panel" style={{ marginTop: 16 }}>
            <h2>感情語グループ</h2>
            <div className="groups">
              {groups.map((g) => (
                <div className="group" key={g.label}>
                  <div className="row">
                    <h3 style={{ margin: 0, color: "var(--ink)", fontWeight: 700 }}>{g.label}</h3>
                    <span className="hint num">{g.rows.length}件 · 平均の強さ {avg(g.rows.map((r) => r.intensity)).toFixed(1)}/3</span>
                  </div>
                  {g.analysis ? (
                    <>
                      <p style={{ margin: "8px 0" }}>{g.analysis.summary}</p>
                      <div className="arc">
                        <span>{g.analysis.emotionArc.trigger}</span><i>→</i>
                        <span>{g.analysis.emotionArc.reaction}</span><i>→</i>
                        <span>{g.analysis.emotionArc.afterglow}</span>
                      </div>
                      <ul className="insights">
                        {g.analysis.insights.map((i, k) => <li key={k}>{i.text} <Cite ids={i.evidenceIds} /></li>)}
                      </ul>
                    </>
                  ) : step === 2 ? <p className="hint">要約中…</p> : null}
                  <details>
                    <summary>投稿を見る</summary>
                    {g.rows.map((r) => <PostCard key={r.id} r={r} />)}
                  </details>
                </div>
              ))}
            </div>
          </section>

          {synthesis && (
            <>
              <section className="panel" style={{ marginTop: 16 }}>
                <h2>一段深いUI/UXの洞察</h2>
                {synthesis.uxInsights.map((u, i) => (
                  <div key={i} className="insight">
                    <h3>{i + 1}. {u.insight}</h3>
                    <p><b>なぜ</b> {u.why}</p>
                    <p><b>設計への示唆</b> {u.designImplication}</p>
                    <div><Cite ids={u.evidenceIds} /></div>
                  </div>
                ))}
                <h3 style={{ marginTop: 16 }}>デザイン原則</h3>
                <div className="row">{synthesis.principles.map((p) => <span key={p} className="chip" style={{ fontSize: 13 }}>{p}</span>)}</div>
              </section>

              <section className="panel" style={{ marginTop: 16 }}>
                <h2>デコンテ(アートディレクション)</h2>
                <div className="deconte">
                  {synthesis.deconte.map((d, i) => (
                    <div className="panel-frame" key={i}>
                      <div className="beat"><span className="num">{String(i + 1).padStart(2, "0")}</span> {d.beat}</div>
                      <p className="scene">{d.scene}</p>
                      <dl>
                        <dt>画づくり</dt><dd>{d.visual}</dd>
                        <dt>言葉</dt><dd>{d.copyTone}</dd>
                        <dt>色と光</dt><dd>{d.colorLight}</dd>
                        <dt>書体</dt><dd>{d.typography}</dd>
                        <dt>動き・音</dt><dd>{d.motionSound}</dd>
                      </dl>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
      {toastEl}
    </>
  );
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function PostCard({ r }) {
  return (
    <div className="post">
      <div>{r.text}</div>
      <div className="row" style={{ marginTop: 4 }}>
        <span className="chip">{r.feeling}</span>
        <Level value={r.intensity} label="強さ" />
        {(r.tags || []).map((t) => <span key={t} className="chip">{t}</span>)}
        {r.literal.length > 0 && <span className="hint">本文: {r.literal.join("・")}</span>}
        <span className="spacer" />
        {r.url && <a className="hint" href={r.url} target="_blank" rel="noreferrer">元の投稿 ↗</a>}
      </div>
    </div>
  );
}

// 横軸 嫌悪(-1)↔好意(+1)、縦軸 少し(0)↔めっちゃ(1)。点は1投稿、クリックで詳細
function QuadrantMap({ rows, picked, onPick, readings }) {
  const S = 520, P = 36, W = S - P * 2;
  const px = (x) => P + ((x + 1) / 2) * W;
  const py = (y) => P + (1 - y) * W;
  // 同じ位置に重なる点は、黄金角の渦巻きで外へ逃がす(並びは決定的)
  const placed = useMemo(() => {
    const buckets = new Map();
    return rows.map((r) => {
      const x = px(r.coord.x), y = py(r.coord.y);
      const key = `${Math.round(x / 8)}:${Math.round(y / 8)}`;
      const k = buckets.get(key) || 0;
      buckets.set(key, k + 1);
      const rad = 7 * Math.sqrt(k), ang = k * 2.39996;
      return { r, cx: x + rad * Math.cos(ang), cy: y + rad * Math.sin(ang) };
    });
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = Object.fromEntries(QUADRANTS.map((q) => [q.id, rows.filter((r) => r.quadrant === q.id).length]));
  const corner = { fever: [S - P - 6, P + 16, "end"], like: [S - P - 6, S - P - 10, "end"], friction: [P + 6, S - P - 10, "start"], reject: [P + 6, P + 16, "start"] };
  return (
    <>
      <svg viewBox={`0 0 ${S} ${S}`} className="qmap" role="img" aria-label="4象限マップ">
        <rect x={px(0)} y={P} width={W / 2} height={W / 2} className="q-fever" />
        <rect x={px(0)} y={py(0.5)} width={W / 2} height={W / 2} className="q-like" />
        <rect x={P} y={py(0.5)} width={W / 2} height={W / 2} className="q-friction" />
        <rect x={P} y={P} width={W / 2} height={W / 2} className="q-reject" />
        <line x1={px(0)} y1={P} x2={px(0)} y2={S - P} className="axis" />
        <line x1={P} y1={py(0.5)} x2={S - P} y2={py(0.5)} className="axis" />
        <text x={P} y={S - 10} className="axis-label">← 嫌悪</text>
        <text x={S - P} y={S - 10} textAnchor="end" className="axis-label">好意 →</text>
        <text x={px(0) + 6} y={P - 10} className="axis-label">↑ めっちゃ</text>
        <text x={px(0) + 6} y={S - P + 18} className="axis-label">↓ 少し</text>
        {QUADRANTS.map((q) => {
          const [x, y, anchor] = corner[q.id];
          return <text key={q.id} x={x} y={y} textAnchor={anchor} className="q-label">{q.name} <tspan className="num">{counts[q.id]}</tspan></text>;
        })}
        {placed.map(({ r, cx, cy }) => (
          <circle key={r.id} cx={cx} cy={cy} r={picked === r.id ? 8 : 5.5}
            className={`dot${picked === r.id ? " on" : ""}`} onClick={() => onPick(r.id)}>
            <title>{`${r.feeling}・強さ${r.intensity.toFixed(1)} — ${r.text.slice(0, 80)}`}</title>
          </circle>
        ))}
      </svg>
      {readings?.length > 0 && (
        <div className="readings">
          {QUADRANTS.map((q) => {
            const rd = readings.find((x) => x.quadrant.includes(q.name));
            return rd ? <p key={q.id}><b>{q.name}</b> {rd.reading}</p> : null;
          })}
        </div>
      )}
      <p className="hint">点をクリックすると投稿を表示。強さは {INTENSITY[0]} 〜 {INTENSITY[3]}。</p>
    </>
  );
}
