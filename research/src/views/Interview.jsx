import { useMemo, useState } from "react";
import { DEFAULT_CATEGORIES, DEFAULT_STAGES, interviewQuestions, interviewState, parseLabels, noneLabel } from "../lib/presets";
import { segmentTranscript, speakersOf } from "../lib/segment";
import { buildFlow, toMermaid, toFigJamPayload, toMiroTSV, CATEGORY_COLORS } from "../lib/exporters";
import { toCSV, download } from "../lib/csv";
import { SAMPLE_THEME, SAMPLE_TRANSCRIPT } from "../lib/samples";
import { useClassifier, NoKeyBanner, DemoBanner, Progress, Level, LOW_CONF, useToast, copyText } from "../components/Bits";

export default function Interview() {
  const [transcript, setTranscript] = useState("");
  const [theme, setTheme] = useState("");
  const [categoriesText, setCategoriesText] = useState(DEFAULT_CATEGORIES);
  const [stagesText, setStagesText] = useState(DEFAULT_STAGES);
  const [skip, setSkip] = useState(null); // 分類しない話者(null = 自動判定のまま)
  const [rows, setRows] = useState(null);
  const [view, setView] = useState("board");
  const clf = useClassifier();
  const [toastEl, toast] = useToast();

  const categories = useMemo(() => parseLabels(categoriesText), [categoriesText]);
  const stages = useMemo(() => parseLabels(stagesText), [stagesText]);
  const segments = useMemo(() => segmentTranscript(transcript), [transcript]);
  const speakers = useMemo(() => speakersOf(segments), [segments]);
  const skipSet = useMemo(
    () => skip ?? new Set(speakers.filter((s) => s.interviewer).map((s) => s.name)),
    [skip, speakers],
  );
  const targets = segments.filter((s) => !skipSet.has(s.speaker ?? "(話者なし)"));

  const toggleSpeaker = (name) => {
    const next = new Set(skipSet);
    next.has(name) ? next.delete(name) : next.add(name);
    setSkip(next);
  };

  const loadSample = () => { setTranscript(SAMPLE_TRANSCRIPT); setTheme(SAMPLE_THEME); setSkip(null); };

  const start = async (forceDemo) => {
    if (!targets.length) return;
    const questions = interviewQuestions({ categoriesText, stagesText });
    // 聞き手の質問も「直前の文脈」としては渡す(答えの意味が質問で決まることが多い)
    const items = targets.map((seg) => ({ id: seg.id, state: interviewState(seg, segments[seg.index - 1], theme) }));
    setRows(null);
    const out = await clf.run(items, questions, { forceDemo });
    if (!out) return;
    setRows(targets.map((seg) => {
      const a = out.answers.get(seg.id);
      if (!a) return { ...seg, error: out.errors.get(seg.id) || "未判定" };
      return {
        ...seg,
        category: a.category.choice, catConf: a.category.confidence,
        stage: a.stage.choice, stageConf: a.stage.confidence,
        action: a.action.noul,
        importance: a.importance.score,
      };
    }));
  };

  const ok = (rows || []).filter((r) => !r.error);
  const move = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch, edited: true } : r)));
  const flow = useMemo(() => (ok.length ? buildFlow(ok, stages, categories) : null), [rows, stages, categories]); // eslint-disable-line react-hooks/exhaustive-deps
  const mermaid = flow ? toMermaid(flow) : "";
  const stepNo = useMemo(() => new Map((flow?.steps || []).map((r, i) => [r.id, i + 1])), [flow]);

  const exportCSV = () => {
    const header = ["#", "話者", "発言", "分類", "分類_確信度", "段階", "段階_確信度", "行動か", "重要度(0-3)", "手修正"];
    const body = ok.map((r) => [r.index + 1, r.speaker || "", r.text, r.category, r.catConf.toFixed(2), r.stage, r.stageConf.toFixed(2), r.action.toFixed(2), r.importance.toFixed(2), r.edited ? "手修正" : ""]);
    download(`interview-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(header, body));
  };
  const figjam = () => copyText(JSON.stringify(toFigJamPayload({ title: theme, rows: ok, categoryLabels: categories, flow })), toast, "FigJam用データ");
  const miro = () => copyText(toMiroTSV(ok, categories), toast, "Miro用の付箋テキスト");

  return (
    <>
      {clf.noKey && <NoKeyBanner onDemo={() => { clf.enableDemo(); start(true); }} />}
      {clf.demo && <DemoBanner />}

      <div className="grid-2">
        <section className="panel">
          <h2>議事録を入れる</h2>
          <label className="field">
            <span>インタビューの文字起こし・議事録</span>
            <textarea rows={14} value={transcript} onChange={(e) => { setTranscript(e.target.value); setSkip(null); }}
              placeholder={"田中：…… / Q: …… / [00:12:03] 田中: …… / Zoom・Teamsの文字起こし形式などに対応\n話者のない議事録は段落ごとに分けます"} />
          </label>
          {speakers.length > 0 && (
            <div className="field">
              <span className="hint">分類する話者(クリックで除外 / 聞き手は自動で除外)</span>
              <div className="speakers" style={{ marginTop: 6 }}>
                {speakers.map((s) => (
                  <label key={s.name} className={skipSet.has(s.name) ? "skip" : ""}>
                    <input type="checkbox" checked={!skipSet.has(s.name)} onChange={() => toggleSpeaker(s.name)} />
                    {s.name} <span className="num">{s.count}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="row">
            <span className="hint num">{segments.length} 発言に分割 · 分類するのは {targets.length} 件</span>
            <button className="btn ghost small" onClick={loadSample}>サンプルを入れる</button>
            <span className="spacer" />
            <button className="btn primary" disabled={!targets.length || clf.running} onClick={() => start()}>
              {clf.running ? "判定中…" : "Jevで仕分ける"}
            </button>
          </div>
          <Progress progress={clf.progress} onCancel={clf.cancel} />
          {clf.error && <p className="hint" style={{ color: "var(--warn)" }}>{clf.error}</p>}
        </section>

        <section className="panel">
          <h2>問いの設定</h2>
          <label className="field">
            <span>調査テーマ</span>
            <input type="text" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="例: 共働き世帯の家計管理の実態" />
          </label>
          <details>
            <summary>アフィニティの分類とジャーニー段階を編集</summary>
            <label className="field" style={{ marginTop: 10 }}>
              <span>アフィニティの分類(1行1件「ラベル: 説明」)</span>
              <textarea rows={8} value={categoriesText} onChange={(e) => setCategoriesText(e.target.value)} />
            </label>
            <label className="field">
              <span>ジャーニーの段階(上から時系列順。「該当なし」を最後に)</span>
              <textarea rows={8} value={stagesText} onChange={(e) => setStagesText(e.target.value)} />
            </label>
          </details>
          <p className="hint">
            1発言につき「分類・ジャーニー段階・具体的な行動か・重要度」をJevに問います。
            行動と判定された発言を時系列に並べて行動フローを、ペインを段階ごとに添えます。
          </p>
        </section>
      </div>

      {rows && (
        <section className="panel" style={{ marginTop: 20 }}>
          <div className="row" style={{ marginBottom: 14 }}>
            <div className="seg-toggle" role="group" aria-label="表示">
              <button aria-pressed={view === "board"} onClick={() => setView("board")}>アフィニティ図</button>
              <button aria-pressed={view === "flow"} onClick={() => setView("flow")}>行動フロー</button>
            </div>
            <span className="hint num">{ok.length}件 · 要確認 {ok.filter((r) => r.catConf < LOW_CONF).length}件</span>
            <span className="spacer" />
            <button className="btn small" onClick={figjam} title="figma-plugin/ のFigJamプラグインに貼り付け">FigJamへ(コピー)</button>
            <button className="btn small" onClick={miro} title="Miroのボードに貼り付けると1セル=1付箋">Miroへ(コピー)</button>
            <button className="btn small" onClick={exportCSV}>CSV</button>
          </div>

          {view === "board" ? (
            <div className="board">
              {Object.keys(categories).map((c, ci) => {
                const list = ok.filter((r) => r.category === c).sort((a, b) => b.importance - a.importance);
                return (
                  <div className="col" key={c}>
                    <h4>{c} <span className="num">{list.length}</span></h4>
                    {list.map((r) => (
                      <div key={r.id} className="sticky" style={{ background: CATEGORY_COLORS[ci % CATEGORY_COLORS.length] }}>
                        {r.text}
                        <div className="meta">
                          <Level value={r.importance} label="重要度" />
                          {r.speaker && <span>{r.speaker}</span>}
                          {r.stage !== noneLabel(stages) && <span>· {r.stage}</span>}
                          {r.catConf < LOW_CONF && <span className="low">要確認 {Math.round(r.catConf * 100)}%</span>}
                          <span className="spacer" />
                          <select aria-label="分類を変える" value={r.category} onChange={(e) => move(r.id, { category: e.target.value, catConf: 1 })}>
                            {Object.keys(categories).map((x) => <option key={x}>{x}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {flow?.stages.length ? (
                <div className="flow">
                  {flow.stages.map((st) => (
                    <div className="stage" key={st.name}>
                      <h4>{st.name}</h4>
                      {st.steps.map((r) => (
                        <div className="step" key={r.id}>
                          <span className="no num">{stepNo.get(r.id)}</span>{r.text}
                        </div>
                      ))}
                      {st.pains.map((r) => <div className="pain" key={r.id}>ペイン: {r.text}</div>)}
                    </div>
                  ))}
                </div>
              ) : <p className="hint">行動として判定された発言がありませんでした。</p>}
              <div className="row" style={{ margin: "16px 0 8px" }}>
                <h3 style={{ margin: 0 }}>Mermaid(FigJam・Miro・Notion などに貼れる図の記法)</h3>
                <span className="spacer" />
                <button className="btn small" onClick={() => copyText(mermaid, toast, "Mermaid")}>コピー</button>
              </div>
              <pre className="code">{mermaid}</pre>
            </>
          )}
        </section>
      )}
      {toastEl}
    </>
  );
}
