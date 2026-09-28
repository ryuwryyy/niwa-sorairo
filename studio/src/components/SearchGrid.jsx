/** 検索結果グリッド。外部画像は必ず /api/studio/image のプロキシ越しに出す。 */
import { useState } from "react";
import { api } from "../lib/api";
import { itemKey } from "../lib/refsources";

export function ProxyThumb({ src, alt = "", direct = false, className = "thumb" }) {
  const [failed, setFailed] = useState(false);
  const url = src ? (direct ? src : api.proxied(src)) : "";
  return (
    <div className={className}>
      {url && !failed ? (
        <img src={url} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <div className="thumb-fallback small muted">{alt || "画像なし"}</div>
      )}
    </div>
  );
}

export default function SearchGrid({
  items = [],
  loading = false,
  error = "",
  onAdd,
  addedKeys,
  onMore = null,
  hasMore = false,
  emptyLabel = "結果がありません",
  addLabel = "ボードへ",
  extraFooter = null,
}) {
  const added = addedKeys instanceof Set ? addedKeys : new Set(addedKeys || []);

  if (error) return <div className="alert danger">{error}</div>;
  if (!items.length && loading) {
    return <div className="row" style={{ padding: 20 }}><span className="spinner" /><span className="small muted">検索しています…</span></div>;
  }
  if (!items.length) return <div className="empty">{emptyLabel}</div>;

  return (
    <div className="stack">
      <div className="grid grid-thumbs">
        {items.map((it) => {
          const k = itemKey(it);
          const isAdded = added.has(k);
          return (
            <div key={k || it.thumbUrl} className="result">
              <ProxyThumb src={it.thumbUrl || it.imageUrl} alt={it.title || "参照画像"} />
              <div className="result-meta">
                <div className="small" title={it.title}>{(it.title || "無題").slice(0, 48)}</div>
                {it.author && <div className="small muted">{it.author}{it.source === "adobe" ? " / Adobe Stock" : ""}</div>}
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-sm" disabled={isAdded} onClick={() => onAdd?.(it)}>
                    {isAdded ? "追加済み" : addLabel}
                  </button>
                  {it.pageUrl && (
                    <a className="small" href={it.pageUrl} target="_blank" rel="noreferrer noopener">出典</a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {extraFooter}
      {(hasMore || loading) && (
        <div className="row" style={{ justifyContent: "center" }}>
          {loading ? <span className="spinner" /> : <button className="btn btn-sm" onClick={onMore}>もっと見る</button>}
        </div>
      )}
    </div>
  );
}
