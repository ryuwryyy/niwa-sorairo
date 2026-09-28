/**
 * 単一選択 / 複数選択のチップ列。
 * options: [{ id, ja, en, hint }]、value は string（単一）または string[]（multi）。
 */
export default function Chips({
  options = [],
  value,
  onChange,
  multi = false,
  max = 0,
  allowEmpty = true,
  label = "",
  showEn = true,
  renderExtra = null,
}) {
  const selected = multi ? (Array.isArray(value) ? value : []) : value ? [value] : [];
  const atMax = multi && max > 0 && selected.length >= max;

  const toggle = (id) => {
    if (multi) {
      const has = selected.includes(id);
      if (has) onChange(selected.filter((x) => x !== id));
      else if (!atMax) onChange([...selected, id]);
    } else {
      onChange(value === id && allowEmpty ? "" : id);
    }
  };

  return (
    <div className="chips" role="group" aria-label={label || undefined}>
      {options.map((o) => {
        const id = o.id ?? o;
        const on = selected.includes(id);
        const blocked = !on && atMax;
        return (
          <button
            key={id}
            type="button"
            className={`chip${on ? " active" : ""}`}
            aria-pressed={on}
            disabled={blocked}
            title={[o.hint, showEn && o.en ? o.en : ""].filter(Boolean).join(" — ") || undefined}
            onClick={() => toggle(id)}
          >
            {renderExtra ? renderExtra(o) : null}
            {o.ja ?? o.labelJa ?? id}
          </button>
        );
      })}
      {multi && max > 0 && (
        <span className="small muted" style={{ alignSelf: "center" }}>{selected.length}/{max}</span>
      )}
    </div>
  );
}
