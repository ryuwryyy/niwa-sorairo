import { useState } from "react";
import { currentKo } from "./data/sekki72";
import { PLANTS } from "./data/plants";
import Identify from "./views/Identify";
import Monthly from "./views/Monthly";
import Garden from "./views/Garden";
import { C, font } from "./theme";

// hint は初めての人向けの「何ができる画面か」
const TABS = [
  { id: "monthly", label: "今月の手入れ", hint: "何をすればいい?" },
  { id: "identify", label: "名前判定", hint: "この木はなに?" },
  { id: "garden", label: "庭づくり", hint: "配置を試す" },
];

const WELCOME_KEY = "teire:welcomed";

export default function App() {
  const [tab, setTab] = useState("monthly");
  const [focus, setFocus] = useState(null);
  const [welcome, setWelcome] = useState(() => {
    try { return !localStorage.getItem(WELCOME_KEY); } catch { return true; }
  });
  const ko = currentKo(new Date());

  const closeWelcome = (to) => {
    setWelcome(false);
    try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* 保存できなくても動く */ }
    if (to) setTab(to);
  };

  // 名前判定の結果から、その木の手入れへ飛ぶ
  const openPlant = (id) => { setFocus({ id, at: Date.now() }); setTab("monthly"); };

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
            {!welcome && (
              <button onClick={() => setWelcome(true)} style={{
                fontFamily: font.goth, fontSize: 11, color: C.moss, background: "transparent",
                border: `1px solid ${C.moss}`, borderRadius: 12, padding: "3px 10px", marginTop: 10, cursor: "pointer",
              }}>使い方</button>
            )}
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
              fontFamily: font.min, fontSize: 15, flex: 1, padding: "12px 0 10px", cursor: "pointer",
              background: "transparent", border: "none", letterSpacing: "0.1em", marginBottom: -1,
              borderBottom: tab === t.id ? `2px solid ${C.ai}` : "2px solid transparent",
              color: tab === t.id ? C.ai : C.inkSoft, fontWeight: tab === t.id ? 700 : 400,
            }}>
              {t.label}
              <span style={{
                display: "block", fontFamily: font.goth, fontSize: 10, fontWeight: 400,
                letterSpacing: 0, marginTop: 3, color: tab === t.id ? C.moss : C.inkSoft,
              }}>{t.hint}</span>
            </button>
          ))}
        </nav>

        {welcome && <Welcome onClose={closeWelcome} />}

        {tab === "monthly" && <Monthly focus={focus} />}
        {tab === "identify" && <Identify onOpenPlant={openPlant} />}
        {tab === "garden" && <Garden />}
      </div>
    </div>
  );
}

/** 初めて開いた人への案内。一度閉じたら出ない(ヘッダーの「使い方」で再表示) */
function Welcome({ onClose }) {
  const steps = [
    ["今月の手入れ", "monthly", "いま、どの木に、何をすればいいかが一覧でわかります。"],
    ["名前判定", "identify", "名前がわからない木は、写真を撮れば教えてくれます。"],
    ["庭づくり", "garden", "植える前に、木の配置を画面の上で試せます。"],
  ];
  return (
    <div style={{
      border: `1px solid ${C.moss}`, borderRadius: 4, padding: "18px 18px 16px",
      marginBottom: 22, background: `${C.mossPale}66`,
    }}>
      <p style={{ fontFamily: font.min, fontSize: 17, fontWeight: 700, color: C.ai, margin: 0 }}>
        はじめての方へ
      </p>
      <p style={{ fontFamily: font.goth, fontSize: 12, lineHeight: 1.9, color: C.inkSoft, margin: "6px 0 12px" }}>
        {PLANTS.length}種の庭木・果樹を、月ごとに「何をすればいいか」で案内する庭仕事の手帖です。
        登録もログインもいりません。
      </p>
      {steps.map(([label, to, text], i) => (
        <button key={to} onClick={() => onClose(to)} style={{
          display: "flex", gap: 12, alignItems: "baseline", width: "100%", textAlign: "left",
          background: "transparent", border: "none", borderTop: i ? `1px solid ${C.line}` : "none",
          padding: "10px 0", cursor: "pointer",
        }}>
          <span style={{ fontFamily: font.min, fontSize: 15, color: C.oki, flexShrink: 0 }}>{"一二三"[i]}</span>
          <span>
            <span style={{ fontFamily: font.min, fontSize: 14, fontWeight: 700, color: C.ai }}>{label}</span>
            <span style={{ display: "block", fontFamily: font.goth, fontSize: 12, lineHeight: 1.8, color: C.ink }}>{text}</span>
          </span>
        </button>
      ))}
      <button onClick={() => onClose("monthly")} style={{
        fontFamily: font.min, fontSize: 15, width: "100%", marginTop: 10, padding: "12px 0",
        background: C.ai, color: C.washi, border: "none", borderRadius: 3, cursor: "pointer", letterSpacing: "0.15em",
      }}>今月やることを見る</button>
    </div>
  );
}
