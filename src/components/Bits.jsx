import { C, font } from "../theme";

/** ラベル付きの一行。剪定など「今」の情報は accent で熾色にする */
export function Section({ label, children, accent }) {
  return (
    <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
      <span style={{
        fontFamily: font.min, fontSize: 13, fontWeight: 600, flexShrink: 0, width: 44,
        paddingRight: 8, color: accent ? C.oki : C.moss,
        borderRight: `1px solid ${accent ? C.oki : C.line}`,
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
      display: "inline-flex", alignItems: "center", gap: 6,
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
