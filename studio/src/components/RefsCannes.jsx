/** 参照タブ「カンヌ」。同梱メタデータ + 原理。画像は持たず、必要なときだけ検索する。 */
import { useEffect, useMemo, useState } from "react";

const PAGE = 12;
import cannes from "../data/cannes.json";
import { useStudio, newRef } from "../store";
import { api, ApiError } from "../lib/api";
import { itemToRef, refKey } from "../lib/refsources";
import SearchGrid from "./SearchGrid";
import { useToast } from "./Toast";

const YEARS = cannes.map((c) => c.year);
const MIN_YEAR = Math.min(...YEARS);
const MAX_YEAR = Math.max(...YEARS);
const LIONS = [...new Set(cannes.map((c) => c.lion))].sort();
const TOP_TAGS = (() => {
  const count = {};
  for (const c of cannes) for (const t of c.tags) count[t] = (count[t] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([t]) => t);
})();

export default function RefsCannes() {
  const { project, dispatch, patch } = useStudio();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(MIN_YEAR);
  const [to, setTo] = useState(MAX_YEAR);
  const [lion, setLion] = useState("");
  const [tags, setTags] = useState([]);
  const [imgFor, setImgFor] = useState(null);   // { id, items, loading, error }
  const [limit, setLimit] = useState(PAGE);      // 67 件を全部展開すると長すぎるので段階表示

  useEffect(() => { setLimit(PAGE); }, [q, from, to, lion, tags]);

  const picks = new Set(project.refs.cannesPicks || []);
  const boardKeys = new Set(project.refs.board.map(refKey));

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cannes.filter((c) => {
      if (c.year < from || c.year > to) return false;
      if (lion && c.lion !== lion) return false;
      if (tags.length && !tags.every((t) => c.tags.includes(t))) return false;
      if (!needle) return true;
      return [c.title, c.brand, c.agency, c.country, ...(c.tags || [])].join(" ").toLowerCase().includes(needle);
    }).sort((a, b) => b.year - a.year);
  }, [q, from, to, lion, tags]);

  const adopt = (c) => {
    const ref = newRef({
      source: "cannes",
      title: `${c.brand} — ${c.title}`,
      pageUrl: c.refUrl,
      role: "composition",
      passPixels: false,
      principles: c.promptSeeds,
      notes: c.visualJa,
      license: "unknown",
      externalId: c.id,
    });
    dispatch({ type: "refs/add", item: ref });
    patch("refs.cannesPicks", (p) => [...new Set([...(p || []), c.id])]);
    toast(`「${c.title}」の原理をボードへ`, "ok");
  };

  const findImages = async (c) => {
    setImgFor({ id: c.id, items: [], loading: true, error: "" });
    try {
      const r = await api.search("cannesImages", { q: c.imageSearchQuery });
      setImgFor({ id: c.id, items: r.items || [], loading: false, error: "", degraded: r.degraded, hint: r.hint });
    } catch (e) {
      setImgFor({ id: c.id, items: [], loading: false, error: e instanceof ApiError ? e.message : "検索できませんでした" });
    }
  };

  const addFound = (item) => {
    dispatch({ type: "refs/add", item: itemToRef({ ...item, source: item.source || "cse" }, { role: "mood" }) });
    toast("ボードへ追加しました", "ok");
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="alert info small">
        受賞作は<strong>原理（何がうまいか）</strong>として使います。画像は同梱せず、特定作品の再現はプロンプトのガードで止まります（DESIGN.md §6）。
      </div>

      <div className="card">
        <div className="grid grid-2">
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">検索</span>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="タイトル・ブランド・代理店・タグ" />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">部門</span>
            <select className="select" value={lion} onChange={(e) => setLion(e.target.value)}>
              <option value="">すべての部門</option>
              {LIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        </div>
        <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
          <span className="label">年 <span className="hint">{from} – {to}</span></span>
          <div className="row">
            <input className="input" style={{ width: 90 }} type="number" min={MIN_YEAR} max={MAX_YEAR} value={from} aria-label="開始年" onChange={(e) => setFrom(Math.min(Number(e.target.value) || MIN_YEAR, to))} />
            <span className="muted">—</span>
            <input className="input" style={{ width: 90 }} type="number" min={MIN_YEAR} max={MAX_YEAR} value={to} aria-label="終了年" onChange={(e) => setTo(Math.max(Number(e.target.value) || MAX_YEAR, from))} />
            <button className="btn btn-sm btn-ghost" onClick={() => { setFrom(MIN_YEAR); setTo(MAX_YEAR); setLion(""); setTags([]); setQ(""); }}>条件をクリア</button>
          </div>
        </div>
        <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
          <span className="label">タグ</span>
          <div className="chips">
            {TOP_TAGS.map((t) => (
              <button key={t} className={`chip${tags.includes(t) ? " active" : ""}`} onClick={() => setTags((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]))}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      <p className="small muted">{list.length} 件{list.length > limit ? `（${limit} 件を表示）` : ""}</p>

      <div className="stack" style={{ gap: 12 }}>
        {list.slice(0, limit).map((c) => (
          <article key={c.id} className="card cannes-card">
            <div className="row" style={{ gap: 8 }}>
              <span className="badge mono">{c.year}</span>
              <span className={`badge ${c.award === "Grand Prix" ? "warn" : "ok"}`}>{c.award}</span>
              <span className="small muted">{c.lion}</span>
              <span className="right small muted">{c.country}</span>
            </div>
            <h3 style={{ marginTop: 6, fontFamily: "var(--font-display)", fontSize: 16 }}>{c.brand} — {c.title}</h3>
            <p className="small muted">{c.agency}</p>
            <dl className="cannes-dl">
              <dt>アイデア</dt><dd>{c.ideaJa}</dd>
              <dt>ビジュアルの原理</dt><dd>{c.visualJa}</dd>
              <dt>なぜ勝ったか</dt><dd>{c.whyJa}</dd>
            </dl>
            <div className="chips" style={{ marginTop: 8 }}>
              {c.tags.map((t) => <span key={t} className="badge">{t}</span>)}
            </div>
            <ul className="seeds">
              {c.promptSeeds.map((s) => <li key={s} className="mono small">{s}</li>)}
            </ul>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btn-sm btn-primary" onClick={() => adopt(c)} disabled={picks.has(c.id)}>
                {picks.has(c.id) ? "採用済み" : "原理を採用"}
              </button>
              <button className="btn btn-sm" onClick={() => findImages(c)}>参考画像を探す</button>
              {c.refUrl && <a className="small" href={c.refUrl} target="_blank" rel="noreferrer noopener">出典</a>}
              {!c.verified && <span className="badge warn">未確認</span>}
            </div>

            {imgFor?.id === c.id && (
              <div className="stack" style={{ marginTop: 12, gap: 8 }}>
                {imgFor.degraded === "none" && <div className="alert info small">{imgFor.hint || "画像検索のキーが未設定です。Web で「" + c.imageSearchQuery + "」を検索してください。"}</div>}
                <SearchGrid
                  items={imgFor.items}
                  loading={imgFor.loading}
                  error={imgFor.error}
                  onAdd={addFound}
                  addedKeys={new Set([...boardKeys].filter(Boolean))}
                  emptyLabel="画像が見つかりませんでした。出典リンクから直接ご覧ください。"
                />
                <button className="btn btn-sm btn-ghost" onClick={() => setImgFor(null)}>閉じる</button>
              </div>
            )}
          </article>
        ))}
        {!list.length && <div className="empty">条件に合う受賞作がありません。</div>}
        {list.length > limit && (
          <button className="btn" onClick={() => setLimit((n) => n + PAGE)}>
            さらに {Math.min(PAGE, list.length - limit)} 件を表示（残り {list.length - limit} 件）
          </button>
        )}
      </div>
    </div>
  );
}
