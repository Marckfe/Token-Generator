import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── ASSET IMPORTS ────────────────────────────────────────────────────────────
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
const framePT = import.meta.glob("/src/assets/frames/pt/*.{png,jpg,jpeg,webp,svg}", { eager: true, import: "default" });
const PT_FRAMES = Object.entries(framePT).map(([p, url]) => ({ name: p.split("/").pop().replace(/\.[a-z]+$/, ""), url }));
const SYMBOLS = import.meta.glob("/src/assets/simbol/*.{svg,png,jpg,jpeg,webp}", { eager: true, import: "default" });

// ─── COSTANTI CARTA ───────────────────────────────────────────────────────────
const CW = 620, CH = 890;
const BLEED = 21; // ~3mm bleed tipografico
const DISPLAY_W = 460;
const DISPLAY_H = Math.round(CH * DISPLAY_W / CW);
const SCALE = CW / DISPLAY_W;

const FT = "Beleren, MatrixSC, Cinzel, Georgia, serif";
const FB = "MPlantin, 'Palatino Linotype', 'Book Antiqua', Georgia, serif";

// ─── UTILITY ──────────────────────────────────────────────────────────────────
function loadImg(src) {
  return new Promise((res, rej) => {
    if (!src) return rej(new Error("no src"));
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function symbolUrl(sym) {
  const key = Object.keys(SYMBOLS).find(p => {
    const fn = p.split("/").pop().replace(/\.[^.]+$/, "");
    return fn === sym || fn === `{${sym}}` || fn.toLowerCase() === sym.toLowerCase();
  });
  return key ? SYMBOLS[key] : null;
}

function parseMana(text) {
  const rx = /\{([^}]+)\}/g;
  const parts = []; let last = 0, m;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "txt", v: text.slice(last, m.index) });
    parts.push({ type: "sym", v: m[1].trim() });
    last = rx.lastIndex;
  }
  if (last < text.length) parts.push({ type: "txt", v: text.slice(last) });
  return parts;
}

async function drawManaText(ctx, text, x, y, fontSize, color, font, maxWidth) {
  const parts = parseMana(text);
  const symSize = fontSize * 1.1;
  ctx.font = `${fontSize}px ${font}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  let curX = x;
  for (const p of parts) {
    if (p.type === "txt") {
      const words = p.v.split(" ");
      for (let i = 0; i < words.length; i++) {
        const word = (i === 0 ? "" : " ") + words[i];
        const w = ctx.measureText(word).width;
        if (maxWidth && curX + w > x + maxWidth && curX > x) {
          curX = x;
          y += fontSize * 1.45;
        }
        ctx.fillText(word, curX, y);
        curX += ctx.measureText(word).width;
      }
    } else {
      const url = symbolUrl(p.v);
      if (url) {
        try {
          const img = await loadImg(url);
          ctx.drawImage(img, curX, y, symSize, symSize);
          curX += symSize + 1;
        } catch {
          ctx.fillText(`{${p.v}}`, curX, y);
          curX += ctx.measureText(`{${p.v}}`).width;
        }
      } else {
        ctx.fillText(`{${p.v}}`, curX, y);
        curX += ctx.measureText(`{${p.v}}`).width;
      }
    }
  }
  return y;
}

// ─── RENDER CANVAS ────────────────────────────────────────────────────────────
async function renderCard(canvas, state, withBleed = false) {
  const {
    artUrl, frame, ptFrame,
    name, nameStyle,
    type, typeStyle,
    ability, abilityStyle, showAbility,
    pt, ptStyle, showPT,
    infoLeft, showInfoLeft, showArtist,
    copyright, showCopyright,
  } = state;

  const B  = withBleed ? BLEED : 0;   // offset bleed
  const TW = CW + B * 2;              // canvas totale width
  const TH = CH + B * 2;              // canvas totale height

  canvas.width  = TW;
  canvas.height = TH;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, TW, TH);

  // ── ARTWORK: occupa tutto il canvas (incluso bleed) ─────────────────────
  if (artUrl) {
    try {
      const img = await loadImg(artUrl);
      ctx.drawImage(img, 0, 0, TW, TH);
    } catch {}
  }

  // ── TUTTO IL RESTO: spostato di B pixel (BLEED offset) ──────────────────
  ctx.save();
  ctx.translate(B, B);

  if (frame) {
    try { const img = await loadImg(frame.url); ctx.drawImage(img, 0, 0, CW, CH); } catch {}
  }

  ctx.save();
  ctx.font = `bold ${nameStyle.fontSize}px ${FT}`;
  ctx.fillStyle = nameStyle.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = nameStyle.align || "center";
  const nameBoxW = CW;
  const nameX = nameStyle.align === "left"  ? nameStyle.x + 10
              : nameStyle.align === "right" ? nameStyle.x + nameBoxW - 10
              : nameStyle.x + nameBoxW / 2;
  ctx.letterSpacing = "1px";
  ctx.fillText(name.toUpperCase(), nameX, nameStyle.y);
  ctx.restore();

  ctx.save();
  ctx.font = `bold ${typeStyle.fontSize}px ${FT}`;
  ctx.fillStyle = typeStyle.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(type, typeStyle.x, typeStyle.y);
  ctx.restore();

  if (showAbility && ability) {
    const lines = ability.split("\n");
    let curY = abilityStyle.y;
    for (const line of lines) {
      curY = await drawManaText(
        ctx, line, abilityStyle.x, curY,
        abilityStyle.fontSize, abilityStyle.color,
        FB, CW - abilityStyle.x * 2
      );
    }
  }

  if (showPT && ptFrame) {
    try { const img = await loadImg(ptFrame.url); ctx.drawImage(img, ptStyle.frameX, ptStyle.frameY, ptStyle.width, ptStyle.height); } catch {}
    ctx.save();
    ctx.font = `bold ${ptStyle.fontSize}px ${FT}`;
    ctx.fillStyle = ptStyle.color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const slash = "/";
    const pw = ctx.measureText(pt.power   || "0").width;
    const sw = ctx.measureText(slash).width;
    const tw = pw + sw + ctx.measureText(pt.toughness || "0").width;
    const ptCX = ptStyle.frameX + ptStyle.width / 2 + (ptStyle.powerOffsetX || 0);
    const ptCY = ptStyle.frameY + ptStyle.height / 2;
    ctx.textAlign = "left";
    ctx.fillText(pt.power     || "0", ptCX - tw / 2, ptCY);
    ctx.fillText(slash,                ptCX - tw / 2 + pw, ptCY);
    ctx.fillText(pt.toughness || "0", ptCX - tw / 2 + pw + sw, ptCY);
    ctx.restore();
  }

  if (showInfoLeft && infoLeft) {
    ctx.save();
    ctx.font = `${infoLeft.fontSize || 11}px ${FT}`;
    ctx.fillStyle = infoLeft.color || "#1a1a1a";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(infoLeft.text || "", infoLeft.x, CH - (infoLeft.y || 10));
    ctx.restore();
  }

  if (showArtist && infoLeft?.artist) {
    ctx.save();
    ctx.font = `${infoLeft.fontSize || 11}px ${FT}`;
    ctx.fillStyle = infoLeft.color || "#1a1a1a";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(`Illus. ${infoLeft.artist}`, infoLeft.x, CH - (infoLeft.y || 10) + (infoLeft.fontSize || 11) + 2);
    ctx.restore();
  }

  if (showCopyright && copyright) {
    ctx.save();
    ctx.font = `${copyright.fontSize || 9}px ${FT}`;
    ctx.fillStyle = copyright.color;
    ctx.textBaseline = "bottom";
    ctx.textAlign = "right";
    ctx.fillText(`™ & © ${copyright.year} Wizards of the Coast`, CW - copyright.x, CH - copyright.y);
    ctx.restore();
  }

  ctx.restore(); // fine translate(B, B)
}


// ─── DRAG BOX ─────────────────────────────────────────────────────────────────
function DragBox({ label, style, onUpdate, color, children }) {
  const drag = useRef(false);
  const start = useRef({});
  const dispX = style.x / SCALE;
  const dispY = style.y / SCALE;

  // ── Ottieni coordinate normalizzate da mouse O touch ──────────────────────
  const getXY = (e) => {
    if (e.touches && e.touches.length > 0) {
      return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
  };

  const onDown = (e) => {
    e.preventDefault();
    drag.current = true;
    const { clientX, clientY } = getXY(e);
    start.current = { mx: clientX, my: clientY, sx: style.x, sy: style.y };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  };

  const onMove = useCallback((e) => {
    if (!drag.current) return;
    e.preventDefault();
    const { clientX, clientY } = getXY(e);
    const dx = (clientX - start.current.mx) * SCALE;
    const dy = (clientY - start.current.my) * SCALE;
    onUpdate({ x: Math.round(start.current.sx + dx), y: Math.round(start.current.sy + dy) });
  }, [onUpdate]);

  const onUp = useCallback(() => {
    drag.current = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
  }, [onMove]);

  return (
    <div
      onMouseDown={onDown}
      onTouchStart={onDown}
      title={`Trascina: ${label}`}
      style={{
        position: "absolute", left: dispX, top: dispY, cursor: "move",
        border: `1.5px dashed ${color}`, background: `${color}18`,
        borderRadius: 3, padding: "4px 8px", userSelect: "none", zIndex: 10,
        minWidth: 36, minHeight: 36,
        touchAction: "none",          // blocca scroll su touch durante drag
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
      <span style={{ position: "absolute", top: -18, left: 0, fontSize: 10,
        background: "rgba(0,0,0,.85)", color, padding: "2px 6px",
        borderRadius: 3, whiteSpace: "nowrap", pointerEvents: "none",
        fontWeight: 700 }}>{label}</span>
      {children}
    </div>
  );
}

// ─── STILI PANNELLO ───────────────────────────────────────────────────────────
const P = { background: "#1a1917", color: "#cdccca", fontFamily: "system-ui,sans-serif", fontSize: 13 };
const BD = "#2e2d2b", G = "#4f98a3", SURFACE = "#201f1d";

function Lbl({ children }) {
  return <div style={{ fontSize: 11, color: "#797876", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".05em" }}>{children}</div>;
}
function TF({ value, onChange, placeholder, disabled, type = "text" }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      style={{ width: "100%", background: "#252420", color: "#cdccca", border: `1px solid ${BD}`,
        borderRadius: 5, padding: "5px 8px", fontSize: 13, boxSizing: "border-box",
        outline: "none", marginBottom: 6, opacity: disabled ? 0.4 : 1 }} />
  );
}
function TFArea({ value, onChange, placeholder, disabled, rows = 3 }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      disabled={disabled} rows={rows}
      style={{ width: "100%", background: "#252420", color: "#cdccca", border: `1px solid ${BD}`,
        borderRadius: 5, padding: "5px 8px", fontSize: 13, boxSizing: "border-box",
        outline: "none", resize: "vertical", marginBottom: 6,
        opacity: disabled ? 0.4 : 1, fontFamily: "system-ui,sans-serif" }} />
  );
}
function Sld({ label, value, onChange, min, max, step = 0.5 }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#797876", marginBottom: 2 }}>
        <span>{label}</span><span style={{ color: G }}>{Number(value).toFixed(1)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={Number(value)}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: G }} />
    </div>
  );
}

function Row({ children }) {
  return <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>{children}</div>;
}
function Btn({ children, onClick, color = G, small, disabled, style: extraStyle }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: color, color: "#fff", border: "none", borderRadius: 5,
        padding: small ? "3px 8px" : "6px 14px", fontSize: small ? 11 : 13,
        cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, whiteSpace: "nowrap",
        opacity: disabled ? 0.5 : 1, ...extraStyle }}>
      {children}
    </button>
  );
}
function Section({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 8, border: `1px solid ${BD}`, borderRadius: 6, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ background: SURFACE, padding: "7px 12px", cursor: "pointer",
          fontWeight: 600, fontSize: 12, display: "flex", justifyContent: "space-between", color: "#aaa" }}>
        <span>{title}</span><span>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div style={{ padding: "10px 12px" }}>{children}</div>}
    </div>
  );
}
function AlignBtns({ value, onChange }) {
  return (
    <Row>
      {["left", "center", "right"].map(a => (
        <button key={a} onClick={() => onChange(a)}
          style={{ flex: 1, background: value === a ? G : "#252420",
            color: value === a ? "#000" : "#797876", border: `1px solid ${BD}`,
            borderRadius: 4, padding: "3px 0", fontSize: 12, cursor: "pointer" }}>
          {a === "left" ? "◀" : a === "center" ? "◆" : "▶"}
        </button>
      ))}
    </Row>
  );
}
function CP({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <Lbl>{label}</Lbl>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 44, height: 36, border: `1px solid ${BD}`, borderRadius: 6,
            background: "none", cursor: "pointer", padding: 2, flexShrink: 0 }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, background: "#252420", color: "#cdccca", border: `1px solid ${BD}`,
            borderRadius: 4, padding: "5px 8px", fontSize: 13, outline: "none", minWidth: 0 }} />
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPALE ────────────────────────────────────────────────────
export default function TokenEditor() {
  const canvasRef  = useRef();
  const artInput   = useRef();
  const stateInput = useRef();

  // ── stati carta ──────────────────────────────────────────────────────────────
  const [artUrl,        setArtUrl]       = useState("");
  const [frameIdx,      setFrameIdx]     = useState(0);
  const [frameSet,      setFrameSet]     = useState(Object.keys(FRAME_MAP)[0] || "");
  const [ptFrameIdx,    setPtFrameIdx]   = useState(0);

  const [name,          setName]         = useState("CONSTRUCT");
  const [nameStyle,     setNameStyle]    = useState({ x: 0, y: 75, fontSize: 29, color: "#181818", align: "center" });

  const [type,          setType]         = useState("Token Artifact Creature — Construct");
  const [typeStyle,     setTypeStyle]    = useState({ x: 53, y: 730, fontSize: 24, color: "#181818" });

  const [ability,       setAbility]      = useState("This creature gets +1/+1 for each artifact you control.\n{T}: Add {G} or {R}.");
  const [abilityStyle,  setAbilityStyle] = useState({ x: 43, y: 760, fontSize: 15.5, color: "#181818" });
  const [showAbility,   setShowAbility]  = useState(true);

  const [pt,            setPt]           = useState({ power: "0", toughness: "0" });
  const [ptStyle,       setPtStyle]      = useState({ x: 503, y: 775, frameX: 498, frameY: 778, width: 89, height: 58, fontSize: 34, color: "#181818", powerOffsetX: 0 });
  const [showPT,        setShowPT]       = useState(true);

  const [infoLeft,      setInfoLeft]     = useState({ x: 9, y: 21, fontSize: 13, year: "2025", rarity: "T", setCode: "MTG", lang: "EN", artist: "Jn Avon" });
  const [showInfoLeft,  setShowInfoLeft] = useState(true);
  const [showArtist,    setShowArtist]   = useState(true);

  const [copyright,     setCopyright]    = useState({ x: 24, y: 21, fontSize: 13, year: "2025", color: "#b2b2b2" });
  const [showCopyright, setShowCopyright]= useState(true);

  const [downloading,   setDownloading]  = useState(false);
  const [showGrid,      setShowGrid]     = useState(true);

  const frame   = (FRAME_MAP[frameSet] || [])[frameIdx];
  const ptFrame = PT_FRAMES[ptFrameIdx];

  // ── FIX DOPPIA CARTA: ref sempre aggiornato allo stato corrente ───────────
  // In questo modo handleDownload legge sempre i valori freschi
  // senza innescare un nuovo render o richiamare useEffect
  const stateRef = useRef({});
  const [activeTab, setActiveTab] = useState("frame");
  stateRef.current = { artUrl, frame, ptFrame, name, nameStyle, type, typeStyle, ability, abilityStyle, showAbility, pt, ptStyle, showPT, infoLeft, showInfoLeft, showArtist, copyright, showCopyright };

  // ── useEffect: ridisegna SOLO quando i dati della carta cambiano ──────────
  // Non dipende da `downloading` → nessun re-render spurio durante l'export
  useEffect(() => {
    if (downloading) return; // blocca re-render durante il download
    const c = canvasRef.current;
    if (!c) return;
    c.width  = CW;
    c.height = CH;
    c.style.width  = DISPLAY_W + "px";
    c.style.height = DISPLAY_H + "px";
    renderCard(c, {
      artUrl, frame, ptFrame,
      name, nameStyle,
      type, typeStyle,
      ability, abilityStyle, showAbility,
      pt, ptStyle, showPT,
      infoLeft, showInfoLeft, showArtist,
      copyright, showCopyright,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    downloading,
    artUrl, frame, ptFrame,
    name, nameStyle,
    type, typeStyle,
    ability, abilityStyle, showAbility,
    pt, ptStyle, showPT,
    infoLeft, showInfoLeft, showArtist,
    copyright, showCopyright,
  ]);

  // ── Download: usa stateRef.current — ZERO re-render, ZERO doppia carta ────
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const snap = {
        artUrl, frame, ptFrame,
        name, nameStyle, type, typeStyle,
        ability, abilityStyle, showAbility,
        pt, ptStyle, showPT,
        infoLeft, showInfoLeft, showArtist,
        copyright, showCopyright,
      };
      const S = 4;

      // Canvas con bleed integrato: artwork su tutto, frame+testi offset di BLEED
      const printCanvas = document.createElement("canvas");
      await renderCard(printCanvas, snap, true); // withBleed=true

      // Scala 4x
      const EW = printCanvas.width  * S;
      const EH = printCanvas.height * S;
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width  = EW;
      exportCanvas.height = EH;
      const ctx = exportCanvas.getContext("2d");
      ctx.drawImage(printCanvas, 0, 0, printCanvas.width, printCanvas.height, 0, 0, EW, EH);

      // Crop marks dentro il bleed (a BLEED*S dal bordo)
      const bx = BLEED * S, by = BLEED * S;
      const cw = CW * S, ch = CH * S;
      const MARK = 10 * S, GAP = 3 * S;
      ctx.save();
      ctx.strokeStyle = "#444";
      ctx.lineWidth = S * 0.5;
      ctx.lineCap = "square";
      for (const [px, py] of [[bx,by],[bx+cw,by],[bx,by+ch],[bx+cw,by+ch]]) {
        const sx = px === bx ? -1 : 1, sy = py === by ? -1 : 1;
        ctx.beginPath(); ctx.moveTo(px+sx*GAP, py); ctx.lineTo(px+sx*(GAP+MARK), py); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px, py+sy*GAP); ctx.lineTo(px, py+sy*(GAP+MARK)); ctx.stroke();
      }
      ctx.restore();

      const link = document.createElement("a");
      link.download = `${(snap.name || "token").replace(/[^a-z0-9_]/gi, "_")}_PRINT.png`;
      link.href = exportCanvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Errore export:", err);
      alert("Errore export: " + err.message);
    } finally {
      setDownloading(false);
    }
  };

  // ── FIX JSON: salva TUTTI i campi inclusi testi, artUrl, frame per nome ───
  const handleSaveState = () => {
    const snap = stateRef.current;
    const snapshot = {
      _version: 3,
      // frame identificati per nome — non per indice
      frameSet,
      frameName:    snap.frame?.name   ?? null,
      ptFrameName:  snap.ptFrame?.name ?? null,
      // artwork come dataURL (se presente)
      artUrl:       snap.artUrl,
      // TUTTI i testi
      name:         snap.name,
      type:         snap.type,
      ability:      snap.ability,
      pt:           snap.pt,
      // stili
      nameStyle:    snap.nameStyle,
      typeStyle:    snap.typeStyle,
      abilityStyle: snap.abilityStyle,
      ptStyle:      snap.ptStyle,
      // visibilità
      showAbility:  snap.showAbility,
      showPT:       snap.showPT,
      showInfoLeft: snap.showInfoLeft,
      showArtist:   snap.showArtist,
      showCopyright:snap.showCopyright,
      // info & copyright
      infoLeft:     snap.infoLeft,
      copyright:    snap.copyright,
      // ui
      showGrid,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(snap.name || "token").replace(/[^a-z0-9_]/gi, "_")}_state.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── FIX JSON: carica TUTTI i campi — testi + posizioni + frame per nome ───
  const handleLoadState = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const s = JSON.parse(ev.target.result);

        // ── frame: cerca per nome (v3), fallback indice (v1/v2) ───────────
        if (s.frameSet !== undefined) {
          setFrameSet(s.frameSet);
          if (s.frameName && FRAME_MAP[s.frameSet]) {
            const idx = FRAME_MAP[s.frameSet].findIndex(f => f.name === s.frameName);
            setFrameIdx(idx >= 0 ? idx : 0);
          } else if (s.frameIdx !== undefined) {
            setFrameIdx(s.frameIdx);
          }
        }
        if (s.ptFrameName) {
          const idx = PT_FRAMES.findIndex(f => f.name === s.ptFrameName);
          setPtFrameIdx(idx >= 0 ? idx : 0);
        } else if (s.ptFrameIdx !== undefined) {
          setPtFrameIdx(s.ptFrameIdx);
        }

        // ── artwork ────────────────────────────────────────────────────────
        if (s.artUrl !== undefined) setArtUrl(s.artUrl);

        // ── TESTI ─────────────────────────────────────────────────────────
        if (s.name    !== undefined) setName(s.name);
        if (s.type    !== undefined) setType(s.type);
        if (s.ability !== undefined) setAbility(s.ability);
        if (s.pt      !== undefined) setPt(s.pt);

        // ── stili posizione ──────────────────────────────────────────────────────
        const toNum = (obj, key) => obj && obj[key] !== undefined ? Number(obj[key]) : undefined;
        if (s.nameStyle    !== undefined) setNameStyle(    prev => ({ ...prev, ...s.nameStyle,    fontSize: toNum(s.nameStyle,    'fontSize') ?? prev.fontSize }));
        if (s.typeStyle    !== undefined) setTypeStyle(    prev => ({ ...prev, ...s.typeStyle,    fontSize: toNum(s.typeStyle,    'fontSize') ?? prev.fontSize }));
        if (s.abilityStyle !== undefined) setAbilityStyle( prev => ({ ...prev, ...s.abilityStyle, fontSize: toNum(s.abilityStyle, 'fontSize') ?? prev.fontSize }));
        if (s.ptStyle      !== undefined) setPtStyle(      prev => ({ ...prev, ...s.ptStyle,      fontSize: toNum(s.ptStyle,      'fontSize') ?? prev.fontSize }));
        if (s.showAbility   !== undefined) setShowAbility(s.showAbility);
        if (s.showPT        !== undefined) setShowPT(s.showPT);
        if (s.showInfoLeft  !== undefined) setShowInfoLeft(s.showInfoLeft);
        if (s.showArtist    !== undefined) setShowArtist(s.showArtist);
        if (s.showCopyright !== undefined) setShowCopyright(s.showCopyright);

        // ── info & copyright ──────────────────────────────────────────────
        if (s.infoLeft  !== undefined) setInfoLeft(  prev => ({ ...prev, ...s.infoLeft  }));
        if (s.copyright !== undefined) setCopyright( prev => ({ ...prev, ...s.copyright }));

        // ── ui ────────────────────────────────────────────────────────────
        if (s.showGrid !== undefined) setShowGrid(s.showGrid);

      } catch (err) {
        alert("File non valido: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const allFrameKeys = Object.keys(FRAME_MAP);

  // ── responsive: detecta mobile via CSS media query simulata ──────────────
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 700);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  React.useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  const tabs = [
    { id: "frame",   label: "🖼", full: "Frame" },
    { id: "testo",   label: "✏️", full: "Testo" },
    { id: "ability", label: "⚡", full: "Abilità" },
    { id: "pt",      label: "⚔️", full: "P/T" },
    { id: "info",    label: "ℹ️", full: "Info" },
    { id: "pos",     label: "📐", full: "Pos." },
  ];

  const PanelContent = () => (
    <div style={{ padding: 12, flex: 1, overflowY: "auto", maxHeight: isMobile ? "60vh" : undefined }}>

      {activeTab === "frame" && (
        <div>
          <Lbl>Set Frame</Lbl>
          <select value={frameSet} onChange={e => { setFrameSet(e.target.value); setFrameIdx(0); }}
            style={{ width: "100%", background: "#252420", color: "#cdccca", border: `1px solid ${BD}`,
              borderRadius: 5, padding: "6px 8px", marginBottom: 10, fontSize: 13 }}>
            {allFrameKeys.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <Lbl>Frame carta</Lbl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {(FRAME_MAP[frameSet] || []).map((f, i) => (
              <img key={f.url} src={f.url} alt={f.name} title={f.name} onClick={() => setFrameIdx(i)}
                style={{ width: 52, height: 74, objectFit: "cover", borderRadius: 4, cursor: "pointer",
                  border: i === frameIdx ? `2px solid ${G}` : `2px solid transparent`,
                  opacity: i === frameIdx ? 1 : 0.55 }} />
            ))}
          </div>
          <Lbl>Frame P/T</Lbl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {PT_FRAMES.map((f, i) => (
              <img key={f.url} src={f.url} alt={f.name} title={f.name} onClick={() => setPtFrameIdx(i)}
                style={{ width: 52, height: 36, objectFit: "cover", borderRadius: 4, cursor: "pointer",
                  border: i === ptFrameIdx ? `2px solid ${G}` : `2px solid transparent`,
                  opacity: i === ptFrameIdx ? 1 : 0.55 }} />
            ))}
          </div>
          <Lbl>Artwork</Lbl>
          <Btn onClick={() => artInput.current.click()} color="#6366f1" style={{ width: "100%", marginBottom: 6 }}>
            📁 Carica immagine
          </Btn>
          <input ref={artInput} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
            const f = e.target.files?.[0]; if (!f) return;
            const r = new FileReader(); r.onloadend = () => setArtUrl(r.result); r.readAsDataURL(f);
            e.target.value = null;
          }} />
          {artUrl && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <img src={artUrl} alt="art" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }} />
              <Btn small onClick={() => setArtUrl("")} color="#7a1e1e">✕ Rimuovi</Btn>
            </div>
          )}
        </div>
      )}

      {activeTab === "testo" && (
        <div>
          <Lbl>Nome carta</Lbl>
          <TF value={name} onChange={setName} placeholder="Es. CONSTRUCT" />
          <Lbl>Allineamento nome</Lbl>
          <AlignBtns value={nameStyle.align || "center"} onChange={v => setNameStyle(s => ({ ...s, align: v }))} />
          <Sld label="Font size nome" value={nameStyle.fontSize} onChange={v => setNameStyle(s => ({ ...s, fontSize: v }))} min={10} max={50} />
          <CP label="Colore nome" value={nameStyle.color} onChange={v => setNameStyle(s => ({ ...s, color: v }))} />
          <div style={{ height: 1, background: BD, margin: "10px 0" }} />
          <Lbl>Tipo carta</Lbl>
          <TF value={type} onChange={setType} placeholder="Es. Token Artifact Creature" />
          <Sld label="Font size tipo" value={typeStyle.fontSize} onChange={v => setTypeStyle(s => ({ ...s, fontSize: v }))} min={10} max={40} />
          <CP label="Colore tipo" value={typeStyle.color} onChange={v => setTypeStyle(s => ({ ...s, color: v }))} />
        </div>
      )}

      {activeTab === "ability" && (
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
            cursor: "pointer", fontSize: 13, color: showAbility ? "#cdccca" : "#4a4948" }}>
            <input type="checkbox" checked={showAbility} onChange={e => setShowAbility(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: G }} />
            Mostra testo abilità
          </label>
          <TFArea value={ability} onChange={setAbility}
            placeholder={"Es. Flying\nWhen this enters…\nUsa {T} {W} {G} {2} ecc."}
            disabled={!showAbility} rows={5} />
          <Sld label="Font size" value={Number(abilityStyle.fontSize)} onChange={v => setAbilityStyle(s => ({ ...s, fontSize: Number(v) }))} min={8} max={30} />
          <CP label="Colore testo" value={abilityStyle.color} onChange={v => setAbilityStyle(s => ({ ...s, color: v }))} />
        </div>
      )}

      {activeTab === "pt" && (
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
            cursor: "pointer", fontSize: 13, color: showPT ? "#cdccca" : "#4a4948" }}>
            <input type="checkbox" checked={showPT} onChange={e => setShowPT(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: G }} />
            Mostra P/T
          </label>
          <Row>
            <div style={{ flex: 1 }}><Lbl>Power</Lbl><TF value={pt.power} onChange={v => setPt(p => ({ ...p, power: v }))} disabled={!showPT} /></div>
            <div style={{ flex: 1 }}><Lbl>Toughness</Lbl><TF value={pt.toughness} onChange={v => setPt(p => ({ ...p, toughness: v }))} disabled={!showPT} /></div>
          </Row>
          <Sld label="Font size" value={ptStyle.fontSize} onChange={v => setPtStyle(s => ({ ...s, fontSize: v }))} min={14} max={60} />
          <CP label="Colore" value={ptStyle.color} onChange={v => setPtStyle(s => ({ ...s, color: v }))} />
        </div>
      )}

      {activeTab === "info" && (
        <div>
          <Row>
            <div style={{ flex: 1 }}><Lbl>Rarità</Lbl><TF value={infoLeft.rarity} onChange={v => setInfoLeft(s => ({ ...s, rarity: v }))} /></div>
            <div style={{ flex: 1 }}><Lbl>Set</Lbl><TF value={infoLeft.setCode} onChange={v => setInfoLeft(s => ({ ...s, setCode: v }))} /></div>
          </Row>
          <Row>
            <div style={{ flex: 1 }}><Lbl>Anno</Lbl><TF value={infoLeft.year} onChange={v => setInfoLeft(s => ({ ...s, year: v }))} /></div>
            <div style={{ flex: 1 }}><Lbl>Lingua</Lbl><TF value={infoLeft.lang} onChange={v => setInfoLeft(s => ({ ...s, lang: v }))} /></div>
          </Row>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={showInfoLeft} onChange={e => setShowInfoLeft(e.target.checked)} style={{ accentColor: G }} />
            Mostra info bassa
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={showArtist} onChange={e => setShowArtist(e.target.checked)} style={{ accentColor: G }} />
            Mostra artista
          </label>
          <Lbl>Artista</Lbl>
          <TF value={infoLeft.artist || ""} onChange={v => setInfoLeft(s => ({ ...s, artist: v }))} disabled={!showArtist} placeholder="Nome artista…" />
          <div style={{ height: 1, background: BD, margin: "10px 0" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={showCopyright} onChange={e => setShowCopyright(e.target.checked)} style={{ accentColor: G }} />
            Mostra copyright
          </label>
          <Lbl>Anno copyright</Lbl>
          <TF value={copyright.year} onChange={v => setCopyright(s => ({ ...s, year: v }))} disabled={!showCopyright} />
        </div>
      )}

      {activeTab === "pos" && (
        <div>
          <Lbl>Nome — posizione</Lbl>
          <Row>
            <div style={{ flex: 1 }}><Lbl>X</Lbl><TF type="number" value={nameStyle.x} onChange={v => setNameStyle(s => ({ ...s, x: Number(v) }))} /></div>
            <div style={{ flex: 1 }}><Lbl>Y</Lbl><TF type="number" value={nameStyle.y} onChange={v => setNameStyle(s => ({ ...s, y: Number(v) }))} /></div>
          </Row>
          <Lbl>Tipo — posizione</Lbl>
          <Row>
            <div style={{ flex: 1 }}><Lbl>X</Lbl><TF type="number" value={typeStyle.x} onChange={v => setTypeStyle(s => ({ ...s, x: Number(v) }))} /></div>
            <div style={{ flex: 1 }}><Lbl>Y</Lbl><TF type="number" value={typeStyle.y} onChange={v => setTypeStyle(s => ({ ...s, y: Number(v) }))} /></div>
          </Row>
          <Lbl>Abilità — posizione</Lbl>
          <Row>
            <div style={{ flex: 1 }}><Lbl>X</Lbl><TF type="number" value={abilityStyle.x} onChange={v => setAbilityStyle(s => ({ ...s, x: Number(v) }))} /></div>
            <div style={{ flex: 1 }}><Lbl>Y</Lbl><TF type="number" value={abilityStyle.y} onChange={v => setAbilityStyle(s => ({ ...s, y: Number(v) }))} /></div>
          </Row>
          <Lbl>P/T frame — posizione</Lbl>
          <Row>
            <div style={{ flex: 1 }}><Lbl>X</Lbl><TF type="number" value={ptStyle.frameX} onChange={v => setPtStyle(s => ({ ...s, frameX: Number(v), x: Number(v) }))} /></div>
            <div style={{ flex: 1 }}><Lbl>Y</Lbl><TF type="number" value={ptStyle.frameY} onChange={v => setPtStyle(s => ({ ...s, frameY: Number(v), y: Number(v) }))} /></div>
          </Row>
          <Row>
            <div style={{ flex: 1 }}><Lbl>W</Lbl><TF type="number" value={ptStyle.width} onChange={v => setPtStyle(s => ({ ...s, width: Number(v) }))} /></div>
            <div style={{ flex: 1 }}><Lbl>H</Lbl><TF type="number" value={ptStyle.height} onChange={v => setPtStyle(s => ({ ...s, height: Number(v) }))} /></div>
          </Row>
          <div style={{ height: 1, background: BD, margin: "10px 0" }} />
          <button onClick={() => setShowGrid(g => !g)}
            style={{ width: "100%", background: showGrid ? G : "#252420", color: showGrid ? "#000" : "#797876",
              border: `1px solid ${BD}`, borderRadius: 5, padding: "7px", fontSize: 12,
              cursor: "pointer", fontWeight: 600, marginBottom: 6 }}>
            {showGrid ? "✅ Box drag ON" : "📐 Box drag OFF"}
          </button>
          <p style={{ fontSize: 11, color: "#4a4948", margin: 0 }}>
            Attiva i box colorati sulla preview per trascinare gli elementi.
          </p>
        </div>
      )}
    </div>
  );

  // ── TAB BAR (condivisa tra mobile e desktop) ─────────────────────────────
  const TabBar = ({ horizontal }) => (
    <div style={{ display: "flex", flexDirection: horizontal ? "row" : "row",
      background: "#151413", borderTop: horizontal ? `1px solid ${BD}` : undefined,
      borderBottom: !horizontal ? `1px solid ${BD}` : undefined,
      flexWrap: "nowrap", overflowX: "auto" }}>
      {tabs.map(t => (
        <button key={t.id}
          onClick={() => { setActiveTab(t.id); if (isMobile) setDrawerOpen(true); }}
          style={{ flex: "1 0 auto", padding: horizontal ? "10px 4px" : "8px 4px",
            fontSize: horizontal ? 20 : 11, fontWeight: 600,
            background: activeTab === t.id && (!isMobile || drawerOpen) ? SURFACE : "transparent",
            color: activeTab === t.id && (!isMobile || drawerOpen) ? G : "#797876",
            border: "none",
            borderTop: horizontal && activeTab === t.id && drawerOpen ? `2px solid ${G}` : horizontal ? "2px solid transparent" : "none",
            borderBottom: !horizontal && activeTab === t.id ? `2px solid ${G}` : !horizontal ? "2px solid transparent" : "none",
            cursor: "pointer", whiteSpace: "nowrap", minWidth: 44 }}>
          <div>{t.label}</div>
          {!horizontal && <div style={{ fontSize: 9, marginTop: 1 }}>{t.full}</div>}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ ...P, display: "flex", flexDirection: "column", minHeight: "100vh",
      minHeight: "100dvh", background: "#111" }}>

      {/* ── TOPBAR ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#1a1917", borderBottom: `1px solid ${BD}`,
        padding: "8px 12px", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: G, letterSpacing: ".05em" }}>🃏 Token Generator</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn small onClick={handleSaveState} color="#1e3a2f" style={{ border: `1px solid ${G}`, color: G }}>💾 Salva</Btn>
          <Btn small onClick={() => stateInput.current.click()} color="#1e3a2f" style={{ border: `1px solid ${G}`, color: G }}>📂 Carica</Btn>
          <input ref={stateInput} type="file" accept=".json" style={{ display: "none" }} onChange={handleLoadState} />
          <Btn small onClick={handleDownload} disabled={downloading}
            color={downloading ? "#333" : "#c9a227"}
            style={{ color: downloading ? "#666" : "#000", fontWeight: 700 }}>
            {downloading ? "⏳…" : "⬇ PNG 4×"}
          </Btn>
        </div>
      </div>

      {/* ── LAYOUT DESKTOP ── */}
      {!isMobile && (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Pannello sinistro */}
          <div style={{ width: 280, minWidth: 260, background: "#1a1917",
            borderRight: `1px solid ${BD}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <TabBar horizontal={false} />
            <div style={{ flex: 1, overflowY: "auto" }}>
              <PanelContent />
            </div>
          </div>
          {/* Preview */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "flex-start", padding: "20px 10px", gap: 16, overflowY: "auto", background: "#0e0e0e" }}>
            <div style={{ position: "relative", width: DISPLAY_W, height: DISPLAY_H,
              borderRadius: 14, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,.8)", flexShrink: 0 }}>
              <canvas ref={canvasRef} style={{ display: "block", width: DISPLAY_W, height: DISPLAY_H, borderRadius: 14 }} />
              {showGrid && (
                <>
                  <DragBox label="NOME" style={nameStyle} color="#c9a227"
                    onUpdate={d => setNameStyle(s => ({ ...s, x: d.x, y: d.y }))}>
                    <span style={{ fontSize: 9, color: "#c9a227", whiteSpace: "nowrap" }}>{name.toUpperCase()}</span>
                  </DragBox>
                  <DragBox label="TIPO" style={typeStyle} color="#60a5fa"
                    onUpdate={d => setTypeStyle(s => ({ ...s, x: d.x, y: d.y }))}>
                    <span style={{ fontSize: 9, color: "#60a5fa", whiteSpace: "nowrap" }}>{type.slice(0, 28)}</span>
                  </DragBox>
                  {showAbility && (
                    <DragBox label="ABILITÀ" style={abilityStyle} color="#4ade80"
                      onUpdate={d => setAbilityStyle(s => ({ ...s, x: d.x, y: d.y }))}>
                      <span style={{ fontSize: 9, color: "#4ade80", whiteSpace: "nowrap" }}>Abilità…</span>
                    </DragBox>
                  )}
                  {showPT && (
                    <DragBox label="P/T" style={{ x: ptStyle.frameX, y: ptStyle.frameY }} color="#f87171"
                      onUpdate={d => setPtStyle(s => ({ ...s, frameX: d.x, frameY: d.y, x: d.x, y: d.y }))}>
                      <span style={{ fontSize: 9, color: "#f87171" }}>{pt.power}/{pt.toughness}</span>
                    </DragBox>
                  )}
                </>
              )}
            </div>
            <p style={{ fontSize: 11, color: "#3a3938", margin: 0 }}>
              Preview {DISPLAY_W}×{DISPLAY_H}px — Export 4× ({CW * 4}×{CH * 4}px)
            </p>
          </div>
        </div>
      )}

      {/* ── LAYOUT MOBILE ── */}
      {isMobile && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Preview scrollabile */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "flex-start", padding: "12px 8px", gap: 10, overflowY: "auto",
            background: "#0e0e0e", paddingBottom: drawerOpen ? "0" : "70px" }}>
            {/* Scala la carta per stare nel viewport mobile */}
            {(() => {
              const vw = Math.min(window.innerWidth - 16, 460);
              const scale = vw / DISPLAY_W;
              const scaledH = Math.round(DISPLAY_H * scale);
              return (
                <div style={{ position: "relative",
                  width: vw, height: scaledH,
                  borderRadius: 14, overflow: "hidden",
                  boxShadow: "0 8px 40px rgba(0,0,0,.8)", flexShrink: 0 }}>
                  <div style={{ transform: `scale(${scale})`, transformOrigin: "top left",
                    width: DISPLAY_W, height: DISPLAY_H }}>
                    <canvas ref={canvasRef} style={{ display: "block", width: DISPLAY_W, height: DISPLAY_H, borderRadius: 14 }} />
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Drawer bottom */}
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
            background: "#1a1917", borderTop: `1px solid ${BD}`,
            maxHeight: drawerOpen ? "65vh" : "56px",
            transition: "max-height .3s cubic-bezier(.4,0,.2,1)",
            display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 -4px 24px rgba(0,0,0,.6)" }}>

            {/* Handle + TabBar */}
            <div style={{ flexShrink: 0 }}>
              {/* Handle bar */}
              <div onClick={() => setDrawerOpen(o => !o)}
                style={{ display: "flex", justifyContent: "center", padding: "6px 0", cursor: "pointer" }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: drawerOpen ? G : "#3a3938" }} />
              </div>
              <TabBar horizontal={true} />
            </div>

            {/* Contenuto drawer */}
            {drawerOpen && (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <PanelContent />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
