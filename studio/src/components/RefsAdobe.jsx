/**
 * 参照タブ「Adobe Stock」。
 * Adobe の開発者規約により、取得したコンプ画像は「表示のみ」で AI 学習・生成には使えない
 * （docs/studio/research-reference-sources.md §C / §F-1）。passPixels は常に不可。
 */
import { useState } from "react";
import { useStudio } from "../store";
import { api, ApiError } from "../lib/api";
import { itemToRef, refKey } from "../lib/refsources";
import SearchGrid from "./SearchGrid";
import { useToast } from "./Toast";

const CONTENT_TYPES = [
  { id: "all", ja: "すべて" },
  { id: "photo", ja: "写真" },
  { id: "illustration", ja: "イラスト" },
  { id: "vector", ja: "ベクター" },
];
const ORIENTATIONS = [
  { id: "all", ja: "指定なし" },
  { id: "horizontal", ja: "横" },
  { id: "vertical", ja: "縦" },
  { id: "square", ja: "正方形" },
];

export default function RefsAdobe() {
  const { project, patch, dispatch, settings } = useStudio();
  const toast = useToast();
  const q = project.refs.queries?.adobe || "";
  const [contentType, setContentType] = useState("all");
  const [orientation, setOrientation] = useState("all");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [state, setState] = useState({ loading: false, error: "", ran: false });

  const hasKey = !!settings.apiStatus?.adobe;
  const boardKeys = new Set(project.refs.board.map(refKey).filter(Boolean));

  const run = async (p = 0) => {
    if (!q.trim()) return;
    setState({ loading: true, error: "", ran: true });
    try {
      const r = await api.search("adobe", { q, page: p, contentType, orientation });
      setItems((cur) => (p === 0 ? r.items || [] : [...cur, ...(r.items || [])]));
      setMore(!!r.next || (r.items || []).length >= 24);
      setPage(p);
      setState({ loading: false, error: r.degraded === true ? "一時的に混み合っています。しばらくして再度お試しください。" : "", ran: true });
    } catch (e) {
      setState({ loading: false, error: e instanceof ApiError ? e.message : "検索できませんでした", ran: true });
    }
  };

  const add = (item) => {
    dispatch({
      type: "refs/add",
      item: itemToRef({ ...item, source: "adobe", license: item.license || "adobe-stock-preview" }, { role: "mood" }),
    });
    toast("ボードへ追加しました（表示のみ・AI には渡しません）", "ok");
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      {!hasKey && (
        <div className="alert info small">
          <code>ADOBE_STOCK_API_KEY</code> が未設定です。設定すると Adobe Stock の検索（キーのみで可）が使えます。
        </div>
      )}
      <div className="alert warn small">
        Adobe Stock のプレビュー画像は<strong>表示のみ</strong>に使えます。規約により AI / 機械学習の入力にはできないため、
        この出所の参照は「画像を渡す」を有効にできません（原理テキストとしては使えます）。
      </div>

      <div className="card">
        <div className="row">
          <input
            className="input"
            style={{ flex: 1, minWidth: 180 }}
            value={q}
            placeholder="例: japanese tea still life"
            aria-label="Adobe Stock 検索語"
            onChange={(e) => patch("refs.queries.adobe", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") run(0); }}
          />
          <select className="select" style={{ width: 130 }} value={contentType} aria-label="種類" onChange={(e) => setContentType(e.target.value)}>
            {CONTENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.ja}</option>)}
          </select>
          <select className="select" style={{ width: 130 }} value={orientation} aria-label="向き" onChange={(e) => setOrientation(e.target.value)}>
            {ORIENTATIONS.map((t) => <option key={t.id} value={t.id}>{t.ja}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => run(0)} disabled={state.loading || !q.trim() || !hasKey}>検索</button>
        </div>

        {state.ran && (
          <div style={{ marginTop: 12 }}>
            <SearchGrid
              items={items}
              loading={state.loading}
              error={state.error}
              onAdd={add}
              addedKeys={boardKeys}
              hasMore={more}
              onMore={() => run(page + 1)}
              emptyLabel="該当する素材がありません。"
            />
          </div>
        )}
        <p className="small muted" style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          Powered by Adobe Stock — 表示している画像は透かし入りのコンプ画像です。作者名と出典を必ず添えてください。
        </p>
      </div>
    </div>
  );
}
