import React, { useState, useRef, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// ASSET IMPORTS
// ─────────────────────────────────────────────────────────────────────────────
const ALL_FRAME_SETS = import.meta.glob(
  "/src/assets/frames/masterframes/*/*.{png,jpg,jpeg,webp,svg}",
  { eager: true, import: "default" }
);
function groupFramesBySet(all) {
  const map = {};
  for (const path in all) {
    const m = path.match(/masterframes\/([^/]+)\//);
    if (!m) continue;
    const k = m[1];
    if (!map[k]) map[k] = [];
    map[k].push({ name: path.split("/").pop().replace(/\.[a-z]+$/, ""), url: all[path] });
  }
  for (const k in map) map[k].sort((a, b) => a.name.localeCompare(b.name));
  return map;
}
const FRAME_MAP = groupFramesBySet(ALL_FRAME_SETS);
const framePT  = import.meta.glob("/src/assets/frames/pt/*.{png,jpg,jpeg,webp,svg}", { eager: true, import: "default" });
const PT_FRAMES = Object.entries(framePT).map(([p, url]) => ({ name: p.split("/").pop().replace(/\.[a-z]+$/, ""), url }));
const SYMBOLS   = import.meta.glob("/src/assets/simbol/*.{svg,png,jpg,jpeg,webp}", { eager: true, import: "default" });

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSIONI — usiamo direttamente 460px di larghezza display
// Tutte le posizioni sono in percentuale o calcolate su questa base
// ─────────────────────────────────────────────────────────────────────────────
const CW = 460;   // card width  (display)
const CH = 660;   // card height (display) — proporzione MTG 2.5"×3.5" = 63×88mm ≈ 460×644, arrotondiamo a 660

// Posizioni % rispetto a CW/CH — verificate empiricamente sui frame MTG
const POS = {
  // Barra nome: strip in cima al frame
  namebar:  { top: pct(CH, 2.2),  left: pct(CW, 9.5), right: pct(CW, 13.5), h: pct(CH, 6.5) },
  // Mana cost: angolo destra barra nome
  manabar:  { top: pct(CH, 2.2),  right: pct(CW, 1.5), h: pct(CH, 6.5) },
  // Riga tipo
  typebar:  { top: pct(CH, 79.2), left: pct(CW, 7.5),  right: pct(CW, 10.5), h: pct(CH, 4.8) },
  // Text box
  textbox:  { top: pct(CH, 84.5), left: pct(CW, 6.5),  w: pct(CW, 87),       h: pct(CH, 12.8) },
  // P/T frame
  ptframe:  { bottom: pct(CH, 2.3), right: pct(CW, 1.8), w: pct(CW, 14.5),   h: pct(CH, 7.8) },
  // Info
  infoL:    { bottom: pct(CH, 0.8), left: pct(CW, 1.5) },
  infoR:    { bottom: pct(CH, 0.8), right: pct(CW, 2.5) },
};
function pct(base, p) { return (base * p / 100); }

// Font families MTG
const FF_TITLE = "'Beleren','MatrixSC','Cinzel Decorative','Georgia',serif";
const FF_BODY  = "'MPlantin','Palatino Linotype','Book Antiqua','Georgia',serif";

// ─────────────────────────────────────────────────────────────────────────────
// MANA SYMBOL PARSER
// ─────────────────────────────────────────────────────────────────────────────
function ManaLine({ text, fontSize, color }) {
  const rx = /{([^}]+)}/g;
  const parts = []; let last = 0, m;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: "txt", v: text.slice(last, m.index) });
    const sym = m[1].trim();
    const key = Object.keys(SYMBOLS).find(p => p.split("/").pop().replace(/\.[^.]+$/, "") === sym);
    parts.push({ t: "sym", v: sym, url: key ? SYMBOLS[key] : null });
    last = rx.lastIndex;
  }
  if (last < text.length) parts.push({ t: "txt", v: text.slice(last) });
  const sz = fontSize || 14;
  return (
    <span style={{ fontSize: sz, color, fontFamily: FF_BODY, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {parts.map((p, i) =>
        p.t === "txt" ? <span key={i}>{p.v}</span>
        : p.url ? <img key={i} src={p.url} alt={`{${p.v}}`}
            style={{ width: sz * 1.1, height: sz * 1.1, verticalAlign: "middle", display: "inline-block", margin: "0 1px", position: "relative", top: -1 }} />
        : <span key={i} style={{ fontWeight: 700, color: "#c9a227" }}>{`{${p.v}}`}</span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE EDITABLE — doppio click sulla carta per modificare
// ─────────────────────────────────────────────────────────────────────────────
function IE({ value, onChange, multiline, fillParent, children, style }) {
  const [ed, setEd] = useState(false);
  const ref = useRef();
  useEffect(() => { if (ed && ref.current) ref.current.focus(); }, [ed]);
  const base = {
    ...style,
    background: "rgba(0,0,0,.8)",
    border: "2px solid #c9a227",
    borderRadius: 3,
    outline: "none",
    color: style?.color || "#fff",
    fontFamily: style?.fontFamily || FF_BODY,
    fontSize: style?.fontSize || 14,
    padding: "2px 5px",
    resize: "none",
    width: "100%",
    boxSizing: "border-box",
    lineHeight: style?.lineHeight || 1.4,
  };
  const wrap = {
    width: "100%",
    height: fillParent ? "100%" : "auto",
    cursor: "text",
    position: "relative",
    display: "flex",
    alignItems: "center",
    ...(fillParent ? {} : {}),
  };
  return (
    <div style={wrap} onDoubleClick={e => { e.stopPropagation(); setEd(true); }}
      title={ed ? "" : "✏ Doppio click per modificare"}>
      {ed
        ? multiline
          ? <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} onBlur={() => setEd(false)} style={{ ...base, height: "100%", minHeight: 60 }} />
          : <input ref={ref} type="text" value={value} onChange={e => onChange(e.target.value)} onBlur={() => setEd(false)} onKeyDown={e => e.key === "Enter" && setEd(false)} style={base} />
        : children
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ARTWORK DRAG
// ─────────────────────────────────────────────────────────────────────────────
function ArtLayer({ url, posX, posY, scale, onUpdate }) {
  const dragging = useRef(false);
  const start    = useRef({});
  const onDown = e => {
    dragging.current = true;
    start.current = { cx: e.clientX, cy: e.clientY, px: posX, py: posY };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };
  const onMove = useCallback(e => {
    if (!dragging.current) return;
    // ogni 5px di spostamento mouse = ~1% di spostamento immagine
    const dx = (start.current.cx - e.clientX) / 5;
    const dy = (start.current.cy - e.clientY) / 5;
    onUpdate(
      Math.max(0, Math.min(100, start.current.px + dx)),
      Math.max(0, Math.min(100, start.current.py + dy))
    );
  }, [onUpdate]);
  const onUp = useCallback(() => {
    dragging.current = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup",   onUp);
  }, [onMove]);
  useEffect(() => () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); }, []);

  return (
    <div style={{ position: "absolute", inset: 0, cursor: "move", overflow: "hidden" }} onMouseDown={onDown}>
      <img src={url} alt="art" draggable={false}
        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: `${scale}%`, height: `${scale}%`, minWidth: "100%", minHeight: "100%",
          objectFit: "cover", objectPosition: `${posX}% ${posY}%`,
          userSelect: "none", pointerEvents: "none" }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const G = "#c9a227";   // gold accent
const BG = "#1c1b19";  // panel bg
const BR = "#2a2927";  // border

function Accordion({ icon, title, open: defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: BG, border: `1px solid ${BR}`, borderRadius: 10, overflow: "hidden", marginBottom: 5 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "11px 15px", background: "none", border: "none", color: G, fontWeight: 700, fontSize: ".88rem", cursor: "pointer" }}>
        <span>{icon} {title}</span>
        <span style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", display: "inline-block" }}>▾</span>
      </button>
      {open && <div style={{ padding: "13px 15px", borderTop: `1px solid ${BR}`, display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>}
    </div>
  );
}

const Lbl = ({ children }) => <div style={{ fontSize: ".7rem", color: "#797876", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>{children}</div>;

const TF = ({ value, onChange, multiline, rows, disabled, placeholder }) => {
  const s = { background: "#252420", border: `1px solid ${BR}`, borderRadius: 6, color: "#cdccca", padding: "7px 10px", fontSize: ".83rem", width: "100%", outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  if (multiline) return <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows||4} disabled={disabled} placeholder={placeholder} style={{ ...s, resize: "vertical", lineHeight: 1.5 }} />;
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} style={s} />;
};

const Slider = ({ label, value, onChange, min, max, step = 1 }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".7rem", color: "#797876", marginBottom: 2 }}>
      <span>{label}</span>
      <span style={{ color: G, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{typeof value === "number" ? value.toFixed(step < 1 ? 1 : 0) : value}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: "100%", accentColor: G }} />
  </div>
);

const CP = ({ label, value, onChange }) => (
  <div>
    {label && <Lbl>{label}</Lbl>}
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 32, height: 28, border: `2px solid ${BR}`, borderRadius: 5, background: "none", cursor: "pointer", padding: 0, flexShrink: 0 }} />
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        style={{ background: "#252420", border: `1px solid ${BR}`, borderRadius: 6, color: "#cdccca", padding: "5px 8px", fontSize: ".78rem", width: 86, fontFamily: "monospace", outline: "none" }} />
    </div>
  </div>
);

const Chk = ({ label, checked, onChange }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".83rem", color: "#797876", userSelect: "none" }}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 14, height: 14, accentColor: G }} />
    {label}
  </label>
);

const GoldBtn = ({ onClick, disabled, children, full }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ background: disabled ? "#2e2d2b" : G, color: disabled ? "#555" : "#0f0e0c", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: ".84rem", fontWeight: 900, cursor: disabled ? "not-allowed" : "pointer", width: full ? "100%" : "auto", transition: "filter .15s" }}
    onMouseEnter={e => !disabled && (e.currentTarget.style.filter = "brightness(1.1)")}
    onMouseLeave={e => e.currentTarget.style.filter = ""}>
    {children}
  </button>
);

const GhostBtn = ({ onClick, children }) => (
  <button onClick={onClick}
    style={{ background: "none", color: "#797876", border: `1px solid ${BR}`, borderRadius: 7, padding: "7px 12px", fontSize: ".78rem", fontWeight: 600, cursor: "pointer" }}>
    {children}
  </button>
);

const COLOR_PRESETS = ["#181818","#f5f5f0","#c9a227","#e8dfc8","#ffffff"];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EDITOR
// ─────────────────────────────────────────────────────────────────────────────
export default function MagicTokenEditor() {
  const allSets = Object.keys(FRAME_MAP);

  // STATO
  const [name,        setName]        = useState("CONSTRUCT");
  const [nameFs,      setNameFs]      = useState(20);
  const [nameColor,   setNameColor]   = useState("#181818");
  const [nameOffX,    setNameOffX]    = useState(0);

  const [manaCost,    setManaCost]    = useState("{5}");
  const [showMana,    setShowMana]    = useState(false);

  const [type,        setType]        = useState("Token Artifact Creature — Construct");
  const [typeFs,      setTypeFs]      = useState(15);
  const [typeColor,   setTypeColor]   = useState("#181818");

  const [ability,     setAbility]     = useState("This creature gets +1/+1 for each artifact you control.\n{T}: Add {G} or {R}.");
  const [abilityFs,   setAbilityFs]   = useState(11);
  const [abilityColor,setAbilityColor]= useState("#181818");
  const [showAbility, setShowAbility] = useState(true);

  const [flavor,      setFlavor]      = useState("");
  const [showFlavor,  setShowFlavor]  = useState(false);
  const [flavorFs,    setFlavorFs]    = useState(10);

  const [power,       setPower]       = useState("0");
  const [toughness,   setToughness]   = useState("0");
  const [ptFs,        setPtFs]        = useState(22);
  const [ptColor,     setPtColor]     = useState("#181818");
  const [showPT,      setShowPT]      = useState(true);

  const [frameSet,    setFrameSet]    = useState(allSets[0] || "");
  const [frameIdx,    setFrameIdx]    = useState(0);
  const [ptFrameIdx,  setPtFrameIdx]  = useState(0);

  const [artUrl,      setArtUrl]      = useState("");
  const [artX,        setArtX]        = useState(50);
  const [artY,        setArtY]        = useState(30);
  const [artZoom,     setArtZoom]     = useState(100);

  const [year,        setYear]        = useState("2025");
  const [rarity,      setRarity]      = useState("P");
  const [setCode,     setSetCode]     = useState("MTG");
  const [lang,        setLang]        = useState("EN");
  const [artist,      setArtist]      = useState("Jn Avon");
  const [showInfo,    setShowInfo]    = useState(true);
  const [showCopy,    setShowCopy]    = useState(true);
  const [infoFs,      setInfoFs]      = useState(8);

  const [downloading, setDownloading] = useState(false);

  const artInput = useRef();
  const cardRef  = useRef();

  const frame   = FRAME_MAP[frameSet]?.[frameIdx];
  const ptFrame = PT_FRAMES[ptFrameIdx];

  const handleArt = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onloadend = () => { setArtUrl(r.result); setArtX(50); setArtY(30); setArtZoom(100); };
    r.readAsDataURL(f); e.target.value = null;
  };

  const handleDownload = async () => {
    if (!cardRef.current || downloading) return;
    setDownloading(true);
    try {
      const el = cardRef.current;
      const lib = (await import("html2canvas")).default;
      const canvas = await lib(el, {
        scale: 4,           // 4× → 1840×2640px, stampa perfetta a 300dpi
        useCORS: true, allowTaint: true, logging: false, backgroundColor: null,
      });
      const a = document.createElement("a");
      a.download = `${name.replace(/[^a-z0-9_]/gi,"_")}_token.png`;
      a.href = canvas.toDataURL("image/png"); a.click();
    } catch (e) { alert("Errore: " + e.message); }
    finally { setDownloading(false); }
  };

  // ─ Stili posizioni carta ─────────────────────────────────────────
  const namebarStyle = {
    position: "absolute",
    top:    POS.namebar.top,
    left:   POS.namebar.left + nameOffX,
    right:  POS.namebar.right - nameOffX,
    height: POS.namebar.h,
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 3,
  };
  const typebarStyle = {
    position: "absolute",
    top:    POS.typebar.top,
    left:   POS.typebar.left,
    right:  POS.typebar.right,
    height: POS.typebar.h,
    display: "flex", alignItems: "center",
    zIndex: 3,
  };
  const textboxStyle = {
    position: "absolute",
    top:    POS.textbox.top,
    left:   POS.textbox.left,
    width:  POS.textbox.w,
    height: POS.textbox.h,
    overflow: "hidden",
    zIndex: 3,
    display: "flex", flexDirection: "column", justifyContent: "flex-start",
  };
  const ptFrameStyle = {
    position: "absolute",
    bottom: POS.ptframe.bottom,
    right:  POS.ptframe.right,
    width:  POS.ptframe.w,
    height: POS.ptframe.h,
    zIndex: 3,
  };
  const ptTextStyle = {
    position: "absolute",
    bottom: POS.ptframe.bottom,
    right:  POS.ptframe.right,
    width:  POS.ptframe.w,
    height: POS.ptframe.h,
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 4,
  };
  const infoLStyle = {
    position: "absolute",
    bottom: POS.infoL.bottom,
    left:   POS.infoL.left,
    zIndex: 3, lineHeight: 1.4,
  };
  const infoRStyle = {
    position: "absolute",
    bottom: POS.infoR.bottom,
    right:  POS.infoR.right,
    zIndex: 3,
  };

  const fonts = `
    @font-face{font-family:'Beleren';src:url('/src/assets/fonts/Beleren2016-Bold.ttf') format('truetype');font-weight:bold}
    @font-face{font-family:'MPlantin';src:url('/src/assets/fonts/Mplantin.ttf') format('truetype')}
    @font-face{font-family:'MatrixSC';src:url('/src/assets/fonts/MatrixBoldSmallCaps Bold.ttf') format('truetype')}
    @keyframes spin{to{transform:rotate(360deg)}}
  `;

  return (
    <>
      <style>{fonts}</style>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ══════════════ CARTA ══════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", flexShrink: 0 }}>

          {/* Carta: larghezza fissa CW, altezza fissa CH, tutto in px assoluti — nessun scale */}
          <div ref={cardRef} style={{ width: CW, height: CH, position: "relative", borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 50px rgba(0,0,0,.85), 0 0 0 1px rgba(201,162,39,.2)", background: "#080806", flexShrink: 0 }}>

            {/* ARTWORK — strato base a tutta carta */}
            <div style={{ position: "absolute", inset: 0, zIndex: 1, overflow: "hidden" }}>
              {artUrl
                ? <ArtLayer url={artUrl} posX={artX} posY={artY} scale={artZoom} onUpdate={(x, y) => { setArtX(x); setArtY(y); }} />
                : <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.2)", gap: 10, cursor: "pointer" }}
                    onClick={() => artInput.current.click()}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span style={{ fontSize: 13, fontStyle: "italic" }}>Clicca per caricare artwork</span>
                  </div>
              }
            </div>

            {/* FRAME — sopra all'artwork */}
            {frame && (
              <img src={frame.url} alt="frame" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", zIndex: 2, pointerEvents: "none" }} />
            )}

            {/* NOME */}
            <div style={namebarStyle}>
              <IE value={name} onChange={setName}
                style={{ fontSize: nameFs, color: nameColor, fontFamily: FF_TITLE, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", lineHeight: 1, whiteSpace: "nowrap" }}>
                <span style={{ fontFamily: FF_TITLE, fontSize: nameFs, fontWeight: 700, color: nameColor, textTransform: "uppercase", letterSpacing: ".04em", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", display: "block" }}>
                  {name}
                </span>
              </IE>
            </div>

            {/* MANA COST */}
            {showMana && (
              <div style={{ position: "absolute", top: POS.manabar.top, right: POS.manabar.right, height: POS.manabar.h, display: "flex", alignItems: "center", gap: 1, zIndex: 3 }}>
                <ManaLine text={manaCost} fontSize={nameFs * 0.85} color={nameColor} />
              </div>
            )}

            {/* RIGA TIPO */}
            <div style={typebarStyle}>
              <IE value={type} onChange={setType}
                style={{ fontSize: typeFs, color: typeColor, fontFamily: FF_TITLE, fontWeight: 700, lineHeight: 1 }}>
                <span style={{ fontFamily: FF_TITLE, fontSize: typeFs, fontWeight: 700, color: typeColor, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", display: "block" }}>
                  {type}
                </span>
              </IE>
            </div>

            {/* TEXT BOX */}
            {showAbility && (
              <div style={textboxStyle}>
                <IE value={ability} onChange={setAbility} multiline fillParent
                  style={{ fontSize: abilityFs, color: abilityColor, fontFamily: FF_BODY, lineHeight: 1.45, width: "100%" }}>
                  <div style={{ width: "100%" }}>
                    {ability.split("\n").map((line, i, arr) => (
                      <div key={i} style={{ marginBottom: i < arr.length - 1 ? 4 : 0 }}>
                        <ManaLine text={line} fontSize={abilityFs} color={abilityColor} />
                      </div>
                    ))}
                    {showFlavor && flavor && (
                      <div style={{ marginTop: 5, paddingTop: 4, borderTop: `1px solid ${abilityColor}55` }}>
                        <span style={{ fontFamily: FF_BODY, fontSize: flavorFs, color: abilityColor, fontStyle: "italic", lineHeight: 1.35 }}>{flavor}</span>
                      </div>
                    )}
                  </div>
                </IE>
              </div>
            )}

            {/* P/T FRAME */}
            {showPT && ptFrame && (
              <img src={ptFrame.url} alt="pt" style={{ ...ptFrameStyle, objectFit: "fill", pointerEvents: "none" }} />
            )}

            {/* P/T TESTO */}
            {showPT && (
              <div style={ptTextStyle}>
                <span style={{ fontFamily: FF_TITLE, fontSize: ptFs, fontWeight: 700, color: ptColor, lineHeight: 1, whiteSpace: "nowrap" }}>
                  {power}/{toughness}
                </span>
              </div>
            )}

            {/* INFO SINISTRA */}
            {showInfo && (
              <div style={infoLStyle}>
                <div style={{ fontSize: infoFs, color: "#909090", fontFamily: "monospace", lineHeight: 1.35 }}>{year} {rarity}</div>
                <div style={{ fontSize: infoFs, color: "#909090", fontFamily: "monospace", lineHeight: 1.35 }}>{setCode} • {lang}</div>
                <div style={{ fontSize: infoFs, color: "#909090", fontFamily: "monospace", lineHeight: 1.35 }}>Illus. {artist}</div>
              </div>
            )}

            {/* COPYRIGHT */}
            {showCopy && (
              <div style={infoRStyle}>
                <span style={{ fontSize: infoFs, color: "#909090", fontFamily: "monospace" }}>© {year} Wizards of the Coast</span>
              </div>
            )}
          </div>

          <p style={{ fontSize: ".7rem", color: "#3a3937", textAlign: "center", maxWidth: CW, margin: 0 }}>
            ✏ Doppio click su nome/tipo/abilità per modificare · 🖱 Trascina artwork per riposizionare
          </p>

          <GoldBtn onClick={handleDownload} disabled={downloading} full>
            {downloading
              ? <><span style={{ width: 14, height: 14, border: "2px solid #555", borderTopColor: G, borderRadius: "50%", animation: "spin .6s linear infinite", display: "inline-block", marginRight: 8 }} />Generazione…</>
              : "⬇ Scarica PNG UHD (4×)"}
          </GoldBtn>
        </div>

        {/* ══════════════ PANNELLO ══════════════ */}
        <div style={{ flex: 1, minWidth: 280, maxWidth: 420 }}>

          {/* FRAME */}
          <Accordion icon="🖼" title="Frame & Artwork" open={true}>
            <Lbl>Set Frame</Lbl>
            <select value={frameSet} onChange={e => { setFrameSet(e.target.value); setFrameIdx(0); }}
              style={{ background: "#252420", border: `1px solid ${BR}`, borderRadius: 6, color: "#cdccca", padding: "7px 10px", fontSize: ".83rem", width: "100%", outline: "none" }}>
              {allSets.map(k => <option key={k} value={k}>{k}</option>)}
            </select>

            {(FRAME_MAP[frameSet]||[]).length > 0 && <>
              <Lbl>Frame specifico</Lbl>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(FRAME_MAP[frameSet]||[]).map((f, i) => (
                  <button key={f.url} onClick={() => setFrameIdx(i)} title={f.name}
                    style={{ padding: 2, borderRadius: 4, border: `2px solid ${frameIdx===i?G:BR}`, background: "#1a1a17", cursor: "pointer", transition: "border-color .15s" }}>
                    <img src={f.url} alt={f.name} style={{ width: 38, height: 54, objectFit: "cover", borderRadius: 2, display: "block" }} />
                  </button>
                ))}
              </div>
            </>}

            {PT_FRAMES.length > 0 && <>
              <Lbl>Frame P/T</Lbl>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {PT_FRAMES.map((f, i) => (
                  <button key={f.url} onClick={() => setPtFrameIdx(i)} title={f.name}
                    style={{ padding: 2, borderRadius: 4, border: `2px solid ${ptFrameIdx===i?G:BR}`, background: "#1a1a17", cursor: "pointer", transition: "border-color .15s" }}>
                    <img src={f.url} alt={f.name} style={{ width: 52, height: 32, objectFit: "cover", borderRadius: 2, display: "block" }} />
                  </button>
                ))}
              </div>
            </>}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <GoldBtn onClick={() => artInput.current.click()}>🖼 {artUrl ? "Cambia artwork" : "Carica artwork"}</GoldBtn>
              {artUrl && <GhostBtn onClick={() => setArtUrl("")}>✕ Rimuovi</GhostBtn>}
            </div>
            <input ref={artInput} type="file" accept="image/*" style={{ display: "none" }} onChange={handleArt} />

            {artUrl && (
              <div style={{ background: "#252420", borderRadius: 8, padding: "11px 12px", border: `1px solid ${BR}`, display: "flex", flexDirection: "column", gap: 8 }}>
                <Lbl>🎯 Posizione artwork (o trascina sulla carta)</Lbl>
                <Slider label="Orizzontale X" value={artX} onChange={setArtX} min={0} max={100} />
                <Slider label="Verticale Y"   value={artY} onChange={setArtY} min={0} max={100} />
                <Slider label="Zoom %"        value={artZoom} onChange={setArtZoom} min={100} max={250} />
                <GhostBtn onClick={() => { setArtX(50); setArtY(30); setArtZoom(100); }}>↺ Reset posizione</GhostBtn>
              </div>
            )}
          </Accordion>

          {/* NOME */}
          <Accordion icon="✏️" title="Nome carta" open={true}>
            <Lbl>Testo</Lbl>
            <TF value={name} onChange={setName} />
            <Slider label="Dimensione" value={nameFs} onChange={setNameFs} min={10} max={38} />
            <CP label="Colore" value={nameColor} onChange={setNameColor} />
            <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
              {COLOR_PRESETS.map(c => (
                <button key={c} onClick={() => setNameColor(c)} title={c}
                  style={{ width: 22, height: 22, borderRadius: 4, background: c, border: nameColor===c ? `2px solid ${G}` : `2px solid ${BR}`, cursor: "pointer", flexShrink: 0 }} />
              ))}
              <span style={{ fontSize: ".7rem", color: "#4a4948" }}>preset rapidi</span>
            </div>
            <div style={{ background: "#252420", borderRadius: 8, padding: "10px 12px", border: `1px solid ${BR}` }}>
              <Lbl>Allineamento fine nome (se il frame ha barra asimmetrica)</Lbl>
              <div style={{ marginTop: 5 }}>
                <Slider label="Offset orizzontale" value={nameOffX} onChange={setNameOffX} min={-80} max={80} />
              </div>
              <div style={{ marginTop: 6 }}>
                <GhostBtn onClick={() => setNameOffX(0)}>↺ Centra</GhostBtn>
              </div>
            </div>
          </Accordion>

          {/* MANA */}
          <Accordion icon="🔮" title="Costo Mana">
            <Chk label="Mostra costo mana (es. carte non-token)" checked={showMana} onChange={setShowMana} />
            <Lbl>Notazione — es: {"{2}{W}{U}"} {"{X}{R}{R}"}</Lbl>
            <TF value={manaCost} onChange={setManaCost} disabled={!showMana} />
          </Accordion>

          {/* TIPO */}
          <Accordion icon="📋" title="Riga Tipo">
            <TF value={type} onChange={setType} />
            <Slider label="Dimensione" value={typeFs} onChange={setTypeFs} min={8} max={24} />
            <CP label="Colore" value={typeColor} onChange={setTypeColor} />
          </Accordion>

          {/* ABILITÀ */}
          <Accordion icon="⚡" title="Testo & Abilità">
            <Chk label="Mostra testo abilità" checked={showAbility} onChange={setShowAbility} />
            <p style={{ fontSize: ".7rem", color: "#4a4948", margin: 0, lineHeight: 1.5 }}>
              Simboli: {"{W}"} {"{U}"} {"{B}"} {"{R}"} {"{G}"} {"{T}"} {"{2}"} {"{X}"} …<br/>
              Invio = nuovo paragrafo abilità.
            </p>
            <TF value={ability} onChange={setAbility} multiline rows={5} disabled={!showAbility} />
            <Slider label="Dimensione" value={abilityFs} onChange={setAbilityFs} min={6} max={18} step={0.5} />
            <CP label="Colore testo" value={abilityColor} onChange={setAbilityColor} />
            <div style={{ borderTop: `1px solid ${BR}`, paddingTop: 8 }}>
              <Chk label="Flavor text (in corsivo)" checked={showFlavor} onChange={setShowFlavor} />
              {showFlavor && <>
                <TF value={flavor} onChange={setFlavor} multiline rows={2} placeholder="Testo flavor…" />
                <Slider label="Dim. flavor" value={flavorFs} onChange={setFlavorFs} min={6} max={16} step={0.5} />
              </>}
            </div>
          </Accordion>

          {/* P/T */}
          <Accordion icon="⚔️" title="Power / Toughness">
            <Chk label="Mostra P/T" checked={showPT} onChange={setShowPT} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 20px 1fr", gap: 8, alignItems: "end" }}>
              <div><Lbl>Power</Lbl><TF value={power} onChange={setPower} /></div>
              <div style={{ textAlign: "center", color: "#797876", fontSize: "1.1rem", paddingBottom: 7 }}>/</div>
              <div><Lbl>Toughness</Lbl><TF value={toughness} onChange={setToughness} /></div>
            </div>
            <Slider label="Dimensione font" value={ptFs} onChange={setPtFs} min={14} max={44} />
            <CP label="Colore P/T" value={ptColor} onChange={setPtColor} />
          </Accordion>

          {/* INFO */}
          <Accordion icon="ℹ️" title="Info & Copyright">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><Lbl>Anno</Lbl><TF value={year} onChange={setYear} /></div>
              <div><Lbl>Rarità</Lbl><TF value={rarity} onChange={setRarity} placeholder="P/C/U/R/M" /></div>
              <div><Lbl>Set</Lbl><TF value={setCode} onChange={setSetCode} /></div>
              <div><Lbl>Lingua</Lbl><TF value={lang} onChange={setLang} /></div>
            </div>
            <Lbl>Illustratore</Lbl>
            <TF value={artist} onChange={setArtist} />
            <Slider label="Dimensione font info" value={infoFs} onChange={setInfoFs} min={6} max={14} />
            <Chk label="Mostra info set/rarità/artista" checked={showInfo} onChange={setShowInfo} />
            <Chk label="Mostra © copyright" checked={showCopy} onChange={setShowCopy} />
          </Accordion>

        </div>
      </div>
    </>
  );
}
