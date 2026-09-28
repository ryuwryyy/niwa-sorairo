/**
 * 「インサイトを掘る」— 探し方（craft.insightSources）の問いに答え、
 * そこからインサイト 5 本と緊張 5 本を出して、それぞれ 1 本を採用する。
 *
 * 問いへの回答は consult.frames["insight_<sourceId>"] に貯める（課題ステージのワーク回答と同じ箱）。
 * AI が無くても lib/idea.js の型から同じ形のデータが埋まる。
 */
import { useState } from "react";
import { useStudio, uid, now } from "../store";
import { api, ApiError } from "../lib/api";
import { mineInsights, ensureOneChosen } from "../lib/idea";
import { useToast } from "./Toast";

export const frameKey = (sourceId) => `insight_${sourceId}`;

export default function InsightMiner({ sources = [], tensionPairs = [], teachers = [], hasClaude = false }) {
  const { project, patch, merge, dispatch } = useStudio();
  const toast = useToast();
  const idea = project.idea || {};
  const brief = project.consult.brief;
  const frames = project.consult.frames || {};

  const [tab, setTab] = useState(sources[0]?.id || "");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const active = sources.find((s) => s.id === tab) || sources[0] || null;
  const answersBySource = Object.fromEntries(sources.map((s) => [s.id, frames[frameKey(s.id)] || {}]));

  const setAnswer = (sourceId, key, value) =>
    merge("consult.frames", { [frameKey(sourceId)]: { ...(frames[frameKey(sourceId)] || {}), [key]: value } });

  const writeBoth = (insights, tensions, label) => {
    patch("idea.insights", ensureOneChosen(insights));
    patch("idea.tensions", ensureOneChosen(tensions));
    toast(`${label}：インサイト ${insights.length} 本・緊張 ${tensions.length} 本`, "ok");
  };

  /* ---------- AI ---------- */
  const runAi = async () => {
    setErr(""); setBusy("ai");
    try {
      const r = await api.ai("insights", {
        brief,
        context: project.consult.context,
        audience: project.consult.audience,
        answers: answersBySource,
        sources,
        teachers,
      });
      const insights = (r.insights || []).map((x) => ({
        id: uid(), text: x.text || "", source: x.source || "", evidence: x.evidence || "", chosen: false,
      }));
      const tensions = (r.tensions || []).map((x) => ({ id: uid(), text: x.text || "", chosen: false }));
      if (!insights.length && !tensions.length) throw new Error("AI から候補が返りませんでした");
      writeBoth(insights, tensions, "AI が掘りました");
      patch("idea.aiRun", { at: now(), model: r.model || "claude", op: "insights" });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : e.message || "生成に失敗しました");
    } finally {
      setBusy("");
    }
  };

  /* ---------- 型から（決定的） ---------- */
  const runTemplate = () => {
    setErr("");
    try {
      const r = mineInsights({ brief, answers: answersBySource, sources, tensionPairs, makeId: () => uid() });
      writeBoth(r.insights, r.tensions, "型から作りました");
    } catch (e) {
      setErr(e.message || "型から作れませんでした");
    }
  };

  const upInsight = (id, p) => patch("idea.insights", (l) => (l || []).map((x) => (x.id === id ? { ...x, ...p } : x)));
  const upTension = (id, p) => patch("idea.tensions", (l) => (l || []).map((x) => (x.id === id ? { ...x, ...p } : x)));
  const addInsight = () => patch("idea.insights", (l) => [...(l || []), { id: uid(), text: "", source: active?.id || "", evidence: "", chosen: !(l || []).length }]);
  const addTension = () => patch("idea.tensions", (l) => [...(l || []), { id: uid(), text: "", chosen: !(l || []).length }]);

  return (
    <div className="stack" style={{ gap: 12 }}>
      {!!sources.length && (
        <>
          <div className="tabs">
            {sources.map((s) => (
              <button key={s.id} className={`tab${active?.id === s.id ? " active" : ""}`} onClick={() => setTab(s.id)}>
                {s.ja}
                {Object.values(answersBySource[s.id] || {}).some((v) => String(v || "").trim()) ? " ●" : ""}
              </button>
            ))}
          </div>
          {active && (
            <div className="stack" style={{ gap: 10 }}>
              <p className="small muted" style={{ margin: 0 }}>{active.descJa}</p>
              {(active.questionsJa || []).map((q, i) => (
                <label className="field" key={i} style={{ marginBottom: 0 }}>
                  <span className="label">{q}</span>
                  <textarea
                    className="textarea"
                    style={{ minHeight: 56 }}
                    value={answersBySource[active.id]?.[`q${i}`] || ""}
                    placeholder="見聞きした事実・言葉をそのまま"
                    onChange={(e) => setAnswer(active.id, `q${i}`, e.target.value)}
                  />
                </label>
              ))}
              {active.exampleJa && <p className="help">例: {active.exampleJa}</p>}
            </div>
          )}
        </>
      )}
      {!sources.length && <div className="empty small">インサイトの探し方データがまだありません。下の「型から作る」は使えます。</div>}

      <div className="row">
        <button className="btn btn-primary" onClick={runAi} disabled={!hasClaude || !!busy}>
          {busy === "ai" ? <><span className="spinner" /> 掘っています…</> : "AI で 5 つ出す"}
        </button>
        <button className="btn" onClick={runTemplate} disabled={!!busy}>型から作る</button>
        <span className="small muted">どちらもインサイト 5 本 + 緊張 5 本を作り、既存の一覧を置き換えます</span>
      </div>
      {!hasClaude && <p className="help">AI は <code>ANTHROPIC_API_KEY</code> を設定すると使えます。無くても「型から作る」で進みます。</p>}
      {err && <div className="alert danger">{err}</div>}

      <Picker
        title="インサイト"
        hint="1 本だけ採用する。採用した本音がコアアイデアの土台になる"
        list={idea.insights || []}
        onAdd={addInsight}
        name="idea-insight"
        onChoose={(id) => dispatch({ type: "idea/choose", key: "insights", id })}
        onRemove={(id) => patch("idea.insights", (l) => (l || []).filter((x) => x.id !== id))}
        renderBody={(it) => (
          <>
            <textarea
              className="textarea" style={{ minHeight: 56 }} value={it.text}
              placeholder="実は、〜なのだ" aria-label="インサイト"
              onChange={(e) => upInsight(it.id, { text: e.target.value })}
            />
            <input
              className="input" style={{ marginTop: 6 }} value={it.evidence || ""}
              placeholder="根拠（見聞きした事実）" aria-label="インサイトの根拠"
              onChange={(e) => upInsight(it.id, { evidence: e.target.value })}
            />
            {it.source && <span className="badge sora" style={{ marginTop: 6 }}>{sources.find((s) => s.id === it.source)?.ja || it.source}</span>}
          </>
        )}
      />

      <Picker
        title="緊張"
        hint="「〜なのに〜」。緊張の無い企画は動かない"
        list={idea.tensions || []}
        onAdd={addTension}
        name="idea-tension"
        onChoose={(id) => dispatch({ type: "idea/choose", key: "tensions", id })}
        onRemove={(id) => patch("idea.tensions", (l) => (l || []).filter((x) => x.id !== id))}
        renderBody={(it) => (
          <textarea
            className="textarea" style={{ minHeight: 48 }} value={it.text}
            placeholder="〜したいのに、〜できない" aria-label="緊張"
            onChange={(e) => upTension(it.id, { text: e.target.value })}
          />
        )}
      />
    </div>
  );
}

function Picker({ title, hint, list, name, onChoose, onRemove, onAdd, renderBody }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <strong className="small">{title}</strong>
        <span className="small muted">{hint}</span>
        <button className="btn btn-sm right" onClick={onAdd}>＋ 手で足す</button>
      </div>
      {list.map((it) => (
        <div key={it.id} className={`hypo${it.chosen ? " chosen" : ""}`}>
          <div className="row" style={{ gap: 8 }}>
            <label className="row small" style={{ gap: 6 }}>
              <input type="radio" name={name} checked={!!it.chosen} onChange={() => onChoose(it.id)} />
              採用
            </label>
            <span className="right" />
            <button className="btn btn-sm btn-ghost" onClick={() => onRemove(it.id)} aria-label={`${title}を削除`}>×</button>
          </div>
          {renderBody(it)}
        </div>
      ))}
      {!list.length && <div className="empty small">まだありません。</div>}
    </div>
  );
}
