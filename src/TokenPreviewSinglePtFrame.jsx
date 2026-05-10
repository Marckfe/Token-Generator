import React, { useState, useRef, useEffect, useCallback } from "react";

// DIPENDENZA: npm install html-to-image   (usata per l'export PNG — gestisce meglio font custom e position:absolute rispetto a html2canvas)
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
const framePT   = import.meta.glob("/src/assets/frames/pt/*.{png,jpg,jpeg,webp,svg}", { eager: true, import: "default" });
const PT_FRAMES = Object.entries(framePT).map(([p, url]) => ({ name: p.split("/").pop().replace(/\.[a-z]+$/, ""), url }));
const SYMBOLS   = import.meta.glob("/src/assets/simbol/*.{svg,png,jpg,jpeg,webp}", { eager: true, import: "default" });

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSIONI CARTA — proporzione reale MTG 63×88mm
// ─────────────────────────────────────────────────────────────────────────────
const CW = 460;
const CH = Math.round(CW * 88 / 63); // 644px

// Font
const FT = "'Beleren','MatrixSC','Cinzel','Georgia',serif";
const FB = "'MPlantin','Palatino Linotype','Book Antiqua','Georgia',serif";

// ─────────────────────────────────────────────────────────────────────────────
// MANA PARSER
// ─────────────────────────────────────────────────────────────────────────────
function ManaLine({ text, fontSize = 13, color = "#181818" }) {
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
  return (
    <span style={{ fontSize, color, fontFamily: FB, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {parts.map((p, i) =>
        p.t === "txt" ? <span key={i}>{p.v}</span>
        : p.url
          ? <img key={i} src={p.url} alt={`{${p.v}}`}
              style={{ width: fontSize * 1.1, height: fontSize * 1.1, verticalAlign: "middle", display: "inline-block", margin: "0 1px", position: "relative", top: -1 }} />
          : <span key={i} style={{ color: "#c9a227", fontWeight: 700 }}>{`{${p.v}}`}</span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAGGABLE + RESIZABLE TEXT BOX — il cuore del sistema
// ─────────────────────────────────────────────────────────────────────────────
// box: { x, y, w, h } — tutte in px, relative alla carta
// onUpdate(newBox)
// editMode: true = mostra bordi/handle, false = solo testo
function DRBox({ box, onUpdate, editMode, accentColor = "#c9a227", label, children }) {
  const dragging = useRef(false);
  const resizing = useRef(null); // quale handle: "se","sw","ne","nw","e","w","s","n"
  const startRef = useRef({});
  const boxRef   = useRef(box);
  boxRef.current = box;

  // ── DRAG ─────────────────────────────────────────────────────────────────
  const startDrag = useCallback((e) => {
    if (!editMode) return;
    e.preventDefault(); e.stopPropagation();
    dragging.current = true;
    startRef.current = { mx: e.clientX, my: e.clientY, bx: box.x, by: box.y };
  }, [editMode, box]);

  // ── RESIZE ───────────────────────────────────────────────────────────────
  const startResize = useCallback((e, handle) => {
    if (!editMode) return;
    e.preventDefault(); e.stopPropagation();
    resizing.current = handle;
    startRef.current = { mx: e.clientX, my: e.clientY, ...boxRef.current };
  }, [editMode]);

  useEffect(() => {
    const MIN = 40;
    const onMove = (e) => {
      const dx = e.clientX - startRef.current.mx;
      const dy = e.clientY - startRef.current.my;
      if (dragging.current) {
        onUpdate({
          ...boxRef.current,
          x: Math.max(0, Math.min(CW - boxRef.current.w, startRef.current.bx + dx)),
          y: Math.max(0, Math.min(CH - boxRef.current.h, startRef.current.by + dy)),
        });
      } else if (resizing.current) {
        const h = resizing.current;
        let { x, y, w, ww: ow, h: oh } = { ...startRef.current, ww: startRef.current.w };
        let nx = x, ny = y, nw = ow, nh = oh;
        if (h.includes("e"))  nw = Math.max(MIN, ow + dx);
        if (h.includes("w"))  { nw = Math.max(MIN, ow - dx); nx = x + (ow - nw); }
        if (h.includes("s"))  nh = Math.max(MIN, oh + dy);
        if (h.includes("n"))  { nh = Math.max(MIN, oh - dy); ny = y + (oh - nh); }
        onUpdate({
          x: Math.max(0, nx),
          y: Math.max(0, ny),
          w: Math.min(CW - Math.max(0, nx), nw),
          h: Math.min(CH - Math.max(0, ny), nh),
        });
      }
    };
    const onUp = () => { dragging.current = false; resizing.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [onUpdate]);

  const handleStyle = (pos) => {
    const SIZE = 10;
    const half = SIZE / 2;
    const base = { position: "absolute", width: SIZE, height: SIZE, background: accentColor, borderRadius: 2, zIndex: 20, cursor: `${pos}-resize` };
    const corners = {
      nw: { top: -half, left: -half }, ne: { top: -half, right: -half },
      sw: { bottom: -half, left: -half }, se: { bottom: -half, right: -half },
      n:  { top: -half, left: "50%", transform: "translateX(-50%)" },
      s:  { bottom: -half, left: "50%", transform: "translateX(-50%)" },
      e:  { right: -half, top: "50%", transform: "translateY(-50%)" },
      w:  { left: -half, top: "50%", transform: "translateY(-50%)" },
    };
    return { ...base, ...corners[pos] };
  };

  return (
    <div
      style={{
        position: "absolute",
        left: box.x, top: box.y, width: box.w, height: box.h,
        zIndex: editMode ? 10 : 4,
        cursor: editMode ? "move" : "default",
        boxSizing: "border-box",
        border: editMode ? `2px dashed ${accentColor}99` : "none",
        background: editMode ? `${accentColor}18` : "transparent",
        borderRadius: 3,
        userSelect: editMode ? "none" : "auto",
      }}
      onMouseDown={startDrag}
    >
      {/* Etichetta zona */}
      {editMode && (
        <div style={{ position: "absolute", top: -20, left: 0, fontSize: 9, fontWeight: 700, color: accentColor, background: "rgba(0,0,0,.75)", padding: "1px 5px", borderRadius: 3, whiteSpace: "nowrap", zIndex: 21, letterSpacing: ".04em", textTransform: "uppercase" }}>
          {label}
        </div>
      )}

      {/* Contenuto — overflow visible per non tagliare testo, hidden solo in export */}
      <div style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
        {children}
      </div>

      {/* Resize handles — solo in editMode */}
      {editMode && ["nw","ne","sw","se","n","s","e","w"].map(h => (
        <div key={h} style={handleStyle(h)} onMouseDown={e => startResize(e, h)} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ARTWORK DRAG
// ─────────────────────────────────────────────────────────────────────────────
function ArtLayer({ url, posX, posY, zoom, onUpdate }) {
  const drag = useRef(false);
  const s    = useRef({});
  const onDown = useCallback(e => {
    if (e.button !== 0) return;
    drag.current = true;
    s.current = { x: e.clientX, y: e.clientY, px: posX, py: posY };
    e.preventDefault();
  }, [posX, posY]);
  useEffect(() => {
    const mv = e => {
      if (!drag.current) return;
      const sens = 0.1;
      onUpdate(
        Math.max(0, Math.min(100, s.current.px + (s.current.x - e.clientX) * sens)),
        Math.max(0, Math.min(100, s.current.py + (s.current.y - e.clientY) * sens))
      );
    };
    const up = () => { drag.current = false; };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup",   up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [onUpdate]);
  return (
    <div onMouseDown={onDown} style={{ position: "absolute", inset: 0, cursor: "move", overflow: "hidden" }}>
      <img src={url} alt="art" draggable={false}
        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: `${zoom}%`, height: `${zoom}%`, minWidth: "100%", minHeight: "100%",
          objectFit: "cover", objectPosition: `${posX}% ${posY}%`,
          userSelect: "none", pointerEvents: "none" }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE EDIT — click singolo per entrare in editing
// ─────────────────────────────────────────────────────────────────────────────
function InlineEdit({ value, onChange, multiline, style }) {
  const ref = useRef();
  // Stile comune — trasparente, nessun bordo, eredita tutto dal parent
  const inputStyle = {
    ...style,
    background: "transparent",
    border: "none",
    outline: "none",
    boxShadow: "none",
    width: "100%",
    boxSizing: "border-box",
    resize: "none",
    padding: 0,
    margin: 0,
    lineHeight: style?.lineHeight || 1.3,
    fontFamily: style?.fontFamily || "inherit",
    fontSize: style?.fontSize || "inherit",
    fontWeight: style?.fontWeight || "inherit",
    color: style?.color || "inherit",
    textAlign: style?.textAlign || "left",
    textTransform: style?.textTransform || "none",
    letterSpacing: style?.letterSpacing || "normal",
    cursor: "text",
    caretColor: "#c9a227",
    // Importante: evita che il browser aggiunga stili nativi agli input
    WebkitAppearance: "none",
    appearance: "none",
  };
  if (multiline) return (
    <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, height: "100%", wordBreak: "break-word", whiteSpace: "pre-wrap", overflowY: "hidden" }} />
  );
  return <input ref={ref} type="text" value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
const G = "#c9a227";
const PBG = "#1c1b19";
const BD = "#2a2927";

function Acc({ icon, title, open: def = false, children }) {
  const [open, setOpen] = useState(def);
  return (
    <div style={{ background: PBG, border: `1px solid ${BD}`, borderRadius: 10, overflow: "hidden", marginBottom: 5 }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "11px 15px", background: "none", border: "none", color: G, fontWeight: 700, fontSize: ".87rem", cursor: "pointer" }}>
        <span>{icon} {title}</span>
        <span style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", display: "inline-block" }}>▾</span>
      </button>
      {open && <div style={{ padding: "12px 14px", borderTop: `1px solid ${BD}`, display: "flex", flexDirection: "column", gap: 9 }}>{children}</div>}
    </div>
  );
}
const Lbl = ({ c, children }) => <div style={{ fontSize: ".7rem", color: c || "#797876", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>{children}</div>;

const TF = ({ value, onChange, multiline, rows, disabled, placeholder }) => {
  const s = { background: "#252420", border: `1px solid ${BD}`, borderRadius: 6, color: "#cdccca", padding: "7px 10px", fontSize: ".83rem", width: "100%", outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  if (multiline) return <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows || 4} disabled={disabled} placeholder={placeholder} style={{ ...s, resize: "vertical", lineHeight: 1.5 }} />;
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} style={s} />;
};

const Sld = ({ label, value, onChange, min, max, step = 1 }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".7rem", color: "#797876", marginBottom: 2 }}>
      <span>{label}</span>
      <span style={{ color: G, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{Number(value).toFixed(step < 1 ? 1 : 0)}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: "100%", accentColor: G }} />
  </div>
);

const CP = ({ label, value, onChange }) => (
  <div>
    {label && <Lbl>{label}</Lbl>}
    <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ width: 32, height: 28, border: `2px solid ${BD}`, borderRadius: 4, background: "none", cursor: "pointer", padding: 0, flexShrink: 0 }} />
      <input type="text" value={value} onChange={e => onChange(e.target.value)} style={{ background: "#252420", border: `1px solid ${BD}`, borderRadius: 6, color: "#cdccca", padding: "5px 8px", fontSize: ".78rem", width: 84, fontFamily: "monospace", outline: "none" }} />
    </div>
  </div>
);

const Chk = ({ label, checked, onChange }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: ".83rem", color: "#797876", userSelect: "none" }}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 14, height: 14, accentColor: G }} />
    {label}
  </label>
);

const GBtn = ({ onClick, children, variant = "gold", full, disabled }) => {
  const v = {
    gold:  { background: G, color: "#0f0e0c", border: "none", fontWeight: 900 },
    ghost: { background: "none", color: "#797876", border: `1px solid ${BD}`, fontWeight: 600 },
    blue:  { background: "#1d4ed8", color: "#fff", border: "none", fontWeight: 700 },
    teal:  { background: "#0d7377", color: "#fff", border: "none", fontWeight: 700 },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...v[variant], borderRadius: 8, padding: "8px 14px", fontSize: ".82rem", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, width: full ? "100%" : "auto", transition: "filter .15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.filter = "brightness(1.12)")}
      onMouseLeave={e => e.currentTarget.style.filter = ""}>
      {children}
    </button>
  );
};

const CPRESETS = ["#181818","#f5f5f0","#c9a227","#e8dfc8","#ffffff"];

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT BOX POSITIONS — percentuali convertite in px, facilmente modificabili
// ─────────────────────────────────────────────────────────────────────────────
const pct = (base, p) => Math.round(base * p / 100);
const DEFAULT_BOXES = {
  name: { x: pct(CW, 9),  y: pct(CH, 2.8), w: pct(CW, 72), h: pct(CH, 6.5) },
  type: { x: pct(CW, 7.5),y: pct(CH, 79),  w: pct(CW, 72), h: pct(CH, 5.5) },
  text: { x: pct(CW, 7),  y: pct(CH, 85),  w: pct(CW, 86), h: pct(CH, 12.5) },
  pt:   { x: pct(CW, 83), y: pct(CH, 90),  w: pct(CW, 13), h: pct(CH, 7) },
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function MagicTokenEditor() {
  const allSets = Object.keys(FRAME_MAP);

  // Boxes — ogni testo ha la sua posizione/dimensione draggabile
  const [boxes, setBoxes] = useState({ ...DEFAULT_BOXES });
  const updateBox = (key, b) => setBoxes(prev => ({ ...prev, [key]: b }));
  const resetBoxes = () => setBoxes({ ...DEFAULT_BOXES });
  const exportLayout = () => {
    const data = JSON.stringify(boxes, null, 2);
    navigator.clipboard.writeText(data).then(
      () => alert("✅ Layout copiato negli appunti!"),
      () => {
        // fallback: download file
        const blob = new Blob([data], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `layout_${name.replace(/[^a-z0-9_]/gi,"_")}.json`;
        a.click();
      }
    );
  };

  const importLayout = () => {
    const s = prompt("📥 Incolla il JSON del layout:");
    if (!s) return;
    try {
      const parsed = JSON.parse(s);
      // Valida che abbia le chiavi giuste
      const required = ["name","type","text","pt"];
      for (const k of required) {
        if (!parsed[k] || typeof parsed[k].x !== "number") throw new Error(`Chiave mancante: ${k}`);
      }
      setBoxes(parsed);
    } catch (e) { alert("❌ JSON non valido: " + e.message); }
  };

  const saveLayoutFile = () => {
    const data = JSON.stringify(boxes, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `layout_${name.replace(/[^a-z0-9_]/gi,"_") || "token"}.json`;
    a.click();
  };

  const loadLayoutFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const required = ["name","type","text","pt"];
        for (const k of required) {
          if (!parsed[k] || typeof parsed[k].x !== "number") throw new Error(`Chiave mancante: ${k}`);
        }
        setBoxes(parsed);
        alert("✅ Layout importato!");
      } catch (ex) { alert("❌ File non valido: " + ex.message); }
    };
    reader.readAsText(file); e.target.value = null;
  };


  // Modalità edit overlay
  const [editMode, setEditMode] = useState(true); // default ON per guidare l'utente
  const [activeBox, setActiveBox] = useState(null); // quale pannello è aperto

  // Testo
  const [name,         setName]          = useState("CONSTRUCT");
  const [nameFs,       setNameFs]         = useState(20);
  const [nameColor,    setNameColor]      = useState("#181818");
  const [nameAlign,    setNameAlign]      = useState("center");
  const [nameBold,     setNameBold]       = useState(true);
  const [nameFont,     setNameFont]       = useState("title"); // title|body

  const [manaCost,     setManaCost]       = useState("{5}");
  const [showMana,     setShowMana]       = useState(false);

  const [type,         setType]           = useState("Token Artifact Creature — Construct");
  const [typeFs,       setTypeFs]         = useState(14);
  const [typeColor,    setTypeColor]      = useState("#181818");
  const [typeAlign,    setTypeAlign]      = useState("left");

  const [ability,      setAbility]        = useState("This creature gets +1/+1 for each artifact you control.\n{T}: Add {G} or {R}.");
  const [abilityFs,    setAbilityFs]      = useState(11);
  const [abilityColor, setAbilityColor]   = useState("#181818");
  const [showAbility,  setShowAbility]    = useState(true);

  const [flavor,       setFlavor]         = useState("");
  const [showFlavor,   setShowFlavor]     = useState(false);
  const [flavorFs,     setFlavorFs]       = useState(10);

  const [power,        setPower]          = useState("0");
  const [toughness,    setToughness]      = useState("0");
  const [ptFs,         setPtFs]           = useState(22);
  const [ptColor,      setPtColor]        = useState("#181818");
  const [showPT,       setShowPT]         = useState(true);

  // Frame
  const [frameSet,     setFrameSet]       = useState(allSets[0] || "");
  const [frameIdx,     setFrameIdx]       = useState(0);
  const [ptFrameIdx,   setPtFrameIdx]     = useState(0);

  // Artwork
  const [artUrl,       setArtUrl]         = useState("");
  const [artX,         setArtX]           = useState(50);
  const [artY,         setArtY]           = useState(30);
  const [artZoom,      setArtZoom]        = useState(100);

  // Info
  const [year,         setYear]           = useState("2025");
  const [rarity,       setRarity]         = useState("T");
  const [setCode,      setSetCode]        = useState("MTG");
  const [lang,         setLang]           = useState("EN");
  const [artist,       setArtist]         = useState("Jn Avon");
  const [showInfo,     setShowInfo]       = useState(true);
  const [showCopy,     setShowCopy]       = useState(true);
  const [infoFs,       setInfoFs]         = useState(8);

  const [downloading,  setDownloading]    = useState(false);

  const artInput = useRef();
  const layoutFileInput = useRef();
  const cardRef  = useRef();
  const frame    = FRAME_MAP[frameSet]?.[frameIdx];
  const ptFrame  = PT_FRAMES[ptFrameIdx];

  const handleArt = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onloadend = () => { setArtUrl(r.result); setArtX(50); setArtY(30); setArtZoom(100); };
    r.readAsDataURL(f); e.target.value = null;
  };

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);

    try {
      const SCALE = 4;
      const W = CW * SCALE;
      const H = CH * SCALE;

      // ── 1. Carica i font custom nel contesto Canvas ───────────────────────
      // Il Canvas 2D NON eredita i @font-face del CSS — vanno caricati esplicitamente.
      const fontPaths = [
        { name: "Beleren",  url: "/src/assets/fonts/Beleren2016-Bold.ttf",           weight: "bold" },
        { name: "MPlantin", url: "/src/assets/fonts/Mplantin.ttf",                   weight: "normal" },
        { name: "MatrixSC", url: "/src/assets/fonts/MatrixBoldSmallCaps Bold.ttf",   weight: "bold" },
      ];
      await Promise.allSettled(
        fontPaths.map(async ({ name, url, weight }) => {
          try {
            const ff = new FontFace(name, `url(${url})`, { weight });
            const loaded = await ff.load();
            document.fonts.add(loaded);
          } catch (_) { /* font non trovato — usa fallback */ }
        })
      );
      // Aspetta che tutti i font siano pronti
      await document.fonts.ready;

      // ── 2. Crea canvas ────────────────────────────────────────────────────
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");

      // Helper: carica immagine
      const loadImg = (src) => new Promise((res, rej) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => res(img);
        img.onerror = () => rej(new Error("Immagine non caricabile: " + src));
        img.src = src;
      });

      // Helper: risolve nome font per canvas (prova custom, poi fallback)
      const resolveFont = (familyStr) => {
        const first = familyStr.split(",")[0].replace(/['"]/g, "").trim();
        return first;
      };

      // Helper: disegna testo con wrap automatico in un box
      const drawBox = (text, box, opts = {}) => {
        if (!text) return;
        const {
          fontSize = 14, color = "#181818",
          fontFamily = "Georgia,serif",
          fontWeight = "bold",
          textTransform = "none",
          align = "left",
          lineHeight = 1.35,
          singleLine = false,
          italic = false,
          paddingX = 4,
          paddingY = 4,
        } = opts;

        const fs  = fontSize * SCALE;
        const lh  = fs * lineHeight;
        const bx  = box.x * SCALE;
        const by  = box.y * SCALE;
        const bw  = box.w * SCALE;
        const bh  = box.h * SCALE;
        const maxW = bw - paddingX * SCALE * 2;

        let displayText = textTransform === "uppercase" ? text.toUpperCase() : text;

        ctx.save();
        ctx.rect(bx, by, bw, bh);
        ctx.clip();
        ctx.font = `${italic ? "italic " : ""}${fontWeight} ${fs}px "${fontFamily}"`;
        ctx.fillStyle = color;
        ctx.textBaseline = "middle";

        if (singleLine) {
          ctx.textAlign = align;
          const tx = align === "center" ? bx + bw / 2
                   : align === "right"  ? bx + bw - paddingX * SCALE
                   : bx + paddingX * SCALE;
          // Scalatura automatica se il testo è troppo lungo
          const measured = ctx.measureText(displayText).width;
          if (measured > maxW) {
            ctx.save();
            const sc = maxW / measured;
            ctx.translate(tx, by + bh / 2);
            ctx.scale(sc, 1);
            ctx.fillText(displayText, 0, 0);
            ctx.restore();
          } else {
            ctx.fillText(displayText, tx, by + bh / 2);
          }
          ctx.restore();
          return;
        }

        // Multi-line wrap (per testo abilità)
        ctx.textAlign = "left";
        const paragraphs = displayText.split("\n");
        let curY = by + paddingY * SCALE + lh / 2;

        for (const para of paragraphs) {
          // Sostituisce {X} simboli mana con testo leggibile nel canvas
          const cleaned = para.replace(/\{([^}]+)\}/g, (_, s) => `[${s}]`);
          const words = cleaned.split(" ");
          let line = "";
          for (const word of words) {
            const test = line ? line + " " + word : word;
            if (ctx.measureText(test).width > maxW && line) {
              ctx.fillText(line, bx + paddingX * SCALE, curY);
              curY += lh;
              line = word;
            } else {
              line = test;
            }
          }
          if (line) { ctx.fillText(line, bx + paddingX * SCALE, curY); curY += lh; }
          curY += lh * 0.3;
        }
        ctx.restore();
      };

      // ── 3. Sfondo ─────────────────────────────────────────────────────────
      ctx.fillStyle = "#080806";
      ctx.fillRect(0, 0, W, H);

      // ── 4. Artwork ────────────────────────────────────────────────────────
      if (artUrl) {
        try {
          const img = await loadImg(artUrl);
          const iw = img.naturalWidth, ih = img.naturalHeight;
          const cardAR = CW / CH;
          const imgAR  = iw / ih;
          const zf = artZoom / 100;

          let sw, sh;
          if (imgAR > cardAR) {
            sh = ih / zf; sw = sh * cardAR;
          } else {
            sw = iw / zf; sh = sw / cardAR;
          }
          const sx = Math.max(0, (iw - sw)) * (artX / 100);
          const sy = Math.max(0, (ih - sh)) * (artY / 100);
          ctx.drawImage(img, sx, sy, Math.min(sw, iw - sx), Math.min(sh, ih - sy), 0, 0, W, H);
        } catch (e) { console.warn("Artwork non caricabile", e); }
      }

      // ── 5. Frame ──────────────────────────────────────────────────────────
      if (frame) {
        try {
          const fimg = await loadImg(frame.url);
          ctx.drawImage(fimg, 0, 0, W, H);
        } catch (e) { console.warn("Frame non caricabile", e); }
      }

      // ── 6. Testi ──────────────────────────────────────────────────────────
      const titleFont = resolveFont(FT);
      const bodyFont  = resolveFont(FB);

      // Nome
      drawBox(name, boxes.name, {
        fontSize: nameFs, color: nameColor,
        fontFamily: nameFont === "body" ? bodyFont : titleFont,
        fontWeight: nameBold ? "bold" : "normal",
        textTransform: "uppercase",
        align: nameAlign, singleLine: true,
      });

      // Tipo
      drawBox(type, boxes.type, {
        fontSize: typeFs, color: typeColor,
        fontFamily: titleFont, fontWeight: "bold",
        align: typeAlign, singleLine: true,
      });

      // Abilità
      if (showAbility && ability) {
        drawBox(ability, boxes.text, {
          fontSize: abilityFs, color: abilityColor,
          fontFamily: bodyFont, fontWeight: "normal",
          lineHeight: 1.45,
        });
        // Flavor text
        if (showFlavor && flavor) {
          const flavorBox = {
            x: boxes.text.x,
            y: boxes.text.y + boxes.text.h * 0.6,
            w: boxes.text.w,
            h: boxes.text.h * 0.4,
          };
          drawBox(flavor, flavorBox, {
            fontSize: flavorFs, color: abilityColor,
            fontFamily: bodyFont, fontWeight: "normal",
            italic: true, lineHeight: 1.35,
          });
        }
      }

      // P/T frame
      if (showPT && ptFrame) {
        try {
          const ptimg = await loadImg(ptFrame.url);
          ctx.drawImage(ptimg,
            boxes.pt.x * SCALE, boxes.pt.y * SCALE,
            boxes.pt.w * SCALE, boxes.pt.h * SCALE
          );
        } catch (e) { console.warn("PT frame non caricabile", e); }
      }

      // P/T testo
      if (showPT) {
        drawBox(`${power}/${toughness}`, boxes.pt, {
          fontSize: ptFs, color: ptColor,
          fontFamily: titleFont, fontWeight: "bold",
          align: "center", singleLine: true,
        });
      }

      // ── 7. Info bassa ────────────────────────────────────────────────────
      if (showInfo) {
        ctx.font = `${infoFs * SCALE}px monospace`;
        ctx.fillStyle = "#909090";
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        const iy = (CH - 20) * SCALE;
        ctx.fillText(`${rarity} ${setCode} \u2022 ${lang}`, pct(CW, 1.5) * SCALE, iy);
        ctx.fillText(`Illus. ${artist}`,                     pct(CW, 1.5) * SCALE, iy + infoFs * SCALE * 1.3);
      }
      if (showCopy) {
        ctx.font = `${infoFs * SCALE}px monospace`;
        ctx.fillStyle = "#909090";
        ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
        ctx.fillText(`\u2122 & \u00A9 ${year} Wizards of the Coast`,
          (CW - pct(CW, 2)) * SCALE, (CH - 20) * SCALE);
      }

      // ── 8. Border-radius ──────────────────────────────────────────────────
      const r = 16 * SCALE;
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = W; tempCanvas.height = H;
      const tc = tempCanvas.getContext("2d");
      tc.beginPath();
      tc.moveTo(r, 0);
      tc.lineTo(W - r, 0); tc.quadraticCurveTo(W, 0, W, r);
      tc.lineTo(W, H - r); tc.quadraticCurveTo(W, H, W - r, H);
      tc.lineTo(r, H);     tc.quadraticCurveTo(0, H, 0, H - r);
      tc.lineTo(0, r);     tc.quadraticCurveTo(0, 0, r, 0);
      tc.closePath();
      tc.fillStyle = "#000";
      tc.fill();
      tc.globalCompositeOperation = "source-in";
      tc.drawImage(canvas, 0, 0);

      // ── 9. Download ───────────────────────────────────────────────────────
      const link = document.createElement("a");
      link.download = `${name.replace(/[^a-z0-9_]/gi, "_") || "token"}_token.png`;
      link.href = tempCanvas.toDataURL("image/png");
      link.click();

    } catch (err) {
      alert("Errore export: " + err.message);
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  const fontFamily = (f) => f === "body" ? FB : FT;

  const FONTS = `
    @font-face{font-family:'Beleren';src:url('/src/assets/fonts/Beleren2016-Bold.ttf') format('truetype');font-weight:bold}
    @font-face{font-family:'MPlantin';src:url('/src/assets/fonts/Mplantin.ttf') format('truetype')}
    @font-face{font-family:'MatrixSC';src:url('/src/assets/fonts/MatrixBoldSmallCaps Bold.ttf') format('truetype')}
    @keyframes spin{to{transform:rotate(360deg)}}
    * { box-sizing: border-box; }
  `;

  // ── Info position (bottom della carta, non draggabile) ────────────────────
  const infoPx = pct(CH, 1);

  return (
    <>
      <style>{FONTS}</style>
      <div style={{ display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ═══════════ CARTA ═══════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", flexShrink: 0 }}>

          {/* Toolbar sopra la carta */}
          <div style={{ display: "flex", gap: 8, width: CW, alignItems: "center", flexWrap: "wrap" }}>
            <GBtn variant={editMode ? "blue" : "ghost"} onClick={() => setEditMode(e => !e)}>
              {editMode ? "✅ Layout ON" : "📐 Modifica layout"}
            </GBtn>
            {editMode && <GBtn variant="ghost" onClick={resetBoxes}>↺ Reset posizioni</GBtn>}
            {editMode && <GBtn variant="teal" onClick={exportLayout}>📋 Copia layout</GBtn>}
            {editMode && <GBtn variant="ghost" onClick={saveLayoutFile}>⬇ Salva .json</GBtn>}
            {editMode && <GBtn variant="ghost" onClick={() => layoutFileInput.current.click()}>📂 Carica .json</GBtn>}
            <input ref={layoutFileInput} type="file" accept=".json,application/json" style={{display:"none"}} onChange={loadLayoutFile} />
            <div style={{ marginLeft: "auto", fontSize: ".7rem", color: editMode ? "#60a5fa" : "#3a3937" }}>
              {editMode ? "Trascina e ridimensiona ogni zona testo" : "✏ Doppio click sui testi per editare"}
            </div>
          </div>

          {/* CARTA */}
          <div ref={cardRef} style={{ width: CW, height: CH, position: "relative", borderRadius: 16, overflow: "hidden", flexShrink: 0, background: "#080806", boxShadow: "0 10px 50px rgba(0,0,0,.85), 0 0 0 1px rgba(201,162,39,.15)", transform: "none", isolation: "isolate" }}>

            {/* ARTWORK z:1 */}
            <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
              {artUrl
                ? <ArtLayer url={artUrl} posX={artX} posY={artY} zoom={artZoom} onUpdate={(x, y) => { setArtX(x); setArtY(y); }} />
                : <div onClick={() => artInput.current.click()} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.22)", gap: 10, cursor: "pointer" }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span style={{ fontSize: 13, fontStyle: "italic" }}>Clicca per caricare artwork</span>
                  </div>
              }
            </div>

            {/* FRAME z:2 */}
            {frame && <img src={frame.url} alt="frame" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", zIndex: 2, pointerEvents: "none" }} />}

            {/* ── NOME ── */}
            <DRBox box={boxes.name} onUpdate={b => updateBox("name", b)} editMode={editMode} accentColor="#c9a227" label="Nome">
              <InlineEdit value={name} onChange={setName}
                style={{ fontSize: nameFs, color: nameColor, fontFamily: fontFamily(nameFont), fontWeight: nameBold ? 700 : 400, textTransform: "uppercase", letterSpacing: ".03em", lineHeight: 1.2, textAlign: nameAlign, width: "100%" }} />
            </DRBox>

            {/* ── MANA (solo in editMode o se attivo) ── */}
            {showMana && (
              <div style={{ position: "absolute", left: boxes.name.x + boxes.name.w, top: boxes.name.y, height: boxes.name.h, display: "flex", alignItems: "center", paddingLeft: 4, zIndex: editMode ? 10 : 4 }}>
                <ManaLine text={manaCost} fontSize={nameFs * 0.9} color={nameColor} />
              </div>
            )}

            {/* ── TIPO ── */}
            <DRBox box={boxes.type} onUpdate={b => updateBox("type", b)} editMode={editMode} accentColor="#60a5fa" label="Tipo">
              <InlineEdit value={type} onChange={setType}
                style={{ fontSize: typeFs, color: typeColor, fontFamily: FT, fontWeight: 700, lineHeight: 1.2, textAlign: typeAlign, width: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} />
            </DRBox>

            {/* ── TEXTBOX ABILITÀ ── */}
            {showAbility && (
              <DRBox box={boxes.text} onUpdate={b => updateBox("text", b)} editMode={editMode} accentColor="#4ade80" label="Abilità">
                {/* In editMode mostra textarea semplice, altrimenti renderizza con mana symbols */}
                {editMode
                  ? <InlineEdit value={ability} onChange={setAbility} multiline
                      style={{ fontSize: abilityFs, color: abilityColor, fontFamily: FB, fontWeight: 400, lineHeight: 1.45, width: "100%", height: "100%" }} />
                  : <div style={{ width: "100%", overflow: "hidden" }}>
                      {ability.split("\n").map((line, i, arr) => (
                        <div key={i} style={{ marginBottom: i < arr.length - 1 ? 4 : 0 }}>
                          <ManaLine text={line} fontSize={abilityFs} color={abilityColor} />
                        </div>
                      ))}
                      {showFlavor && flavor && (
                        <div style={{ marginTop: 5, paddingTop: 4, borderTop: `1px solid ${abilityColor}55` }}>
                          <span style={{ fontFamily: FB, fontSize: flavorFs, color: abilityColor, fontStyle: "italic", lineHeight: 1.35 }}>{flavor}</span>
                        </div>
                      )}
                    </div>
                }
              </DRBox>
            )}

            {/* ── P/T FRAME (non draggabile — posizione = box.pt) ── */}
            {showPT && ptFrame && (
              <img src={ptFrame.url} alt="pt"
                style={{ position: "absolute", left: boxes.pt.x, top: boxes.pt.y, width: boxes.pt.w, height: boxes.pt.h, objectFit: "fill", zIndex: 3, pointerEvents: "none" }} />
            )}

            {/* ── P/T TESTO ── */}
            {showPT && (
              <DRBox box={boxes.pt} onUpdate={b => updateBox("pt", b)} editMode={editMode} accentColor="#f87171" label="P/T">
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <InlineEdit value={`${power}/${toughness}`} onChange={v => {
                    const parts = v.split("/");
                    setPower(parts[0] || "0");
                    setToughness(parts[1] !== undefined ? parts[1] : toughness);
                  }}
                  style={{ fontSize: ptFs, color: ptColor, fontFamily: FT, fontWeight: 700, lineHeight: 1, textAlign: "center", width: "100%" }} />
                </div>
              </DRBox>
            )}

            {/* ── INFO BASSA ── */}
            {showInfo && (
              <div style={{ position: "absolute", bottom: infoPx, left: pct(CW, 1.5), zIndex: 5, lineHeight: 1.35, pointerEvents: "none" }}>
                <div style={{ fontSize: infoFs, color: "#909090", fontFamily: "monospace" }}>{rarity} {setCode} • {lang}</div>
                <div style={{ fontSize: infoFs, color: "#909090", fontFamily: "monospace" }}>Illus. {artist}</div>
              </div>
            )}
            {showCopy && (
              <div style={{ position: "absolute", bottom: infoPx, right: pct(CW, 2), zIndex: 5, pointerEvents: "none" }}>
                <span style={{ fontSize: infoFs, color: "#909090", fontFamily: "monospace" }}>™ & © {year} Wizards of the Coast</span>
              </div>
            )}
          </div>

          <p style={{ fontSize: ".68rem", color: "#3a3937", textAlign: "center", maxWidth: CW, margin: 0 }}>
            {editMode
              ? "📐 Trascina le zone colorate · Ridimensiona dai bordi/angoli · Disattiva Layout per editare il testo"
              : "✏ Clicca su un campo per modificare il testo · 🖱 Trascina artwork per riposizionarlo"}
          </p>

          <GBtn onClick={handleDownload} disabled={downloading} full>
            {downloading
              ? <><span style={{ width: 14, height: 14, border: "2px solid #555", borderTopColor: G, borderRadius: "50%", animation: "spin .6s linear infinite", display: "inline-block" }} />Generazione…</>
              : "⬇ Scarica PNG UHD (4×)"}
          </GBtn>
        </div>

        {/* ═══════════ PANNELLO CONTROLLI ═══════════ */}
        <div style={{ flex: 1, minWidth: 280, maxWidth: 420 }}>

          {/* Avviso modalità */}
          <div style={{ background: editMode ? "#1d3461" : "#1c2918", border: `1px solid ${editMode ? "#2d5be3" : "#2d4a1e"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8, fontSize: ".78rem", color: editMode ? "#93c5fd" : "#86efac" }}>
            {editMode
              ? "📐 Modalità Layout: trascina e ridimensiona le zone sulla carta. Qui configura stile testo."
              : "✏ Modalità Testo: clicca sui campi sulla carta per modificare."}
          </div>

          {/* FRAME */}
          <Acc icon="🖼" title="Frame & Artwork" open={true}>
            <Lbl>Set Frame</Lbl>
            <select value={frameSet} onChange={e => { setFrameSet(e.target.value); setFrameIdx(0); }}
              style={{ background: "#252420", border: `1px solid ${BD}`, borderRadius: 6, color: "#cdccca", padding: "7px 10px", fontSize: ".83rem", width: "100%", outline: "none" }}>
              {allSets.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            {(FRAME_MAP[frameSet] || []).length > 0 && <>
              <Lbl>Frame specifico</Lbl>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(FRAME_MAP[frameSet] || []).map((f, i) => (
                  <button key={f.url} onClick={() => setFrameIdx(i)} title={f.name}
                    style={{ padding: 2, borderRadius: 4, border: `2px solid ${frameIdx === i ? G : BD}`, background: "#1a1a17", cursor: "pointer" }}>
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
                    style={{ padding: 2, borderRadius: 4, border: `2px solid ${ptFrameIdx === i ? G : BD}`, background: "#1a1a17", cursor: "pointer" }}>
                    <img src={f.url} alt={f.name} style={{ width: 52, height: 32, objectFit: "cover", borderRadius: 2, display: "block" }} />
                  </button>
                ))}
              </div>
            </>}
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <GBtn onClick={() => artInput.current.click()}>🖼 {artUrl ? "Cambia artwork" : "Carica artwork"}</GBtn>
              {artUrl && <GBtn variant="ghost" onClick={() => setArtUrl("")}>✕ Rimuovi</GBtn>}
            </div>
            <input ref={artInput} type="file" accept="image/*" style={{ display: "none" }} onChange={handleArt} />
            {artUrl && (
              <div style={{ background: "#252420", borderRadius: 8, padding: "10px 12px", border: `1px solid ${BD}`, display: "flex", flexDirection: "column", gap: 7 }}>
                <Lbl>🎯 Posizione artwork (o trascina sulla carta)</Lbl>
                <Sld label="Orizzontale X" value={artX} onChange={setArtX} min={0} max={100} />
                <Sld label="Verticale Y"   value={artY} onChange={setArtY} min={0} max={100} />
                <Sld label="Zoom %"        value={artZoom} onChange={setArtZoom} min={100} max={250} />
                <GBtn variant="ghost" onClick={() => { setArtX(50); setArtY(30); setArtZoom(100); }}>↺ Reset</GBtn>
              </div>
            )}
          </Acc>

          {/* NOME */}
          <Acc icon="✏️" title="Nome carta" open={true}>
            <TF value={name} onChange={setName} placeholder="Nome carta…" />
            <Sld label="Dimensione font" value={nameFs} onChange={setNameFs} min={8} max={40} />
            <CP label="Colore" value={nameColor} onChange={setNameColor} />
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              {CPRESETS.map(c => <button key={c} onClick={() => setNameColor(c)} style={{ width: 22, height: 22, borderRadius: 4, background: c, border: nameColor === c ? `2px solid ${G}` : `2px solid ${BD}`, cursor: "pointer" }} />)}
              <span style={{ fontSize: ".7rem", color: "#4a4948", marginLeft: 4 }}>preset</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Lbl>Allineamento</Lbl>
                <div style={{ display: "flex", gap: 4 }}>
                  {["left","center","right"].map(a => (
                    <button key={a} onClick={() => setNameAlign(a)} style={{ flex: 1, background: nameAlign === a ? G : "#252420", color: nameAlign === a ? "#000" : "#797876", border: `1px solid ${BD}`, borderRadius: 5, padding: "4px 0", fontSize: ".75rem", cursor: "pointer" }}>{a === "left" ? "←" : a === "center" ? "↔" : "→"}</button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <Lbl>Font</Lbl>
                <div style={{ display: "flex", gap: 4 }}>
                  {[["title","MTG"], ["body","Serif"]].map(([v, l]) => (
                    <button key={v} onClick={() => setNameFont(v)} style={{ flex: 1, background: nameFont === v ? G : "#252420", color: nameFont === v ? "#000" : "#797876", border: `1px solid ${BD}`, borderRadius: 5, padding: "4px 0", fontSize: ".72rem", cursor: "pointer" }}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
            <Chk label="Grassetto" checked={nameBold} onChange={setNameBold} />
          </Acc>

          {/* MANA */}
          <Acc icon="🔮" title="Costo Mana">
            <Chk label="Mostra costo mana" checked={showMana} onChange={setShowMana} />
            <p style={{ fontSize: ".7rem", color: "#4a4948", margin: 0 }}>es: {"{2}{W}{U}"} · {"{X}{R}{R}"}</p>
            <TF value={manaCost} onChange={setManaCost} disabled={!showMana} />
          </Acc>

          {/* TIPO */}
          <Acc icon="📋" title="Riga Tipo">
            <TF value={type} onChange={setType} />
            <Sld label="Dimensione font" value={typeFs} onChange={setTypeFs} min={8} max={22} />
            <CP label="Colore" value={typeColor} onChange={setTypeColor} />
            <div style={{ display: "flex", gap: 4 }}>
              {["left","center","right"].map(a => (
                <button key={a} onClick={() => setTypeAlign(a)} style={{ flex: 1, background: typeAlign === a ? G : "#252420", color: typeAlign === a ? "#000" : "#797876", border: `1px solid ${BD}`, borderRadius: 5, padding: "4px 0", fontSize: ".75rem", cursor: "pointer" }}>{a === "left" ? "←" : a === "center" ? "↔" : "→"}</button>
              ))}
            </div>
          </Acc>

          {/* ABILITÀ */}
          <Acc icon="⚡" title="Testo & Abilità">
            <Chk label="Mostra testo abilità" checked={showAbility} onChange={setShowAbility} />
            <p style={{ fontSize: ".7rem", color: "#4a4948", margin: 0, lineHeight: 1.5 }}>
              Simboli: {"{W}"} {"{U}"} {"{B}"} {"{R}"} {"{G}"} {"{T}"} {"{2}"} {"{X}"}<br/>Invio = paragrafo separato.
            </p>
            <TF value={ability} onChange={setAbility} multiline rows={5} disabled={!showAbility} />
            <Sld label="Dimensione font" value={abilityFs} onChange={setAbilityFs} min={6} max={18} step={0.5} />
            <CP label="Colore testo" value={abilityColor} onChange={setAbilityColor} />
            <div style={{ borderTop: `1px solid ${BD}`, paddingTop: 8 }}>
              <Chk label="Flavor text (corsivo)" checked={showFlavor} onChange={setShowFlavor} />
              {showFlavor && <>
                <TF value={flavor} onChange={setFlavor} multiline rows={2} placeholder="Testo flavor…" />
                <Sld label="Dim. flavor" value={flavorFs} onChange={setFlavorFs} min={6} max={16} step={0.5} />
              </>}
            </div>
          </Acc>

          {/* P/T */}
          <Acc icon="⚔️" title="Power / Toughness">
            <Chk label="Mostra P/T" checked={showPT} onChange={setShowPT} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 16px 1fr", gap: 8, alignItems: "end" }}>
              <div><Lbl>Power</Lbl><TF value={power} onChange={setPower} /></div>
              <div style={{ textAlign: "center", color: "#797876", fontSize: "1.1rem", paddingBottom: 7 }}>/</div>
              <div><Lbl>Toughness</Lbl><TF value={toughness} onChange={setToughness} /></div>
            </div>
            <Sld label="Dimensione font P/T" value={ptFs} onChange={setPtFs} min={10} max={44} />
            <CP label="Colore P/T" value={ptColor} onChange={setPtColor} />
          </Acc>

          {/* LAYOUT EXPORT/IMPORT */}
          <Acc icon="📐" title="Salva / Carica layout posizioni">
            <p style={{ fontSize: ".75rem", color: "#797876", margin: 0, lineHeight: 1.5 }}>
              Salva le posizioni di nome, tipo, abilità e P/T per riusarle con lo stesso frame in futuro. Ogni frame MTG ha posizioni diverse — salvale una volta, caricale sempre.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <GBtn variant="teal" onClick={exportLayout}>📋 Copia JSON</GBtn>
              <GBtn variant="ghost" onClick={saveLayoutFile}>⬇ Scarica .json</GBtn>
              <GBtn variant="ghost" onClick={() => layoutFileInput.current.click()}>📂 Carica .json</GBtn>
              <GBtn variant="ghost" onClick={resetBoxes}>↺ Reset default</GBtn>
            </div>
            <div style={{ background: "#252420", borderRadius: 8, padding: "10px 12px", border: `1px solid ${BD}`, marginTop: 2 }}>
              <Lbl>Layout corrente (px)</Lbl>
              <pre style={{ fontSize: ".68rem", color: "#4ade80", margin: 0, lineHeight: 1.6, overflow: "auto", maxHeight: 160, fontFamily: "monospace" }}>
                {JSON.stringify(boxes, null, 2)}
              </pre>
            </div>
          </Acc>

          {/* INFO */}
          <Acc icon="ℹ️" title="Info & Copyright">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><Lbl>Anno</Lbl><TF value={year} onChange={setYear} /></div>
              <div><Lbl>Rarità</Lbl><TF value={rarity} onChange={setRarity} placeholder="T/C/U/R/M" /></div>
              <div><Lbl>Set</Lbl><TF value={setCode} onChange={setSetCode} /></div>
              <div><Lbl>Lingua</Lbl><TF value={lang} onChange={setLang} /></div>
            </div>
            <Lbl>Illustratore</Lbl>
            <TF value={artist} onChange={setArtist} />
            <Sld label="Dim. font info" value={infoFs} onChange={setInfoFs} min={6} max={14} />
            <Chk label="Mostra info" checked={showInfo} onChange={setShowInfo} />
            <Chk label="Mostra copyright" checked={showCopy} onChange={setShowCopy} />
          </Acc>

        </div>
      </div>
    </>
  );
}
