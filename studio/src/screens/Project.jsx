import vars from "../data/directionVars.json";
import { useStudio, STAGES, stageStatus } from "../store";
import { suggestAspect } from "../lib/prompt";
import { loadSample, SAMPLE_NAME } from "../lib/sample";
import Chips from "../components/Chips";
import ConfirmButton from "../components/ConfirmButton";
import { useToast } from "../components/Toast";

const STAGE_LINES = {
  project: "案件の名前・ブランド・成果物の種類を決める。ここで決めた成果物がアスペクト比の既定になる。",
  consult: "依頼文を課題に分解し、仮説を 3 つ立て、1 行ブリーフ（Get–To–By）と成功基準まで落とす。",
  refs: "カンヌの名作・Pinterest・Adobe Stock・自前画像を集め、それぞれに役割と「原理」を付ける。",
  direction: "主題・軸・技法・構図・光・配色・文字の扱いを変数として決める。下に完成プロンプトが即時に出る。",
  prompt: "変数から編まれた EN プロンプトを読み、磨き、版として残す。権利ガードがここで働く。",
  generate: "複数案を生成し、6 基準で批評し、修正指示で再生成する。星を付けて残す。",
  handoff: "選んだ画像から色を抽出しトークン化、spec.json を作って Figma プラグイン / MCP に渡す。",
};

export default function Project() {
  const { state, project, dispatch, patch, merge, setStage } = useStudio();
  const toast = useToast();
  const status = stageStatus(project);
  const list = Object.values(state.projects).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  const setDeliverable = (id) => {
    if (!id) return;
    const autoAspect = project.direction.aspect === suggestAspect(project.meta.deliverable);
    merge("meta", { deliverable: id });
    if (autoAspect) patch("direction.aspect", suggestAspect(id));
  };

  const duplicate = (p) => {
    dispatch({ type: "project/import", project: { ...p, id: null, name: `${p.name} のコピー` } });
    toast("案件を複製しました", "ok");
  };

  const hasSample = list.some((p) => p.name === SAMPLE_NAME);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="card">
        <div className="card-head"><h2>案件</h2></div>
        <div className="grid grid-2">
          <label className="field">
            <span className="label">案件名</span>
            <input
              className="input"
              value={project.name}
              placeholder="例: つちや茶舗 新ブランド KV"
              onChange={(e) => dispatch({ type: "project/rename", name: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="label">クライアント</span>
            <input className="input" value={project.meta.client} placeholder="会社・団体名" onChange={(e) => merge("meta", { client: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">ブランド <span className="hint">プロンプト冒頭に入る</span></span>
            <input className="input" value={project.meta.brand} placeholder="例: TSUCHIYA TEA" onChange={(e) => merge("meta", { brand: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">言語</span>
            <select className="select" value={project.meta.language} onChange={(e) => merge("meta", { language: e.target.value })}>
              <option value="ja">日本語（UI・解説）</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <span className="label">
            成果物
            <span className="hint">選ぶとアスペクト比の既定が変わります（手で変更済みの場合はそのまま）</span>
          </span>
          <Chips
            options={vars.deliverables}
            value={project.meta.deliverable}
            onChange={setDeliverable}
            allowEmpty={false}
            label="成果物"
          />
          <p className="help">
            {vars.deliverables.find((d) => d.id === project.meta.deliverable)?.hint} · 既定のアスペクト比 {suggestAspect(project.meta.deliverable)}
            {project.direction.aspect !== suggestAspect(project.meta.deliverable) && (
              <> · <strong>現在は {project.direction.aspect}</strong>（方向ステージで変更済み）</>
            )}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>7 つの段階</h2>
          <span className="small muted">順序は推奨であって強制ではありません。どこからでも編集できます。</span>
        </div>
        <ol className="pipeline">
          {STAGES.map((st) => (
            <li key={st.id}>
              <button className="pipeline-row" onClick={() => setStage(st.id)}>
                <span className="n mono">{st.n}</span>
                <span className="body">
                  <span className="t">{st.ja}<small className="muted"> {st.en}</small></span>
                  <span className="small muted">{STAGE_LINES[st.id]}</span>
                </span>
                <span className={`dot ${status[st.id] || ""}`} title={status[st.id]} />
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>はじめて使うとき</h2>
        </div>
        <p className="small">
          API キーが 1 つも無くても、課題設定・参照の整理・変数の操作・プロンプトのコンパイル・Figma spec の書き出しまで通して使えます。
          AI 機能（課題の構造化・原理抽出・磨き・批評）と画像生成だけがキーを必要とします。
        </p>
        <div className="row">
          <button
            className="btn btn-primary"
            onClick={() => { loadSample(dispatch); toast("サンプル案件を読み込みました", "ok"); }}
          >
            サンプル案件を読み込む
          </button>
          <span className="small muted">
            {hasSample ? "すでに読み込み済み（もう一度押すと複製されます）" : "京都の小さな茶舗の新ブランド KV。ブリーフ・仮説・参照・変数・プロンプトまで入った完成例です。"}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>案件一覧 <span className="small muted">{list.length} 件</span></h2>
          <button className="btn btn-sm" onClick={() => dispatch({ type: "project/create", name: `案件 ${list.length + 1}` })}>＋ 新しい案件</button>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          {list.map((p) => (
            <div key={p.id} className={`projrow${p.id === project.id ? " active" : ""}`}>
              <button className="projrow-main" onClick={() => dispatch({ type: "project/select", id: p.id })}>
                <span className="t">{p.name || "無題の案件"}</span>
                <span className="small muted">
                  {p.meta?.brand || "ブランド未設定"} · {vars.deliverables.find((d) => d.id === p.meta?.deliverable)?.ja || "—"}
                  {" · "}参照 {p.refs?.board?.length ?? 0} · 生成 {p.gens?.length ?? 0}
                  {p.updatedAt ? ` · ${new Date(p.updatedAt).toLocaleString("ja-JP")}` : ""}
                </span>
              </button>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-sm" onClick={() => duplicate(p)}>複製</button>
                <ConfirmButton
                  onConfirm={() => { dispatch({ type: "project/delete", id: p.id }); toast("案件を削除しました", "warn"); }}
                  confirmLabel="削除する？"
                  disabled={list.length === 1}
                  title={list.length === 1 ? "最後の 1 件は削除できません" : ""}
                >
                  削除
                </ConfirmButton>
              </div>
            </div>
          ))}
        </div>
        <p className="help" style={{ marginTop: 10 }}>
          案件は端末の localStorage に、画像は IndexedDB に保存されます。案件を削除しても端末内の画像データはそのまま残ります（他の案件が参照している可能性があるため）。
        </p>
      </div>
    </div>
  );
}
