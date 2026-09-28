/**
 * 「先生を選ぶ（デコンテ）」— カンヌ受賞作を 課題→人間の真実→…→学び の順に分解して読む。
 *
 * cannes.json（事実）と cannesDeconstruction.json（分解）を id で突き合わせる。
 * 最大 3 件を「先生」にすると、AI 生成のときに構造だけを手本として渡す（作品の再現は禁止）。
 */
import { useEffect, useMemo, useState } from "react";
import cannes from "../data/cannes.json";
import patternsData from "../data/ideaPatterns.json";
import { useStudio } from "../store";
import Collapsible from "./Collapsible";
import { useToast } from "./Toast";

const PAGE = 12;
export const MAX_TEACHERS = 3;
export const MAX_PATTERNS = 3;

/** 読む順番は固定する。どの受賞作も同じ順で読むから「型」が見えてくる */
const FIELDS = [
  ["problemJa", "課題"],
  ["humanTruthJa", "人間の真実"],
  ["brandTruthJa", "ブランドの真実"],
  ["tensionJa", "緊張"],
  ["coreIdeaJa", "コアアイデア"],
  ["twistJa", "跳躍"],
  ["executionJa", "実行"],
  ["mediaLogicJa", "接点"],
  ["resultJa", "結果"],
  ["timelessJa", "学び"],
];

const caseById = new Map(cannes.map((c) => [c.id, c]));
const patternById = new Map((patternsData || []).map((p) => [p.id, p]));

/**
 * 分解データ（cannesDeconstruction.json）は別途書き足される。
 * 未着でもビルドと画面が壊れないよう、あれば読み、無ければ空で動く。
 * （Vite の import.meta.glob は一致するファイルが無ければ {} を返す）
 */
const deconModules = import.meta.glob("../data/cannesDeconstruction.json", { eager: true, import: "default" });
const decons = Object.values(deconModules).find(Array.isArray) || [];

/** 分解 + 事実。分解が無い受賞作はこの画面には出さない（読む順が揃わないため） */
export const JOINED = decons
  .filter((d) => d && d.id)
  .map((d) => ({ ...d, case: caseById.get(d.id) || null }))
  .filter((d) => d.case)
  .sort((a, b) => (b.case.year || 0) - (a.case.year || 0));

export const HAS_DECONSTRUCTION = JOINED.length > 0;

const LIONS = [...new Set(JOINED.map((d) => d.case.lion))].sort();

export default function Deconte() {
  const { project, patch } = useStudio();
  const toast = useToast();
  const idea = project.idea || {};
  const teachers = idea.teachers || [];
  const picked = idea.patterns || [];

  const [q, setQ] = useState("");
  const [lion, setLion] = useState("");
  const [patternFilter, setPatternFilter] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [openPattern, setOpenPattern] = useState("");
  const [onlyTeachers, setOnlyTeachers] = useState(false);

  useEffect(() => { setLimit(PAGE); }, [q, lion, patternFilter, onlyTeachers]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return JOINED.filter((d) => {
      if (onlyTeachers && !teachers.includes(d.id)) return false;
      if (lion && d.case.lion !== lion) return false;
      if (patternFilter && !(d.patterns || []).includes(patternFilter)) return false;
      if (!needle) return true;
      return [d.case.title, d.case.brand, d.case.agency, d.case.country, d.coreIdeaJa, d.humanTruthJa, ...(d.case.tags || [])]
        .join(" ").toLowerCase().includes(needle);
    });
  }, [q, lion, patternFilter, onlyTeachers, teachers]);

  const toggleTeacher = (id) => {
    if (teachers.includes(id)) {
      patch("idea.teachers", teachers.filter((x) => x !== id));
      return;
    }
    if (teachers.length >= MAX_TEACHERS) {
      toast(`先生は ${MAX_TEACHERS} 件までです。どれかを外してください`, "warn");
      return;
    }
    patch("idea.teachers", [...teachers, id]);
    toast("先生にしました（構造だけを学びます）", "ok");
  };

  const togglePattern = (id) => {
    if (picked.includes(id)) {
      patch("idea.patterns", picked.filter((x) => x !== id));
      return;
    }
    if (picked.length >= MAX_PATTERNS) {
      toast(`型は ${MAX_PATTERNS} つまでです`, "warn");
      return;
    }
    patch("idea.patterns", [...picked, id]);
  };

  const detail = openPattern ? patternById.get(openPattern) : null;
  const chosen = teachers.map((id) => JOINED.find((d) => d.id === id)).filter(Boolean);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="alert info small">
        受賞作からは<strong>構造（どう考えたか）だけ</strong>を借ります。作品名・ブランド・絵をなぞる指示はプロンプトのガードで止まります。
        先生は最大 {MAX_TEACHERS} 件。読む順は 課題 → 人間の真実 → ブランドの真実 → 緊張 → コアアイデア → 跳躍 → 実行 → 接点 → 結果 → 学び で固定しています。
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <span className="label">
          型を選ぶ
          <span className="hint">最大 {MAX_PATTERNS} つ。選んだ型からコアアイデアを組み立てます</span>
          <span className="right small muted">{picked.length}/{MAX_PATTERNS}</span>
        </span>
        <div className="chips">
          {(patternsData || []).map((p) => {
            const on = picked.includes(p.id);
            return (
              <span key={p.id} className={`chip pattern-chip${on ? " active" : ""}`}>
                <button type="button" className="chip-main" aria-pressed={on} title={p.summaryJa} onClick={() => togglePattern(p.id)}>
                  {p.ja}
                </button>
                <button
                  type="button"
                  className="x"
                  aria-label={`${p.ja} の説明`}
                  aria-expanded={openPattern === p.id}
                  onClick={() => setOpenPattern((v) => (v === p.id ? "" : p.id))}
                >
                  ?
                </button>
              </span>
            );
          })}
          {!patternsData?.length && <span className="small muted">型のデータがまだありません。</span>}
        </div>
        {detail && (
          <div className="pattern-detail" role="region" aria-label={`${detail.ja} の説明`}>
            <div className="row" style={{ gap: 8 }}>
              <strong>{detail.ja}</strong>
              <span className="small muted mono">{detail.en}</span>
              <button className="btn btn-sm btn-ghost right" onClick={() => setOpenPattern("")}>閉じる</button>
            </div>
            <p className="small">{detail.summaryJa}</p>
            {detail.whenJa && <p className="small muted">使いどころ: {detail.whenJa}</p>}
            {!!(detail.howToJa || []).length && (
              <ol className="howto small">{detail.howToJa.map((h, i) => <li key={i}>{h}</li>)}</ol>
            )}
            {detail.kvSeedEn && <p className="mono small seed-line">{detail.kvSeedEn}</p>}
            {detail.risksJa && <p className="small danger">risk: {detail.risksJa}</p>}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm" onClick={() => togglePattern(detail.id)}>
                {picked.includes(detail.id) ? "この型を外す" : "この型を使う"}
              </button>
              {!!(detail.examples || []).length && (
                <button className="btn btn-sm btn-ghost" onClick={() => { setPatternFilter(detail.id); setOpenPattern(""); }}>
                  この型の受賞作を見る（{(detail.examples || []).length}）
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!!chosen.length && (
        <div className="stack" style={{ gap: 10 }}>
          <span className="label">いまの先生（{chosen.length}/{MAX_TEACHERS}）</span>
          {chosen.map((d) => (
            <DeconteCard key={d.id} d={d} isTeacher atMax={false} onToggle={() => toggleTeacher(d.id)} onPattern={(id) => setPatternFilter((v) => (v === id ? "" : id))} />
          ))}
        </div>
      )}

      {!HAS_DECONSTRUCTION && (
        <div className="alert small">
          受賞作の分解データ（<code>cannesDeconstruction.json</code>）がまだ入っていないため、先生は選べません。
          型の選択と、下のインサイト・アイデアづくりはこのまま進められます。
        </div>
      )}

      {HAS_DECONSTRUCTION && (
      <Collapsible
        title="受賞作の分解を読む"
        subtitle={`${JOINED.length} 件`}
        defaultOpen={!teachers.length}
      >
        <div className="stack" style={{ gap: 12 }}>
          <div className="grid grid-2">
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="label">検索</span>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="タイトル・ブランド・コアアイデア・真実" />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="label">部門</span>
              <select className="select" value={lion} onChange={(e) => setLion(e.target.value)}>
                <option value="">すべての部門</option>
                {LIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <span className="label">型で絞る</span>
            <div className="chips">
              {(patternsData || []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip${patternFilter === p.id ? " active" : ""}`}
                  onClick={() => setPatternFilter((v) => (v === p.id ? "" : p.id))}
                >
                  {p.ja}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <label className="row small" style={{ gap: 6 }}>
              <input type="checkbox" checked={onlyTeachers} onChange={(e) => setOnlyTeachers(e.target.checked)} />
              先生にしたものだけ（{teachers.length}）
            </label>
            <button className="btn btn-sm btn-ghost" onClick={() => { setQ(""); setLion(""); setPatternFilter(""); setOnlyTeachers(false); }}>
              条件をクリア
            </button>
            <span className="right small muted">
              {list.length} 件{list.length > limit ? `（${limit} 件を表示）` : ""}
            </span>
          </div>

          {list.slice(0, limit).map((d) => (
            <DeconteCard
              key={d.id}
              d={d}
              isTeacher={teachers.includes(d.id)}
              atMax={teachers.length >= MAX_TEACHERS}
              onToggle={() => toggleTeacher(d.id)}
              onPattern={(id) => setPatternFilter((v) => (v === id ? "" : id))}
            />
          ))}
          {!list.length && <div className="empty">条件に合う分解がありません。</div>}
          {list.length > limit && (
            <button className="btn" onClick={() => setLimit((n) => n + PAGE)}>
              さらに {Math.min(PAGE, list.length - limit)} 件を表示（残り {list.length - limit} 件）
            </button>
          )}
        </div>
      </Collapsible>
      )}
    </div>
  );
}

function DeconteCard({ d, isTeacher, atMax, onToggle, onPattern }) {
  const c = d.case;
  return (
    <article className={`cannes-card deconte-card${isTeacher ? " teacher" : ""}`}>
      <div className="row" style={{ gap: 8 }}>
        <span className="badge mono">{c.year}</span>
        <span className={`badge ${c.award === "Grand Prix" ? "warn" : "ok"}`}>{c.award}</span>
        <span className="small muted">{c.lion}</span>
        <span className="right small muted">{c.country}</span>
      </div>
      <h3 style={{ marginTop: 6, fontFamily: "var(--font-display)", fontSize: 16 }}>{c.brand} — {c.title}</h3>
      <p className="small muted">{c.agency}</p>

      <dl className="cannes-dl">
        {FIELDS.map(([k, ja]) => (d[k] ? <Fragmentish key={k} dt={ja} dd={d[k]} /> : null))}
      </dl>

      {d.coreIdeaEn && <p className="mono small seed-line" style={{ marginTop: 8 }}>{d.coreIdeaEn}</p>}
      {d.kvDescriptionEn && <p className="mono small seed-line">KV: {d.kvDescriptionEn}</p>}

      {!!(d.patterns || []).length && (
        <div className="chips" style={{ marginTop: 8 }}>
          {(d.patterns || []).map((pid) => (
            <button key={pid} type="button" className="chip" onClick={() => onPattern(pid)}>
              {patternById.get(pid)?.ja || pid}
            </button>
          ))}
        </div>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-sm btn-primary" onClick={onToggle} disabled={!isTeacher && atMax}>
          {isTeacher ? "先生をやめる" : "先生にする"}
        </button>
        {(d.sources || []).slice(0, 3).map((s, i) => (
          <a key={i} className="small" href={typeof s === "string" ? s : s?.url} target="_blank" rel="noreferrer noopener">
            出典{(d.sources || []).length > 1 ? ` ${i + 1}` : ""}
          </a>
        ))}
        {!(d.sources || []).length && c.refUrl && (
          <a className="small" href={c.refUrl} target="_blank" rel="noreferrer noopener">出典</a>
        )}
        {d.verified === false && <span className="badge warn">未検証</span>}
      </div>
    </article>
  );
}

/** <dl> の中に <> が置けないので dt/dd の対をここで返す */
function Fragmentish({ dt, dd }) {
  return (
    <>
      <dt>{dt}</dt>
      <dd>{dd}</dd>
    </>
  );
}
