import { useState } from "react";
import { useStudio } from "../store";
import { maxRefImages, modelSpec } from "../lib/refsources";
import RefsCannes from "../components/RefsCannes";
import RefsPinterest from "../components/RefsPinterest";
import RefsAdobe from "../components/RefsAdobe";
import RefsUpload from "../components/RefsUpload";
import RefCard from "../components/RefCard";

const TABS = [
  { id: "cannes", ja: "カンヌ", hint: "受賞作の原理" },
  { id: "pinterest", ja: "Pinterest", hint: "チームの Pin / URL / 埋め込み" },
  { id: "adobe", ja: "Adobe Stock", hint: "表示のみ" },
  { id: "upload", ja: "自前画像", hint: "画像を渡せる唯一の出所" },
  { id: "board", ja: "ボード", hint: "役割と重みを付ける" },
];

export default function Refs() {
  const { project, dispatch } = useStudio();
  const [tab, setTab] = useState("cannes");
  const board = project.refs.board;

  const move = (index, dir) => {
    const next = [...board];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    dispatch({ type: "refs/reorder", ids: next.map((r) => r.id) });
  };

  const max = maxRefImages(project.direction);
  const model = modelSpec(project.direction);
  const passing = board.filter((r) => r.passPixels && (r.blobKey || r.imageUrl));
  const principlesOnly = board.length - passing.length;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            {t.ja}
            {t.id === "board" && board.length ? <span className="badge" style={{ marginLeft: 6 }}>{board.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === "cannes" && <RefsCannes />}
      {tab === "pinterest" && <RefsPinterest />}
      {tab === "adobe" && <RefsAdobe />}
      {tab === "upload" && <RefsUpload />}

      {tab === "board" && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="card">
            <div className="card-head">
              <h2>ムードボード</h2>
              <span className="small muted">{board.length} 件</span>
            </div>
            <div className="row">
              <span className="badge sora">画像を渡す {passing.length}</span>
              <span className="badge">原理のみ {principlesOnly}</span>
              <span className="small muted">
                {model.label || "既定モデル"} は参照画像を最大 {max} 枚まで受け取ります
                {passing.length > max && <strong className="danger"> — 上位 {max} 枚（重み順）だけが送られます</strong>}
              </span>
            </div>
            {passing.length > max && (
              <div className="alert warn small" style={{ marginTop: 8 }}>
                画像を渡す参照が上限（{max} 枚）を超えています。重みの高い順に {max} 枚だけ送られ、残りは原理テキストとして扱われます。
              </div>
            )}
            <p className="help" style={{ marginTop: 8 }}>
              役割は「この参照から何<em>だけ</em>を見るか」。重みは並び順（画像を渡す順番）に効きます。
            </p>
          </div>

          {board.length ? (
            <div className="stack" style={{ gap: 12 }}>
              {board.map((r, i) => (
                <RefCard key={r.id} item={r} index={i} count={board.length} onMove={move} />
              ))}
            </div>
          ) : (
            <div className="empty">
              まだ参照がありません。「カンヌ」で原理を採用するか、「自前画像」から投入してください。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
