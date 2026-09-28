/**
 * 企画（Idea）ステージ — 課題と参照のあいだ。
 *
 * ブリーフ → 先生（受賞作の分解）→ インサイト → 緊張 → コアアイデア → KV コンセプト + タグライン。
 * AI キーが 1 つも無くても、lib/idea.js の決定的生成器で全部の箱が埋まる。
 */
import { useMemo, useState } from "react";
import craft from "../data/craft.json";
import patternsData from "../data/ideaPatterns.json";
import { useStudio, uid, now } from "../store";
import { api, ApiError } from "../lib/api";
import { generateIdeas, variantIdea, ideaToCore, chosenOf } from "../lib/idea";
import Deconte, { JOINED } from "../components/Deconte";
import InsightMiner from "../components/InsightMiner";
import IdeaBoard from "../components/IdeaBoard";
import KvConcept from "../components/KvConcept";
import Collapsible from "../components/Collapsible";
import { useToast } from "../components/Toast";

const CD_STAGES = [
  { id: "brief", ja: "ブリーフに向かって" },
  { id: "insight", ja: "インサイトに向かって" },
  { id: "idea", ja: "アイデアに向かって" },
];
const CD_FRAME = "cd_questions";

export default function Idea() {
  const { project, patch, merge, dispatch, setStage, settings } = useStudio();
  const toast = useToast();
  const idea = project.idea || {};
  const brief = project.consult.brief;
  const hasClaude = !!settings.apiStatus?.claude;

  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const teacherEntries = useMemo(
    () => (idea.teachers || []).map((id) => JOINED.find((d) => d.id === id)).filter(Boolean),
    [idea.teachers],
  );
  const patternEntries = useMemo(() => {
    const picked = (idea.patterns || []).map((id) => patternsData.find((p) => p.id === id)).filter(Boolean);
    return picked.length ? picked : patternsData;
  }, [idea.patterns]);

  const insight = chosenOf(idea.insights)?.text || brief.insight || "";
  const tension = chosenOf(idea.tensions)?.text || "";

  /* ---------- 3. コアアイデア ---------- */

  const appendIdeas = (list, label) => {
    if (!list.length) throw new Error("案が作れませんでした");
    dispatch({ type: "idea/addIdeas", items: list });
    toast(`${label}：${list.length} 案`, "ok");
  };

  const runAiIdeas = async () => {
    setErr(""); setBusy("ideas");
    try {
      const r = await api.ai("ideas", {
        brief,
        insight,
        tension,
        patterns: patternEntries,
        teachers: teacherEntries,
        kvGrammar: craft.kvGrammar || [],
        taglineDirections: craft.taglineDirections || [],
      });
      appendIdeas(
        (r.ideas || []).map((x) => ({
          id: uid(),
          oneLiner: x.oneLiner || "", twist: x.twist || "", kvConcept: x.kvConcept || "",
          tagline: x.tagline || "", why: x.why || "", risk: x.risk || "",
          patterns: Array.isArray(x.patterns) ? x.patterns : [],
          scores: x.scores || null, tests: {}, chosen: false, source: "ai",
        })),
        "AI が出しました",
      );
      patch("idea.aiRun", { at: now(), model: r.model || "claude", op: "ideas" });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : e.message || "生成に失敗しました");
    } finally {
      setBusy("");
    }
  };

  const runTemplateIdeas = () => {
    setErr("");
    try {
      appendIdeas(
        generateIdeas({
          brief,
          insight,
          tension,
          patterns: patternEntries,
          teachers: teacherEntries,
          kvGrammar: craft.kvGrammar || [],
          taglineDirections: craft.taglineDirections || [],
          count: 6,
          makeId: () => uid(),
        }),
        "型から作りました",
      );
    } catch (e) {
      setErr(e.message || "型から作れませんでした");
    }
  };

  const adopt = (item) => {
    dispatch({ type: "idea/choose", key: "ideas", id: item.id });
    patch("idea.core", ideaToCore(item));
    toast("コアアイデアに採用しました", "ok");
  };

  const makeVariant = (item, kind) => {
    const v = variantIdea(item, kind, { makeId: () => uid() });
    if (!v) return;
    dispatch({ type: "idea/addIdeas", item: v });
    toast(`「${kind}」の変種を足しました`, "ok");
  };

  /* ---------- 4. CD の問い ---------- */
  const cdChecks = project.consult.frames?.[CD_FRAME] || {};
  const toggleCd = (key) => merge("consult.frames", { [CD_FRAME]: { ...cdChecks, [key]: !cdChecks[key] } });
  const cdByStage = useMemo(() => {
    const m = {};
    for (const q of craft.cdQuestions || []) (m[q.stage] ||= []).push(q);
    return m;
  }, []);

  return (
    <div className="stack" style={{ gap: 14 }}>
      {!hasClaude && (
        <div className="alert info">
          <strong>AI 機能は未接続です。</strong> サーバに <code>ANTHROPIC_API_KEY</code> を設定すると「AI で出す」が使えます。
          設定しなくても、型（{patternsData.length} 種）と craft のテンプレートだけで同じデータ構造が埋まります。
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <h2>1 · 先生を選ぶ（デコンテ）</h2>
          <span className="small muted">受賞作を同じ順で分解して読む。最大 3 件</span>
        </div>
        <Deconte />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>2 · インサイトを掘る</h2>
          <span className="small muted">本音を 1 本、緊張を 1 本に絞る</span>
        </div>
        <InsightMiner
          sources={craft.insightSources || []}
          tensionPairs={craft.tensionPairs || []}
          teachers={teacherEntries}
          hasClaude={hasClaude}
        />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>3 · コアアイデアを出す</h2>
          <span className="small muted">{(idea.ideas || []).length} 案</span>
        </div>

        <div className="idea-source small muted">
          <div><strong>採用インサイト</strong>：{insight || "（未選択）"}</div>
          <div><strong>採用した緊張</strong>：{tension || "（未選択）"}</div>
          <div>
            <strong>使う型</strong>：{(idea.patterns || []).length
              ? patternEntries.map((p) => p.ja).join("・")
              : `未選択（${patternsData.length} 種すべてから順に使います）`}
          </div>
          <div><strong>先生</strong>：{teacherEntries.length ? teacherEntries.map((t) => t.case.title).join("・") : "（未選択）"}</div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={runAiIdeas} disabled={!hasClaude || !!busy}>
            {busy === "ideas" ? <><span className="spinner" /> 考えています…</> : "AI で 6 案"}
          </button>
          <button className="btn" onClick={runTemplateIdeas} disabled={!!busy}>型から 6 案</button>
          {!!(idea.ideas || []).length && (
            <button className="btn btn-sm btn-ghost right" onClick={() => patch("idea.ideas", [])}>案を全部消す</button>
          )}
        </div>
        {err && <div className="alert danger" style={{ marginTop: 8 }}>{err}</div>}
        {idea.aiRun && !busy && (
          <p className="small muted" style={{ marginTop: 8 }}>
            最終 AI 実行: {new Date(idea.aiRun.at).toLocaleString("ja-JP")}（{idea.aiRun.op}）
          </p>
        )}

        <div style={{ marginTop: 12 }}>
          <IdeaBoard
            ideas={idea.ideas || []}
            patterns={patternsData}
            ideaTests={craft.ideaTests || []}
            lens={craft.cannesLens || null}
            onUpdate={(id, p) => dispatch({ type: "idea/updateIdea", id, patch: p })}
            onRemove={(id) => dispatch({ type: "idea/removeIdea", id })}
            onAdopt={adopt}
            onVariant={makeVariant}
          />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>4 · CD の問い</h2>
          <span className="small muted">出す前に、自分に聞かれる問いを先に自分で聞く</span>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          {CD_STAGES.map((st) => {
            const list = cdByStage[st.id] || [];
            const done = list.filter((_, i) => cdChecks[`${st.id}-${i}`]).length;
            return (
              <Collapsible key={st.id} title={st.ja} subtitle={`${done}/${list.length}`} defaultOpen={st.id === "idea"}>
                <ul className="cdlist">
                  {list.map((q, i) => (
                    <li key={i}>
                      <label className="row small" style={{ gap: 6, alignItems: "flex-start" }}>
                        <input type="checkbox" checked={!!cdChecks[`${st.id}-${i}`]} onChange={() => toggleCd(`${st.id}-${i}`)} />
                        <span><strong>{q.questionJa}</strong><br /><span className="muted">{q.whyJa}</span></span>
                      </label>
                    </li>
                  ))}
                  {!list.length && <li className="small muted">この段階の問いはまだありません。</li>}
                </ul>
              </Collapsible>
            );
          })}

          <Collapsible title="手法の辞典" subtitle={`${(craft.methods || []).length} 件`}>
            <div className="stack" style={{ gap: 10 }}>
              {(craft.methods || []).map((m) => (
                <div key={m.id} className="minicard">
                  <div className="row" style={{ gap: 6 }}>
                    <strong className="small">{m.ja}</strong>
                    {m.sourceUrl && <a className="small right" href={m.sourceUrl} target="_blank" rel="noreferrer noopener">出典</a>}
                  </div>
                  <p className="small muted">{m.originJa}</p>
                  <ol className="howto small">{(m.stepsJa || []).map((s, i) => <li key={i}>{s}</li>)}</ol>
                  {!!(m.outputsJa || []).length && (
                    <p className="small">出るもの: {(m.outputsJa || []).join("・")}</p>
                  )}
                </div>
              ))}
              {!(craft.methods || []).length && <p className="small muted">手法のデータがまだありません。</p>}
            </div>
          </Collapsible>

          <Collapsible title="仕上げのチェックリスト" subtitle={`${(craft.adChecklist || []).length} 項目`}>
            <div className="stack" style={{ gap: 8 }}>
              {(craft.adChecklist || []).map((a) => (
                <div key={a.id} className="minicard">
                  <div className="row" style={{ gap: 6 }}>
                    <strong className="small">{a.ja}</strong>
                    <span className="badge">{a.category}</span>
                  </div>
                  <p className="small muted">{a.questionJa}</p>
                  {a.fixJa && <p className="small">直し方: {a.fixJa}</p>}
                </div>
              ))}
            </div>
          </Collapsible>

          {craft.verifiedAt && (
            <p className="help">
              craft データの確認日: {craft.verifiedAt}
              {craft.cannesLens?.sourceUrl && <> · <a href={craft.cannesLens.sourceUrl} target="_blank" rel="noreferrer noopener">審査の見方の出典</a></>}
            </p>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>この企画で進む</h2>
          <span className="small muted">採用した 1 本が下流（参照・方向・プロンプト・Figma）の土台になります</span>
        </div>
        <KvConcept
          core={idea.core || {}}
          onChange={(p) => merge("idea.core", p)}
          onGoRefs={() => setStage("refs")}
          onGoDirection={() => setStage("direction")}
        />
      </section>
    </div>
  );
}
