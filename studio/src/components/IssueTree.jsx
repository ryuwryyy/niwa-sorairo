/** 3 階層までの編集可能な課題ツリー。 [{ id, text, children[] }] */
import { uid } from "../store";

const MAX_DEPTH = 3;

function Node({ node, depth, onPatch, onRemove, onAddChild }) {
  return (
    <li className={`tree-node d${depth}`}>
      <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
        <span className="tree-bullet mono small">{"—".repeat(depth + 1)}</span>
        <input
          className="input"
          value={node.text || ""}
          aria-label={`第 ${depth + 1} 階層の項目`}
          placeholder={depth === 0 ? "解くべき問い" : "枝（重なりのない切り口）"}
          onChange={(e) => onPatch({ text: e.target.value })}
        />
        {depth + 1 < MAX_DEPTH && (
          <button className="btn btn-sm btn-ghost" onClick={onAddChild} title="子を足す">＋</button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={onRemove} title="この項目を消す" aria-label="削除">×</button>
      </div>
      {!!node.children?.length && (
        <ul className="tree">
          {node.children.map((c, i) => (
            <Node
              key={c.id}
              node={c}
              depth={depth + 1}
              onPatch={(p) => onPatch({ children: node.children.map((x, j) => (j === i ? { ...x, ...p } : x)) })}
              onRemove={() => onPatch({ children: node.children.filter((_, j) => j !== i) })}
              onAddChild={() =>
                onPatch({
                  children: node.children.map((x, j) =>
                    j === i ? { ...x, children: [...(x.children || []), { id: uid(), text: "", children: [] }] } : x,
                  ),
                })
              }
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function IssueTree({ nodes = [], onChange }) {
  const add = () => onChange([...nodes, { id: uid(), text: "", children: [] }]);
  return (
    <div className="stack" style={{ gap: 8 }}>
      {nodes.length ? (
        <ul className="tree">
          {nodes.map((n, i) => (
            <Node
              key={n.id}
              node={n}
              depth={0}
              onPatch={(p) => onChange(nodes.map((x, j) => (j === i ? { ...x, ...p } : x)))}
              onRemove={() => onChange(nodes.filter((_, j) => j !== i))}
              onAddChild={() =>
                onChange(nodes.map((x, j) => (j === i ? { ...x, children: [...(x.children || []), { id: uid(), text: "", children: [] }] } : x)))
              }
            />
          ))}
        </ul>
      ) : (
        <div className="empty small">まだ枝がありません。「＋ 問いを足す」から始めてください。</div>
      )}
      <div><button className="btn btn-sm" onClick={add}>＋ 問いを足す</button></div>
    </div>
  );
}
