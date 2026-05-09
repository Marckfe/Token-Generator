import React, { useState, useRef, useEffect, useCallback } from "react";
import html2canvas from "html2canvas";

// ─────────────────────────────────────────────────────────────────────────────
// ASSET IMPORTS
// ─────────────────────────────────────────────────────────────────────────────
const ALL_FRAME_SETS = import.meta.glob(
  "/src/assets/frames/masterframes/*/*.{png,jpg,jpeg,webp,svg}",
  { eager: true, import: "default" }
);
function groupFramesBySet(allFrames) {
  const map = {};
  for (const path in allFrames) {
    const match = path.match(/masterframes\/([^/]+)\//);
    if (!match) continue;
    const setKey = match[1];
    if (!map[setKey]) map[setKey] = [];
    map[setKey].push({ name: path.split("/").pop().replace(/\.[a-z]+$/, ""), url: allFrames[path] });
  }
  for (const k in map) map[k] = map[k].sort((a, b) => a.name.localeCompare(b.name));
  return map;
}
const FRAME_MAP = groupFramesBySet(ALL_FRAME_SETS);
const framePT = import.meta.glob("/src/assets/frames/pt/*.{png,jpg,jpeg,webp,svg}", { eager: true, import: "default" });
const PT_FRAMES = Object.entries(framePT).map(([p, url]) => ({ name: p.split("/").pop().replace(/\.[a-z]+$/, ""), url }));
const simbolImport = import.meta.glob("/src/assets/simbol/*.{svg,png,jpg,jpeg,webp}", { eager: true, import: "default" });

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS — dimensioni carta reale MTG (in px base, poi scalata per display)
// ─────────────────────────────────────────────────────────────────────────────
const CARD_W = 620;
const CARD_H = 890;
const DISPLAY_W = 460;
const SCALE = DISPLAY_W / CARD_W; // ~0.742

// Layout aree della carta (coordinate su base 620×890)
const LAYOUT = {
  // Barra nome: y center ≈ 42, altezza ≈ 52px
  namebar:    { top: 16, left: 58, right: 85, height: 52 },
  // Area artwork: copre tutta la carta (frame overlay sopra)
  art:        { top: 0, left: 0, width: CARD_W, height: CARD_H },
  // Barra tipo: y center ≈ 720
  typebar:    { top: 705, left: 50, right: 68, height: 32 },
  // Text box abilità
  textbox:    { top: 748, left: 46, width: 506, height: 126 },
  // Frame P/T
  ptframe:    { left: 498, top: 778, width: 89, height: 58 },
  // Info bassa
  infoL:      { left: 10, bottom: 12 },
  copyright:  { right: 20, bottom: 12 },
};

// ─────────────────────────────────────────────────────────────────────────────
// MANA SYMBOL RENDERER
// ─────────────────────────────────────────────────────────────────────────────
function ManaLine({ text, symbolMap, fontSize, color }) {
  const regex = /{([^}]+)}/g;
  const parts = [];
  let last = 0, m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: "txt", v: text.slice(last, m.index) });
    const sym = m[1].trim();
    const key = Object.keys(symbolMap).find(p => p.split("/").pop().replace(/\.[^/.]+$/, "") === sym);
    parts.push({ t: "sym", v: sym, url: key ? symbolMap[key] : null });
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push({ t: "txt", v: text.slice(last) });
  const sz = fontSize || 15;
  return (
    <span style={{ fontSize: sz, color, fontFamily: "'MPlantin','Palatino Linotype','Book Antiqua',serif", lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {parts.map((p, i) =>
        p.t === "txt"
          ? <span key={i}>{p.v}</span>
          : p.url
            ? <img key={i} src={p.url} alt={`{${p.v}}`} style={{ width: sz * 1.1, height: sz * 1.1, verticalAlign: "middle", display: "inline-block", margin: "0 1.5px", position: "relative", top: -1.5 }} />
            : <span key={i} style={{ fontWeight: 700, color: "#c9a227" }}>{`{${p.v}}`}</span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE EDITABLE FIELD — doppio click per editare direttamente sulla carta
// ─────────────────────────────────────────────────────────────────────────────
function InlineField({ value, onChange, multiline, wrapStyle, textStyle, renderContent }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef();
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const inputStyle = {
    ...textStyle,
    background: "rgba(0,0,0,.75)",
    border: "2px solid #c9a227",
    borderRadius: 4,
    outline: "none",
    fontFamily: textStyle?.fontFamily || "inherit",
    color: textStyle?.color || "#fff",
    width: "100%",
    boxSizing: "border-box",
    padding: "2px 6px",
    resize: "none",
    lineHeight: textStyle?.lineHeight || 1.4,
  };

  return (
    <div
      style={{ ...wrapStyle, cursor: editing ? "text" : "pointer", position: "relative" }}
      onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}
      title={editing ? "" : "✏ Doppio click per modificare"}
    >
      {editing ? (
        multiline
          ? <textarea ref={inputRef} value={value} onChange={e => onChange(e.target.value)} onBlur={() => setEditing(false)} style={{ ...inputStyle, minHeight: 60 }} rows={4} />
          : <input ref={inputRef} type="text" value={value} onChange={e => onChange(e.target.value)} onBlur={() => setEditing(false)} onKeyDown={e => e.key === "Enter" && setEditing(false)} style={inputStyle} />
      ) : (
        <>
          {renderContent ? renderContent() : <span style={textStyle}>{value}</span>}
          {/* Indicatore edit */}
          <span style={{
            position: "absolute", top: -7, right: -4,
            background: "#c9a227", color: "#000", fontSize: 8, fontWeight: 900,
            padding: "1px 3px", borderRadius: 3, lineHeight: 1,
            opacity: 0, transition: "opacity .15s", pointerEvents: "none",
          }} className="edit-badge">✏</span>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ARTWORK DRAG TO REPOSITION
// ─────────────────────────────────────────────────────────────────────────────
function DraggableArt({ url, posX, posY, scale, onPosChange, cardW, cardH }) {
  const isDragging = useRef(false);
  const startPos = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const containerRef = useRef();

  const onMouseDown = e => {
    e.preventDefault();
    isDragging.current = true;
    startPos.current = { mx: e.clientX, my: e.clientY, px: posX, py: posY };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };
  const onMouseMove = useCallback(e => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (e.clientX - startPos.current.mx) / rect.width * 100;
    const dy = (e.clientY - startPos.current.my) / rect.height * 100;
    onPosChange(
      Math.max(0, Math.min(100, startPos.current.px - dx)),
      Math.max(0, Math.min(100, startPos.current.py - dy))
    );
  }, [onPosChange]);
  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }, [onMouseMove]);

  // Touch support
  const onTouchStart = e => {
    const t = e.touches[0];
    isDragging.current = true;
    startPos.current = { mx: t.clientX, my: t.clientY, px: posX, py: posY };
  };
  const onTouchMove = e => {
    if (!isDragging.current || !containerRef.current) return;
    const t = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (t.clientX - startPos.current.mx) / rect.width * 100;
    const dy = (t.clientY - startPos.current.my) / rect.height * 100;
    onPosChange(
      Math.max(0, Math.min(100, startPos.current.px - dx)),
      Math.max(0, Math.min(100, startPos.current.py - dy))
    );
  };
  const onTouchEnd = () => { isDragging.current = false; };

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, cursor: "move", overflow: "hidden" }}
      onMouseDown={onMouseDown} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <img src={url} alt="art" style={{
        width: `${scale}%`, height: `${scale}%`,
        objectFit: "cover",
        objectPosition: `${posX}% ${posY}%`,
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        minWidth: "100%", minHeight: "100%",
        userSelect: "none", pointerEvents: "none",
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Section({ icon, title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: "#1c1b19", border: "1px solid #2e2d2b", borderRadius: 10, overflow: "hidden", marginBottom: 5 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        width: "100%", padding: "11px 15px", background: "none", border: "none",
        color: "#c9a227", fontWeight: 700, fontSize: ".88rem", cursor: "pointer", textAlign: "left",
      }}>
        <span>{icon} {title}</span>
        <span style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", display: "inline-block", fontSize: "1rem" }}>▾</span>
      </button>
      {open && <div style={{ padding: "13px 15px", borderTop: "1px solid #252422", display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>}
    </div>
  );
}

const L = ({ children, sub }) => (
  <div style={{ fontSize: ".72rem", color: sub ? "#4a4948" : "#797876", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>
    {children}
  </div>
);

const TF = ({ value, onChange, disabled, multiline, rows, placeholder }) => {
  const base = { background: "#252420", border: "1px solid #2e2d2b", borderRadius: 6, color: "#cdccca", padding: "7px 10px", fontSize: ".83rem", width: "100%", outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color .15s" };
  const focus = e => e.target.style.borderColor = "#c9a227";
  const blur = e => e.target.style.borderColor = "#2e2d2b";
  if (multiline) return <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows || 4} disabled={disabled} placeholder={placeholder} onFocus={focus} onBlur={blur} style={{ ...base, resize: "vertical", lineHeight: 1.5 }} />;
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} onFocus={focus} onBlur={blur} style={base} />;
};

const Num = ({ value, onChange, min, max }) => (
  <input type="number" value={value} onChange={e => onChange(e.target.value)} min={min} max={max}
    style={{ background: "#252420", border: "1px solid #2e2d2b", borderRadius: 6, color: "#cdccca", padding: "6px 8px", fontSize: ".88rem", width: "100%", outline: "none", fontFamily: "inherit", textAlign: "center" }} />
);

const Slider = ({ label, value, onChange, min, max, step = 0.5 }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", color: "#797876", marginBottom: 2 }}>
      <span>{label}</span>
      <span style={{ color: "#c9a227", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {typeof value === "number" ? Number(value).toFixed(step < 1 ? 1 : 0) : value}
      </span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#c9a227", height: 4 }} />
  </div>
);

const ColorPicker = ({ label, value, onChange }) => (
  <div>
    {label && <L>{label}</L>}
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ width: 34, height: 30, border: "2px solid #3a3937", borderRadius: 5, background: "none", cursor: "pointer", padding: 0, flexShrink: 0 }} />
      <input type="text" value={value} onChange={e => onChange(e.target.value)} style={{ background: "#252420", border: "1px solid #2e2d2b", borderRadius: 6, color: "#cdccca", padding: "5px 8px", fontSize: ".8rem", width: 90, fontFamily: "monospace", outline: "none" }} />
    </div>
  </div>
);

const Check = ({ checked, onChange, label }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".83rem", color: "#797876", userSelect: "none" }}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 15, height: 15, accentColor: "#c9a227" }} />
    {label}
  </label>
);

const Btn = ({ onClick, children, variant = "ghost", disabled }) => {
  const styles = {
    primary: { background: "#c9a227", color: "#0f0e0c", border: "none", fontWeight: 900 },
    ghost:   { background: "none", color: "#797876", border: "1px solid #2e2d2b", fontWeight: 600 },
    danger:  { background: "none", color: "#f87171", border: "1px solid #7f1d1d", fontWeight: 600 },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles[variant], borderRadius: 7, padding: "8px 14px", fontSize: ".83rem",
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "filter .15s",
    }} onMouseEnter={e => !disabled && (e.currentTarget.style.filter = "brightness(1.12)")}
       onMouseLeave={e => e.currentTarget.style.filter = ""}>
      {children}
    </button>
  );
};

// Preset colori testo per frame comuni
const TEXT_PRESETS = [
  { label: "Scuro (default)", value: "#181818" },
  { label: "Bianco", value: "#f5f5f0" },
  { label: "Oro", value: "#c9a227" },
  { label: "Beige", value: "#e8dfc8" },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function MagicTokenEditor() {
  const allFrameKeys = Object.keys(FRAME_MAP);

  // ── STATE ──────────────────────────────────────────────────────────────────
  const [name,          setName]         = useState("CONSTRUCT");
  const [nameFs,        setNameFs]        = useState(29);
  const [nameColor,     setNameColor]     = useState("#181818");
  const [nameOffX,      setNameOffX]      = useState(0);
  const [nameOffY,      setNameOffY]      = useState(0);

  const [manaCost,      setManaCost]      = useState("{5}");
  const [showMana,      setShowMana]      = useState(true);

  const [type,          setType]          = useState("Token Artifact Creature — Construct");
  const [typeFs,        setTypeFs]        = useState(21);
  const [typeColor,     setTypeColor]     = useState("#181818");

  const [abilityText,   setAbilityText]   = useState("This creature gets +1/+1 for each artifact you control.\n{T}: Add {G} or {R} to your mana pool.");
  const [abilityFs,     setAbilityFs]     = useState(15);
  const [abilityColor,  setAbilityColor]  = useState("#181818");
  const [showAbility,   setShowAbility]   = useState(true);

  const [flavorText,    setFlavorText]    = useState("");
  const [showFlavor,    setShowFlavor]    = useState(false);
  const [flavorFs,      setFlavorFs]      = useState(14);

  const [power,         setPower]         = useState("0");
  const [toughness,     setToughness]     = useState("0");
  const [ptFs,          setPtFs]          = useState(34);
  const [ptColor,       setPtColor]       = useState("#181818");
  const [showPT,        setShowPT]        = useState(true);

  const [mainFrameSet,  setMainFrameSet]  = useState(allFrameKeys[0] || "");
  const [mainFrameIdx,  setMainFrameIdx]  = useState(0);
  const [ptFrameIdx,    setPtFrameIdx]    = useState(0);

  const [artUrl,        setArtUrl]        = useState("");
  const [artPosX,       setArtPosX]       = useState(50);
  const [artPosY,       setArtPosY]       = useState(30);
  const [artScale,      setArtScale]      = useState(100);

  const [year,          setYear]          = useState("2025");
  const [rarity,        setRarity]        = useState("P");
  const [setCode,       setSetCode]       = useState("MTG");
  const [lang,          setLang]          = useState("EN");
  const [artist,        setArtist]        = useState("Jn Avon");
  const [showInfo,      setShowInfo]      = useState(true);
  const [showCopyright, setShowCopyright] = useState(true);
  const [infoFs,        setInfoFs]        = useState(12);

  const [downloading,   setDownloading]   = useState(false);

  const artInput = useRef();
  const cardRef  = useRef();
  const symbolMap = simbolImport;

  const currentFrame   = FRAME_MAP[mainFrameSet]?.[mainFrameIdx];
  const currentPtFrame = PT_FRAMES[ptFrameIdx];

  // ── ART UPLOAD ─────────────────────────────────────────────────────────────
  const handleArtChange = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => { setArtUrl(reader.result); setArtPosX(50); setArtPosY(30); setArtScale(100); };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  // ── DOWNLOAD ───────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!cardRef.current || downloading) return;
    setDownloading(true);
    try {
      const el = cardRef.current;
      const saved = { ov: el.style.overflow, bd: el.style.border, bs: el.style.boxShadow, br: el.style.borderRadius };
      el.style.overflow = "visible"; el.style.border = "none"; el.style.boxShadow = "none"; el.style.borderRadius = "0";
      const lib = (await import("html2canvas")).default;
      const canvas = await lib(el, { scale: 3, useCORS: true, allowTaint: true, logging: false, backgroundColor: null });
      el.style.overflow = saved.ov; el.style.border = saved.bd; el.style.boxShadow = saved.bs; el.style.borderRadius = saved.br;
      const a = document.createElement("a");
      a.download = `${name.replace(/[^a-zA-Z0-9_\-]/g, "_")}_token.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch (err) { console.error("Download error:", err); alert("Errore download: " + err.message); }
    finally { setDownloading(false); }
  };

  // ── FONT FACE ──────────────────────────────────────────────────────────────
  const fontFace = `
    @font-face{font-family:'Beleren';src:url('/src/assets/fonts/Beleren2016-Bold.ttf') format('truetype');font-weight:bold}
    @font-face{font-family:'MPlantin';src:url('/src/assets/fonts/Mplantin.ttf') format('truetype')}
    @font-face{font-family:'MatrixSC';src:url('/src/assets/fonts/MatrixBoldSmallCaps Bold.ttf') format('truetype')}
    @font-face{font-family:'MagicFont';src:url('/src/assets/fonts/magic-font.ttf') format('truetype')}
    .card-wrap:hover .edit-badge{opacity:1!important}
    .inline-field:hover .edit-badge{opacity:1!important}
  `;

  // ── CARD RENDER ────────────────────────────────────────────────────────────
  const displayH = Math.round(CARD_H * SCALE);
  const cardWrapStyle = { width: DISPLAY_W, height: displayH, position: "relative", flexShrink: 0 };
  const cardInnerStyle = {
    width: CARD_W, height: CARD_H,
    position: "absolute", top: 0, left: 0,
    transform: `scale(${SCALE})`, transformOrigin: "top left",
    borderRadius: 18, overflow: "hidden",
    boxShadow: "0 12px 60px rgba(0,0,0,.9), 0 0 0 1px rgba(201,162,39,.15)",
  };

  const nameFont = "'Beleren','MatrixSC','Cinzel',serif";
  const bodyFont = "'MPlantin','Palatino Linotype','Book Antiqua',serif";

  return (
    <>
      <style>{fontFace}</style>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ═══════════════════════════════════════════════════════════════════
            CARTA PREVIEW
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>

          <div className="card-wrap" ref={cardRef} style={cardWrapStyle}>
            <div style={cardInnerStyle}>

              {/* ── ARTWORK (dietro tutto, tutta carta) ── */}
              <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "#0a0a08" }}>
                {artUrl
                  ? <DraggableArt url={artUrl} posX={artPosX} posY={artPosY} scale={artScale}
                      onPosChange={(x, y) => { setArtPosX(x); setArtPosY(y); }} cardW={CARD_W} cardH={CARD_H} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "rgba(255,255,255,.25)", userSelect: "none" }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      <span style={{ fontSize: 14, fontStyle: "italic" }}>Carica artwork</span>
                    </div>
                }
              </div>

              {/* ── FRAME overlay ── */}
              {currentFrame && (
                <img src={currentFrame.url} alt="frame" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", zIndex: 2, pointerEvents: "none" }} />
              )}

              {/* ── NOME ── */}
              <InlineField value={name} onChange={setName}
                wrapStyle={{ position: "absolute", zIndex: 3, top: LAYOUT.namebar.top, left: LAYOUT.namebar.left + nameOffX, right: LAYOUT.namebar.right - nameOffX, height: LAYOUT.namebar.height, display: "flex", alignItems: "center", justifyContent: "center" }}
                textStyle={{ fontSize: nameFs, color: nameColor, fontFamily: nameFont, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1 }}
                renderContent={() => (
                  <span className="inline-field" style={{ fontFamily: nameFont, fontSize: nameFs, fontWeight: 700, color: nameColor, textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", display: "block", position: "relative" }}>
                    {name}
                    <span className="edit-badge" style={{ position: "absolute", top: -7, right: -4, background: "#c9a227", color: "#000", fontSize: 8, fontWeight: 900, padding: "1px 3px", borderRadius: 3, lineHeight: 1, opacity: 0, transition: "opacity .15s", pointerEvents: "none" }}>✏</span>
                  </span>
                )}
              />

              {/* ── COSTO MANA (angolo in alto a destra della barra nome) ── */}
              {showMana && manaCost && (
                <div style={{ position: "absolute", zIndex: 3, top: LAYOUT.namebar.top, right: 8, height: LAYOUT.namebar.height, display: "flex", alignItems: "center", gap: 1 }}>
                  <ManaLine text={manaCost} symbolMap={symbolMap} fontSize={22} color={nameColor} />
                </div>
              )}

              {/* ── RIGA TIPO ── */}
              <InlineField value={type} onChange={setType}
                wrapStyle={{ position: "absolute", zIndex: 3, top: LAYOUT.typebar.top, left: LAYOUT.typebar.left, right: LAYOUT.typebar.right, height: LAYOUT.typebar.height, display: "flex", alignItems: "center" }}
                textStyle={{ fontSize: typeFs, color: typeColor, fontFamily: nameFont, fontWeight: 700, lineHeight: 1 }}
                renderContent={() => (
                  <span className="inline-field" style={{ fontFamily: nameFont, fontSize: typeFs, fontWeight: 700, color: typeColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", lineHeight: 1, display: "block", position: "relative" }}>
                    {type}
                    <span className="edit-badge" style={{ position: "absolute", top: -7, right: -4, background: "#c9a227", color: "#000", fontSize: 8, fontWeight: 900, padding: "1px 3px", borderRadius: 3, lineHeight: 1, opacity: 0, transition: "opacity .15s", pointerEvents: "none" }}>✏</span>
                  </span>
                )}
              />

              {/* ── TEXT BOX ABILITÀ ── */}
              {showAbility && (
                <div style={{ position: "absolute", zIndex: 3, top: LAYOUT.textbox.top, left: LAYOUT.textbox.left, width: LAYOUT.textbox.width, height: LAYOUT.textbox.height, overflow: "hidden" }}>
                  <InlineField value={abilityText} onChange={setAbilityText} multiline
                    wrapStyle={{ width: "100%", height: "100%" }}
                    textStyle={{ fontSize: abilityFs, color: abilityColor, fontFamily: bodyFont, lineHeight: 1.45 }}
                    renderContent={() => (
                      <div className="inline-field" style={{ position: "relative" }}>
                        {abilityText.split("\n").map((line, i, arr) => (
                          <div key={i} style={{ marginBottom: i < arr.length - 1 ? 5 : 0 }}>
                            <ManaLine text={line} symbolMap={symbolMap} fontSize={abilityFs} color={abilityColor} />
                          </div>
                        ))}
                        {showFlavor && flavorText && (
                          <div style={{ marginTop: 7, borderTop: `1px solid ${abilityColor}44`, paddingTop: 5 }}>
                            <span style={{ fontFamily: bodyFont, fontSize: flavorFs, color: abilityColor, fontStyle: "italic", lineHeight: 1.4 }}>{flavorText}</span>
                          </div>
                        )}
                        <span className="edit-badge" style={{ position: "absolute", top: -7, right: -4, background: "#c9a227", color: "#000", fontSize: 8, fontWeight: 900, padding: "1px 3px", borderRadius: 3, lineHeight: 1, opacity: 0, transition: "opacity .15s", pointerEvents: "none" }}>✏</span>
                      </div>
                    )}
                  />
                </div>
              )}

              {/* ── P/T FRAME ── */}
              {showPT && currentPtFrame && (
                <img src={currentPtFrame.url} alt="pt" style={{ position: "absolute", left: LAYOUT.ptframe.left, top: LAYOUT.ptframe.top, width: LAYOUT.ptframe.width, height: LAYOUT.ptframe.height, objectFit: "fill", zIndex: 3, pointerEvents: "none" }} />
              )}

              {/* ── P/T TESTO ── */}
              {showPT && (
                <div style={{ position: "absolute", left: LAYOUT.ptframe.left, top: LAYOUT.ptframe.top, width: LAYOUT.ptframe.width, height: LAYOUT.ptframe.height, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4 }}>
                  <span style={{ fontFamily: nameFont, fontSize: ptFs, fontWeight: 700, color: ptColor, letterSpacing: ".01em", lineHeight: 1, whiteSpace: "nowrap" }}>
                    {power}/{toughness}
                  </span>
                </div>
              )}

              {/* ── INFO BASSA SINISTRA ── */}
              {showInfo && (
                <div style={{ position: "absolute", left: LAYOUT.infoL.left, bottom: LAYOUT.infoL.bottom, zIndex: 3, lineHeight: 1.4 }}>
                  <div style={{ fontSize: infoFs, color: "#909090", fontFamily: "monospace" }}>{year} {rarity}</div>
                  <div style={{ fontSize: infoFs, color: "#909090", fontFamily: "monospace" }}>{setCode} • {lang}</div>
                  <div style={{ fontSize: infoFs, color: "#909090", fontFamily: "monospace" }}>Illus. {artist}</div>
                </div>
              )}

              {/* ── COPYRIGHT ── */}
              {showCopyright && (
                <div style={{ position: "absolute", right: LAYOUT.copyright.right, bottom: LAYOUT.copyright.bottom, zIndex: 3 }}>
                  <span style={{ fontSize: infoFs, color: "#909090", fontFamily: "monospace" }}>© {year} Wizards of the Coast</span>
                </div>
              )}
            </div>
          </div>

          {/* Hint */}
          <p style={{ fontSize: ".72rem", color: "#3a3937", textAlign: "center", maxWidth: DISPLAY_W, margin: 0 }}>
            ✏ Doppio click su nome, tipo, abilità per modificare · 🖱 Trascina l'artwork per riposizionarlo
          </p>

          {/* Download */}
          <button onClick={handleDownload} disabled={downloading} style={{
            width: DISPLAY_W, background: downloading ? "#2e2d2b" : "#c9a227",
            color: downloading ? "#797876" : "#0f0e0c", border: "none",
            borderRadius: 10, padding: "13px 0", fontSize: "1rem", fontWeight: 900,
            cursor: downloading ? "not-allowed" : "pointer", transition: "all .2s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {downloading
              ? <><span style={{ width: 15, height: 15, border: "2px solid #555", borderTopColor: "#c9a227", borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block" }} /> Generazione PNG…</>
              : <>⬇ Scarica PNG UHD (3×)</>
            }
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            PANNELLO CONTROLLI
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ flex: 1, minWidth: 290, maxWidth: 430 }}>

          {/* ── FRAME & ARTWORK ── */}
          <Section icon="🖼" title="Frame & Artwork" defaultOpen={true}>
            <L>Set Frame</L>
            <select value={mainFrameSet} onChange={e => { setMainFrameSet(e.target.value); setMainFrameIdx(0); }}
              style={{ background: "#252420", border: "1px solid #2e2d2b", borderRadius: 6, color: "#cdccca", padding: "7px 10px", fontSize: ".83rem", width: "100%", outline: "none" }}>
              {allFrameKeys.map(k => (
                <option key={k} value={k}>{k.replace("token","").replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^./,a=>a.toUpperCase())||k}</option>
              ))}
            </select>

            {(FRAME_MAP[mainFrameSet]||[]).length > 0 && (<>
              <L>Frame specifico</L>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(FRAME_MAP[mainFrameSet]||[]).map((f,idx) => (
                  <button key={f.url} onClick={() => setMainFrameIdx(idx)}
                    title={f.name}
                    style={{ padding: 2, borderRadius: 4, border: `2px solid ${mainFrameIdx===idx?"#c9a227":"#2e2d2b"}`, background: "#1a1a17", cursor: "pointer", transition: "border-color .15s" }}>
                    <img src={f.url} alt={f.name} style={{ width: 40, height: 56, objectFit: "cover", borderRadius: 2, display: "block" }} />
                  </button>
                ))}
              </div>
            </>)}

            {PT_FRAMES.length > 0 && (<>
              <L>Frame P/T</L>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {PT_FRAMES.map((f,idx) => (
                  <button key={f.url} onClick={() => setPtFrameIdx(idx)}
                    title={f.name}
                    style={{ padding: 2, borderRadius: 4, border: `2px solid ${ptFrameIdx===idx?"#c9a227":"#2e2d2b"}`, background: "#1a1a17", cursor: "pointer", transition: "border-color .15s" }}>
                    <img src={f.url} alt={f.name} style={{ width: 54, height: 34, objectFit: "cover", borderRadius: 2, display: "block" }} />
                  </button>
                ))}
              </div>
            </>)}

            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="primary" onClick={() => artInput.current.click()}>
                🖼 {artUrl ? "Cambia artwork" : "Carica artwork"}
              </Btn>
              {artUrl && <Btn variant="danger" onClick={() => setArtUrl("")}>✕</Btn>}
            </div>
            <input ref={artInput} type="file" accept="image/*" style={{ display: "none" }} onChange={handleArtChange} />

            {artUrl && (
              <div style={{ background: "#252420", borderRadius: 8, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 8, border: "1px solid #2e2d2b" }}>
                <L>🎯 Posizione artwork — trascina sulla carta oppure usa gli slider</L>
                <Slider label="Posizione orizzontale (X)" value={artPosX} onChange={setArtPosX} min={0} max={100} step={1} />
                <Slider label="Posizione verticale (Y)" value={artPosY} onChange={setArtPosY} min={0} max={100} step={1} />
                <Slider label="Zoom %" value={artScale} onChange={setArtScale} min={100} max={200} step={1} />
                <Btn variant="ghost" onClick={() => { setArtPosX(50); setArtPosY(30); setArtScale(100); }}>↺ Reset</Btn>
              </div>
            )}
          </Section>

          {/* ── NOME ── */}
          <Section icon="✏️" title="Nome carta" defaultOpen={true}>
            <L>Testo <span style={{ color: "#3a3937", fontWeight: 400, textTransform: "none" }}>(o doppio click sulla carta)</span></L>
            <TF value={name} onChange={setName} placeholder="Nome della carta" />
            <Slider label="Dimensione font" value={nameFs} onChange={setNameFs} min={12} max={48} />
            <ColorPicker label="Colore" value={nameColor} onChange={setNameColor} />
            <div style={{ display: "flex", gap: 6 }}>
              {TEXT_PRESETS.map(p => (
                <button key={p.value} onClick={() => setNameColor(p.value)} title={p.label}
                  style={{ width: 24, height: 24, borderRadius: 4, background: p.value, border: nameColor === p.value ? "2px solid #c9a227" : "2px solid #333", cursor: "pointer" }} />
              ))}
              <span style={{ fontSize: ".72rem", color: "#4a4948", alignSelf: "center", marginLeft: 4 }}>Preset colori</span>
            </div>
            <div style={{ background: "#252420", borderRadius: 8, padding: "10px 12px", border: "1px solid #2e2d2b" }}>
              <L>Allineamento fine nome</L>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
                <Slider label="Offset X" value={nameOffX} onChange={setNameOffX} min={-120} max={120} step={1} />
                <Slider label="Offset Y" value={nameOffY} onChange={setNameOffY} min={-20} max={20} step={1} />
              </div>
              <div style={{ marginTop: 8 }}>
                <Btn variant="ghost" onClick={() => { setNameOffX(0); setNameOffY(0); }}>↺ Centra nome</Btn>
              </div>
            </div>
          </Section>

          {/* ── COSTO MANA ── */}
          <Section icon="🔮" title="Costo Mana">
            <Check checked={showMana} onChange={setShowMana} label="Mostra costo mana" />
            <L>Costo mana — es: {"{2}{W}{U}"} {"{X}{R}{R}"} {"{5}"}</L>
            <TF value={manaCost} onChange={setManaCost} placeholder="{5}" disabled={!showMana} />
          </Section>

          {/* ── TIPO ── */}
          <Section icon="📋" title="Riga Tipo">
            <L>Testo <span style={{ color: "#3a3937", fontWeight: 400, textTransform: "none" }}>(o doppio click sulla carta)</span></L>
            <TF value={type} onChange={setType} />
            <Slider label="Dimensione font" value={typeFs} onChange={setTypeFs} min={10} max={30} />
            <ColorPicker label="Colore" value={typeColor} onChange={setTypeColor} />
          </Section>

          {/* ── ABILITÀ ── */}
          <Section icon="⚡" title="Testo & Abilità">
            <Check checked={showAbility} onChange={setShowAbility} label="Mostra testo abilità" />
            <L>Testo abilità</L>
            <p style={{ fontSize: ".72rem", color: "#4a4948", margin: 0, lineHeight: 1.5 }}>
              Usa {"{"} {"}"} per i simboli mana: {"{W}"} {"{U}"} {"{B}"} {"{R}"} {"{G}"} {"{T}"} {"{2}"} {"{X}"}<br/>
              Vai a capo con Invio per separare paragrafi abilità.
            </p>
            <TF value={abilityText} onChange={setAbilityText} multiline rows={5} disabled={!showAbility} />
            <Slider label="Dimensione font" value={abilityFs} onChange={setAbilityFs} min={8} max={22} step={0.5} />
            <ColorPicker label="Colore testo" value={abilityColor} onChange={setAbilityColor} />

            <div style={{ borderTop: "1px solid #252422", paddingTop: 10 }}>
              <Check checked={showFlavor} onChange={setShowFlavor} label="Mostra flavor text (in corsivo)" />
              {showFlavor && (<>
                <TF value={flavorText} onChange={setFlavorText} multiline rows={2} placeholder="Testo flavour in corsivo…" />
                <Slider label="Dimensione flavor" value={flavorFs} onChange={setFlavorFs} min={8} max={18} step={0.5} />
              </>)}
            </div>
          </Section>

          {/* ── P/T ── */}
          <Section icon="⚔️" title="Power / Toughness">
            <Check checked={showPT} onChange={setShowPT} label="Mostra Power / Toughness" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 32px 1fr", gap: 8, alignItems: "end" }}>
              <div><L>Power</L><Num value={power} onChange={setPower} /></div>
              <div style={{ textAlign: "center", color: "#797876", fontSize: "1.2rem", paddingBottom: 6 }}>/</div>
              <div><L>Toughness</L><Num value={toughness} onChange={setToughness} /></div>
            </div>
            <Slider label="Dimensione font P/T" value={ptFs} onChange={setPtFs} min={16} max={52} />
            <ColorPicker label="Colore P/T" value={ptColor} onChange={setPtColor} />
          </Section>

          {/* ── INFO & COPYRIGHT ── */}
          <Section icon="ℹ️" title="Info & Copyright">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><L>Anno</L><TF value={year} onChange={setYear} /></div>
              <div><L>Rarità</L><TF value={rarity} onChange={setRarity} placeholder="P / C / R / M" /></div>
              <div><L>Codice Set</L><TF value={setCode} onChange={setSetCode} /></div>
              <div><L>Lingua</L><TF value={lang} onChange={setLang} /></div>
            </div>
            <L>Illustratore</L>
            <TF value={artist} onChange={setArtist} />
            <Slider label="Dimensione font info" value={infoFs} onChange={setInfoFs} min={7} max={16} />
            <Check checked={showInfo} onChange={setShowInfo} label="Mostra info set/rarità/artista" />
            <Check checked={showCopyright} onChange={setShowCopyright} label="Mostra © copyright" />
          </Section>

        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
