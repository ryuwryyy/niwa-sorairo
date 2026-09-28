import { useState, useEffect, useMemo } from "react";
import { PLANTS, GROUPS, KINDS, LEVELS, tasksFor, hasWork, normalizeName } from "../data/plants";
import { askClaude } from "../lib/api";
import { C, font, KIND_COLOR } from "../theme";
import { Section, Chip, Tag, KindLabel, Rich } from "../components/Bits";

const MINE_KEY = "teire:mine";
const DONE_KEY = "teire:done";
const MAIN = ["剪定", "作業", "収穫"];

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 容量超過等は無視 */ } };

export default function Monthly({ focus }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [group, setGroup] = useState(null);
  const [kind, setKind] = useState(null);
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [mine, setMine] = useState(() => load(MINE_KEY, []));
  const [done, setDone] = useState(() => load(DONE_KEY, {}));
  const [open, setOpen] = useState(null);
  const [notes, setNotes] = useState({});
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => save(MINE_KEY, mine), [mine]);
  useEffect(() => save(DONE_KEY, done), [done]);

  // 名前判定から「この木の手入れを見る」で来たとき
  useEffect(() => {
    if (!focus) return;
    setMonth(now.getMonth() + 1);
    setGroup(null); setKind(null); setQuery(""); setMineOnly(false);
    setOpen(focus.id);
    requestAnimationFrame(() =>
      document.getElementById(`plant-${focus.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const isNow = month === now.getMonth() + 1;
  const doneKey = `${now.getFullYear()}-${month}`;
  const doneSet = new Set(done[doneKey] || []);

  const toggleMine = (id) => setMine((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const toggleDone = (id) => setDone((d) => {
    const cur = new Set(d[doneKey] || []);
    cur.has(id) ? cur.delete(id) : cur.add(id);
    return { ...d, [doneKey]: [...cur] };
  });

  // 絞り込み前の母集団(わが家の木・検索・分類)
  const base = useMemo(() => {
    const q = normalizeName(query);
    return PLANTS.filter((p) =>
      (!mineOnly || mine.includes(p.id)) &&
      (!group || p.group === group) &&
      (!q || [p.name, p.kana, ...(p.alias || [])].some((n) => normalizeName(n).includes(q))));
  }, [query, mineOnly, mine, group]);

  const rows = base.map((p) => ({ p, tasks: tasksFor(p, month) }));
  const counts = Object.fromEntries(KINDS.map((k) => [k, rows.filter((r) => r.tasks.some((t) => t.kind === k)).length]));
  const shown = kind ? rows.filter((r) => r.tasks.some((t) => t.kind === kind)) : rows;

  const main = shown.filter((r) => r.tasks.some((t) => MAIN.includes(t.kind)));
  const light = shown.filter((r) => !main.includes(r) && hasWork(r.tasks));
  const rest = shown.filter((r) => !hasWork(r.tasks));
  const workCount = rows.filter((r) => hasWork(r.tasks)).length;

  // 済んだものは下へ
  const byDone = (a, b) => doneSet.has(a.p.id) - doneSet.has(b.p.id);

  const askDetail = async (p) => {
    setLoadingId(p.id);
    try {
      const t = await askClaude(
        `${p.name}(${p.sci})の${month}月の手入れについて、庭仕事が初めての人向けに、日本の温暖地の庭植え前提で具体的な作業手順を3〜4文で。専門用語には短い補足を。前置きなしで本文のみ。`, 500);
      setNotes((n) => ({ ...n, [p.id + month]: t }));
    } catch {
      setNotes((n) => ({ ...n, [p.id + month]: "この環境では取得できません。" }));
    } finally {
      setLoadingId(null);
    }
  };

  const card = ({ p, tasks }) => (
    <PlantCard key={p.id} p={p} tasks={tasks} month={month}
      isOpen={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)}
      starred={mine.includes(p.id)} onStar={() => toggleMine(p.id)}
      done={doneSet.has(p.id)} onDone={() => toggleDone(p.id)}
      note={notes[p.id + month]} loading={loadingId === p.id} onAsk={() => askDetail(p)} />
  );

  return (
    <div>
      {/* 月の切り替え */}
      <div className="months" style={{ marginBottom: 12 }}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <button key={m} onClick={() => setMonth(m)} style={{
            fontFamily: font.min, fontSize: 14, padding: "8px 0", cursor: "pointer",
            border: "none", background: "transparent", position: "relative",
            borderBottom: m === month ? `2px solid ${C.oki}` : "2px solid transparent",
            color: m === month ? C.ai : C.inkSoft, fontWeight: m === month ? 700 : 400,
          }}>
            {m}月
            {m === now.getMonth() + 1 && (
              <span style={{
                position: "absolute", top: 2, right: 4, width: 5, height: 5, borderRadius: "50%", background: C.oki,
              }} />
            )}
          </button>
        ))}
      </div>

      {/* この月のまとめ。最初に見た人が「何をすればいいか」を一目で掴めるように */}
      <div style={{ background: C.washi2, borderRadius: 4, padding: "16px 16px 14px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: font.min, fontSize: 22, fontWeight: 700, color: C.ai, letterSpacing: "0.05em" }}>
            {month}月は、{workCount}種に手を入れる
          </span>
          {!isNow && (
            <button onClick={() => setMonth(now.getMonth() + 1)} style={{
              fontFamily: font.goth, fontSize: 11, color: C.oki, background: "transparent",
              border: "none", padding: 0, cursor: "pointer", textDecoration: "underline",
            }}>今月に戻る</button>
          )}
        </div>
        <p style={{ fontFamily: font.goth, fontSize: 12, lineHeight: 1.8, margin: "6px 0 12px", color: C.inkSoft }}>
          {counts["剪定"] > 0
            ? "迷ったら熾色の「剪定」から。時期を逃すと一年待つ作業です。"
            : "今月は剪定の適期の木がありません。見回りと季節の作業だけで大丈夫。"}
          札をタップすると、その作業の木だけに絞れます。
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {KINDS.filter((k) => counts[k] > 0).map((k) => (
            <KindLabel key={k} kind={k} count={counts[k]} active={kind === k}
              onClick={() => setKind(kind === k ? null : k)} />
          ))}
        </div>
      </div>

      {/* 探す・絞る */}
      <input value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="木の名前でさがす(ひらがなでも)" style={{
          width: "100%", fontFamily: font.goth, fontSize: 14, padding: "10px 12px", marginBottom: 10,
          border: `1px solid ${C.line}`, borderRadius: 3, background: "#ffffff88", color: C.ink, outline: "none",
        }} />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 4 }}>
        <Chip label={`★ わが家の木${mine.length ? ` ${mine.length}` : ""}`} active={mineOnly}
          onClick={() => setMineOnly(!mineOnly)} />
        <Chip label="すべて" active={!group} onClick={() => setGroup(null)} />
        {GROUPS.map((g) => (
          <Chip key={g} label={g} active={group === g} onClick={() => setGroup(group === g ? null : g)} />
        ))}
      </div>
      {mineOnly && mine.length === 0 && (
        <p style={{ fontFamily: font.goth, fontSize: 12, lineHeight: 1.8, color: C.inkSoft, margin: "8px 0" }}>
          まだ登録がありません。各植物の右にある ☆ をタップすると、「わが家の木」だけを表示できます。
        </p>
      )}

      <Block title={`${isNow ? "今月" : `${month}月`}の大事な作業`} sub="剪定・収穫・季節の作業" rows={main.sort(byDone)} card={card} />
      <Block title="ついでに見ておくこと" sub="肥料・虫の見回り・水やり" rows={light.sort(byDone)} card={card} />

      {rest.length > 0 && (
        <details style={{ marginTop: 22 }}>
          <summary style={{ fontFamily: font.min, fontSize: 14, color: C.inkSoft, cursor: "pointer", padding: "6px 0" }}>
            {isNow ? "今月" : `${month}月`}は見守るだけ({rest.length}種)
          </summary>
          {rest.map(card)}
        </details>
      )}

      {shown.length === 0 && (
        <p style={{ fontFamily: font.goth, fontSize: 13, color: C.inkSoft, marginTop: 20 }}>
          条件に合う植物がありません。
        </p>
      )}

      <p style={{ fontFamily: font.goth, fontSize: 11, lineHeight: 1.9, color: C.inkSoft, marginTop: 28 }}>
        時期は関東〜関西の平地が目安です。寒い地域は半月〜1か月ほど遅らせてください。
        本文の<span style={{ borderBottom: `1px dotted ${C.moss}` }}>点線の言葉</span>はタップすると意味が出ます。
      </p>
    </div>
  );
}

function Block({ title, sub, rows, card }) {
  if (!rows.length) return null;
  return (
    <section style={{ marginTop: 18 }}>
      <h3 style={{
        fontFamily: font.min, fontSize: 15, fontWeight: 700, color: C.ai, margin: "0 0 2px",
        display: "flex", alignItems: "baseline", gap: 8,
      }}>
        {title}
        <span style={{ fontFamily: font.goth, fontSize: 11, fontWeight: 400, color: C.inkSoft }}>
          {sub} ・ {rows.length}種
        </span>
      </h3>
      <div style={{ borderTop: `1px solid ${C.line}` }}>{rows.map(card)}</div>
    </section>
  );
}

function PlantCard({ p, tasks, month, isOpen, onToggle, starred, onStar, done, onDone, note, loading, onAsk }) {
  const work = tasks.filter((t) => t.kind !== "見頃");
  const see = tasks.find((t) => t.kind === "見頃");
  const first = tasks[0]?.kind;

  return (
    <div id={`plant-${p.id}`} style={{ borderBottom: `1px solid ${C.line}`, scrollMarginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button onClick={onToggle} aria-expanded={isOpen} style={{
          flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none",
          cursor: "pointer", padding: "13px 4px", display: "flex", alignItems: "center", gap: 10,
          opacity: done ? 0.5 : 1,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: done ? C.moss : first ? KIND_COLOR[first] : C.line,
          }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: font.min, fontSize: 16, color: C.ink }}>
                {done && "✓ "}{p.name}
              </span>
              {p.kana !== p.name && (
                <span style={{ fontFamily: font.goth, fontSize: 10, color: C.inkSoft }}>{p.kana}</span>
              )}
            </span>
            <span style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
              {work.map((t) => <KindLabel key={t.kind} kind={t.kind} />)}
              {see && (
                <span style={{ fontFamily: font.goth, fontSize: 11, color: C.inkSoft, padding: "2px 2px" }}>
                  見頃: {see.text}
                </span>
              )}
            </span>
          </span>
          <span style={{ fontFamily: font.goth, fontSize: 14, color: C.inkSoft, flexShrink: 0 }}>
            {isOpen ? "−" : "+"}
          </span>
        </button>
        <button onClick={onStar} aria-label={starred ? "わが家の木から外す" : "わが家の木に登録"} style={{
          background: "transparent", border: "none", cursor: "pointer", padding: "10px 4px 10px 10px",
          fontSize: 18, color: starred ? C.oki : C.line, flexShrink: 0,
        }}>{starred ? "★" : "☆"}</button>
      </div>

      {isOpen && (
        <div style={{ padding: "0 4px 18px 18px" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Tag>{p.group}</Tag><Tag>{p.type}</Tag><Tag>手間: {LEVELS[p.level]}</Tag>
          </div>

          {work.length > 0 ? (
            <>
              <h4 style={subHead}>{month}月にすること</h4>
              {work.map((t) => (
                <Section key={t.kind} label={t.kind} color={KIND_COLOR[t.kind]}><Rich text={t.text} /></Section>
              ))}
            </>
          ) : (
            <p style={{ fontFamily: font.goth, fontSize: 13, lineHeight: 1.9, color: C.inkSoft, margin: "12px 0 0" }}>
              {month}月は特に作業はありません。様子を見守るだけで大丈夫。
            </p>
          )}

          <h4 style={subHead}>1年の手入れ</h4>
          <YearStrip p={p} month={month} />

          <h4 style={subHead}>ふだんのこと</h4>
          <Section label="水"><Rich text={p.water} /></Section>
          <Section label="虫"><Rich text={p.pest} /></Section>
          {p.tip && <Section label="コツ"><Rich text={p.tip} /></Section>}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
            {work.length > 0 && (
              <button onClick={onDone} style={{
                ...btn, background: done ? C.moss : "transparent", color: done ? C.washi : C.moss, borderColor: C.moss,
              }}>{done ? "✓ 今月の手入れ済み" : "今月の手入れをした"}</button>
            )}
            <button onClick={onAsk} disabled={loading} style={btn}>
              {loading ? "調べています…" : `${month}月の手順をAIにくわしく聞く`}
            </button>
          </div>

          {note && (
            <p style={{
              fontFamily: font.goth, fontSize: 13, lineHeight: 1.9, color: C.ink,
              marginTop: 10, padding: 12, background: C.washi2, borderRadius: 3,
            }}>{note}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** 12か月の作業を一行ずつ。今見ている月に枠がつく */
function YearStrip({ p, month }) {
  const lines = [
    ["剪定", p.prune],
    ["収穫", p.harvest || []],
    ["肥料", p.fert],
    ["見頃", Object.keys(p.see).map(Number)],
  ].filter(([, ms]) => ms.length);
  if (!lines.length) return null;
  return (
    <div style={{ marginTop: 8, overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "34px repeat(12, minmax(18px, 1fr))", gap: 2, minWidth: 280 }}>
        <span />
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} style={{
            fontFamily: font.goth, fontSize: 9, textAlign: "center",
            color: i + 1 === month ? C.ai : C.inkSoft, fontWeight: i + 1 === month ? 700 : 400,
          }}>{i + 1}</span>
        ))}
        {lines.map(([k, ms]) => [
          <span key={k} style={{ fontFamily: font.min, fontSize: 11, color: KIND_COLOR[k], alignSelf: "center" }}>{k}</span>,
          ...Array.from({ length: 12 }, (_, i) => (
            <span key={k + i} style={{
              height: 14, borderRadius: 2,
              background: ms.includes(i + 1) ? KIND_COLOR[k] : C.washi2,
              opacity: ms.includes(i + 1) ? (k === "見頃" ? 0.45 : 0.85) : 1,
              outline: i + 1 === month ? `1.5px solid ${C.ai}` : "none", outlineOffset: -1,
            }} />
          )),
        ])}
      </div>
    </div>
  );
}

const subHead = {
  fontFamily: font.min, fontSize: 13, fontWeight: 700, color: C.ai, margin: "18px 0 0", letterSpacing: "0.1em",
};
const btn = {
  fontFamily: font.goth, fontSize: 12, color: C.ai, background: "transparent",
  border: `1px solid ${C.ai}`, borderRadius: 3, padding: "7px 14px", cursor: "pointer",
};
