import React, { useState, useRef, useMemo } from "react";
import html2canvas from "html2canvas";

// ── ASSET IMPORTS (identici all'originale) ────────────────────────────────────
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

const framePT = import.meta.glob(
  "/src/assets/frames/pt/*.{png,jpg,jpeg,webp,svg}",
  { eager: true, import: "default" }
);
const PT_FRAMES = Object.entries(framePT).map(([p, url]) => ({
  name: p.split("/").pop().replace(/\.[a-z]+$/, ""), url,
}));

const simbolImport = import.meta.glob(
  "/src/assets/simbol/*.{svg,png,jpg,jpeg,webp}",
  { eager: true, import: "default" }
);

// Dimensioni carta (identiche all'originale)
const CARD_WIDTH = 620, CARD_HEIGHT = 890;

// ── MANA SYMBOL PARSER ────────────────────────────────────────────────────────
function ParsedText({ text, symbolMap, style }) {
  const regex = /{([^}]+)}/g;
  const parts = [];
  let lastIndex = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ t: "txt", v: text.slice(lastIndex, match.index) });
    const sym = match[1].trim();
    const key = Object.keys(symbolMap).find(p => p.split("/").pop().replace(/\.[^/.]+$/, "") === sym);
    parts.push({ t: "sym", v: sym, url: key ? symbolMap[key] : null });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push({ t: "txt", v: text.slice(lastIndex) });
  const sz = style?.fontSize || 16;
  return (
    <span style={style}>
      {parts.map((p, i) =>
        p.t === "txt" ? <span key={i}>{p.v}</span>
        : p.url
          ? <img key={i} src={p.url} alt={`{${p.v}}`} style={{ width: sz * 1.15, height: sz * 1.15, verticalAlign: "middle", display: "inline-block", margin: "0 1px", position: "relative", top: -1 }} />
          : <span key={i} style={{ fontWeight: 700 }}>{`{${p.v}}`}</span>
      )}
    </span>
  );
}

// ── UI COMPONENTS ─────────────────────────────────────────────────────────────
function Accordion({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: "#1c1b19", border: "1px solid #333", borderRadius: 10, overflow: "hidden", marginBottom: 6 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", cursor: "pointer", userSelect: "none", color: "#c9a227", fontWeight: 700, fontSize: ".88rem" }}
      >
        <span>{title}</span>
        <span style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "none", display: "inline-block", fontSize: "1rem" }}>▾</span>
      </div>
      {open && (
        <div style={{ padding: "12px 14px", borderTop: "1px solid #2a2927", display: "flex", flexDirection: "column", gap: 10 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: ".72rem", color: "#797876", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>{children}</div>;
}

function TInput({ value, onChange, disabled, multiline, rows }) {
  const base = { background: "#252420", border: "1px solid #333", borderRadius: 6, color: "#cdccca", padding: "7px 10px", fontSize: ".83rem", width: "100%", outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  if (multiline) return <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows || 4} disabled={disabled} style={{ ...base, resize: "vertical", lineHeight: 1.5 }} />;
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} disabled={disabled} style={base} />;
}

function SliderNum({ label, value, onChange, min, max, step = 0.5 }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", color: "#797876", marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color: "#c9a227", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{typeof value === "number" ? value.toFixed(step < 1 ? 1 : 0) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#c9a227" }} />
    </div>
  );
}

function ColorRow({ label, value, onChange }) {
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 34, height: 30, border: "2px solid #555", borderRadius: 5, background: "none", cursor: "pointer", padding: 0 }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          style={{ background: "#252420", border: "1px solid #333", borderRadius: 6, color: "#cdccca", padding: "5px 8px", fontSize: ".8rem", width: 90, fontFamily: "monospace", outline: "none" }} />
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".83rem", color: "#797876" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 15, height: 15, accentColor: "#c9a227" }} />
      {label}
    </label>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function MagicTokenEditor() {
  const [name, setName] = useState("CONSTRUCT");
  const [nameStyle, setNameStyle] = useState({ fontSize: 29.2, color: "#181818" });

  const [type, setType] = useState("Token Artifact Creature — Construct");
  const [typeStyle, setTypeStyle] = useState({ x: 53, y: 730, fontSize: 22, color: "#181818" });

  const [ability, setAbility] = useState("This creature gets +1/+1 for each {W} you control.\n{T}: Add {G} or {R}.");
  const [abilityStyle, setAbilityStyle] = useState({ x: 44, y: 668, w: 508, h: 144, fontSize: 15.6, color: "#181818" });
  const [showAbility, setShowAbility] = useState(true);

  const [pt, setPT] = useState({ power: "0", toughness: "0" });
  const [ptStyle, setPTStyle] = useState({ frameX: 498, frameY: 778, w: 89, h: 58, fontSize: 34, color: "#181818" });
  const [showPT, setShowPT] = useState(true);

  const allFrameKeys = Object.keys(FRAME_MAP);
  const [mainFrameSet, setMainFrameSet] = useState(allFrameKeys[0] || "");
  const [mainFrameIdx, setMainFrameIdx] = useState(0);
  const [ptFrameIdx, setPTFrameIdx] = useState(0);

  const [showInfoLeft, setShowInfoLeft] = useState(true);
  const [showArtist, setShowArtist] = useState(true);
  const [infoLeft, setInfoLeft] = useState({ year: "2025", rarity: "P", setCode: "MTG", lang: "EN", fontSize: 13, artist: "Jn Avon" });
  const [copyright, setCopyright] = useState({ year: "2025", color: "#b2b2b2", fontSize: 13 });
  const [showCopyright, setShowCopyright] = useState(true);

  const [artUrl, setArtUrl] = useState("");
  const artInput = useRef();
  const cardRef = useRef();
  const symbolMap = simbolImport;

  // Scala display: mantieni le proporzioni originali 620×890
  // La carta viene mostrata a ~480px di larghezza
  const DISPLAY_W = 480;
  const SCALE = DISPLAY_W / CARD_WIDTH; // ~0.774

  const handleArtChange = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setArtUrl(reader.result);
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    const el = cardRef.current;
    const prev = { overflow: el.style.overflow, border: el.style.border, boxShadow: el.style.boxShadow };
    el.style.overflow = "visible"; el.style.border = "none"; el.style.boxShadow = "none";
    try {
      const lib = (await import("html2canvas")).default;
      const canvas = await lib(el, { scale: 3, useCORS: true, logging: false });
      const a = document.createElement("a");
      a.download = `${name.replace(/[^a-zA-Z0-9]/g, "_")}_token.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch (err) { console.error(err); }
    finally { el.style.overflow = prev.overflow; el.style.border = prev.border; el.style.boxShadow = prev.boxShadow; }
  };

  const currentFrame = FRAME_MAP[mainFrameSet]?.[mainFrameIdx];
  const currentPtFrame = PT_FRAMES[ptFrameIdx];

  // ── CARD RENDER ────────────────────────────────────────────────────────────
  // Usiamo transform:scale per scalare l'intera carta (come l'originale)
  // La carta ha dimensioni fisse CARD_WIDTH × CARD_HEIGHT poi scalata con CSS
  const cardWrap = {
    width: CARD_WIDTH * SCALE,
    height: CARD_HEIGHT * SCALE,
    position: "relative",
    flexShrink: 0,
  };
  const cardInner = {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    position: "absolute",
    top: 0, left: 0,
    transform: `scale(${SCALE})`,
    transformOrigin: "top left",
    borderRadius: 18,
    overflow: "hidden",
    boxShadow: "0 8px 40px rgba(0,0,0,.8)",
  };

  // font-face inline per usare i font dalla cartella assets
  const fontFace = `
    @font-face { font-family:'Beleren'; src:url('/src/assets/fonts/Beleren2016-Bold.ttf') format('truetype'); font-weight:bold; }
    @font-face { font-family:'MPlantin'; src:url('/src/assets/fonts/Mplantin.ttf') format('truetype'); }
    @font-face { font-family:'MatrixSC'; src:url('/src/assets/fonts/MatrixBoldSmallCaps Bold.ttf') format('truetype'); }
  `;

  return (
    <>
      <style>{fontFace}{`
        input[type=range]::-webkit-slider-thumb { cursor: pointer; }
        textarea, input { transition: border-color .15s; }
        textarea:focus, input:focus { border-color: #c9a227 !important; }
        .card-dl-btn:hover { filter: brightness(1.12); }
      `}</style>

      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap", padding: "4px 0" }}>

        {/* ═══ CARTA ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <div ref={cardRef} style={cardWrap}>
            <div style={cardInner}>

              {/* Artwork */}
              <div style={{ position: "absolute", top: 88, left: 36, width: 548, height: 404, background: "#0a0a08", overflow: "hidden" }}>
                {artUrl
                  ? <img src={artUrl} alt="art" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.2)", fontSize: 16, fontStyle: "italic" }}>Nessuna immagine</div>
                }
              </div>

              {/* Frame (overlay) */}
              {currentFrame && (
                <img src={currentFrame.url} alt="frame" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", zIndex: 2, pointerEvents: "none" }} />
              )}

              {/* Nome — centrato nella barra superiore */}
              <div style={{ position: "absolute", top: 24, left: 60, right: 80, height: 52, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}>
                <span style={{
                  fontFamily: "'Beleren','MatrixSC','Cinzel',serif",
                  fontSize: nameStyle.fontSize,
                  fontWeight: 700,
                  color: nameStyle.color,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                  lineHeight: 1,
                }}>
                  {name}
                </span>
              </div>

              {/* Riga Tipo */}
              <div style={{ position: "absolute", top: typeStyle.y - 24, left: typeStyle.x, right: 60, height: 30, display: "flex", alignItems: "center", zIndex: 3 }}>
                <span style={{
                  fontFamily: "'Beleren','MatrixSC','Cinzel',serif",
                  fontSize: typeStyle.fontSize,
                  fontWeight: 700,
                  color: typeStyle.color,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                  lineHeight: 1,
                }}>
                  {type}
                </span>
              </div>

              {/* Text box abilità — con word wrap reale */}
              {showAbility && (
                <div style={{
                  position: "absolute",
                  top: abilityStyle.y,
                  left: abilityStyle.x,
                  width: abilityStyle.w,
                  height: abilityStyle.h,
                  zIndex: 3,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "flex-start",
                }}>
                  <div style={{ width: "100%" }}>
                    {ability.split("\n").map((line, i, arr) => (
                      <div key={i} style={{ marginBottom: i < arr.length - 1 ? 5 : 0 }}>
                        <ParsedText
                          text={line}
                          symbolMap={symbolMap}
                          style={{
                            fontFamily: "'MPlantin','Palatino Linotype','Book Antiqua',serif",
                            fontSize: abilityStyle.fontSize,
                            color: abilityStyle.color,
                            lineHeight: 1.45,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            display: "inline",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* P/T Frame */}
              {showPT && currentPtFrame && (
                <img src={currentPtFrame.url} alt="pt"
                  style={{ position: "absolute", left: ptStyle.frameX, top: ptStyle.frameY, width: ptStyle.w, height: ptStyle.h, objectFit: "fill", zIndex: 3, pointerEvents: "none" }}
                />
              )}

              {/* P/T Testo — centrato nel frame P/T */}
              {showPT && (
                <div style={{
                  position: "absolute",
                  left: ptStyle.frameX,
                  top: ptStyle.frameY,
                  width: ptStyle.w,
                  height: ptStyle.h,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 4,
                }}>
                  <span style={{
                    fontFamily: "'Beleren','MatrixSC','Cinzel',serif",
                    fontSize: ptStyle.fontSize,
                    fontWeight: 700,
                    color: ptStyle.color,
                    letterSpacing: ".02em",
                    lineHeight: 1,
                  }}>
                    {pt.power}/{pt.toughness}
                  </span>
                </div>
              )}

              {/* Info bassa sinistra */}
              {showInfoLeft && (
                <div style={{ position: "absolute", left: 10, bottom: 12, zIndex: 3, lineHeight: 1.35 }}>
                  <div style={{ fontSize: infoLeft.fontSize, color: "#a0a0a0", fontFamily: "monospace" }}>{infoLeft.year} {infoLeft.rarity}</div>
                  <div style={{ fontSize: infoLeft.fontSize, color: "#a0a0a0", fontFamily: "monospace" }}>{infoLeft.setCode} • {infoLeft.lang}</div>
                  {showArtist && <div style={{ fontSize: infoLeft.fontSize, color: "#a0a0a0", fontFamily: "monospace" }}>Illus. {infoLeft.artist}</div>}
                </div>
              )}

              {/* Copyright */}
              {showCopyright && (
                <div style={{ position: "absolute", right: 20, bottom: 12, zIndex: 3 }}>
                  <span style={{ fontSize: copyright.fontSize, color: copyright.color, fontFamily: "monospace" }}>© {copyright.year} Wizards of the Coast</span>
                </div>
              )}
            </div>
          </div>

          {/* Download */}
          <button className="card-dl-btn" onClick={handleDownload} style={{
            width: CARD_WIDTH * SCALE,
            background: "#c9a227", color: "#0f0e0c",
            border: "none", borderRadius: 10,
            padding: "12px 0", fontSize: "1rem", fontWeight: 900,
            cursor: "pointer", letterSpacing: ".02em",
          }}>
            ⬇ Scarica PNG UHD
          </button>
        </div>

        {/* ═══ CONTROLS ═══ */}
        <div style={{ flex: 1, minWidth: 280, maxWidth: 440 }}>

          <Accordion title="🖼 Frame & Artwork" defaultOpen={true}>
            <Label>Set Frame</Label>
            <select value={mainFrameSet} onChange={e => { setMainFrameSet(e.target.value); setMainFrameIdx(0); }}
              style={{ background: "#252420", border: "1px solid #333", borderRadius: 6, color: "#cdccca", padding: "7px 10px", fontSize: ".83rem", width: "100%", outline: "none" }}>
              {allFrameKeys.map(k => <option key={k} value={k}>{k.replace("token","").replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^./,a=>a.toUpperCase())||k}</option>)}
            </select>

            {(FRAME_MAP[mainFrameSet]||[]).length > 0 && (
              <>
                <Label>Frame specifico</Label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(FRAME_MAP[mainFrameSet]||[]).map((f,idx) => (
                    <button key={f.url} onClick={() => setMainFrameIdx(idx)}
                      style={{ padding: 2, borderRadius: 4, border: `2px solid ${mainFrameIdx===idx?"#c9a227":"#333"}`, background: "#1a1a17", cursor: "pointer" }}>
                      <img src={f.url} alt={f.name} style={{ width: 38, height: 54, objectFit: "cover", borderRadius: 2, display: "block" }} />
                    </button>
                  ))}
                </div>
              </>
            )}

            {PT_FRAMES.length > 0 && (
              <>
                <Label>Frame P/T</Label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {PT_FRAMES.map((f,idx) => (
                    <button key={f.url} onClick={() => setPTFrameIdx(idx)}
                      style={{ padding: 2, borderRadius: 4, border: `2px solid ${ptFrameIdx===idx?"#c9a227":"#333"}`, background: "#1a1a17", cursor: "pointer" }}>
                      <img src={f.url} alt={f.name} style={{ width: 54, height: 34, objectFit: "cover", borderRadius: 2, display: "block" }} />
                    </button>
                  ))}
                </div>
              </>
            )}

            <button onClick={() => artInput.current.click()}
              style={{ background: "#c9a227", color: "#0f0e0c", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: ".85rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
              🖼 {artUrl ? "Cambia artwork" : "Carica artwork"}
            </button>
            {artUrl && (
              <button onClick={() => setArtUrl("")}
                style={{ background: "none", border: "1px solid #333", borderRadius: 6, color: "#797876", padding: "6px 12px", fontSize: ".8rem", cursor: "pointer" }}>
                ✕ Rimuovi artwork
              </button>
            )}
            <input ref={artInput} type="file" accept="image/*" style={{ display: "none" }} onChange={handleArtChange} />
          </Accordion>

          <Accordion title="✏️ Nome" defaultOpen={true}>
            <Label>Testo</Label>
            <TInput value={name} onChange={setName} />
            <SliderNum label="Font size" value={nameStyle.fontSize} onChange={v => setNameStyle(s=>({...s,fontSize:v}))} min={14} max={48} />
            <ColorRow label="Colore" value={nameStyle.color} onChange={v => setNameStyle(s=>({...s,color:v}))} />
          </Accordion>

          <Accordion title="📋 Tipo">
            <Label>Testo</Label>
            <TInput value={type} onChange={setType} />
            <SliderNum label="Font size" value={typeStyle.fontSize} onChange={v => setTypeStyle(s=>({...s,fontSize:v}))} min={10} max={32} />
            <ColorRow label="Colore" value={typeStyle.color} onChange={v => setTypeStyle(s=>({...s,color:v}))} />
          </Accordion>

          <Accordion title="⚡ Abilità">
            <Toggle checked={showAbility} onChange={setShowAbility} label="Mostra testo abilità" />
            <Label>Testo (usa {"{W}"} {"{U}"} {"{B}"} {"{R}"} {"{G}"} {"{T}"} …)</Label>
            <TInput value={ability} onChange={setAbility} multiline rows={4} disabled={!showAbility} />
            <SliderNum label="Font size" value={abilityStyle.fontSize} onChange={v => setAbilityStyle(s=>({...s,fontSize:v}))} min={8} max={24} step={0.5} />
            <ColorRow label="Colore" value={abilityStyle.color} onChange={v => setAbilityStyle(s=>({...s,color:v}))} />
          </Accordion>

          <Accordion title="⚔️ Power / Toughness">
            <Toggle checked={showPT} onChange={setShowPT} label="Mostra P/T" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <Label>Power</Label>
                <TInput value={pt.power} onChange={v => setPT(p=>({...p,power:v}))} />
              </div>
              <div>
                <Label>Toughness</Label>
                <TInput value={pt.toughness} onChange={v => setPT(p=>({...p,toughness:v}))} />
              </div>
            </div>
            <SliderNum label="Font size" value={ptStyle.fontSize} onChange={v => setPTStyle(s=>({...s,fontSize:v}))} min={16} max={52} />
            <ColorRow label="Colore P/T" value={ptStyle.color} onChange={v => setPTStyle(s=>({...s,color:v}))} />
          </Accordion>

          <Accordion title="ℹ️ Info & Copyright">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><Label>Anno</Label><TInput value={infoLeft.year} onChange={v=>setInfoLeft(s=>({...s,year:v}))} /></div>
              <div><Label>Rarità</Label><TInput value={infoLeft.rarity} onChange={v=>setInfoLeft(s=>({...s,rarity:v}))} /></div>
              <div><Label>Set</Label><TInput value={infoLeft.setCode} onChange={v=>setInfoLeft(s=>({...s,setCode:v}))} /></div>
              <div><Label>Lingua</Label><TInput value={infoLeft.lang} onChange={v=>setInfoLeft(s=>({...s,lang:v}))} /></div>
            </div>
            <Label>Artista</Label>
            <TInput value={infoLeft.artist} onChange={v=>setInfoLeft(s=>({...s,artist:v}))} />
            <SliderNum label="Font size info" value={infoLeft.fontSize} onChange={v=>setInfoLeft(s=>({...s,fontSize:v}))} min={7} max={18} />
            <Toggle checked={showInfoLeft} onChange={setShowInfoLeft} label="Mostra info sinistra" />
            <Toggle checked={showArtist} onChange={setShowArtist} label="Mostra artista" />
            <Toggle checked={showCopyright} onChange={setShowCopyright} label="Mostra copyright" />
          </Accordion>

        </div>
      </div>
    </>
  );
}
