/** 配色の編集（最大 6 色）。mode: auto / manual / from_ref */
import vars from "../data/directionVars.json";
import { colorName } from "../lib/prompt";
import Chips from "./Chips";

const MODES = [
  { id: "auto", ja: "自動", hint: "色は指定せず、調和だけを指示する" },
  { id: "manual", ja: "手で決める", hint: "hex を 3 色以上入れると 60-30-10 の文が出る" },
  { id: "from_ref", ja: "参照から", hint: "ボードの参照から抽出した配色を使う" },
];

export default function PaletteEditor({ palette, onChange, refsWithPalette = [], onAdoptRef }) {
  const colors = palette.colors || [];
  const setColors = (next) => onChange({ ...palette, colors: next.filter(Boolean).slice(0, 6) });
  const setAt = (i, hex) => setColors(colors.map((c, j) => (j === i ? hex : c)));

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="segmented" role="group" aria-label="配色の決め方">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`seg${palette.mode === m.id ? " active" : ""}`}
            title={m.hint}
            onClick={() => onChange({ ...palette, mode: m.id })}
          >
            {m.ja}
          </button>
        ))}
      </div>

      {palette.mode !== "auto" && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="palette-rows">
            {colors.map((c, i) => (
              <div className="palette-row" key={`${i}-${c}`}>
                <span className="mono small muted">{i === 0 ? "主 60%" : i === 1 ? "副 30%" : i === 2 ? "差 10%" : "補"}</span>
                <input
                  type="color"
                  className="color"
                  value={/^#[0-9a-f]{6}$/i.test(c) ? c : "#888888"}
                  aria-label={`色 ${i + 1}`}
                  onChange={(e) => setAt(i, e.target.value.toUpperCase())}
                />
                <input
                  className="input mono"
                  style={{ width: 110 }}
                  value={c}
                  aria-label={`色 ${i + 1} の hex`}
                  onChange={(e) => setAt(i, e.target.value.toUpperCase())}
                />
                <span className="small muted">{colorName(c) || "—"}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => setColors(colors.filter((_, j) => j !== i))} aria-label={`色 ${i + 1} を削除`}>×</button>
              </div>
            ))}
          </div>
          {colors.length < 6 && (
            <div><button className="btn btn-sm" onClick={() => setColors([...colors, "#8899AA"])}>＋ 色を足す</button></div>
          )}
          {colors.length > 0 && colors.length < 3 && (
            <p className="small muted">3 色以上あると「60-30-10（主・副・差し色）」の指示文が作られます。</p>
          )}
        </div>
      )}

      <div className="field" style={{ marginBottom: 0 }}>
        <span className="label">調和</span>
        <Chips options={vars.harmony} value={palette.harmony} onChange={(v) => onChange({ ...palette, harmony: v })} allowEmpty={false} label="調和" />
      </div>

      {palette.mode === "from_ref" && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">参照から採用</span>
          {refsWithPalette.length ? (
            <div className="stack" style={{ gap: 6 }}>
              {refsWithPalette.map((r) => (
                <div className="row" key={r.id}>
                  <div className="swatches">
                    {(r.palette || []).slice(0, 6).map((c, i) => <span key={`${c}-${i}`} className="swatch" style={{ background: c }} title={c} />)}
                  </div>
                  <span className="small" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{r.title || "無題"}</span>
                  <button className="btn btn-sm right" onClick={() => onAdoptRef?.(r)}>採用</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="small muted">配色を持つ参照がまだありません。参照ステージで「原理を抽出 (AI)」を実行すると色が付きます。</p>
          )}
        </div>
      )}
    </div>
  );
}
