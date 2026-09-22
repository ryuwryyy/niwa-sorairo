import { useState } from "react";
import { C, font, KIND_COLOR } from "../theme";
import { GLOSSARY } from "../data/plants";

/** ラベル付きの一行。剪定など「今」の情報は accent で熾色にする */
export function Section({ label, children, accent, color }) {
  const col = color || (accent ? C.oki : C.moss);
  return (
    <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
      <span style={{
        fontFamily: font.min, fontSize: 13, fontWeight: 600, flexShrink: 0, width: 44,
        paddingRight: 8, color: col,
        borderRight: `1px solid ${color || accent ? col : C.line}`,
      }}>{label}</span>
      <p style={{ fontFamily: font.goth, fontSize: 13, lineHeight: 1.95, margin: 0, color: C.ink }}>
        {children}
      </p>
    </div>
  );
}

/** 丸みのある選択チップ。swatch を渡すと葉色の四角が付く */
export function Chip({ label, active, onClick, swatch }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: font.goth, fontSize: 12, padding: "7px 12px", cursor: "pointer",
      borderRadius: 14, border: `1px solid ${active ? C.ai : C.line}`,
      background: active ? C.ai : "#ffffff88", color: active ? C.washi : C.ink,
      display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {swatch && <span style={{ width: 10, height: 10, borderRadius: 3, background: swatch, flexShrink: 0 }} />}
      {label}
    </button>
  );
}

export function Tag({ children }) {
  return (
    <span style={{
      fontFamily: font.goth, fontSize: 11, color: C.inkSoft,
      border: `1px solid ${C.inkSoft}`, borderRadius: 2, padding: "2px 8px",
    }}>{children}</span>
  );
}

/** 作業の種類を示す小さな札 */
export function KindLabel({ kind, count, active, onClick }) {
  const col = KIND_COLOR[kind];
  const Tagn = onClick ? "button" : "span";
  return (
    <Tagn onClick={onClick} style={{
      fontFamily: font.goth, fontSize: 11, lineHeight: 1.4, padding: "2px 8px", borderRadius: 2,
      border: `1px solid ${col}`, background: active ? col : "transparent",
      color: active ? C.washi : col, cursor: onClick ? "pointer" : "default",
      display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
    }}>
      {kind}{count != null && <b style={{ fontWeight: 500 }}>{count}</b>}
    </Tagn>
  );
}

const TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const TERM_RE = new RegExp(`(${TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`);

/**
 * 本文中の専門用語に点線を引き、タップで意味を差し込む。
 * 初めての人が「透かしって何?」で止まらないように。
 */
export function Rich({ text }) {
  const [open, setOpen] = useState(null);
  const seen = new Set();
  const parts = String(text).split(TERM_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0 || seen.has(part)) return part;
        seen.add(part);
        return (
          <span key={i} role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setOpen(open === part ? null : part); }}
            onKeyDown={(e) => { if (e.key === "Enter") setOpen(open === part ? null : part); }}
            style={{
              borderBottom: `1px dotted ${C.moss}`, cursor: "help",
              color: open === part ? C.moss : "inherit",
            }}>{part}</span>
        );
      })}
      {open && (
        <span style={{
          display: "block", marginTop: 6, padding: "6px 10px", fontSize: 12, lineHeight: 1.8,
          background: C.mossPale, borderRadius: 3, color: C.ink,
        }}>
          <b style={{ fontFamily: font.min, color: C.moss, marginRight: 6 }}>{open}</b>{GLOSSARY[open]}
        </span>
      )}
    </>
  );
}
