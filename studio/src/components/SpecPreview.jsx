/**
 * spec.json を HTML でプレビューする（Figma に流す前に見比べるため）。
 * auto-layout は flex に、$color.* はトークンに解決して描く。
 */
import { useEffect, useRef, useState } from "react";

const JUSTIFY = { start: "flex-start", center: "center", end: "flex-end", space_between: "space-between" };

function resolveColor(v, tokens) {
  if (typeof v !== "string") return undefined;
  if (v.startsWith("$color.")) return tokens?.color?.[v.slice(7)] || "transparent";
  return v;
}

function fillStyle(fill, tokens, assets) {
  if (!fill) return {};
  if (typeof fill === "string") return { background: resolveColor(fill, tokens) };
  if (fill.asset) {
    const a = (assets || []).find((x) => x.id === fill.asset);
    if (!a?.dataUrl) return { background: tokens?.color?.secondary || "#ccc" };
    return {
      backgroundImage: `url(${a.dataUrl})`,
      backgroundSize: fill.scale === "fit" ? "contain" : "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }
  return {};
}

function nodeStyle(node, tokens, assets, parentMode) {
  const s = { boxSizing: "border-box", ...fillStyle(node.fill, tokens, assets) };
  const L = node.layout;
  if (L && L.mode && L.mode !== "none") {
    s.display = "flex";
    s.flexDirection = L.mode === "horizontal" ? "row" : "column";
    s.justifyContent = JUSTIFY[L.align] || "flex-start";
    s.alignItems = JUSTIFY[L.counterAlign] || "flex-start";
    if (L.gap) s.gap = `${L.gap}px`;
    if (Array.isArray(L.padding)) s.padding = L.padding.map((p) => `${p}px`).join(" ");
  } else if (node.children?.length) {
    s.display = "block";
  }

  const sz = node.size || {};
  const horizontalParent = parentMode === "horizontal";
  if (sz.wMode === "fill") {
    if (horizontalParent) { s.flexGrow = 1; s.flexBasis = 0; s.minWidth = 0; }
    else { s.alignSelf = "stretch"; s.width = "100%"; }
  } else if (sz.wMode === "hug") s.width = "auto";
  else if (sz.w) s.width = `${sz.w}px`;

  if (sz.hMode === "fill") {
    if (horizontalParent) { s.alignSelf = "stretch"; }
    else { s.flexGrow = 1; s.flexBasis = 0; s.minHeight = 0; }
  } else if (sz.hMode === "hug") s.height = "auto";
  else if (sz.h) s.height = `${sz.h}px`;

  if (node.radius != null) s.borderRadius = `${node.radius}px`;
  if (node.opacity != null) s.opacity = node.opacity;
  if (node.stroke) s.border = `${node.stroke.width || 1}px solid ${resolveColor(node.stroke.color, tokens)}`;

  if (node.text) {
    const t = tokens?.type || {};
    s.fontSize = `${t.scale?.[node.text.style] ?? 16}px`;
    s.fontFamily = node.text.family === "display" ? t.displayFamily || t.family : t.family;
    s.color = resolveColor(node.text.color, tokens) || "inherit";
    s.textAlign = node.text.align || "left";
    s.lineHeight = t.lineHeight ?? 1.5;
    s.fontWeight = ["display", "h1", "h2", "h3"].includes(node.text.style) ? 700 : 400;
    s.whiteSpace = "pre-wrap";
    s.wordBreak = "break-word";
  }
  if (node.type === "ellipse") s.borderRadius = "50%";
  return s;
}

function SpecNode({ node, tokens, assets, parentMode = "none" }) {
  if (!node) return null;
  const style = nodeStyle(node, tokens, assets, parentMode);
  if (node.type === "text") return <div style={style}>{node.text?.value ?? ""}</div>;
  const mode = node.layout?.mode || "none";
  return (
    <div style={style} title={node.name}>
      {(node.children || []).map((c, i) => (
        <SpecNode key={`${c.name || c.type}-${i}`} node={c} tokens={tokens} assets={assets} parentMode={mode} />
      ))}
    </div>
  );
}

/** 幅に合わせて縮小表示する枠 */
function ScaledFrame({ width, height, children, label }) {
  const wrap = useRef(null);
  const [scale, setScale] = useState(0.25);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const measure = () => setScale(Math.min(1, (el.clientWidth || 320) / (width || 1)));
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [width]);

  return (
    <div className="spec-frame">
      {label && <div className="small muted">{label} · {width}×{height}</div>}
      <div className="spec-frame-box" ref={wrap} style={{ height: (height || 0) * scale }}>
        <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
      </div>
    </div>
  );
}

export default function SpecPreview({ spec }) {
  if (!spec) return <div className="empty">まだ spec がありません</div>;
  const { tokens, assets } = spec;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="stack" style={{ gap: 8 }}>
        <h3 className="small muted">フレーム</h3>
        {(spec.frames || []).map((f) => (
          <ScaledFrame key={f.id} width={f.width} height={f.height} label={f.name}>
            <div style={{ width: f.width, height: f.height, position: "relative", overflow: "hidden" }}>
              {(f.children || []).map((c, i) => (
                <SpecNode key={i} node={c} tokens={tokens} assets={assets} parentMode="none" />
              ))}
            </div>
          </ScaledFrame>
        ))}
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h3 className="small muted">コンポーネント</h3>
        {(spec.components || []).map((c) => (
          <div key={c.id} className="spec-comp">
            <div className="row" style={{ gap: 8 }}>
              <strong>{c.name}</strong>
              {Object.entries(c.props || {}).map(([k, vs]) => (
                <span key={k} className="badge">{k}: {vs.join(" / ")}</span>
              ))}
            </div>
            <div className="spec-variants">
              {(c.variants || []).map((v, i) => (
                <div key={i} className="spec-variant">
                  <div className="small muted">{Object.values(v.props || {}).join(" · ")}</div>
                  <div className="spec-variant-box" style={{ background: tokens?.color?.bg }}>
                    <SpecNode node={v.node} tokens={tokens} assets={assets} parentMode="none" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
