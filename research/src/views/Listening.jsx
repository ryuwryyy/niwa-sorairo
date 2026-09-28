import { useMemo, useState } from "react";
import { socialQuestions, socialState, SENTIMENTS, INTENTS, DEFAULT_TOPICS, parseLabels } from "../lib/presets";
import { parseCSV, guessColumns, splitPosts, toCSV, download } from "../lib/csv";
import { SAMPLE_CONTEXT, SAMPLE_POSTS } from "../lib/samples";
import { applyRules, reasonCounts } from "../lib/filters";
import { toFigJamListening, listeningForStrategy, strategyToMarkdown } from "../lib/strategy";
import Strategy from "../components/Strategy";
import { useClassifier, NoKeyBanner, DemoBanner, Progress, Conf, Level, LOW_CONF, useToast, copyText } from "../components/Bits";

// 感情は極性なので、青(ポジ)↔灰(中立)↔赤(ネガ)の発散配色。凡例と表で色だけに頼らない
const SENT_ORDER = ["ポジティブ", "中立", "混在", "ネガティブ"];
const SENT_VAR = { "ポジティブ": "var(--pos)", "中立": "var(--neu)", "混在": "var(--mix)", "ネガティブ": "var(--neg)" };

const needsReview = (r) => !r.error && Math.min(r.sentConf, r.topicConf, r.intentConf) < LOW_CONF;

export default function Listening() {
  const [mode, setMode] = useState("paste");
  const [paste, setPaste] = useState("");
  const [csv, setCsv] = useState(null);
  const [context, setContext] = useState("");
  const [topicsText, setTopicsText] = useState(DEFAULT_TOPICS);
  const [rows, setRows] = useState(null);
  const [strategy, setStrategy] = useState(null); // 戦略シート(押したときだけ Claude)
  const [noMarketing, setNoMarketing] = useState(true); // 公式・広告・宣伝をルールで外す(無料。Jevの件数も減る)
  const [filter, setFilter] = useState({ topic: "", sentiment: "", onlyRelevant: true, onlyReview: false });
  const clf = useClassifier();
  const [toastEl, toast] = useToast();

  const topics = useMemo(() => parseLabels(topicsText), [topicsText]);

  const rawPosts = useMemo(() => {
    if (mode === "paste") return splitPosts(paste).map((text, i) => ({ id: `p${i + 1}`, text }));
    if (!csv) return [];
    const c = csv.cols;
    return csv.rows
      .map((r, i) => ({
        id: `p${i + 1}`,
        text: (r[c.text] || "").trim(),
        date: c.date >= 0 ? r[c.date] : "",
        url: c.url >= 0 ? r[c.url] : "",
        author: c.author >= 0 ? r[c.author] : "",
        likes: c.likes >= 0 ? Number(r[c.likes]) || 0 : null,
      }))
      .filter((p) => p.text.length >= 4);
  }, [mode, paste, csv]);

  const { posts, excluded } = useMemo(() => {
    const { kept, excluded } = applyRules(rawPosts, { on: noMarketing });
    return { posts: kept, excluded };
  }, [rawPosts, noMarketing]);

  const onFile = async (file) => {
    if (!file) return;
    const table = parseCSV(await file.text());
    if (table.length < 2) { toast("CSVに行がありません"); return; }
    const [header, ...body] = table;
    setCsv({ name: file.name, header, rows: body, cols: guessColumns(header) });
  };

  const loadSample = () => { setMode("paste"); setPaste(SAMPLE_POSTS); setContext(SAMPLE_CONTEXT); };

  const start = async (forceDemo) => {
    if (!posts.length) return;
    const questions = socialQuestions({ context, topicsText });
    const items = posts.map((p) => ({ id: p.id, state: socialState(p, context) }));
    setRows(null); setStrategy(null);
    const out = await clf.run(items, questions, { forceDemo });
    if (!out) return;
    setRows(posts.map((p) => {
      const a = out.answers.get(p.id);
      if (!a) return { ...p, error: out.errors.get(p.id) || "未判定" };
      return {
        ...p,
        relevant: a.relevant.noul,
        sentiment: a.sentiment.choice, sentConf: a.sentiment.confidence,
        topic: a.topic.choice, topicConf: a.topic.confidence, topicProbs: a.topic.probabilities,
        intent: a.intent.choice, intentConf: a.intent.confidence,
        severity: a.severity.score,
      };
    }));
  };

  const edit = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch, edited: true } : r)));

  const ok = (rows || []).filter((r) => !r.error);
  const relevant = ok.filter((r) => r.relevant >= 0.5);

  const byTopic = useMemo(() => {
    const m = Object.keys(topics).map((t) => {
      const list = relevant.filter((r) => r.topic === t);
      return { topic: t, total: list.length, counts: Object.fromEntries(SENT_ORDER.map((s) => [s, list.filter((r) => r.sentiment === s).length])) };
    }).filter((x) => x.total);
    return m.sort((a, b) => b.total - a.total);
  }, [rows, topics]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxTopic = Math.max(1, ...byTopic.map((x) => x.total));
  const urgent = relevant
    .filter((r) => r.severity >= 1.5)
    .sort((a, b) => b.severity - a.severity || (b.likes ?? 0) - (a.likes ?? 0))
    .slice(0, 8);

  const shown = ok.filter((r) =>
    (!filter.onlyRelevant || r.relevant >= 0.5) &&
    (!filter.onlyReview || needsReview(r)) &&
    (!filter.topic || r.topic === filter.topic) &&
    (!filter.sentiment || r.sentiment === filter.sentiment));

  const byId = useMemo(() => new Map(ok.map((r) => [r.id, r])), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportFigJam = () => copyText(JSON.stringify(toFigJamListening({ title: context ? `${context.slice(0, 40)} — ソーシャルリスニング` : "", rows: ok, topics, strategy })), toast, "FigJam用データ");
  const exportMd = () => download(`strategy-${new Date().toISOString().slice(0, 10)}.md`,
    `# ${context || "ソーシャルリスニング"} — 戦略シート\n\n${strategyToMarkdown(strategy, (ids) => (ids || []).map((id) => byId.get(id)).filter(Boolean).map((r) => (r.url ? `[${r.id}](${r.url})` : r.id)).join(" "))}`,
    "text/markdown;charset=utf-8");

  const exportCSV = () => {
    const header = ["本文", "関連度", "感情", "感情_確信度", "話題", "話題_確信度", "意図", "意図_確信度", "深刻度(0-3)", "要確認", "手修正", "日時", "投稿者", "いいね", "URL"];
    const body = ok.map((r) => [
      r.text, r.relevant.toFixed(2), r.sentiment, r.sentConf.toFixed(2), r.topic, r.topicConf.toFixed(2),
      r.intent, r.intentConf.toFixed(2), r.severity.toFixed(2), needsReview(r) ? "要確認" : "", r.edited ? "手修正" : "",
      r.date || "", r.author || "", r.likes ?? "", r.url || "",
    ]);
    download(`social-listening-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(header, body));
  };

  return (
    <>
      {clf.noKey && <NoKeyBanner onDemo={() => { clf.enableDemo(); start(true); }} />}
      {clf.demo && <DemoBanner />}

      <div className="grid-2">
        <section className="panel">
          <div className="row" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>投稿を入れる</h2>
            <span className="spacer" />
            <div className="seg-toggle" role="group" aria-label="入力方法">
              <button aria-pressed={mode === "paste"} onClick={() => setMode("paste")}>貼り付け</button>
              <button aria-pressed={mode === "csv"} onClick={() => setMode("csv")}>CSV</button>
            </div>
          </div>

          {mode === "paste" ? (
            <label className="field">
              <span>X / Instagram / レビューの投稿(空行区切り、または1行1投稿)</span>
              <textarea rows={12} value={paste} onChange={(e) => setPaste(e.target.value)}
                placeholder={"投稿をここに貼り付け\n\n空行で区切ると複数行の投稿もそのまま1件になります"} />
            </label>
          ) : (
            <div className="field">
              <input type="file" accept=".csv,.tsv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
              <p className="hint">X のデータエクスポート、Instagram のコメント書き出し、各種リスニングツールのCSVなど。見出し行から本文の列を推測します。</p>
              {csv && (
                <div className="row" style={{ marginTop: 8 }}>
                  {["text", "date", "author", "likes", "url"].map((k) => (
                    <label key={k} style={{ fontSize: 12 }}>
                      {{ text: "本文", date: "日時", author: "投稿者", likes: "いいね", url: "URL" }[k]}
                      <select value={csv.cols[k]} onChange={(e) => setCsv({ ...csv, cols: { ...csv.cols, [k]: Number(e.target.value) } })}>
                        <option value={-1}>—</option>
                        {csv.header.map((h, i) => <option key={i} value={i}>{h || `列${i + 1}`}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="row">
            <span className="hint num">{posts.length} 件</span>
            <label className="hint" title={reasonCounts(excluded).map(([r, n]) => `${r} ${n}`).join(" · ")}>
              <input type="checkbox" checked={noMarketing} onChange={(e) => setNoMarketing(e.target.checked)} /> 公式・広告・宣伝を除く{noMarketing && excluded.length ? `(${excluded.length}件除外)` : ""}
            </label>
            <button className="btn ghost small" onClick={loadSample}>サンプルを入れる</button>
            <span className="spacer" />
            <button className="btn primary" disabled={!posts.length || clf.running} onClick={() => start()}>
              {clf.running ? "判定中…" : "Jevで仕分ける"}
            </button>
          </div>
          <Progress progress={clf.progress} onCancel={clf.cancel} />
          {clf.error && <p className="hint" style={{ color: "var(--warn)" }}>{clf.error}</p>}
        </section>

        <section className="panel">
          <h2>問いの設定</h2>
          <label className="field">
            <span>調査対象(製品名・ブランド名など)</span>
            <input type="text" value={context} onChange={(e) => setContext(e.target.value)} placeholder="例: 家計簿アプリ「つむぎ帳」" />
          </label>
          <label className="field">
            <span>話題の分類(1行1件「ラベル: 説明」)</span>
            <textarea rows={8} value={topicsText} onChange={(e) => setTopicsText(e.target.value)} />
          </label>
          <p className="hint">
            1投稿につき「関連するか・感情・話題・意図・深刻度」の5つをJevに同時に問います。
            Jevは選択肢ごとの確率を返すので、確信度が{Math.round(LOW_CONF * 100)}%未満のものは「要確認」に回します。
          </p>
        </section>
      </div>

      {rows && (
        <>
          <div className="tiles" style={{ marginTop: 20 }}>
            <div className="tile"><div className="k">体験に関する投稿</div><div className="v num">{relevant.length}</div><div className="s num">全{ok.length}件中</div></div>
            <div className="tile">
              <div className="k">ネガティブの割合</div>
              <div className="v num">{relevant.length ? Math.round((relevant.filter((r) => r.sentiment === "ネガティブ").length / relevant.length) * 100) : 0}%</div>
              <div className="s">体験に関する投稿のうち</div>
            </div>
            <div className="tile"><div className="k">要対応(深刻度2以上)</div><div className="v num">{relevant.filter((r) => r.severity >= 1.5).length}</div><div className="s">下の一覧で確認</div></div>
            <div className="tile"><div className="k">要確認(確信度が低い)</div><div className="v num">{ok.filter(needsReview).length}</div><div className="s">人が見て直す候補</div></div>
          </div>

          <div className="grid-2">
            <section className="panel">
              <h2>話題 × 感情</h2>
              <div className="legend">
                {SENT_ORDER.map((s) => <span key={s}><i style={{ background: SENT_VAR[s] }} />{s}</span>)}
              </div>
              <div className="bars">
                {byTopic.map((t) => (
                  <Bar key={t.topic} t={t} max={maxTopic} onPick={() => setFilter((f) => ({ ...f, topic: f.topic === t.topic ? "" : t.topic }))} />
                ))}
              </div>
              {!byTopic.length && <p className="hint">体験に関する投稿がありませんでした。</p>}
            </section>
            <section className="panel">
              <h2>まず読むべき投稿</h2>
              {urgent.length ? urgent.map((r) => (
                <div key={r.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 13 }}>{r.text}</div>
                  <div className="row" style={{ marginTop: 4 }}>
                    <Level value={r.severity} label="深刻度" />
                    <span className="chip">{r.topic}</span>
                    <span className="chip">{r.intent}</span>
                    {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="hint">元の投稿</a>}
                  </div>
                </div>
              )) : <p className="hint">深刻度の高い投稿はありません。</p>}
            </section>
          </div>

          <section className="panel" style={{ marginTop: 16 }}>
            <div className="row" style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>すべての投稿</h2>
              <span className="spacer" />
              <select style={{ width: "auto" }} value={filter.topic} onChange={(e) => setFilter({ ...filter, topic: e.target.value })}>
                <option value="">話題: すべて</option>
                {Object.keys(topics).map((t) => <option key={t}>{t}</option>)}
              </select>
              <select style={{ width: "auto" }} value={filter.sentiment} onChange={(e) => setFilter({ ...filter, sentiment: e.target.value })}>
                <option value="">感情: すべて</option>
                {SENT_ORDER.map((s) => <option key={s}>{s}</option>)}
              </select>
              <label className="hint"><input type="checkbox" checked={filter.onlyRelevant} onChange={(e) => setFilter({ ...filter, onlyRelevant: e.target.checked })} /> 体験に関するものだけ</label>
              <label className="hint"><input type="checkbox" checked={filter.onlyReview} onChange={(e) => setFilter({ ...filter, onlyReview: e.target.checked })} /> 要確認だけ</label>
              <button className="btn small" onClick={exportCSV}>CSVに書き出す</button>
              <button className="btn small" onClick={exportFigJam} title="figma-plugin/ のプラグインに貼り付け">FigJamへ(コピー)</button>
              {strategy && <button className="btn small" onClick={exportMd}>戦略シート(Markdown)</button>}
            </div>
            <div className="scroll-x">
              <table className="list">
                <thead><tr><th>投稿</th><th>感情</th><th>話題</th><th>意図</th><th>深刻度</th></tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className={r.relevant < 0.5 ? "off" : ""}>
                      <td className="text">
                        {r.text}
                        {(r.author || r.date) && <div className="hint">{[r.author, r.date].filter(Boolean).join(" · ")}</div>}
                      </td>
                      <td>
                        <span className="dot" style={{ background: SENT_VAR[r.sentiment] }} />
                        <select value={r.sentiment} onChange={(e) => edit(r.id, { sentiment: e.target.value, sentConf: 1 })}>
                          {Object.keys(SENTIMENTS).map((s) => <option key={s}>{s}</option>)}
                        </select>
                        <div><Conf value={r.sentConf} /></div>
                      </td>
                      <td>
                        <select value={r.topic} onChange={(e) => edit(r.id, { topic: e.target.value, topicConf: 1 })}>
                          {Object.keys(topics).map((t) => <option key={t}>{t}</option>)}
                        </select>
                        <div><Conf value={r.topicConf} /></div>
                      </td>
                      <td>
                        <select value={r.intent} onChange={(e) => edit(r.id, { intent: e.target.value, intentConf: 1 })}>
                          {Object.keys(INTENTS).map((t) => <option key={t}>{t}</option>)}
                        </select>
                        <div><Conf value={r.intentConf} /></div>
                      </td>
                      <td><Level value={r.severity} label="深刻度" />{r.edited && <div className="hint">手修正</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!shown.length && <p className="hint">条件に合う投稿はありません。</p>}
            </div>
          </section>

          <Strategy theme={context || "ソーシャルリスニング"} byId={byId} value={strategy} onChange={setStrategy}
            getInput={() => ({ posts: listeningForStrategy(ok), notes: byTopic.map((t) => `${t.topic}: ${t.total}件(${SENT_ORDER.map((s) => `${s}${t.counts[s]}`).join("・")})`).join("\n") })} />
        </>
      )}
      {toastEl}
    </>
  );
}

function Bar({ t, max, onPick }) {
  const title = SENT_ORDER.map((s) => `${s} ${t.counts[s]}`).join(" / ");
  return (
    <>
      <div className="lbl"><button onClick={onPick} title="この話題で絞り込む">{t.topic}</button></div>
      <div className="stack" style={{ width: `${(t.total / max) * 100}%` }} title={`${t.topic}: ${title}`}>
        {SENT_ORDER.filter((s) => t.counts[s]).map((s) => (
          <span key={s} style={{ flex: t.counts[s], background: SENT_VAR[s] }} title={`${t.topic} · ${s} ${t.counts[s]}件`} />
        ))}
      </div>
      <div className="n num">{t.total}</div>
    </>
  );
}
