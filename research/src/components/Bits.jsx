import { useRef, useState } from "react";
import { classifyAll, median, NoKeyError } from "../lib/jev";

export const LOW_CONF = 0.55; // これ未満は「要確認」として人が見る

/** Jev での一括分類を、進捗・中断・デモ判定への切り替えごと扱う */
export function useClassifier() {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [noKey, setNoKey] = useState(false);
  const [demo, setDemo] = useState(false);
  const ctrl = useRef(null);

  const run = async (items, questions, { forceDemo } = {}) => {
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setError(null);
    const useDemo = forceDemo ?? demo;
    try {
      const out = await classifyAll(items, questions, {
        demo: useDemo,
        signal: ctrl.current.signal,
        onProgress: (done, total, stats) => setProgress({ done, total, stats, running: done < total }),
      });
      setProgress((p) => ({ ...p, running: false, stats: out.stats }));
      if (out.errors.size) setError(`${out.errors.size}件の判定に失敗しました(${[...out.errors.values()][0]})`);
      return out;
    } catch (e) {
      setProgress((p) => p && { ...p, running: false });
      if (e instanceof NoKeyError) { setNoKey(true); return null; }
      if (e.name !== "AbortError") setError(e.message);
      return null;
    }
  };

  return {
    run, progress, error, noKey, demo,
    running: !!progress?.running,
    enableDemo: () => { setDemo(true); setNoKey(false); },
    cancel: () => ctrl.current?.abort(),
  };
}

export function NoKeyBanner({ onDemo }) {
  return (
    <div className="banner warn">
      サーバーに <code>TYPESAFE_API_KEY</code> が設定されていません。<code>.env.local</code>(開発)か
      Vercel の Environment Variables に設定すると Jev で判定できます。
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn small" onClick={onDemo}>キーなしで画面を試す(デモ判定)</button>
      </div>
    </div>
  );
}

export function DemoBanner() {
  return (
    <div className="banner info">
      いまは<b>デモ判定</b>(キーワード照合)で動いています。Jev の結果ではないので、分析には使わないでください。
    </div>
  );
}

export function Progress({ progress, onCancel }) {
  if (!progress) return null;
  const { done, total, stats, running } = progress;
  const per = median(stats.itemMs || []);
  return (
    <div style={{ marginTop: 12 }}>
      <div className="progress"><div style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
      <div className="row hint num">
        <span>{done} / {total} 件</span>
        <span>· 経過 {(stats.wallMs / 1000).toFixed(1)} 秒</span>
        {per != null && <span>· 1件あたり中央値 {Math.round(per)}ms</span>}
        {stats.model && <span>· {stats.model}</span>}
        <span className="spacer" />
        {running && <button className="btn small" onClick={onCancel}>中断</button>}
      </div>
    </div>
  );
}

/** 確信度の小さなバー。低いものは要確認色 */
export function Conf({ value }) {
  if (value == null) return null;
  const low = value < LOW_CONF;
  return (
    <span className={`conf${low ? " low" : ""}`} title={`確信度 ${Math.round(value * 100)}%`}>
      <span className="bar"><span style={{ width: `${value * 100}%` }} /></span>
      <span className="num">{Math.round(value * 100)}%</span>
    </span>
  );
}

/** 0..max の深刻度・重要度を ●●○ で */
export function Level({ value, max = 3, label }) {
  const n = Math.round(value ?? 0);
  return (
    <span className="sev" title={`${label} ${(value ?? 0).toFixed(1)} / ${max}`} aria-label={`${label} ${n} / ${max}`}>
      {"●".repeat(n)}<b>{"●".repeat(Math.max(0, max - n))}</b>
    </span>
  );
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  const show = (m) => { setMsg(m); setTimeout(() => setMsg(null), 1800); };
  return [msg && <div className="toast" role="status">{msg}</div>, show];
}

export async function copyText(text, toast, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label}をコピーしました`);
  } catch {
    toast("コピーできませんでした");
  }
}
