import { useId, useState } from "react";

export default function Collapsible({ title, subtitle = "", defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="collapsible">
      <button type="button" className="collapsible-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="tw">{open ? "▾" : "▸"}</span>
        <span>{title}</span>
        {subtitle ? <span className="small muted">{subtitle}</span> : null}
      </button>
      {open && <div className="collapsible-body" id={id}>{children}</div>}
    </div>
  );
}
