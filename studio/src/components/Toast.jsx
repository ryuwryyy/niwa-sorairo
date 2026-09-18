/**
 * 小さなトースト。App.jsx に <ToastProvider> を足して使う。
 * useToast() は (message, kind?) を受け取る関数を返す。Provider が無くても落ちない。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const seq = useRef(0);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const push = useCallback((message, kind = "ok", ms = 3200) => {
    if (!message) return null;
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { id, message: String(message), kind }]);
    timers.current.push(setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), ms));
    return id;
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

const noop = () => null;

export function useToast() {
  return useContext(ToastCtx) || noop;
}

export default ToastProvider;
