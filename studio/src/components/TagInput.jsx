/** 自由入力のタグ欄。Enter / 読点 / カンマ で確定、Backspace で末尾を削除。 */
import { useId, useState } from "react";

export default function TagInput({
  value = [],
  onChange,
  placeholder = "入力して Enter",
  suggestions = [],
  label = "",
  max = 0,
  disabled = false,
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const list = Array.isArray(value) ? value : [];

  const commit = (raw) => {
    const parts = String(raw ?? "")
      .split(/[,、\n\t]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...list];
    for (const p of parts) {
      if (next.includes(p)) continue;
      if (max && next.length >= max) break;
      next.push(p);
    }
    if (next.length !== list.length) onChange(next);
    setDraft("");
  };

  const remove = (t) => onChange(list.filter((x) => x !== t));

  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && list.length) {
      e.preventDefault();
      remove(list.at(-1));
    }
  };

  const free = (suggestions || []).filter((s) => !list.includes(s.id ?? s));

  return (
    <div className="taginput">
      <div className="chips">
        {list.map((t) => (
          <span key={t} className="chip active tag">
            {t}
            {!disabled && (
              <button type="button" className="x" onClick={() => remove(t)} aria-label={`${t} を外す`}>×</button>
            )}
          </span>
        ))}
      </div>
      <input
        id={inputId}
        className="input"
        type="text"
        value={draft}
        disabled={disabled || (!!max && list.length >= max)}
        aria-label={label || placeholder}
        placeholder={max && list.length >= max ? `上限 ${max} 件` : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
      />
      {!!free.length && (
        <div className="chips" style={{ marginTop: 6 }}>
          {free.slice(0, 12).map((s) => {
            const id = s.id ?? s;
            const ja = s.ja ?? s;
            return (
              <button key={id} type="button" className="chip" onClick={() => commit(ja)}>＋ {ja}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}
