/** frameworks.json の 1 フレームを、step.type に従って汎用レンダリングする。 */
import TagInput from "./TagInput";

export default function FrameRunner({ frame, answers = {}, onChange }) {
  if (!frame) return null;
  const set = (key, value) => onChange?.({ ...answers, [key]: value });

  return (
    <div className="frame-runner stack" style={{ gap: 14 }}>
      <div className="stack" style={{ gap: 4 }}>
        <div className="row" style={{ gap: 8 }}>
          <h3>{frame.name}<small className="muted"> {frame.nameEn}</small></h3>
          <span className="badge">{frame.minutes} 分</span>
          <span className="right small muted">{frame.origin}</span>
        </div>
        <p className="small">{frame.summaryJa}</p>
        <p className="small muted">使いどころ — {frame.whenJa}</p>
        {frame.sourceUrl && (
          <a className="small" href={frame.sourceUrl} target="_blank" rel="noreferrer noopener">出典を読む</a>
        )}
      </div>

      {frame.steps.map((step) => {
        const v = answers[step.key];
        return (
          <div className="field" key={step.key} style={{ marginBottom: 0 }}>
            <span className="label">{step.promptJa}</span>

            {step.type === "text" && (
              <textarea
                className="textarea"
                style={{ minHeight: 64 }}
                value={v || ""}
                placeholder={step.placeholderJa}
                aria-label={step.promptJa}
                onChange={(e) => set(step.key, e.target.value)}
              />
            )}

            {step.type === "list" && (
              <TagInput
                value={Array.isArray(v) ? v : []}
                onChange={(next) => set(step.key, next)}
                placeholder={step.placeholderJa || "入力して Enter"}
                label={step.promptJa}
              />
            )}

            {step.type === "choice" && (
              <div className="chips">
                {(step.options || []).map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={`chip${v === o ? " active" : ""}`}
                    aria-pressed={v === o}
                    onClick={() => set(step.key, v === o ? "" : o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}

            {step.type === "slider" && (
              <div className="axis">
                <span className="l">{step.leftJa}</span>
                <input
                  className="slider"
                  type="range"
                  min={step.min ?? 0}
                  max={step.max ?? 100}
                  value={v ?? Math.round(((step.min ?? 0) + (step.max ?? 100)) / 2)}
                  aria-label={step.promptJa}
                  onChange={(e) => set(step.key, Number(e.target.value))}
                />
                <span className="r">{step.rightJa}</span>
              </div>
            )}
          </div>
        );
      })}

      {!!frame.feeds?.length && (
        <p className="small muted">この回答が効く先: {frame.feeds.join(" / ")}</p>
      )}
    </div>
  );
}
