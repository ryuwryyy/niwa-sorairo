/**
 * 参照タブ「Pinterest」。
 * 公式 API v5 はトークン所有アカウントの Pin しか検索しないので、UI 文言もそれに合わせる
 * （docs/studio/research-reference-sources.md §A-4-1）。
 * サーバが縮退したときは brave / cse のバッジを出し、URL 取り込みとボード埋め込みへ誘導する。
 */
import { useEffect, useRef, useState } from "react";
import { useStudio } from "../store";
import { api, ApiError } from "../lib/api";
import { itemToRef, refKey } from "../lib/refsources";
import SearchGrid from "./SearchGrid";
import { useToast } from "./Toast";

const DEGRADED_JA = {
  brave: "Brave 画像検索 (site:pinterest.com) で代替",
  cse: "Google 検索 (site:pinterest.com) で代替",
};

let pinitLoading = null;
function loadPinit() {
  if (typeof document === "undefined") return Promise.resolve(false);
  if (window.doBuild) return Promise.resolve(true);
  if (pinitLoading) return pinitLoading;
  pinitLoading = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://assets.pinterest.com/js/pinit.js";
    s.async = true;
    s.defer = true;
    s.setAttribute("data-pin-build", "doBuild");
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return pinitLoading;
}

export default function RefsPinterest() {
  const { project, patch, dispatch, settings } = useStudio();
  const toast = useToast();
  const q = project.refs.queries?.pinterest || "";
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [next, setNext] = useState(null);
  const [state, setState] = useState({ loading: false, error: "", degraded: null, hint: "", ran: false });
  const [url, setUrl] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlErr, setUrlErr] = useState("");
  const [boardUrl, setBoardUrl] = useState("");
  const [embedUrl, setEmbedUrl] = useState("");
  const embedRef = useRef(null);

  const hasKey = !!settings.apiStatus?.pinterest;
  const boardKeys = new Set(project.refs.board.map(refKey).filter(Boolean));

  const run = async (p = 0) => {
    if (!q.trim()) return;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await api.search("pinterest", { q, page: p, bookmark: p > 0 ? next : undefined });
      setItems((cur) => (p === 0 ? r.items || [] : [...cur, ...(r.items || [])]));
      setNext(r.next || null);
      setPage(p);
      setState({ loading: false, error: "", degraded: r.degraded || null, hint: r.hint || "", ran: true });
    } catch (e) {
      setState({ loading: false, error: e instanceof ApiError ? e.message : "検索できませんでした", degraded: null, hint: "", ran: true });
    }
  };

  const add = (item) => {
    dispatch({ type: "refs/add", item: itemToRef(item, { role: "mood" }) });
    toast("ボードへ追加しました（画像は渡さず、原理として使います）", "ok");
  };

  const unfurl = async () => {
    if (!url.trim()) return;
    setUrlBusy(true); setUrlErr("");
    try {
      const r = await api.search("unfurl", { url: url.trim() });
      const it = (r.items || [])[0];
      if (!it) throw new Error("この URL からは画像を取り出せませんでした");
      dispatch({ type: "refs/add", item: itemToRef(it, { role: "mood" }) });
      setUrl("");
      toast("URL から取り込みました", "ok");
    } catch (e) {
      setUrlErr(e instanceof ApiError ? e.message : e.message || "取り込めませんでした");
    } finally {
      setUrlBusy(false);
    }
  };

  useEffect(() => {
    if (!embedUrl) return;
    let alive = true;
    loadPinit().then((ok) => {
      if (!alive) return;
      if (!ok) return;
      try { window.doBuild?.(); } catch { /* 埋め込みは任意機能 */ }
    });
    return () => { alive = false; };
  }, [embedUrl]);

  const degradedLabel = state.degraded && DEGRADED_JA[state.degraded];

  return (
    <div className="stack" style={{ gap: 12 }}>
      {!hasKey && (
        <div className="alert info small">
          <code>PINTEREST_ACCESS_TOKEN</code> が未設定です。設定するとチーム用アカウントに保存した Pin を検索できます。
          未設定でも、下の「ピンの URL を貼る」と「ボードを埋め込む」はキー無しで動きます。
        </div>
      )}

      <div className="card">
        <label className="field" style={{ marginBottom: 8 }}>
          <span className="label">
            自分のピンを検索（Pinterest API）
            <span className="hint">公式 API はトークン所有アカウントの Pin だけを検索します</span>
          </span>
          <div className="row">
            <input
              className="input"
              style={{ flex: 1, minWidth: 180 }}
              value={q}
              placeholder="例: still life tea steam minimal"
              onChange={(e) => patch("refs.queries.pinterest", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") run(0); }}
            />
            <button className="btn btn-primary" onClick={() => run(0)} disabled={state.loading || !q.trim()}>検索</button>
          </div>
        </label>
        {degradedLabel && <div className="row"><span className="badge warn">{degradedLabel}</span></div>}
        {state.degraded === "none" && (
          <div className="alert warn small">
            {state.hint || "Pinterest の検索キーが未設定か失効しています。下の 2 つの方法で取り込めます。"}
          </div>
        )}
        {state.ran && (
          <div style={{ marginTop: 12 }}>
            <SearchGrid
              items={items}
              loading={state.loading}
              error={state.error}
              onAdd={add}
              addedKeys={boardKeys}
              hasMore={!!next}
              onMore={() => run(page + 1)}
              emptyLabel="該当する Pin がありません。Pinterest で保存してから再検索してください。"
            />
          </div>
        )}
        <p className="small muted" style={{ marginTop: 10 }}>
          Pinterest の画像は端末に保存しません（サムネイルは毎回プロキシ経由で読み込みます）。
          ボード上で「画像を取り込む」を押したときだけ端末内に保存されます。
        </p>
      </div>

      <div className="card">
        <div className="card-head"><h2>ピンの URL を貼る</h2><span className="small muted">キー不要</span></div>
        <div className="row">
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            value={url}
            placeholder="https://www.pinterest.com/pin/…"
            aria-label="Pin の URL"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") unfurl(); }}
          />
          <button className="btn" onClick={unfurl} disabled={urlBusy || !url.trim()}>
            {urlBusy ? <><span className="spinner" /> 取り込み中…</> : "取り込む"}
          </button>
        </div>
        {urlErr && <div className="alert danger small" style={{ marginTop: 8 }}>{urlErr}</div>}
      </div>

      <div className="card">
        <div className="card-head"><h2>ボードを埋め込む</h2><span className="small muted">公式ウィジェット</span></div>
        <div className="row">
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            value={boardUrl}
            placeholder="https://www.pinterest.com/ユーザー名/ボード名/"
            aria-label="ボードの URL"
            onChange={(e) => setBoardUrl(e.target.value)}
          />
          <button className="btn" onClick={() => setEmbedUrl(boardUrl.trim())} disabled={!boardUrl.trim()}>表示する</button>
          {embedUrl && <button className="btn btn-sm btn-ghost" onClick={() => setEmbedUrl("")}>消す</button>}
        </div>
        {embedUrl && (
          <div className="pin-embed" ref={embedRef} style={{ marginTop: 12 }}>
            <a
              data-pin-do="embedBoard"
              data-pin-board-width="400"
              data-pin-scale-height="240"
              data-pin-scale-width="80"
              href={embedUrl}
            >
              {embedUrl}
            </a>
            <p className="small muted" style={{ marginTop: 8 }}>
              埋め込みウィジェットの中身は別ドメインのため、ここから直接ボードへ追加することはできません。
              気に入ったピンは URL をコピーして上の欄に貼ってください。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
