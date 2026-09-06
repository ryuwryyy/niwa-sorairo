import { useState, useEffect, useRef } from "react";
import { SPECIES, SPEC_MAP, CATS } from "../data/species";
import { drawSprite } from "../lib/sprite";
import { mulberry32 } from "../lib/random";
import { askClaude } from "../lib/api";
import { C, font, GRID, isoX, isoY, SKIES, GRASS } from "../theme";
import { Chip } from "../components/Bits";

const STORAGE_KEY = "teire:garden";

export default function Garden() {
  const [cat, setCat] = useState("高木");
  const [sel, setSel] = useState("アオダモ");
  const [dig, setDig] = useState(false);
  const [placed, setPlaced] = useState({});
  const [time, setTime] = useState("昼");
  const [caption, setCaption] = useState("");
  const ready = useRef(false);

  // 庭は端末に自動保存。次に開いた時も続きから作れる
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v) setPlaced(JSON.parse(v));
    } catch { /* 初回は保存なし */ }
    ready.current = true;
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(placed)); } catch { /* 容量超過等は無視 */ }
  }, [placed]);

  const onTile = (r, c) => {
    const k = `${r},${c}`;
    setPlaced((p) => {
      const n = { ...p };
      if (dig) delete n[k]; else n[k] = sel;
      return n;
    });
  };

  const randomPlant = () => {
    const pool = SPECIES.filter((s) => s.cat === cat);
    setPlaced((p) => {
      const n = { ...p };
      let added = 0, tries = 0;
      while (added < 10 && tries < 300) {
        tries++;
        const k = `${Math.floor(Math.random() * GRID.ROWS)},${Math.floor(Math.random() * GRID.COLS)}`;
        if (n[k]) continue;
        n[k] = pool[Math.floor(Math.random() * pool.length)].name;
        added++;
      }
      return n;
    });
  };

  const askCaption = async () => {
    const names = [...new Set(Object.values(placed))];
    if (!names.length) return;
    setCaption("…");
    try {
      const t = await askClaude(
        `${time}の庭。植えられているのは${names.slice(0, 12).join("、")}。この庭への添え書きを俳句的な一文(20字以内)で。本文のみ。`, 100);
      setCaption(t.trim().split("\n")[0].slice(0, 30));
    } catch {
      setCaption("(この環境では添え書きを取得できません)");
    }
  };

  const sky = SKIES[time], grass = GRASS[time];

  const tiles = [];
  for (let r = 0; r < GRID.ROWS; r++) {
    for (let c = 0; c < GRID.COLS; c++) {
      const x = isoX(c, r), y = isoY(c, r);
      tiles.push(
        <polygon key={`t${r}-${c}`}
          points={`${x},${y - GRID.TH / 2} ${x + GRID.TW / 2},${y} ${x},${y + GRID.TH / 2} ${x - GRID.TW / 2},${y}`}
          fill={(r + c) % 2 ? grass[0] : grass[1]}
          stroke="#fff" strokeOpacity="0.07" style={{ cursor: "pointer" }}
          onClick={() => onTile(r, c)} />
      );
    }
  }

  // 奥のマスから順に描くことで、手前の植物が奥に重なる
  const sprites = Object.entries(placed)
    .map(([k, name]) => {
      const [r, c] = k.split(",").map(Number);
      return { k, r, c, sp: SPEC_MAP[name] };
    })
    .filter((e) => e.sp)
    .sort((a, b) => (a.r + a.c) - (b.r + b.c) || a.c - b.c)
    .map(({ k, r, c, sp }) => (
      <g key={k} style={{ pointerEvents: "none" }}
        dangerouslySetInnerHTML={{
          __html: drawSprite(sp, isoX(c, r), isoY(c, r), 0.85,
            mulberry32(r * 97 + c * 13 + sp.name.length * 7 + 11)),
        }} />
    ));

  return (
    <div>
      <p style={{ fontFamily: font.goth, fontSize: 13, lineHeight: 1.9, margin: "0 0 14px", color: C.inkSoft }}>
        植物を選んで、マスをタップして植える。{SPECIES.length}種を好きなだけ混植できます。庭は自動で保存されます。
      </p>

      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {CATS.map((cn) => (
          <button key={cn} onClick={() => {
            setCat(cn);
            const first = SPECIES.find((s) => s.cat === cn);
            if (first) { setSel(first.name); setDig(false); }
          }} style={{
            fontFamily: font.min, fontSize: 13, padding: "8px 10px", cursor: "pointer",
            background: "transparent", border: "none",
            borderBottom: cat === cn ? `2px solid ${C.oki}` : "2px solid transparent",
            color: cat === cn ? C.ai : C.inkSoft, fontWeight: cat === cn ? 700 : 400,
          }}>{cn}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {SPECIES.filter((s) => s.cat === cat).map((sp) => (
          <Chip key={sp.name} label={sp.name} swatch={sp.fol}
            active={sel === sp.name && !dig}
            onClick={() => { setSel(sp.name); setDig(false); }} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <Chip label={dig ? "✓ 抜くモード" : "抜く"} active={dig} onClick={() => setDig(!dig)} />
        <Chip label="おまかせで10株" onClick={randomPlant} />
        <Chip label="更地に戻す" onClick={() => { setPlaced({}); setCaption(""); }} />
        <span style={{ fontFamily: font.goth, fontSize: 11, marginLeft: "auto", color: C.inkSoft }}>
          {Object.keys(placed).length} 株
        </span>
      </div>

      <svg viewBox="0 0 800 410" style={{ width: "100%", display: "block", borderRadius: 8, touchAction: "manipulation" }}>
        <defs>
          <linearGradient id="gsky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sky[0]} />
            <stop offset="100%" stopColor={sky[1]} />
          </linearGradient>
        </defs>
        <rect width="800" height="410" fill="url(#gsky)" />
        <rect y="270" width="800" height="140" fill={grass[1]} opacity="0.35" />
        {tiles}
        {sprites}
        {time === "夕暮れ" && <rect width="800" height="410" fill="#B06A4B" opacity="0.13" style={{ pointerEvents: "none" }} />}
        {time === "朝" && <rect width="800" height="410" fill="#F6F2DF" opacity="0.1" style={{ pointerEvents: "none" }} />}
      </svg>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {["朝", "昼", "夕暮れ"].map((t) => (
          <Chip key={t} label={t} active={time === t} onClick={() => setTime(t)} />
        ))}
        {Object.keys(placed).length > 0 && (
          <Chip label="この庭に添え書きをもらう" onClick={askCaption} />
        )}
      </div>
      {caption && (
        <p style={{ fontFamily: font.min, fontSize: 14, marginTop: 12, color: C.ai }}>{caption}</p>
      )}
    </div>
  );
}
