import { useMemo, useRef, useState } from "react";
import {
  DEFAULT_THEME, DEFAULT_KEYWORDS, xSearchUrl, igTagUrl, xApiQuery,
  screeningQuestions, tagQuestion, postState, selectTop, topTags, usefulness,
  coordinates, quadrantOf, QUADRANTS, FEELINGS, INTENSITY, literalWords,
  toFigJamReport, toMarkdown, parsePastedPosts, dedupe,
} from "../lib/report";
import { applyRules, reasonCounts, sourceQuestion, isPersonal, EXCLUDE_DEFAULTS } from "../lib/filters";
import { analyze, forClaude, NoClaudeKeyError } from "../lib/analyze";
import { collectWithBrave, estimateQueries, NoBraveKeyError } from "../lib/brave";
import { parseCSV, guessColumns, toCSV, download } from "../lib/csv";
import Strategy from "../components/Strategy";
import { STRATEGY_MAX_POSTS } from "../lib/strategy";
import { useClassifier, NoKeyBanner, DemoBanner, Progress, Level, useToast, copyText } from "../components/Bits";

const STEPS = ["ふるい分け", "カテゴリーとタグ", "グループの要約", "洞察とデコンテ"];
// 費用の目安(1回あたり): Claude は要約・洞察ごとに1回、Jev は1投稿ごとに1回。要約と洞察はボタンを押したときだけ呼ぶ

export default function Report() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [keywordsText, setKeywordsText] = useState(DEFAULT_KEYWORDS.join("\n"));
  const [mode, setMode] = useState("brave");
  const [brave, setBrave] = useState({ sites: ["x"], pages: 5, freshness: "", target: 1000, replyAuthors: 20 });
  const [braveRun, setBraveRun] = useState(null); // { running, queries, found, label, posts, error }
  const braveCtrl = useRef(null);
  const [paste, setPaste] = useState("");
  const [csv, setCsv] = useState(null);
  const [keep, setKeep] = useState(100);
  const [excl, setExcl] = useState(EXCLUDE_DEFAULTS); // 公式・広告・宣伝の除外
  const [jevExcluded, setJevExcluded] = useState([]);
  const [summarizing, setSummarizing] = useState({}); // 感情語 → 要約中か

  const [screened, setScreened] = useState(null); // 全件のJev結果
  const [rows, setRows] = useState(null);         // 選んだ上位N件
  const [categories, setCategories] = useState(null);
  const [analyses, setAnalyses] = useState({});   // 感情語 → Claudeの要約
  const [synthesis, setSynthesis] = useState(null);
  const [strategy, setStrategy] = useState(null); // 戦略シート(押したときだけ)
  const [step, setStep] = useState(null);
  const [error, setError] = useState(null);
  const [noClaude, setNoClaude] = useState(false);
  const [picked, setPicked] = useState(null);

  const clf = useClassifier();
  const [toastEl, toast] = useToast();
  const keywords = keywordsText.split(/\n/).map((k) => k.trim()).filter(Boolean);

  const { posts, ruleExcluded } = useMemo(() => {
    let list = [];
    if (mode === "paste") list = parsePastedPosts(paste);
    else if (mode === "brave") list = braveRun?.posts || [];
    else if (csv) {
      const c = csv.cols;
      list = csv.rows.map((r) => ({ text: (r[c.text] || "").trim(), url: c.url >= 0 ? r[c.url] : null, author: c.author >= 0 ? r[c.author] : "", date: c.date >= 0 ? r[c.date] : "" }));
    }
    // ルールでの除外は無料。Jev に渡す件数(= 費用)を先に減らす
    const { kept, excluded } = applyRules(list.filter((p) => p.text.length >= 4), excl);
    return { posts: dedupe(kept).map((p, i) => ({ ...p, id: `p${i + 1}` })), ruleExcluded: excluded };
  }, [mode, paste, csv, braveRun, excl]);

  const runBrave = async () => {
    braveCtrl.current?.abort();
    braveCtrl.current = new AbortController();
    setBraveRun({ running: true, queries: 0, found: 0, label: "開始", posts: [] });
    try {
      const out = await collectWithBrave({ ...brave, keywords, excludeMarketing: excl.on }, {
        signal: braveCtrl.current.signal,
        onProgress: (p) => setBraveRun((r) => ({ ...r, ...p })),
      });
      setBraveRun((r) => ({ ...r, running: false, posts: out.posts, queries: out.queries }));
    } catch (e) {
      const msg = e instanceof NoBraveKeyError ? "サーバーに BRAVE_API_KEY が設定されていません" : e.name === "AbortError" ? "中断しました" : e.message;
      setBraveRun((r) => ({ ...r, running: false, error: msg }));
    }
  };
  const toggleSite = (site) => setBrave((b) => ({
    ...b, sites: b.sites.includes(site) ? b.sites.filter((x) => x !== site) : [...b.sites, site],
  }));

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
    setRows(null); setCategories(null); setAnalyses({}); setSynthesis(null); setStrategy(null); setJevExcluded([]);
    const useSource = excl.on && excl.useJev;
    const questions = { ...screeningQuestions(theme), ...(useSource ? sourceQuestion() : {}) };
    const out = await clf.run(posts.map((p) => ({ id: p.id, state: postState(p, theme) })), questions, { forceDemo });
    if (!out) { setStep(null); return null; }
    const all = posts.map((p) => {
      const a = out.answers.get(p.id);
      if (!a) return null;
      return {
        ...p, usable: a.usable.noul, depth: a.depth.score,
        feeling: a.feeling.choice, feelingConf: a.feeling.confidence, feelingProbs: a.feeling.probabilities,
        intensity: a.intensity.score, literal: literalWords(p.text),
        source: a.source?.choice || null, personal: isPersonal(a.source),
      };
    }).filter(Boolean);
    setJevExcluded(all.filter((r) => !r.personal).map((r) => ({ ...r, reasons: [`Jev: ${r.source}`] })));
    const top = selectTop(all.filter((r) => r.personal), keep).map((r) => {
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

  // 3. 感情語グループの要約。費用を抑えるため、押したグループだけ Claude を1回呼ぶ
  const summarizeGroup = async (g) => {
    setError(null);
    setSummarizing((s) => ({ ...s, [g.label]: true }));
    try {
      const res = await analyze("group", { theme, group: g.label, posts: forClaude(g.rows) });
      setAnalyses((a) => ({ ...a, [g.label]: res }));
    } catch (e) { fail(e); }
    setSummarizing((s) => ({ ...s, [g.label]: false }));
  };

  // 4. 全体の洞察とデコンテ(押したときだけ。要約済みのグループがあればそれも渡す)
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

  // まとめて実行するのは、ふるい分けとカテゴリー(Claude 1回)まで。要約・洞察はクリックで
  const runAll = async (forceDemo) => {
    const top = await runScreening(forceDemo);
    if (!top?.length) return;
    await runCategories(top, forceDemo);
  };

  const groups = useMemo(() => (rows ? groupsOf(rows).map((g) => ({ ...g, analysis: analyses[g.label] })) : []), [rows, analyses]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map((rows || []).map((r) => [r.id, r])), [rows]);
  const stats = screened && {
    total: screened.length, usable: screened.filter((r) => r.usable >= 0.5 && r.personal).length,
    ruleExcluded: ruleExcluded.length, jevExcluded: jevExcluded.length,
  };
  const excludedAll = [...ruleExcluded, ...jevExcluded];
  const busy = step !== null || clf.running;

  const exportMd = () => download(`social-deepdive-${new Date().toISOString().slice(0, 10)}.md`,
    toMarkdown({ theme, rows, categories, groups, synthesis, stats, strategy }), "text/markdown;charset=utf-8");
  const exportCsv = () => download(`social-deepdive-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(
    ["id", "本文", "URL", "感情語", "強さ(0-3)", "象限", "タグ", "使える度", "本文中の言葉"],
    rows.map((r) => [r.id, r.text, r.url || "", r.feeling, r.intensity.toFixed(2), QUADRANTS.find((q) => q.id === r.quadrant).name, (r.tags || []).join("/"), usefulness(r).toFixed(2), r.literal.join("/")]),
  ));
  const exportFigJam = () => copyText(JSON.stringify(toFigJamReport({ theme, rows, groups, synthesis, strategy })), toast, "FigJam用データ");

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
              <button aria-pressed={mode === "brave"} onClick={() => setMode("brave")}>Braveで集める</button>
              <button aria-pressed={mode === "csv"} onClick={() => setMode("csv")}>CSV</button>
              <button aria-pressed={mode === "paste"} onClick={() => setMode("paste")}>貼り付け</button>
            </div>
          </div>
          {mode === "brave" ? (
            <div className="field">
              <div className="row">
                <label className="hint"><input type="checkbox" checked={brave.sites.includes("x")} onChange={() => toggleSite("x")} /> X</label>
                <label className="hint"><input type="checkbox" checked={brave.sites.includes("instagram")} onChange={() => toggleSite("instagram")} /> Instagram</label>
                <label className="hint">期間
                  <select value={brave.freshness} onChange={(e) => setBrave({ ...brave, freshness: e.target.value })} style={{ width: "auto", marginLeft: 4 }}>
                    <option value="">指定なし</option><option value="pw">1週間</option><option value="pm">1か月</option><option value="py">1年</option>
                  </select>
                </label>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <label className="hint">1キーワードあたり最大 <input type="number" min={1} max={10} value={brave.pages} onChange={(e) => setBrave({ ...brave, pages: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} style={{ width: 52 }} /> ページ(20件/ページ)</label>
                <label className="hint">目標 <input type="number" min={20} max={2000} value={brave.target} onChange={(e) => setBrave({ ...brave, target: Math.max(20, Math.min(2000, Number(e.target.value) || 1000)) })} style={{ width: 68 }} /> 件</label>
                <label className="hint">返信(コメント)を探す投稿者 <input type="number" min={0} max={50} value={brave.replyAuthors} onChange={(e) => setBrave({ ...brave, replyAuthors: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} style={{ width: 52 }} /> 人</label>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="hint num">最大 {estimateQueries({ ...brave, keywords })} クエリ</span>
                <span className="spacer" />
                {braveRun?.running
                  ? <button className="btn small" onClick={() => braveCtrl.current?.abort()}>中断</button>
                  : <button className="btn" disabled={!keywords.length || !brave.sites.length} onClick={runBrave}>Braveで集める</button>}
              </div>
              {braveRun && (
                <p className="hint num" style={{ color: braveRun.error ? "var(--warn)" : undefined }}>
                  {braveRun.error || `${braveRun.label} · ${braveRun.found}件 · ${braveRun.queries}クエリ`}
                </p>
              )}
              <p className="hint">
                Brave が索引した公開ページを検索します(X・Instagram を直接読みにはいきません)。本文は検索結果の抜粋なので、長い投稿は途中で切れることがあります。
                返信は「返信先: @投稿者」を含む公開ページを探すもので、スレッドのすべてのコメントが取れるわけではありません。
              </p>
              <p className="brave-attr">Powered by Brave</p>
            </div>
          ) : mode === "csv" ? (
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
          <details className="field">
            <summary>
              公式・広告・宣伝を除く{excl.on ? <span className="hint num"> · ルールで除外 {ruleExcluded.length}件{jevExcluded.length ? ` · Jevで除外 ${jevExcluded.length}件` : ""}</span> : <span className="hint"> · オフ</span>}
            </summary>
            <div className="row" style={{ marginTop: 6 }}>
              <label className="hint"><input type="checkbox" checked={excl.on} onChange={(e) => setExcl({ ...excl, on: e.target.checked })} /> 除外する</label>
              <label className="hint"><input type="checkbox" checked={excl.useJev} disabled={!excl.on} onChange={(e) => setExcl({ ...excl, useJev: e.target.checked })} /> Jevでも発信元を判定</label>
              <label className="hint">同じ投稿者は <input type="number" min={0} max={50} value={excl.maxPerAuthor} onChange={(e) => setExcl({ ...excl, maxPerAuthor: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} style={{ width: 52 }} /> 件まで</label>
            </div>
            <div className="grid-2" style={{ gap: 8, marginTop: 6 }}>
              <label className="field"><span>除外する@アカウント(空白・改行区切り)</span>
                <textarea rows={2} value={excl.blockHandles} onChange={(e) => setExcl({ ...excl, blockHandles: e.target.value })} placeholder="@brand_official @design_news" /></label>
              <label className="field"><span>除外する言葉</span>
                <textarea rows={2} value={excl.blockWords} onChange={(e) => setExcl({ ...excl, blockWords: e.target.value })} placeholder="資料請求 無料相談" /></label>
            </div>
            <p className="hint">
              まず無料のルールで外します: 広告表記(#PR・【PR】など)・キャンペーン・告知・求人・販促・アフィリエイト、表示名や@に「公式・株式会社・編集部・news」など、
              リンクやタグだけの投稿、複数アカウントの同じ文面、同じ投稿者の出しすぎ。Brave の検索にも除外語(-求人 -キャンペーン など)を付けます。
              残りは Jev が「企業・公式/広告・PR/メディア/告知・求人/自己宣伝/個人の声」を判定し、個人の声だけを残します。
            </p>
            {excludedAll.length > 0 && (
              <>
                <p className="hint num">{reasonCounts(excludedAll).map(([r, n]) => `${r} ${n}`).join(" · ")}</p>
                <div className="excluded">
                  {excludedAll.slice(0, 200).map((p, i) => (
                    <div key={p.url || p.id || i} className="post">
                      <div>{p.text}</div>
                      <div className="row" style={{ marginTop: 4 }}>
                        {p.reasons.map((r) => <span key={r} className="chip">{r}</span>)}
                        {p.author && <span className="hint">@{p.author}{p.authorName ? `(${p.authorName})` : ""}</span>}
                        <span className="spacer" />
                        {p.url && <a className="hint" href={p.url} target="_blank" rel="noreferrer">元の投稿 ↗</a>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </details>
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
            <li className={screened ? "done" : ""}><b>ふるい分け(Jev)</b> — 公式・広告をルールで外したあと、全件に「使えるか・具体性・感情語・強さ{excl.on && excl.useJev ? "・発信元" : ""}」を問い、個人の声で使える上位{keep}件を残す{stats && <span className="hint num"> · {stats.total}件中 使える{stats.usable}件 → {rows?.length}件(除外 ルール{stats.ruleExcluded}・Jev{stats.jevExcluded})</span>}</li>
            <li className={categories ? "done" : ""}><b>カテゴリー(Claude)とタグ(Jev)</b> — 残った投稿からカテゴリー体系をつくり、1件ずつタグ付け
              {rows && <button className="btn small ghost" disabled={busy} onClick={() => runCategories()}>やり直す</button>}</li>
            <li className={Object.keys(analyses).length ? "done" : ""}><b>感情語グループ</b> — 好き・いい・最高・感動・やばい・悪い・嫌い・最悪・くそ に分け、強さ(少し〜めっちゃ)を添える。要約・感情の動き・インサイト(Claude)は、見たいグループの「要約する」を押したときだけ(1回ずつ課金)</li>
            <li className={rows ? "done" : ""}><b>4象限マップ</b> — 横軸 嫌悪↔好意、縦軸 少し↔めっちゃ</li>
            <li className={synthesis ? "done" : ""}><b>洞察とデコンテ(Claude)</b> — 一段深いUI/UXの洞察と、アートディレクションの絵コンテ。押したときだけ(Claude 1回)
              {rows && <button className="btn small" disabled={busy} onClick={() => runSynthesis()}>{step === 3 ? "作成中…" : synthesis ? "つくり直す" : "洞察とデコンテをつくる"}</button>}</li>
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
                  ) : null}
                  <div className="row" style={{ margin: "6px 0" }}>
                    <button className="btn small" disabled={summarizing[g.label] || g.rows.length < 2}
                      onClick={() => summarizeGroup(g)} title="Claude を1回呼ぶ">
                      {summarizing[g.label] ? "要約中…" : g.analysis ? "要約し直す" : "要約する"}
                    </button>
                    {g.rows.length < 2 && <span className="hint">2件以上で要約できます</span>}
                  </div>
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

          <Strategy theme={theme} byId={byId} value={strategy} onChange={setStrategy} getInput={() => ({
            posts: forClaude([...rows].sort((a, b) => usefulness(b) - usefulness(a)).slice(0, STRATEGY_MAX_POSTS)),
            notes: [
              synthesis && `全体: ${synthesis.headline}`,
              ...groups.filter((g) => g.analysis).map((g) => `${g.label}(${g.rows.length}件): ${g.analysis.summary}`),
              ...QUADRANTS.map((q) => `${q.name}: ${rows.filter((r) => r.quadrant === q.id).length}件`),
            ].filter(Boolean).join("\n"),
          })} />
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
        {r.replyTo && <span className="hint">↳ @{r.replyTo} への返信</span>}
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
