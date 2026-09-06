import { useState } from "react";
import { currentKo } from "./data/sekki72";
import Identify from "./views/Identify";
import Calendar from "./views/Calendar";
import Garden from "./views/Garden";
import { C, font } from "./theme";

const TABS = [
  { id: "identify", label: "名前判定", view: Identify },
  { id: "calendar", label: "手入れ暦", view: Calendar },
  { id: "garden", label: "庭づくり", view: Garden },
];

export default function App() {
  const [tab, setTab] = useState("garden");
  const ko = currentKo(new Date());
  const View = TABS.find((t) => t.id === tab).view;

  return (
    <div style={{ minHeight: "100vh", background: C.washi, color: C.ink }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 20px 60px" }}>

        {/* 縦書きの七十二候が、この画面の署名 */}
        <header style={{
          display: "flex", alignItems: "stretch", gap: 20,
          padding: "36px 0 24px", borderBottom: `1px solid ${C.line}`,
        }}>
          <div style={{ flex: 1 }}>
            <h1 style={{
              fontFamily: font.min, fontSize: 34, fontWeight: 700, margin: 0,
              letterSpacing: "0.3em", color: C.ai,
            }}>手入れ</h1>
            <p style={{
              fontFamily: font.goth, fontSize: 12, margin: "10px 0 0",
              lineHeight: 1.9, color: C.inkSoft,
            }}>名前を知り、季節を待ち、手を入れる。</p>
          </div>
          <div style={{
            writingMode: "vertical-rl", fontFamily: font.min,
            borderLeft: `2px solid ${C.oki}`, paddingLeft: 12,
            display: "flex", gap: 8, alignItems: "flex-start",
          }}>
            <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "0.2em", color: C.ai }}>{ko[1]}</span>
            <span style={{ fontSize: 10, letterSpacing: "0.15em", color: C.inkSoft }}>{ko[2]}</span>
          </div>
        </header>

        <nav style={{ display: "flex", borderBottom: `1px solid ${C.line}`, marginBottom: 24 }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              fontFamily: font.min, fontSize: 15, flex: 1, padding: "14px 0", cursor: "pointer",
              background: "transparent", border: "none", letterSpacing: "0.2em", marginBottom: -1,
              borderBottom: tab === t.id ? `2px solid ${C.ai}` : "2px solid transparent",
              color: tab === t.id ? C.ai : C.inkSoft, fontWeight: tab === t.id ? 700 : 400,
            }}>{t.label}</button>
          ))}
        </nav>

        <View />
      </div>
    </div>
  );
}
