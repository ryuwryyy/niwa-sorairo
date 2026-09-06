import { useState } from "react";
import { PLANTS } from "../data/plants";
import { askClaude } from "../lib/api";
import { C, font } from "../theme";
import { Section } from "../components/Bits";

export default function Calendar() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [open, setOpen] = useState(null);
  const [notes, setNotes] = useState({});
  const [loadingId, setLoadingId] = useState(null);

  const askDetail = async (p) => {
    setLoadingId(p.id);
    try {
      const t = await askClaude(
        `${p.name}(${p.sci})の${month}月の手入れについて、日本の温暖地の庭植え前提で具体的な作業手順を3〜4文で。専門用語には短い補足を。前置きなしで本文のみ。`, 500);
      setNotes((n) => ({ ...n, [p.id + month]: t }));
    } catch {
      setNotes((n) => ({ ...n, [p.id + month]: "この環境では取得できません。" }));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <button key={m} onClick={() => setMonth(m)} style={{
            fontFamily: font.min, fontSize: 14, minWidth: 40, padding: "8px 0", cursor: "pointer",
            border: "none", background: "transparent",
            borderBottom: m === month ? `2px solid ${C.oki}` : "2px solid transparent",
            color: m === month ? C.ai : C.inkSoft, fontWeight: m === month ? 700 : 400,
          }}>{m}月</button>
        ))}
      </div>

      {PLANTS.map((p) => {
        const inPrune = p.prune.includes(month);
        const isSummer = month >= 6 && month <= 8;
        const isOpen = open === p.id;
        return (
          <div key={p.id} style={{ borderBottom: `1px solid ${C.line}` }}>
            <button onClick={() => setOpen(isOpen ? null : p.id)} style={{
              width: "100%", textAlign: "left", background: "transparent", border: "none",
              cursor: "pointer", padding: "14px 4px", display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: inPrune ? C.oki : isSummer ? C.moss : C.line,
              }} />
              <span style={{ fontFamily: font.min, fontSize: 16, flex: 1, color: C.ink }}>{p.name}</span>
              <span style={{ fontFamily: font.goth, fontSize: 11, color: inPrune ? C.oki : C.inkSoft }}>
                {inPrune ? "剪定適期" : p.type}
              </span>
            </button>

            {isOpen && (
              <div style={{ padding: "0 4px 16px 18px" }}>
                {inPrune
                  ? <Section label="剪定" accent>{p.how}</Section>
                  : p.prune.length > 0 && (
                    <Section label="剪定">
                      {`適期は${p.prune.join("・")}月。今月は切らずに樹形を観察しておく。`}
                    </Section>
                  )}
                {isSummer && <Section label="夏">{p.summer}</Section>}
                <Section label="水">{p.water}</Section>

                <button onClick={() => askDetail(p)} disabled={loadingId === p.id} style={{
                  fontFamily: font.goth, fontSize: 12, color: C.ai, background: "transparent",
                  border: `1px solid ${C.ai}`, borderRadius: 3, padding: "6px 14px",
                  marginTop: 10, cursor: "pointer",
                }}>
                  {loadingId === p.id ? "調べています…" : `${month}月の手順をAIに聞く`}
                </button>

                {notes[p.id + month] && (
                  <p style={{
                    fontFamily: font.goth, fontSize: 13, lineHeight: 1.9, color: C.ink,
                    marginTop: 10, padding: 12, background: C.washi2, borderRadius: 3,
                  }}>{notes[p.id + month]}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
