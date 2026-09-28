/** 抽出した配色に役割を割り当てる。コントラスト比（WCAG）も出す。 */
import { COLOR_ROLES, ROLE_LABELS, contrastRatio, setRole } from "../lib/palette";

function Contrast({ label, fg, bg, need = 4.5 }) {
  const r = contrastRatio(fg, bg);
  const ok = r >= need;
  return (
    <div className="row small" style={{ gap: 6 }}>
      <span className="chip" style={{ background: bg, color: fg, borderColor: "var(--line)" }}>{label}</span>
      <span className={`badge ${ok ? "ok" : "danger"}`}>{r.toFixed(2)} : 1</span>
      <span className="muted">{ok ? `AA (${need}) を満たす` : `AA (${need}) に届かない`}</span>
    </div>
  );
}

export default function PaletteRoles({ palette = [], colors, onChange }) {
  if (!colors) return null;
  const roleOf = (hex) => COLOR_ROLES.find((k) => (colors[k] || "").toLowerCase() === hex.toLowerCase()) || "";
  // hex[] でも [{hex, share}] でも受ける
  const list = palette.map((p) => (typeof p === "string" ? { hex: p, share: null } : p)).filter((p) => p?.hex);

  return (
    <div className="stack" style={{ gap: 12 }}>
      {!!list.length && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">抽出された色{list[0].share != null ? "（面積順）" : ""}</span>
          <div className="palette-extract">
            {list.map((p, i) => (
              <div className="pe" key={`${p.hex}-${i}`}>
                <span className="pe-sw" style={{ background: p.hex }} />
                <span className="mono small">{p.hex}</span>
                {p.share != null && <span className="small muted">{Math.round(p.share * 100)}%</span>}
                <select
                  className="select"
                  value={roleOf(p.hex)}
                  aria-label={`${p.hex} の役割`}
                  onChange={(e) => { if (e.target.value) onChange(setRole(colors, e.target.value, p.hex)); }}
                >
                  <option value="">役割に割り当てる…</option>
                  {COLOR_ROLES.map((k) => <option key={k} value={k}>{ROLE_LABELS[k]}（{k}）</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stack" style={{ gap: 6 }}>
        <span className="label">トークン</span>
        <div className="role-grid">
          {COLOR_ROLES.map((k) => (
            <label className="role-cell" key={k}>
              <span className="small">{ROLE_LABELS[k]}<br /><span className="muted mono" style={{ fontSize: 10 }}>{k}</span></span>
              <input type="color" className="color" value={colors[k] || "#888888"} aria-label={ROLE_LABELS[k]} onChange={(e) => onChange(setRole(colors, k, e.target.value.toUpperCase()))} />
              <input className="input mono" style={{ width: 92 }} value={colors[k] || ""} aria-label={`${ROLE_LABELS[k]} の hex`} onChange={(e) => onChange(setRole(colors, k, e.target.value.toUpperCase()))} />
            </label>
          ))}
        </div>
      </div>

      <div className="stack" style={{ gap: 4 }}>
        <span className="label">コントラスト</span>
        <Contrast label="本文 / 背景" fg={colors.ink} bg={colors.bg} />
        <Contrast label="ボタン文字 / 主色" fg={colors.onPrimary} bg={colors.primary} />
        <Contrast label="弱い文字 / 背景" fg={colors.inkSoft} bg={colors.bg} need={3} />
      </div>
    </div>
  );
}
