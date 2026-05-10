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
// Coordinate native: tutte le posizioni sono in px su canvas 620×890
const CW = 620, CH = 890;
// Scala di visualizzazione: la carta nel DOM è larga DISPLAY_W px
const DISPLAY_W = 460;
const DISPLAY_H = Math.round(CH * DISPLAY_W / CW); // ~661px
const SCALE = CW / DISPLAY_W; // ~1.348 — fattore DOM→canvas

// Font stack
const FT = "Beleren, MatrixSC, Cinzel, Georgia, serif";
const FB = "MPlantin, 'Palatino Linotype', 'Book Antiqua', Georgia, serif";

// ─── UTILITY: carica immagine come HTMLImageElement ───────────────────────────
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

// ─── UTILITY: trova URL simbolo da nome (es. "T", "W", "G") ──────────────────
function symbolUrl(sym) {
  const key = Object.keys(SYMBOLS).find(p => {
    const fn = p.split("/").pop().replace(/\.[^.]+$/, "");
    return fn === sym || fn === `{${sym}}` || fn.toLowerCase() === sym.toLowerCase();
  });
  return key ? SYMBOLS[key] : null;
}

// ─── PARSER MANA: ritorna array {type:"txt"|"sym", v} ─────────────────────────
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

// ─── DISEGNA TESTO CON SIMBOLI SU CANVAS ─────────────────────────────────────
// Ritorna Promise — necessario per le immagini simboli
async function drawManaText(ctx, text, x, y, fontSize, color, font, maxWidth) {
  const parts = parseMana(text);
  const symSize = fontSize * 1.1;
  ctx.font = `${fontSize}px ${font}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  let curX = x;
  for (const p of parts) {
    if (p.type === "txt") {
      // Wrap se supera maxWidth
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
  return y; // ritorna y finale (utile per multiline)
}

// ─── RENDER CANVAS COMPLETO ───────────────────────────────────────────────────
async function renderCard(canvas, state) {
  const {
    artUrl, frame, ptFrame,
    name, nameStyle,
    type, typeStyle,
    ability, abilityStyle, showAbility,
    pt, ptStyle, showPT,
    infoLeft, showInfoLeft, showArtist,
    copyright, showCopyright,
  } = state;

  const ctx = canvas.getContext("2d");
  canvas.width  = CW;
  canvas.height = CH;
  ctx.clearRect(0, 0, CW, CH);

  // 1. Artwork
  if (artUrl) {
    try {
      const img = await loadImg(artUrl);
      ctx.drawImage(img, 0, 0, CW, CH);
    } catch {}
  }

  // 2. Frame principale
  if (frame) {
    try {
      const img = await loadImg(frame.url);
      ctx.drawImage(img, 0, 0, CW, CH);
    } catch {}
  }

  // 3. NOME — centrato nel box
  ctx.save();
  ctx.font = `bold ${nameStyle.fontSize}px ${FT}`;
  ctx.fillStyle = nameStyle.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = nameStyle.align || "center";
  const nameBoxW = CW; // box largo tutta la carta
  const nameX = nameStyle.align === "left" ? nameStyle.x + 10
              : nameStyle.align === "right" ? nameStyle.x + nameBoxW - 10
              : nameStyle.x + nameBoxW / 2;
  // Testo maiuscolo con letter-spacing simulato
  const nameText = name.toUpperCase();
  ctx.letterSpacing = "1px";
  ctx.fillText(nameText, nameX, nameStyle.y);
  ctx.restore();

  // 4. TIPO
  ctx.save();
  ctx.font = `bold ${typeStyle.fontSize}px ${FT}`;
  ctx.fillStyle = typeStyle.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(type, typeStyle.x, typeStyle.y);
  ctx.restore();

  // 5. ABILITÀ con simboli mana
  if (showAbility && ability) {
    const lines = ability.split("\n");
    let curY = abilityStyle.y;
    for (const line of lines) {
      curY = await drawManaText(
        ctx, line,
        abilityStyle.x, curY,
        abilityStyle.fontSize,
        abilityStyle.color,
        FB,
        CW - abilityStyle.x - 20
      );
      curY += abilityStyle.fontSize * 1.45 + 2;
    }
  }

  // 6. Frame P/T
  if (showPT && ptFrame) {
    try {
      const img = await loadImg(ptFrame.url);
      ctx.drawImage(img, ptStyle.frameX, ptStyle.frameY, ptStyle.width, ptStyle.height);
    } catch {}
  }

  // 7. Testo P/T
  if (showPT) {
    ctx.save();
    ctx.font = `bold ${ptStyle.fontSize}px ${FT}`;
    ctx.fillStyle = ptStyle.color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const ptCenterX = ptStyle.frameX + ptStyle.width / 2;
    const ptCenterY = ptStyle.frameY + ptStyle.height / 2;
    ctx.fillText(`${pt.power}/${pt.toughness}`, ptCenterX + (ptStyle.powerOffsetX || 0), ptCenterY);
    ctx.restore();
  }

  // 8. Info bassa sinistra
  if (showInfoLeft) {
    ctx.save();
    ctx.font = `${infoLeft.fontSize}px ${FB}`;
    ctx.fillStyle = "#9a9a9a";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    const infoY = CH - infoLeft.y;
    ctx.fillText(`${infoLeft.rarity} ${infoLeft.setCode} • ${infoLeft.lang}`, infoLeft.x, infoY - infoLeft.fontSize * 1.2);
    if (showArtist) ctx.fillText(`Illus. ${infoLeft.artist}`, infoLeft.x, infoY);
    ctx.restore();
  }

  // 9. Copyright
  if (showCopyright) {
    ctx.save();
    ctx.font = `${copyright.fontSize * 0.85}px ${FB}`;
    ctx.fillStyle = copyright.color;
    ctx.textBaseline = "bottom";
    ctx.textAlign = "right";
    ctx.fillText(`™ & © ${copyright.year} Wizards of the Coast`, CW - copyright.x, CH - copyright.y);
    ctx.restore();
  }
}

// ─── COMPONENTE DRAGGABLE PER POSIZIONARE I BOX ───────────────────────────────
// Le coordinate sono in spazio CANVAS (620×890)
// Internamente le converti in spazio DISPLAY dividendo per SCALE
function DragBox({ label, style, onUpdate, color, children }) {
  const ref = useRef();
  const drag = useRef(false);
  const start = useRef({});

  const dispX = style.x / SCALE;
  const dispY = style.y / SCALE;

  const onDown = (e) => {
    e.preventDefault();
    drag.current = true;
    start.current = { mx: e.clientX, my: e.clientY, sx: style.x, sy: style.y };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const onMove = useCallback((e) => {
    if (!drag.current) return;
    const dx = (e.clientX - start.current.mx) * SCALE;
    const dy = (e.clientY - start.current.my) * SCALE;
    onUpdate({ x: Math.round(start.current.sx + dx), y: Math.round(start.current.sy + dy) });
  }, [onUpdate]);
  const onUp = useCallback(() => {
    drag.current = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }, [onMove]);

  return (
    <div
      ref={ref}
      onMouseDown={onDown}
      title={`Trascina: ${label}`}
      style={{
        position: "absolute",
        left: dispX, top: dispY,
        cursor: "move",
        border: `1.5px dashed ${color}`,
        background: `${color}18`,
        borderRadius: 3,
        padding: "1px 4px",
        userSelect: "none",
        zIndex: 10,
        minWidth: 30, minHeight: 16,
      }}
    >
      <span style={{ position: "absolute", top: -14, left: 0, fontSize: 9, background: "rgba(0,0,0,.8)", color, padding: "1px 4px", borderRadius: 2, whiteSpace: "nowrap", pointerEvents: "none" }}>{label}</span>
      {children}
    </div>
  );
}

// ─── STILE PANNELLO ───────────────────────────────────────────────────────────
const P = { background: "#1a1917", color: "#cdccca", fontFamily: "system-ui,sans-serif", fontSize: 13 };
const BD = "#2e2d2b", G = "#4f98a3", SURFACE = "#201f1d";

function Lbl({ children }) {
  return <div style={{ fontSize: 11, color: "#797876", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".05em" }}>{children}</div>;
}
function TF({ value, onChange, placeholder, disabled, type = "text" }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      style={{ width: "100%", background: "#252420", color: "#cdccca", border: `1px solid ${BD}`, borderRadius: 5, padding: "5px 8px", fontSize: 13, boxSizing: "border-box", outline: "none", marginBottom: 6, opacity: disabled ? 0.4 : 1 }} />
  );
}
function TFArea({ value, onChange, placeholder, disabled, rows = 3 }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} rows={rows}
      style={{ width: "100%", background: "#252420", color: "#cdccca", border: `1px solid ${BD}`, borderRadius: 5, padding: "5px 8px", fontSize: 13, boxSizing: "border-box", outline: "none", resize: "vertical", marginBottom: 6, opacity: disabled ? 0.4 : 1, fontFamily: "system-ui,sans-serif" }} />
  );
}
function Sld({ label, value, onChange, min, max, step = 0.5 }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#797876", marginBottom: 2 }}>
        <span>{label}</span><span style={{ color: G }}>{typeof value === "number" ? value.toFixed(1) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: G }} />
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>{children}</div>;
}
function Btn({ children, onClick, color = G, small }) {
  return (
    <button onClick={onClick} style={{ background: color, color: "#fff", border: "none", borderRadius: 5, padding: small ? "3px 8px" : "6px 14px", fontSize: small ? 11 : 13, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}
function Section({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 8, border: `1px solid ${BD}`, borderRadius: 6, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ background: SURFACE, padding: "7px 12px", cursor: "pointer", fontWeight: 600, fontSize: 12, display: "flex", justifyContent: "space-between", color: "#aaa" }}>
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
          style={{ flex: 1, background: value === a ? G : "#252420", color: value === a ? "#000" : "#797876", border: `1px solid ${BD}`, borderRadius: 4, padding: "3px 0", fontSize: 12, cursor: "pointer" }}>
          {a === "left" ? "◀" : a === "center" ? "◆" : "▶"}
        </button>
      ))}
    </Row>
  );
}
function CP({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
      <Lbl>{label}</Lbl>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 32, height: 26, border: `1px solid ${BD}`, borderRadius: 4, background: "none", cursor: "pointer", padding: 1 }} />
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        style={{ flex: 1, background: "#252420", color: "#cdccca", border: `1px solid ${BD}`, borderRadius: 4, padding: "3px 6px", fontSize: 12, outline: "none" }} />
    </div>
  );
}

// ─── COMPONENTE PRINCIPALE ───────────────────────────────────────────────────
export default function TokenEditor() {
  const canvasRef  = useRef();   // canvas preview (DISPLAY_W × DISPLAY_H)
  const artInput   = useRef();

  // Stato carta
  const [artUrl,      setArtUrl]     = useState("");
  const [frameIdx,    setFrameIdx]   = useState(0);
  const [frameSet,    setFrameSet]   = useState(Object.keys(FRAME_MAP)[0] || "");
  const [ptFrameIdx,  setPtFrameIdx] = useState(0);

  const [name,        setName]       = useState("CONSTRUCT");
  const [nameStyle,   setNameStyle]  = useState({ x: 0, y: 75, fontSize: 29, color: "#181818", align: "center" });

  const [type,        setType]       = useState("Token Artifact Creature — Construct");
  const [typeStyle,   setTypeStyle]  = useState({ x: 53, y: 730, fontSize: 24, color: "#181818" });

  const [ability,     setAbility]    = useState("This creature gets +1/+1 for each artifact you control.\n{T}: Add {G} or {R}.");
  const [abilityStyle,setAbilityStyle] = useState({ x: 43, y: 760, fontSize: 15.5, color: "#181818" });
  const [showAbility, setShowAbility]= useState(true);

  const [pt,          setPt]         = useState({ power: "0", toughness: "0" });
  const [ptStyle,     setPtStyle]    = useState({ x: 503, y: 775, frameX: 498, frameY: 778, width: 89, height: 58, fontSize: 34, color: "#181818", powerOffsetX: 0 });
  const [showPT,      setShowPT]     = useState(true);

  const [infoLeft,    setInfoLeft]   = useState({ x: 9, y: 21, fontSize: 13, year: "2025", rarity: "T", setCode: "MTG", lang: "EN", artist: "Jn Avon" });
  const [showInfoLeft,setShowInfoLeft]=useState(true);
  const [showArtist,  setShowArtist] = useState(true);

  const [copyright,   setCopyright]  = useState({ x: 24, y: 21, fontSize: 13, year: "2025", color: "#b2b2b2" });
  const [showCopyright,setShowCopyright]=useState(true);

  const [downloading, setDownloading]= useState(false);
  const [showGrid,    setShowGrid]   = useState(true);

  const frame   = (FRAME_MAP[frameSet] || [])[frameIdx];
  const ptFrame = PT_FRAMES[ptFrameIdx];

  // ── Stato completo per renderCard ──────────────────────────────────────────
  const cardState = { artUrl, frame, ptFrame, name, nameStyle, type, typeStyle, ability, abilityStyle, showAbility, pt, ptStyle, showPT, infoLeft, showInfoLeft, showArtist, copyright, showCopyright };

  // ── Ridisegna il canvas ogni volta che cambia qualcosa ──────────────────────
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // Imposta dimensioni display
    c.style.width  = DISPLAY_W + "px";
    c.style.height = DISPLAY_H + "px";
    // Risoluzione interna = nativa canvas (620×890)
    c.width  = CW;
    c.height = CH;
    renderCard(c, cardState);
  });

  // ── Export: il canvas ha già tutto renderizzato — basta scaricarlo ──────────
  const handleDownload = async () => {
    // ── Bleed tipografico 3mm ─────────────────────────────────────────────────
    // Bleed: 3mm proporzionato al canvas 620×890 = ~21px per lato
    const BLEED = 21;
    const TW = CW + BLEED * 2;   // 662 px
    const TH = CH + BLEED * 2;   // 932 px
    const S  = 4;                 // 4× export scale → 2648×3728 px
    const EW = TW * S;
    const EH = TH * S;
    const OX = BLEED * S;         // offset carta nell'area bleed
    const OY = BLEED * S;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width  = EW;
    exportCanvas.height = EH;
    const ctx = exportCanvas.getContext("2d");
    ctx.clearRect(0, 0, EW, EH);

    if (downloading) return;
    setDownloading(true);

    try {
      // 1. ARTWORK — esteso sull'intera area bleed (nessun bordo bianco)
      if (artUrl) {
        const img = await loadImg(artUrl);
        ctx.drawImage(img, 0, 0, EW, EH);
      }

      // 2. FRAME — anch'esso esteso sull'intera area bleed
      if (frame) {
        const img = await loadImg(frame.url);
        ctx.drawImage(img, 0, 0, EW, EH);
      }

      // 3. NOME
      {
        const fs = nameStyle.fontSize * S;
        ctx.save();
        ctx.font         = `bold ${fs}px ${FT}`;
        ctx.fillStyle    = nameStyle.color;
        ctx.textBaseline = "middle";
        ctx.textAlign    = nameStyle.align || "center";
        const nameX = nameStyle.align === "left"  ? OX + 10
                    : nameStyle.align === "right" ? OX + CW * S - 10
                    : OX + (CW * S) / 2;
        ctx.fillText(name.toUpperCase(), nameX, OY + nameStyle.y * S);
        ctx.restore();
      }

      // 4. TIPO
      {
        const fs = typeStyle.fontSize * S;
        ctx.save();
        ctx.font         = `bold ${fs}px ${FT}`;
        ctx.fillStyle    = typeStyle.color;
        ctx.textBaseline = "middle";
        ctx.textAlign    = "left";
        ctx.fillText(type, OX + typeStyle.x * S, OY + typeStyle.y * S);
        ctx.restore();
      }

      // 5. ABILITÀ con simboli mana
      if (showAbility && ability) {
        const lines2 = ability.split("\n");
        const fs     = abilityStyle.fontSize * S;
        let   curY   = OY + abilityStyle.y * S;
        for (const line of lines2) {
          curY = await drawManaText(
            ctx, line,
            OX + abilityStyle.x * S, curY,
            fs, abilityStyle.color, FB,
            (CW - abilityStyle.x - 20) * S
          );
          curY += fs * 1.45 + 2;
        }
      }

      // 6. Frame P/T
      if (showPT && ptFrame) {
        const img = await loadImg(ptFrame.url);
        ctx.drawImage(img,
          OX + ptStyle.frameX * S, OY + ptStyle.frameY * S,
          ptStyle.width * S, ptStyle.height * S
        );
      }

      // 7. Testo P/T
      if (showPT) {
        const fs   = ptStyle.fontSize * S;
        const ptCX = OX + (ptStyle.frameX + ptStyle.width / 2 + (ptStyle.powerOffsetX || 0)) * S;
        const ptCY = OY + (ptStyle.frameY + ptStyle.height / 2) * S;
        ctx.save();
        ctx.font         = `bold ${fs}px ${FT}`;
        ctx.fillStyle    = ptStyle.color;
        ctx.textBaseline = "middle";
        ctx.textAlign    = "center";
        ctx.fillText(`${pt.power}/${pt.toughness}`, ptCX, ptCY);
        ctx.restore();
      }

      // 8. Info bassa sinistra
      if (showInfoLeft) {
        const fs  = infoLeft.fontSize * S;
        const ix  = OX + infoLeft.x * S;
        const iy1 = OY + CH * S - infoLeft.y * S - fs * 1.2;
        const iy2 = OY + CH * S - infoLeft.y * S;
        ctx.save();
        ctx.font         = `${fs}px ${FB}`;
        ctx.fillStyle    = "#9a9a9a";
        ctx.textBaseline = "bottom";
        ctx.textAlign    = "left";
        ctx.fillText(`${infoLeft.rarity} ${infoLeft.setCode} • ${infoLeft.lang}`, ix, iy1);
        if (showArtist) ctx.fillText(`Illus. ${infoLeft.artist}`, ix, iy2);
        ctx.restore();
      }

      // 9. Copyright
      if (showCopyright) {
        const fs = copyright.fontSize * 0.85 * S;
        ctx.save();
        ctx.font         = `${fs}px ${FB}`;
        ctx.fillStyle    = copyright.color;
        ctx.textBaseline = "bottom";
        ctx.textAlign    = "right";
        ctx.fillText(`™ & © ${copyright.year} Wizards of the Coast`,
          OX + CW * S - copyright.x * S,
          OY + CH * S - copyright.y * S
        );
        ctx.restore();
      }

      // 10. Crop marks agli angoli (bordo taglio reale)
      {
        const MARK = 15 * S, GAP = 4 * S;
        ctx.save();
        ctx.strokeStyle = "#808080";
        ctx.lineWidth   = 0.8 * S;
        const corners = [
          { x: OX, y: OY },
          { x: OX + CW * S, y: OY },
          { x: OX, y: OY + CH * S },
          { x: OX + CW * S, y: OY + CH * S },
        ];
        for (const c of corners) {
          const sx = c.x === OX ? -1 : 1;
          const sy = c.y === OY ? -1 : 1;
          ctx.beginPath(); ctx.moveTo(c.x + sx * GAP, c.y); ctx.lineTo(c.x + sx * (GAP + MARK), c.y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(c.x, c.y + sy * GAP); ctx.lineTo(c.x, c.y + sy * (GAP + MARK)); ctx.stroke();
        }
        ctx.restore();
      }

      // DOWNLOAD
      const link = document.createElement("a");
      link.download = `${(name || "token").replace(/[^a-z0-9_]/gi, "_")}_PRINT.png`;
      link.href = exportCanvas.toDataURL("image/png");
      link.click();

    } catch (err) {
      console.error("Errore export:", err);
      alert("Errore export: " + err.message);
    } finally {
      setDownloading(false);
    }
  };
// ─── FINE PATCH ──────────────────────────────────────────────────────────────

  const allFrameKeys = Object.keys(FRAME_MAP);

  return (
    <div style={{ ...P, display: "flex", gap: 0, minHeight: "100vh", background: "#111" }}>

      {/* ── PANNELLO SINISTRO ─────────────────────────────────────────────── */}
      <div style={{ width: 260, minWidth: 220, background: "#1a1917", borderRight: `1px solid ${BD}`, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 0 }}>

        <Section title="🖼 Frame & Artwork">
          <Lbl>Set Frame</Lbl>
          <select value={frameSet} onChange={e => { setFrameSet(e.target.value); setFrameIdx(0); }}
            style={{ width: "100%", background: "#252420", color: "#cdccca", border: `1px solid ${BD}`, borderRadius: 5, padding: "4px 6px", marginBottom: 6, fontSize: 12 }}>
            {allFrameKeys.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
            {(FRAME_MAP[frameSet] || []).map((f, i) => (
              <img key={f.url} src={f.url} alt={f.name} title={f.name} onClick={() => setFrameIdx(i)}
                style={{ width: 44, height: 63, objectFit: "cover", borderRadius: 3, cursor: "pointer", border: i === frameIdx ? `2px solid ${G}` : `2px solid transparent`, opacity: i === frameIdx ? 1 : 0.6 }} />
            ))}
          </div>
          <Lbl>Frame P/T</Lbl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
            {PT_FRAMES.map((f, i) => (
              <img key={f.url} src={f.url} alt={f.name} title={f.name} onClick={() => setPtFrameIdx(i)}
                style={{ width: 44, height: 32, objectFit: "cover", borderRadius: 3, cursor: "pointer", border: i === ptFrameIdx ? `2px solid ${G}` : `2px solid transparent`, opacity: i === ptFrameIdx ? 1 : 0.6 }} />
            ))}
          </div>
          <Btn onClick={() => artInput.current.click()} color="#6366f1">📁 Carica Artwork</Btn>
          <input ref={artInput} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
            const f = e.target.files?.[0]; if (!f) return;
            const r = new FileReader(); r.onloadend = () => setArtUrl(r.result); r.readAsDataURL(f);
            e.target.value = null;
          }} />
          {artUrl && <div style={{ marginTop: 6 }}><Btn small onClick={() => setArtUrl("")} color="#7a1e1e">✕ Rimuovi artwork</Btn></div>}
        </Section>

        <Section title="✏️ Nome">
          <TF value={name} onChange={setName} placeholder="Nome carta…" />
          <Lbl>Allineamento</Lbl>
          <AlignBtns value={nameStyle.align || "center"} onChange={v => setNameStyle(s => ({ ...s, align: v }))} />
          <Sld label="Font size" value={nameStyle.fontSize} onChange={v => setNameStyle(s => ({ ...s, fontSize: v }))} min={10} max={50} />
          <CP label="Colore" value={nameStyle.color} onChange={v => setNameStyle(s => ({ ...s, color: v }))} />
        </Section>

        <Section title="📋 Tipo">
          <TF value={type} onChange={setType} placeholder="Tipo carta…" />
          <Sld label="Font size" value={typeStyle.fontSize} onChange={v => setTypeStyle(s => ({ ...s, fontSize: v }))} min={10} max={40} />
          <CP label="Colore" value={typeStyle.color} onChange={v => setTypeStyle(s => ({ ...s, color: v }))} />
        </Section>

        <Section title="⚡ Abilità">
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={showAbility} onChange={e => setShowAbility(e.target.checked)} /> Mostra abilità
          </label>
          <TFArea value={ability} onChange={setAbility} placeholder="Testo abilità… usa {T} {W} {G} ecc." disabled={!showAbility} rows={4} />
          <Sld label="Font size" value={abilityStyle.fontSize} onChange={v => setAbilityStyle(s => ({ ...s, fontSize: v }))} min={8} max={30} />
          <CP label="Colore" value={abilityStyle.color} onChange={v => setAbilityStyle(s => ({ ...s, color: v }))} />
        </Section>

        <Section title="⚔️ P/T">
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={showPT} onChange={e => setShowPT(e.target.checked)} /> Mostra P/T
          </label>
          <Row>
            <div style={{ flex: 1 }}><Lbl>Power</Lbl><TF value={pt.power} onChange={v => setPt(p => ({ ...p, power: v }))} disabled={!showPT} /></div>
            <div style={{ flex: 1 }}><Lbl>Toughness</Lbl><TF value={pt.toughness} onChange={v => setPt(p => ({ ...p, toughness: v }))} disabled={!showPT} /></div>
          </Row>
          <Sld label="Font size" value={ptStyle.fontSize} onChange={v => setPtStyle(s => ({ ...s, fontSize: v }))} min={14} max={60} />
          <CP label="Colore" value={ptStyle.color} onChange={v => setPtStyle(s => ({ ...s, color: v }))} />
        </Section>

        <Section title="ℹ️ Info & Copyright">
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={showInfoLeft} onChange={e => setShowInfoLeft(e.target.checked)} /> Mostra info bassa
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={showArtist} onChange={e => setShowArtist(e.target.checked)} /> Mostra artista
          </label>
          <Row>
            <div style={{ flex: 1 }}><Lbl>Anno</Lbl><TF value={infoLeft.year} onChange={v => setInfoLeft(s => ({ ...s, year: v }))} /></div>
            <div style={{ flex: 1 }}><Lbl>Rarità</Lbl><TF value={infoLeft.rarity} onChange={v => setInfoLeft(s => ({ ...s, rarity: v }))} /></div>
          </Row>
          <Row>
            <div style={{ flex: 1 }}><Lbl>Set</Lbl><TF value={infoLeft.setCode} onChange={v => setInfoLeft(s => ({ ...s, setCode: v }))} /></div>
            <div style={{ flex: 1 }}><Lbl>Lingua</Lbl><TF value={infoLeft.lang} onChange={v => setInfoLeft(s => ({ ...s, lang: v }))} /></div>
          </Row>
          <Lbl>Artista</Lbl>
          <TF value={infoLeft.artist} onChange={v => setInfoLeft(s => ({ ...s, artist: v }))} disabled={!showArtist} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={showCopyright} onChange={e => setShowCopyright(e.target.checked)} /> Mostra copyright
          </label>
          <Lbl>Anno copyright</Lbl>
          <TF value={copyright.year} onChange={v => setCopyright(s => ({ ...s, year: v }))} disabled={!showCopyright} />
        </Section>

      </div>

      {/* ── PREVIEW CENTRALE ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "20px 10px", gap: 12, overflowY: "auto" }}>

        {/* Toolbar */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={() => setShowGrid(g => !g)}
            style={{ background: showGrid ? G : "#252420", color: showGrid ? "#000" : "#797876", border: `1px solid ${BD}`, borderRadius: 5, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
            {showGrid ? "✅ Box ON" : "📐 Box OFF"}
          </button>
          <span style={{ color: "#4a4948", fontSize: 11, alignSelf: "center" }}>Trascina i box colorati per riposizionare</span>
        </div>

        {/* Carta: canvas + overlay DragBox */}
        <div style={{ position: "relative", width: DISPLAY_W, height: DISPLAY_H, borderRadius: 14, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,.7)", flexShrink: 0 }}>

          {/* Canvas principale — unica fonte di verità visiva */}
          <canvas ref={canvasRef} style={{ display: "block", width: DISPLAY_W, height: DISPLAY_H, borderRadius: 14 }} />

          {/* Overlay drag boxes — visibili solo se showGrid */}
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

        {/* Pulsante download */}
        <button onClick={handleDownload} disabled={downloading}
          style={{ background: downloading ? "#333" : "#c9a227", color: downloading ? "#666" : "#000", border: "none", borderRadius: 8, padding: "10px 32px", fontSize: 15, fontWeight: 700, cursor: downloading ? "not-allowed" : "pointer", letterSpacing: ".03em", boxShadow: "0 2px 12px rgba(201,162,39,.3)" }}>
          {downloading ? "⏳ Esportazione…" : "⬇ Scarica PNG UHD (4×)"}
        </button>

      </div>

      {/* ── PANNELLO DESTRO — posizioni fini ─────────────────────────────── */}
      <div style={{ width: 220, minWidth: 180, background: "#1a1917", borderLeft: `1px solid ${BD}`, overflowY: "auto", padding: 10 }}>

        <Section title="📍 Posizioni">
          <Lbl>Nome  X / Y</Lbl>
          <Row>
            <TF type="number" value={nameStyle.x} onChange={v => setNameStyle(s => ({ ...s, x: Number(v) }))} />
            <TF type="number" value={nameStyle.y} onChange={v => setNameStyle(s => ({ ...s, y: Number(v) }))} />
          </Row>
          <Lbl>Tipo  X / Y</Lbl>
          <Row>
            <TF type="number" value={typeStyle.x} onChange={v => setTypeStyle(s => ({ ...s, x: Number(v) }))} />
            <TF type="number" value={typeStyle.y} onChange={v => setTypeStyle(s => ({ ...s, y: Number(v) }))} />
          </Row>
          <Lbl>Abilità  X / Y</Lbl>
          <Row>
            <TF type="number" value={abilityStyle.x} onChange={v => setAbilityStyle(s => ({ ...s, x: Number(v) }))} />
            <TF type="number" value={abilityStyle.y} onChange={v => setAbilityStyle(s => ({ ...s, y: Number(v) }))} />
          </Row>
          <Lbl>P/T Frame  X / Y</Lbl>
          <Row>
            <TF type="number" value={ptStyle.frameX} onChange={v => setPtStyle(s => ({ ...s, frameX: Number(v), x: Number(v) }))} />
            <TF type="number" value={ptStyle.frameY} onChange={v => setPtStyle(s => ({ ...s, frameY: Number(v), y: Number(v) }))} />
          </Row>
          <Lbl>P/T Frame  W / H</Lbl>
          <Row>
            <TF type="number" value={ptStyle.width}  onChange={v => setPtStyle(s => ({ ...s, width:  Number(v) }))} />
            <TF type="number" value={ptStyle.height} onChange={v => setPtStyle(s => ({ ...s, height: Number(v) }))} />
          </Row>
        </Section>

        <Section title="💾 Layout JSON">
          <Btn onClick={() => {
            const layout = { nameStyle, typeStyle, abilityStyle, ptStyle };
            const a = document.createElement("a");
            a.href = "data:application/json," + encodeURIComponent(JSON.stringify(layout, null, 2));
            a.download = "token_layout.json"; a.click();
          }} color="#4a4948" small>⬇ Salva layout</Btn>
          <div style={{ marginTop: 6 }}>
            <input type="file" accept=".json" id="layoutUpload" style={{ display: "none" }} onChange={e => {
              const f = e.target.files?.[0]; if (!f) return;
              const r = new FileReader();
              r.onloadend = () => {
                try {
                  const l = JSON.parse(r.result);
                  if (l.nameStyle)    setNameStyle(l.nameStyle);
                  if (l.typeStyle)    setTypeStyle(l.typeStyle);
                  if (l.abilityStyle) setAbilityStyle(l.abilityStyle);
                  if (l.ptStyle)      setPtStyle(l.ptStyle);
                } catch { alert("JSON non valido"); }
              };
              r.readAsText(f); e.target.value = null;
            }} />
            <Btn onClick={() => document.getElementById("layoutUpload").click()} color="#4a4948" small>📂 Carica layout</Btn>
          </div>
        </Section>

      </div>
    </div>
  );
}
