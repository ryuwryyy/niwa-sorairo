/** compilePrompt() のブロック配列を色分けして表示する。 */
export default function PromptBlocks({ blocks = [], showJa = true, onJump = null }) {
  if (!blocks.length) return <div className="empty">まだブロックがありません</div>;
  return (
    <div className="prompt-blocks">
      {blocks.map((b) => (
        <div key={b.key} className={`prompt-block ${b.key}`}>
          <div className="k row" style={{ gap: 6 }}>
            <span>{b.labelJa}</span>
            {onJump && <button className="btn btn-sm btn-ghost" onClick={() => onJump(b.key)}>変数へ</button>}
          </div>
          <div className="en">{b.en}</div>
          {showJa && b.ja ? <div className="ja">{b.ja}</div> : null}
        </div>
      ))}
    </div>
  );
}
