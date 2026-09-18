/**
 * Sorairo Studio — 状態モデルと永続化（唯一の定義源）
 *
 * - プロジェクト JSON は localStorage、画像 Blob は IndexedDB（lib/idb.js）。
 * - すべての段階は独立に編集できる。順序は推奨であって強制しない。
 * - 画像の base64 をこの state に入れないこと（容量上限で壊れる）。blobKey で参照する。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";

export const STORAGE_KEY = "sorairo.studio.v1";

export const STAGES = [
  { id: "project", n: 0, ja: "案件", en: "Project", hint: "名前・ブランド・成果物" },
  { id: "consult", n: 1, ja: "課題", en: "Consult", hint: "仮説 → 課題 → 1行ブリーフ" },
  { id: "refs", n: 2, ja: "参照", en: "References", hint: "カンヌ・Pinterest・Adobe・自前" },
  { id: "direction", n: 3, ja: "方向", en: "Direction", hint: "アートディレクション変数" },
  { id: "prompt", n: 4, ja: "プロンプト", en: "Prompt", hint: "叙述プロンプト（EN + JA）" },
  { id: "generate", n: 5, ja: "生成", en: "Generate", hint: "生成 → 批評 → 修正" },
  { id: "handoff", n: 6, ja: "Figma", en: "Handoff", hint: "トークン → spec → プラグイン" },
];

export const DEFAULT_ASPECT = {
  kv: "16:9", poster: "2:3", ooh: "21:9", social: "1:1",
  web_hero: "21:9", editorial: "4:5", packaging: "1:1", app: "9:16",
};

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const now = () => new Date().toISOString();

/** 参照（ムードボード項目）の雛形。source によって passPixels の既定を変える */
export function newRef(partial = {}) {
  const source = partial.source || "upload";
  return {
    id: uid(),
    source,                 // "upload" | "cannes" | "pinterest" | "adobe" | "cse" | "url"
    title: "",
    thumbUrl: "",           // 表示用（外部 URL は /api/studio/image 経由で表示してもよい）
    imageUrl: "",           // 原寸（外部）
    pageUrl: "",            // 出典ページ
    blobKey: null,          // IndexedDB のキー（upload、または取り込んだ画像）
    width: 0, height: 0,
    author: "", license: "",
    role: "mood",           // roles: composition | palette | lighting | texture | typography | mood | subject
    weight: 2,              // 1..3
    passPixels: source === "upload",  // 画像そのものをモデルに渡すか（原理テキストのみか）
    notes: "",
    principles: [],         // AI 抽出した原理（EN 短文）
    toneWords: [],
    palette: [],            // 抽出色 hex[]
    addedAt: now(),
    ...partial,
  };
}

export function emptyProject(name = "無題の案件") {
  return {
    id: uid(),
    version: 1,
    name,
    createdAt: now(),
    updatedAt: now(),
    meta: { client: "", brand: "", deliverable: "kv", language: "ja" },
    consult: {
      context: "",          // 依頼・ビジネス文脈
      audience: "",         // 対象
      constraints: "",      // 制約（媒体・期間・規定）
      frames: {},           // { [frameId]: { [stepKey]: value } } ワークショップ回答
      issueTree: [],        // [{ id, text, children: [] }]
      hypotheses: [],       // [{ id, text, evidence, confidence, chosen }]
      hmw: [],              // ["How might we ..."]
      brief: {
        problem: "", insight: "", audience: "", promise: "",
        tone: [],           // トーン語（moodWords の id か自由語）
        oneLiner: "",       // Get–To–By の1行
        lighthouse: "",     // Art Thinking: 到達点 B が未知の問い
        successCriteria: [],
      },
      aiRun: null,          // { at, model }
    },
    refs: {
      board: [],            // newRef()[]
      cannesPicks: [],      // cannes.json の id[]
      queries: { pinterest: "", adobe: "", cse: "" },
    },
    direction: {
      axes: {
        minimal_maximal: 40, warm_cool: 50, quiet_loud: 40,
        classic_future: 50, handmade_digital: 50, playful_serious: 50,
      },
      medium: "photo",
      technique: [],        // directionVars.technique の id[]
      composition: "negative_space",
      lighting: "soft_window",
      camera: "normal_50",
      texture: [],
      palette: { mode: "auto", colors: [], harmony: "analogous" },  // mode: auto | manual | from_ref
      typography: { intent: "headline_zone", zone: "top", copy: "" },
      subject: "",
      scene: "",
      mood: [],             // moodWords の id[]
      mustInclude: [],
      mustAvoid: [],
      aspect: "16:9",
      model: "",            // 空ならサーバ既定
      variants: 2,
      size: "1K",
    },
    prompt: { versions: [], activeId: null },
    // versions[]: { id, at, source: "compiled"|"ai"|"manual", en, ja, blocks[], refIds[], note }
    gens: [],
    // gens[]: { id, at, promptVersionId, model, aspect, blobKey, width, height, parentId, editInstruction,
    //           critique: { scores{}, total, notes[], revisions[] } | null, starred, blocked, reason }
    handoff: {
      selectedGenId: null,
      palette: [],          // 抽出色 hex[]
      tokens: null,         // spec.tokens
      spec: null,           // Figma spec（DESIGN.md 4.6）
      exportedAt: null,
    },
  };
}

/* ---------- 汎用 immutable 更新 ---------- */

export function getIn(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setIn(obj, path, value) {
  const keys = path.split(".");
  const rec = (o, i) => {
    if (i === keys.length) return typeof value === "function" ? value(o) : value;
    const k = keys[i];
    const base = Array.isArray(o) ? [...o] : { ...(o || {}) };
    base[k] = rec(o == null ? undefined : o[k], i + 1);
    return base;
  };
  return rec(obj, 0);
}

/* ---------- 永続化 ---------- */

function initialState() {
  const fallback = () => {
    const p = emptyProject();
    return {
      version: 1,
      projects: { [p.id]: p },
      currentId: p.id,
      settings: { theme: "auto", stage: "project", panelOpen: true, apiStatus: null },
    };
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback();
    const s = JSON.parse(raw);
    if (!s || !s.projects || !s.currentId || !s.projects[s.currentId]) return fallback();
    return { ...fallback(), ...s, settings: { ...fallback().settings, ...(s.settings || {}) } };
  } catch {
    return fallback();
  }
}

function persist(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("[studio] persist failed", e);
  }
}

/* ---------- reducer ---------- */

function touch(p) {
  return { ...p, updatedAt: now() };
}

function reducer(state, action) {
  const cur = state.projects[state.currentId];
  const withProject = (p) => ({ ...state, projects: { ...state.projects, [p.id]: touch(p) } });

  switch (action.type) {
    case "project/create": {
      const p = emptyProject(action.name);
      return { ...state, projects: { ...state.projects, [p.id]: p }, currentId: p.id, settings: { ...state.settings, stage: "project" } };
    }
    case "project/select":
      return state.projects[action.id] ? { ...state, currentId: action.id } : state;
    case "project/delete": {
      const projects = { ...state.projects };
      delete projects[action.id];
      let currentId = state.currentId;
      if (currentId === action.id) currentId = Object.keys(projects)[0];
      if (!currentId) {
        const p = emptyProject();
        projects[p.id] = p;
        currentId = p.id;
      }
      return { ...state, projects, currentId };
    }
    case "project/import": {
      const p = { ...emptyProject(), ...action.project, id: action.project.id || uid() };
      return { ...state, projects: { ...state.projects, [p.id]: p }, currentId: p.id };
    }
    case "project/rename":
      return withProject({ ...cur, name: action.name });
    case "project/replace":
      return withProject({ ...action.project, id: cur.id });

    case "patch":       // { path: "consult.brief.oneLiner", value }  value は関数でもよい
      return withProject(setIn(cur, action.path, action.value));
    case "merge":       // { path, value: {...} } 浅いマージ
      return withProject(setIn(cur, action.path, (o) => ({ ...(o || {}), ...action.value })));

    case "refs/add": {
      const items = (Array.isArray(action.items) ? action.items : [action.item]).filter(Boolean);
      return withProject(setIn(cur, "refs.board", (b) => [...(b || []), ...items]));
    }
    case "refs/update":
      return withProject(setIn(cur, "refs.board", (b) => (b || []).map((r) => (r.id === action.id ? { ...r, ...action.patch } : r))));
    case "refs/remove":
      return withProject(setIn(cur, "refs.board", (b) => (b || []).filter((r) => r.id !== action.id)));
    case "refs/reorder":
      return withProject(setIn(cur, "refs.board", (b) => {
        const map = new Map((b || []).map((r) => [r.id, r]));
        return action.ids.map((id) => map.get(id)).filter(Boolean);
      }));

    case "prompt/addVersion": {
      const v = { id: uid(), at: now(), source: "manual", note: "", refIds: [], blocks: [], ...action.version };
      const versions = [...cur.prompt.versions, v];
      return withProject({ ...cur, prompt: { versions, activeId: v.id } });
    }
    case "prompt/updateVersion": {   // { id, patch } 既存の版をその場で書き換える（直近の手編集をまとめるため）
      const versions = cur.prompt.versions.map((v) => (v.id === action.id ? { ...v, ...action.patch } : v));
      return withProject({ ...cur, prompt: { ...cur.prompt, versions } });
    }
    case "prompt/setActive":
      return withProject({ ...cur, prompt: { ...cur.prompt, activeId: action.id } });
    case "prompt/removeVersion": {
      const versions = cur.prompt.versions.filter((v) => v.id !== action.id);
      const activeId = cur.prompt.activeId === action.id ? (versions.at(-1)?.id ?? null) : cur.prompt.activeId;
      return withProject({ ...cur, prompt: { versions, activeId } });
    }

    case "gens/add":
      return withProject({ ...cur, gens: [...cur.gens, { id: uid(), at: now(), starred: false, critique: null, ...action.gen }] });
    case "gens/update":
      return withProject({ ...cur, gens: cur.gens.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)) });
    case "gens/remove":
      return withProject({ ...cur, gens: cur.gens.filter((g) => g.id !== action.id) });

    case "stage/set":
      return { ...state, settings: { ...state.settings, stage: action.stage } };
    case "settings/patch":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    default:
      return state;
  }
}

/* ---------- context ---------- */

const StudioCtx = createContext(null);

export function StudioProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(state), 250);
    return () => clearTimeout(timer.current);
  }, [state]);

  const project = state.projects[state.currentId];
  const patch = useCallback((path, value) => dispatch({ type: "patch", path, value }), []);
  const merge = useCallback((path, value) => dispatch({ type: "merge", path, value }), []);
  const setStage = useCallback((stage) => dispatch({ type: "stage/set", stage }), []);

  const value = useMemo(
    () => ({ state, project, dispatch, patch, merge, setStage, stage: state.settings.stage, settings: state.settings }),
    [state, project, patch, merge, setStage],
  );
  return <StudioCtx.Provider value={value}>{children}</StudioCtx.Provider>;
}

export function useStudio() {
  const ctx = useContext(StudioCtx);
  if (!ctx) throw new Error("useStudio must be used inside <StudioProvider>");
  return ctx;
}

/* ---------- 派生情報 ---------- */

/** レールの進捗ドット用。done / partial / empty */
export function stageStatus(p) {
  const st = {};
  st.project = p.name && p.meta.deliverable ? "done" : "partial";
  st.consult = p.consult.brief.oneLiner ? "done" : (p.consult.context ? "partial" : "empty");
  st.refs = p.refs.board.length >= 3 ? "done" : (p.refs.board.length ? "partial" : "empty");
  st.direction = p.direction.subject ? "done" : "partial";
  st.prompt = p.prompt.versions.length ? "done" : "empty";
  st.generate = p.gens.length ? (p.gens.some((g) => g.critique) ? "done" : "partial") : "empty";
  st.handoff = p.handoff.spec ? "done" : (p.handoff.palette.length ? "partial" : "empty");
  return st;
}

export function activePrompt(p) {
  return p.prompt.versions.find((v) => v.id === p.prompt.activeId) || p.prompt.versions.at(-1) || null;
}

export function latestGen(p) {
  return p.gens.at(-1) || null;
}

/** 書き出し用（画像は含めない。画像は別途 blob を zip する UI 側の責務） */
export function serializeProject(p) {
  return JSON.stringify({ ...p, exportedAt: now(), $schema: "sorairo-studio-project/1" }, null, 2);
}

export function parseProject(text) {
  const p = JSON.parse(text);
  if (!p || typeof p !== "object" || !p.meta || !p.direction) throw new Error("プロジェクト JSON の形式が違います");
  const base = emptyProject(p.name || "読み込んだ案件");
  return {
    ...base, ...p,
    meta: { ...base.meta, ...p.meta },
    consult: { ...base.consult, ...(p.consult || {}), brief: { ...base.consult.brief, ...((p.consult || {}).brief || {}) } },
    refs: { ...base.refs, ...(p.refs || {}) },
    direction: { ...base.direction, ...(p.direction || {}),
      axes: { ...base.direction.axes, ...((p.direction || {}).axes || {}) },
      palette: { ...base.direction.palette, ...((p.direction || {}).palette || {}) },
      typography: { ...base.direction.typography, ...((p.direction || {}).typography || {}) } },
    prompt: { ...base.prompt, ...(p.prompt || {}) },
    gens: Array.isArray(p.gens) ? p.gens : [],
    handoff: { ...base.handoff, ...(p.handoff || {}) },
  };
}
