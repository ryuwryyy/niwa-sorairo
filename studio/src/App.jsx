import { useEffect, useMemo, useRef, useState } from "react";
import { StudioProvider, useStudio, STAGES, stageStatus, activePrompt, latestGen, serializeProject, parseProject } from "./store";
import { useBlobUrl } from "./lib/idb";
import { api } from "./lib/api";
import Project from "./screens/Project";
import Consult from "./screens/Consult";
import Refs from "./screens/Refs";
import Direction from "./screens/Direction";
import Prompt from "./screens/Prompt";
import Generate from "./screens/Generate";
import Handoff from "./screens/Handoff";
import { ToastProvider } from "./components/Toast";

const SCREENS = { project: Project, consult: Consult, refs: Refs, direction: Direction, prompt: Prompt, generate: Generate, handoff: Handoff };

export default function App() {
  return (
    <StudioProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StudioProvider>
  );
}

function Shell() {
  const { state, project, dispatch, stage, setStage, settings } = useStudio();
  const Screen = SCREENS[stage] || Project;
  const meta = STAGES.find((s) => s.id === stage) || STAGES[0];
  const status = useMemo(() => stageStatus(project), [project]);
  const [panelOpen, setPanelOpen] = useState(true);

  // テーマ
  useEffect(() => {
    const t = settings.theme || "auto";
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }, [settings.theme]);

  // API キーの有無（表示のみ）
  useEffect(() => {
    let alive = true;
    api.status().then((s) => { if (alive) dispatch({ type: "settings/patch", patch: { apiStatus: s } }); });
    return () => { alive = false; };
  }, [dispatch]);

  // ステージ切替でスクロールを戻す
  useEffect(() => { window.scrollTo({ top: 0 }); }, [stage]);

  return (
    <div className={`shell${panelOpen ? "" : " panel-closed"}`}>
      <Rail status={status} />
      <div className="main">
        <MobileStepper status={status} />
        <header className="main-head">
          <div className="title">
            <span className="en">{meta.n} · {meta.en}</span>
            <h1>{meta.ja}</h1>
            <span className="small muted">{meta.hint}</span>
          </div>
          <div className="row">
            <ProjectSwitcher />
            <button className="btn btn-sm btn-ghost" onClick={() => setPanelOpen((v) => !v)} title="コンテキストパネル">
              {panelOpen ? "パネルを隠す" : "パネル"}
            </button>
          </div>
        </header>
        <Screen />
        <footer className="row" style={{ marginTop: 32, justifyContent: "space-between" }}>
          <button className="btn" disabled={meta.n === 0} onClick={() => setStage(STAGES[meta.n - 1].id)}>← {meta.n > 0 ? STAGES[meta.n - 1].ja : ""}</button>
          <button className="btn btn-primary" disabled={meta.n === STAGES.length - 1} onClick={() => setStage(STAGES[meta.n + 1].id)}>
            {meta.n < STAGES.length - 1 ? `${STAGES[meta.n + 1].ja} →` : "完了"}
          </button>
        </footer>
      </div>
      <ContextPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
}

function Rail({ status }) {
  const { stage, setStage, settings, dispatch } = useStudio();
  const s = settings.apiStatus || {};
  const cycleTheme = () => {
    const order = ["auto", "light", "dark"];
    const next = order[(order.indexOf(settings.theme || "auto") + 1) % order.length];
    dispatch({ type: "settings/patch", patch: { theme: next } });
  };
  return (
    <aside className="rail">
      <div className="brand">
        <span className="name">空色</span>
        <span className="sub">SORAIRO STUDIO</span>
      </div>
      <nav className="stages">
        {STAGES.map((st) => (
          <button key={st.id} className={`stage-btn${stage === st.id ? " active" : ""}`} onClick={() => setStage(st.id)}>
            <span className="n">{st.n}</span>
            <span className="lbl">{st.ja}<small>{st.en}</small></span>
            <span className={`dot ${status[st.id] || ""}`} />
          </button>
        ))}
      </nav>
      <div style={{ marginTop: "auto" }} className="stack">
        <div className="status-list">
          <StatusRow ok={s.claude} label="Claude（課題・批評）" />
          <StatusRow ok={s.gemini} label="Gemini（画像生成）" />
          <StatusRow ok={s.pinterest || s.brave || s.cse} label="Pinterest 検索" />
          <StatusRow ok={s.adobe} label="Adobe Stock" />
        </div>
        <button className="btn btn-sm btn-ghost" onClick={cycleTheme}>テーマ: {settings.theme || "auto"}</button>
        <a className="small muted" href="/" style={{ padding: "0 6px" }}>← 手入れ（庭）へ</a>
      </div>
    </aside>
  );
}

function StatusRow({ ok, label }) {
  return (
    <div className="st">
      <span className={`dot ${ok ? "done" : ""}`} />
      <span>{label}</span>
      {!ok && <span className="badge warn" style={{ marginLeft: "auto" }}>キー未設定</span>}
    </div>
  );
}

function MobileStepper({ status }) {
  const { stage, setStage } = useStudio();
  return (
    <div className="mobile-stepper">
      {STAGES.map((st) => (
        <button key={st.id} className={`stage-btn${stage === st.id ? " active" : ""}`} onClick={() => setStage(st.id)}>
          <span className="lbl">{st.n} {st.ja}</span>
        </button>
      ))}
    </div>
  );
}

function ProjectSwitcher() {
  const { state, project, dispatch } = useStudio();
  const fileRef = useRef(null);
  const list = Object.values(state.projects).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  const exportJson = () => {
    const blob = new Blob([serializeProject(project)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name || "project"}.sorairo.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      dispatch({ type: "project/import", project: parseProject(await f.text()) });
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="row">
      <select className="select" style={{ width: 200 }} value={project.id} onChange={(e) => {
        if (e.target.value === "__new") dispatch({ type: "project/create", name: `案件 ${list.length + 1}` });
        else dispatch({ type: "project/select", id: e.target.value });
      }}>
        {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        <option value="__new">＋ 新しい案件</option>
      </select>
      <button className="btn btn-sm" onClick={exportJson}>書き出し</button>
      <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>読み込み</button>
      <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={importJson} />
    </div>
  );
}

function ContextPanel({ open, onClose }) {
  const { project, setStage } = useStudio();
  const brief = project.consult.brief;
  const prompt = activePrompt(project);
  const gen = latestGen(project);
  const genUrl = useBlobUrl(gen?.blobKey);
  const board = project.refs.board.slice(0, 6);

  return (
    <aside className={`panel${open ? " open" : ""}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong style={{ fontFamily: "var(--font-display)", letterSpacing: ".08em" }}>{project.name}</strong>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>×</button>
      </div>

      <section>
        <h3>Brief</h3>
        {brief.oneLiner
          ? <p className="one">{brief.oneLiner}</p>
          : <button className="btn btn-sm" onClick={() => setStage("consult")}>1行ブリーフを作る</button>}
        {!!brief.tone?.length && <div className="chips" style={{ marginTop: 6 }}>{brief.tone.map((t) => <span key={t} className="badge sora">{t}</span>)}</div>}
      </section>

      <section>
        <h3>Board · {project.refs.board.length}</h3>
        {board.length
          ? <div className="mini-thumbs">{board.map((r) => <MiniThumb key={r.id} item={r} />)}</div>
          : <button className="btn btn-sm" onClick={() => setStage("refs")}>参照を集める</button>}
      </section>

      <section>
        <h3>Prompt</h3>
        {prompt
          ? <p className="mono small" style={{ whiteSpace: "pre-wrap", maxHeight: 160, overflow: "hidden" }}>{prompt.en.slice(0, 380)}{prompt.en.length > 380 ? "…" : ""}</p>
          : <button className="btn btn-sm" onClick={() => setStage("prompt")}>プロンプトを編む</button>}
      </section>

      <section>
        <h3>Latest</h3>
        {gen && genUrl
          ? <div className="thumb" onClick={() => setStage("generate")} style={{ cursor: "pointer" }}><img src={genUrl} alt="latest" /></div>
          : <span className="small muted">まだ生成していません</span>}
        {gen?.critique && <div className="small soft" style={{ marginTop: 6 }}>批評 {gen.critique.total}/30</div>}
      </section>
    </aside>
  );
}

function MiniThumb({ item }) {
  const blobUrl = useBlobUrl(item.blobKey);
  const src = blobUrl || (item.thumbUrl ? (item.source === "upload" ? item.thumbUrl : api.proxied(item.thumbUrl)) : "");
  return (
    <div className="thumb" title={item.title}>
      {src ? <img src={src} alt={item.title || ""} loading="lazy" /> : null}
    </div>
  );
}
