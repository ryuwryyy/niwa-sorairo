import { useEffect, useRef, useState } from "react";

/** 2 段階の確認ボタン。モーダルを出さずにその場で確認する。 */
export default function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "本当に？",
  className = "btn btn-sm btn-danger",
  title = "",
  disabled = false,
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const click = () => {
    if (!armed) {
      setArmed(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    clearTimeout(timer.current);
    setArmed(false);
    onConfirm?.();
  };

  return (
    <button type="button" className={className} onClick={click} disabled={disabled} title={title || undefined}>
      {armed ? confirmLabel : children}
    </button>
  );
}
