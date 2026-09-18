import { useMemo, useState } from "react";
import frameworks from "../data/frameworks.json";
import vars from "../data/directionVars.json";
import { useStudio, uid, now } from "../store";
import { api, ApiError } from "../lib/api";
import Chips from "../components/Chips";
import TagInput from "../components/TagInput";
import FrameRunner from "../components/FrameRunner";
import IssueTree from "../components/IssueTree";
import Collapsible from "../components/Collapsible";
import { useToast } from "../components/Toast";

const CATEGORY_JA = {
  consult: "コンサル",
  "design-thinking": "デザイン思考",
  "art-thinking": "アート思考",
  "art-direction": "アートディレクション",
  critique: "批評",
};
const CATEGORY_ORDER = ["consult", "design-thinking", "art-thinking", "art-direction", "critique"];

export default function Consult() {
  const { project, patch, merge, settings } = useStudio();
  const toast = useToast();
  const c = project.consult;
  const brief = c.brief;

  const [cat, setCat] = useState("consult");
  const [frameId, setFrameId] = useState("issue-tree");
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState("");
  const [err, setErr] = useState("");
  const [overwrite, setOverwrite] = useState(false);

  const hasClaude = !!settings.apiStatus?.claude;
  const byCat = useMemo(() => {
    const m = {};
    for (const f of frameworks) (m[f.category] ||= []).push(f);
    return m;
  }, []);
  const frame = frameworks.find((f) => f.id === frameId) || null;

  const setFrameAnswers = (id, answers) => merge("consult.frames", { [id]: answers });

  /* ---------- AI: 課題の構造化 ---------- */
  const runAi = async () => {
    setErr(""); setBusy(true); setStatusLine("依頼文を読み、課題ツリーを組み立てています…");
    try {
      const r = await api.ai("brief", {
        context: c.context,
        audience: c.audience,
        constraints: c.constraints,
        deliverable: project.meta.deliverable,
        frames: c.frames,
      });
      setStatusLine("結果を書き戻しています…");
      const keep = (cur, next) => (overwrite ? (next ?? cur) : (isEmpty(cur) ? (next ?? cur) : cur));
      patch("consult", (prev) => ({
        ...prev,
        issueTree: keep(prev.issueTree, normalizeTree(r.issueTree)),
        hypotheses: keep(prev.hypotheses, normalizeHypotheses(r.hypotheses)),
        hmw: keep(prev.hmw, Array.isArray(r.hmw) ? r.hmw : null),
        brief: {
          ...prev.brief,
          problem: keep(prev.brief.problem, r.brief?.problem),
          insight: keep(prev.brief.insight, r.brief?.insight),
          audience: keep(prev.brief.audience, r.brief?.audience),
          promise: keep(prev.brief.promise, r.brief?.promise),
          oneLiner: keep(prev.brief.oneLiner, r.brief?.oneLiner),
          lighthouse: keep(prev.brief.lighthouse, r.brief?.lighthouse),
          tone: keep(prev.brief.tone, Array.isArray(r.brief?.tone) ? r.brief.tone : null),
          successCriteria: keep(prev.brief.successCriteria, Array.isArray(r.brief?.successCriteria) ? r.brief.successCriteria : null),
        },
        aiRun: { at: now(), model: r.model || "claude" },
      }));
      toast("課題を構造化しました", "ok");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : e.message || "生成に失敗しました");
    } finally {
      setBusy(false); setStatusLine("");
    }
  };

  /* ---------- オフライン: Get–To–By 雛形 ---------- */
  const buildTemplate = () => {
    const audience = brief.audience || c.audience || "（対象）";
    const promise = brief.promise || "（約束＝どう変わるか）";
    const insight = brief.insight || "（インサイト＝効く理由）";
    const line = `${audience}を、${promise}へ、${insight}によって`;
    patch("consult.brief", (b) => ({
      ...b,
      audience: b.audience || c.audience,
      problem: b.problem || (c.context ? `${c.context.slice(0, 60)}… を解決する必要がある` : b.problem),
      oneLiner: line,
    }));
    toast("Get–To–By の雛形を入れました", "ok");
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      {!hasClaude && (
        <div className="alert info">
          <strong>AI 機能は未接続です。</strong> サーバに <code>ANTHROPIC_API_KEY</code> を設定すると「AI で課題を構造化する」が使えます。
          設定しなくても、下のワークショップと手入力だけで同じデータ構造が埋まります。
        </div>
      )}

      <div className="card">
        <div className="card-head"><h2>依頼をそのまま置く</h2></div>
        <label className="field">
          <span className="label">依頼・文脈 <span className="hint">クライアントの言葉のまま貼ってよい</span></span>
          <textarea className="textarea" value={c.context} placeholder="何を頼まれたか、背景、これまでの経緯" onChange={(e) => patch("consult.context", e.target.value)} />
        </label>
        <div className="grid grid-2">
          <label className="field">
            <span className="label">対象</span>
            <textarea className="textarea" style={{ minHeight: 72 }} value={c.audience} placeholder="誰に届けるのか。年齢・状況・今の気持ち" onChange={(e) => patch("consult.audience", e.target.value)} />
          </label>
          <label className="field">
            <span className="label">制約</span>
            <textarea className="textarea" style={{ minHeight: 72 }} value={c.constraints} placeholder="媒体・期間・予算・規定・やってはいけないこと" onChange={(e) => patch("consult.constraints", e.target.value)} />
          </label>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={runAi} disabled={!hasClaude || busy || !c.context}>
            {busy ? <><span className="spinner" /> 構造化しています…</> : "AI で課題を構造化する"}
          </button>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            上書き（既に書いた内容も置き換える）
          </label>
          <button className="btn" onClick={buildTemplate}>手動でブリーフ雛形を作る</button>
        </div>
        {busy && statusLine && <p className="small muted" style={{ marginTop: 8 }}>{statusLine}</p>}
        {err && <div className="alert danger" style={{ marginTop: 8 }}>{err}</div>}
        {c.aiRun && !busy && <p className="small muted" style={{ marginTop: 8 }}>最終 AI 実行: {new Date(c.aiRun.at).toLocaleString("ja-JP")}</p>}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>ワークショップ</h2>
          <span className="small muted">回答は案件に保存され、AI 構造化の材料になります</span>
        </div>
        <div className="tabs">
          {CATEGORY_ORDER.filter((k) => byCat[k]).map((k) => (
            <button key={k} className={`tab${cat === k ? " active" : ""}`} onClick={() => { setCat(k); setFrameId(byCat[k][0].id); }}>
              {CATEGORY_JA[k]} <span className="small muted">{byCat[k].length}</span>
            </button>
          ))}
        </div>
        <div className="chips" style={{ marginBottom: 12 }}>
          {(byCat[cat] || []).map((f) => (
            <button
              key={f.id}
              className={`chip${frameId === f.id ? " active" : ""}`}
              onClick={() => setFrameId(f.id)}
              title={f.summaryJa}
            >
              {f.name}
              {Object.keys(project.consult.frames?.[f.id] || {}).length ? " ●" : ""}
            </button>
          ))}
        </div>
        {frame && (
          <FrameRunner
            frame={frame}
            answers={project.consult.frames?.[frame.id] || {}}
            onChange={(a) => setFrameAnswers(frame.id, a)}
          />
        )}
      </div>

      <div className="card">
        <div className="card-head"><h2>課題ツリー</h2><span className="small muted">MECE に分解し、扱わない枝を決める</span></div>
        <IssueTree nodes={c.issueTree} onChange={(v) => patch("consult.issueTree", v)} />
      </div>

      <Hypotheses list={c.hypotheses} onChange={(v) => patch("consult.hypotheses", v)} />

      <div className="card">
        <div className="card-head"><h2>How Might We</h2><span className="small muted">解ける大きさの問いに変換する</span></div>
        <TagInput
          value={c.hmw}
          onChange={(v) => patch("consult.hmw", v)}
          placeholder="How might we … / どうすれば〜できるか"
          label="How Might We"
        />
      </div>

      <div className="card">
        <div className="card-head"><h2>1 行ブリーフ</h2><span className="small muted">Get–To–By。ここが埋まると全ステージが安定する</span></div>
        <div className="grid grid-2">
          <label className="field">
            <span className="label">問題</span>
            <textarea className="textarea" style={{ minHeight: 72 }} value={brief.problem} onChange={(e) => merge("consult.brief", { problem: e.target.value })} placeholder="いま何が起きていて、何が欠けているか" />
          </label>
          <label className="field">
            <span className="label">インサイト</span>
            <textarea className="textarea" style={{ minHeight: 72 }} value={brief.insight} onChange={(e) => merge("consult.brief", { insight: e.target.value })} placeholder="人の本音。「実は〜」で始められる一文" />
          </label>
          <label className="field">
            <span className="label">対象（Get）</span>
            <input className="input" value={brief.audience} onChange={(e) => merge("consult.brief", { audience: e.target.value })} placeholder="誰を" />
          </label>
          <label className="field">
            <span className="label">約束（To）</span>
            <input className="input" value={brief.promise} onChange={(e) => merge("consult.brief", { promise: e.target.value })} placeholder="どんな状態へ" />
          </label>
        </div>

        <div className="field">
          <span className="label">トーン <span className="hint">最大 5 つ。プロンプトのムード語になる</span></span>
          <Chips
            options={vars.moodWords}
            value={brief.tone}
            onChange={(v) => merge("consult.brief", { tone: v })}
            multi
            max={5}
            label="トーン"
          />
          <div style={{ marginTop: 8 }}>
            <TagInput
              value={(brief.tone || []).filter((t) => !vars.moodWords.some((m) => m.id === t))}
              onChange={(free) => merge("consult.brief", { tone: [...(brief.tone || []).filter((t) => vars.moodWords.some((m) => m.id === t)), ...free] })}
              placeholder="辞書に無いトーン語を足す"
              label="自由トーン語"
            />
          </div>
        </div>

        <label className="field">
          <span className="label">1 行（By まで） <span className="hint">{"{対象}を、{約束}へ、{インサイト}によって"}</span></span>
          <textarea className="textarea" style={{ minHeight: 64, fontFamily: "var(--font-display)", fontSize: 15 }} value={brief.oneLiner} onChange={(e) => merge("consult.brief", { oneLiner: e.target.value })} placeholder="作法を知らない人を、静かな3分間へ、「待つ時間の美しさ」によって" />
        </label>

        <label className="field">
          <span className="label">灯台の問い <span className="hint">アート思考：答えが未知のまま掲げる問い</span></span>
          <input className="input" value={brief.lighthouse} onChange={(e) => merge("consult.brief", { lighthouse: e.target.value })} placeholder="「何もしていない時間」は、どうすれば贅沢に見えるのか？" />
        </label>

        <div className="field" style={{ marginBottom: 0 }}>
          <span className="label">成功基準 <span className="hint">測れる形で。批評のときに使う</span></span>
          <TagInput value={brief.successCriteria} onChange={(v) => merge("consult.brief", { successCriteria: v })} placeholder="例: 1秒で「お茶の時間」だと分かる" label="成功基準" />
        </div>
      </div>

      <Collapsible title="フレームの一覧（20 件）" subtitle="出典つき">
        <div className="grid grid-2">
          {frameworks.map((f) => (
            <div key={f.id} className="minicard">
              <div className="row" style={{ gap: 6 }}>
                <strong className="small">{f.name}</strong>
                <span className="badge">{CATEGORY_JA[f.category]}</span>
                <span className="right small muted">{f.minutes}分</span>
              </div>
              <p className="small muted">{f.summaryJa}</p>
              <button className="btn btn-sm" onClick={() => { setCat(f.category); setFrameId(f.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>開く</button>
            </div>
          ))}
        </div>
      </Collapsible>
    </div>
  );
}

/* ---------- 仮説 ---------- */

function Hypotheses({ list = [], onChange }) {
  const add = () => onChange([...list, { id: uid(), text: "", evidence: "", confidence: 50, chosen: !list.length }]);
  const up = (i, p) => onChange(list.map((h, j) => (j === i ? { ...h, ...p } : h)));
  const choose = (i) => onChange(list.map((h, j) => ({ ...h, chosen: i === j })));

  return (
    <div className="card">
      <div className="card-head">
        <h2>仮説</h2>
        <span className="small muted">3 つ以上並べ、1 つを採用する（採用理由は根拠欄に）</span>
      </div>
      <div className="stack">
        {list.map((h, i) => (
          <div key={h.id} className={`hypo${h.chosen ? " chosen" : ""}`}>
            <div className="row" style={{ gap: 8 }}>
              <label className="row small" style={{ gap: 6 }}>
                <input type="radio" name="hypo-chosen" checked={!!h.chosen} onChange={() => choose(i)} />
                採用
              </label>
              <span className="right" />
              <button className="btn btn-sm btn-ghost" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="仮説を削除">×</button>
            </div>
            <textarea
              className="textarea"
              style={{ minHeight: 60 }}
              value={h.text}
              placeholder="〜なのは〜だからだ、と考える"
              aria-label={`仮説 ${i + 1}`}
              onChange={(e) => up(i, { text: e.target.value })}
            />
            <textarea
              className="textarea"
              style={{ minHeight: 48, marginTop: 6 }}
              value={h.evidence}
              placeholder="根拠 / 反証されうる条件"
              aria-label={`仮説 ${i + 1} の根拠`}
              onChange={(e) => up(i, { evidence: e.target.value })}
            />
            <div className="axis" style={{ marginTop: 8 }}>
              <span className="l">確信 低</span>
              <input
                className="slider"
                type="range"
                min="0"
                max="100"
                value={h.confidence ?? 50}
                aria-label={`仮説 ${i + 1} の確信度`}
                onChange={(e) => up(i, { confidence: Number(e.target.value) })}
              />
              <span className="r">高 {h.confidence ?? 50}</span>
            </div>
          </div>
        ))}
        {!list.length && <div className="empty small">まだ仮説がありません。</div>}
        <div><button className="btn btn-sm" onClick={add}>＋ 仮説を足す</button></div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function isEmpty(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function normalizeTree(nodes, depth = 0) {
  if (!Array.isArray(nodes) || depth >= 3) return depth >= 3 ? [] : null;
  return nodes
    .map((n) => (typeof n === "string" ? { text: n } : n))
    .filter((n) => n && (n.text || n.label))
    .map((n) => ({
      id: n.id || uid(),
      text: String(n.text || n.label || ""),
      children: normalizeTree(n.children, depth + 1) || [],
    }));
}

function normalizeHypotheses(list) {
  if (!Array.isArray(list)) return null;
  return list
    .map((h) => (typeof h === "string" ? { text: h } : h))
    .filter((h) => h && h.text)
    .map((h, i) => ({
      id: h.id || uid(),
      text: String(h.text),
      evidence: String(h.evidence || h.rationale || ""),
      confidence: Number.isFinite(Number(h.confidence)) ? Number(h.confidence) : 50,
      chosen: h.chosen ?? i === 0,
    }));
}
