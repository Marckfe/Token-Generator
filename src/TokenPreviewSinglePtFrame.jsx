import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import html2canvas from "html2canvas";

// ── ASSET IMPORTS ─────────────────────────────────────────────────────────────
const ALL_FRAME_SETS = import.meta.glob(
  "/src/assets/frames/masterframes/*/*.{png,jpg,jpeg,webp,svg}",
  { eager: true, import: "default" }
);
const framePT = import.meta.glob(
  "/src/assets/frames/pt/*.{png,jpg,jpeg,webp,svg}",
  { eager: true, import: "default" }
);
const simbolImport = import.meta.glob(
  "/src/assets/simbol/*.{svg,png,jpg,jpeg,webp}",
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
const PT_FRAMES = Object.entries(framePT).map(([p, url]) => ({
  name: p.split("/").pop().replace(/\.[a-z]+$/, ""), url,
}));

// Dimensioni reali carta MTG in px @3x (per download HQ)
const CARD_W = 620, CARD_H = 890;

// ── MANA SYMBOL PARSER ────────────────────────────────────────────────────────
function ManaText({ text, symbolMap, fontSize, color, lineHeight = 1.45 }) {
  const regex = /\{([^}]+)\}/g;
  const parts = [];
  let lastIndex = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: "text", val: text.slice(lastIndex, match.index) });
    const sym = match[1].trim();
    const key = Object.keys(symbolMap).find(p => p.split("/").pop().replace(/\.[^/.]+$/, "") === sym);
    parts.push({ type: "sym", val: sym, url: key ? symbolMap[key] : null });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push({ type: "text", val: text.slice(lastIndex) });

  return (
    <span style={{ fontSize, color, lineHeight, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {parts.map((p, i) =>
        p.type === "text" ? <span key={i}>{p.val}</span>
        : p.url
          ? <img key={i} src={p.url} alt={`{${p.val}}`} style={{ width: fontSize * 1.1, height: fontSize * 1.1, verticalAlign: "middle", display: "inline-block", margin: "0 1px", position: "relative", top: -1 }} />
          : <span key={i} style={{ fontWeight: 700, color: "#c9a227" }}>{`{${p.val}}`}</span>
      )}
    </span>
  );
}

// ── FIELD ROW component ───────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: ".72rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = "text", ...rest }) {
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      style={{ background: "var(--surf-off)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", color: "var(--text)", padding: "7px 10px", fontSize: ".83rem", width: "100%", outline: "none", fontFamily: "inherit", transition: "border-color var(--tr)" }}
      onFocus={e => e.target.style.borderColor = "var(--primary)"}
      onBlur={e => e.target.style.borderColor = "var(--border)"}
      {...rest}
    />
  );
}

function Textarea({ value, onChange, rows = 4 }) {
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)} rows={rows}
      style={{ background: "var(--surf-off)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", color: "var(--text)", padding: "7px 10px", fontSize: ".83rem", width: "100%", outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.5, transition: "border-color var(--tr)" }}
      onFocus={e => e.target.style.borderColor = "var(--primary)"}
      onBlur={e => e.target.style.borderColor = "var(--border)"}
    />
  );
}

function SliderRow({ label, value, onChange, min, max, step = 0.5 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", color: "var(--muted)" }}>
        <span>{label}</span>
        <span style={{ color: "var(--primary)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "var(--primary)", height: 4 }} />
    </div>
  );
}

function Accordion({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
      <div onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 15px", fontSize: ".83rem", fontWeight: 700, color: "var(--primary)", cursor: "pointer", userSelect: "none", transition: "background var(--tr)" }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--surf-off)"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <span>{title}</span>
        <span style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block" }}>▾</span>
      </div>
      {open && <div style={{ padding: "13px 15px", borderTop: "1px solid var(--divider)", display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>}
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function MagicTokenEditor() {
  const allFrameKeys = Object.keys(FRAME_MAP);

  const [name, setName] = useState("CONSTRUCT");
  const [nameColor, setNameColor] = useState("#181818");
  const [nameFontSize, setNameFontSize] = useState(29);

  const [type, setType] = useState("Token Artifact Creature — Construct");
  const [typeColor, setTypeColor] = useState("#181818");
  const [typeFontSize, setTypeFontSize] = useState(18);

  const [ability, setAbility] = useState("This creature gets +1/+1 for each {W} you control.\n{T}: Add {G} or {R}.");
  const [abilityColor, setAbilityColor] = useState("#181818");
  const [abilityFontSize, setAbilityFontSize] = useState(15);
  const [showAbility, setShowAbility] = useState(true);

  const [power, setPower] = useState("0");
  const [toughness, setToughness] = useState("0");
  const [ptColor, setPtColor] = useState("#181818");
  const [ptFontSize, setPtFontSize] = useState(30);
  const [showPT, setShowPT] = useState(true);

  const [mainFrameSet, setMainFrameSet] = useState(allFrameKeys[0] || "");
  const [mainFrameIdx, setMainFrameIdx] = useState(0);
  const [ptFrameIdx, setPtFrameIdx] = useState(0);

  const [year, setYear] = useState("2025");
  const [rarity, setRarity] = useState("P");
  const [setCode, setSetCode] = useState("MTG");
  const [lang, setLang] = useState("EN");
  const [artist, setArtist] = useState("Jn Avon");
  const [showInfo, setShowInfo] = useState(true);
  const [showCopyright, setShowCopyright] = useState(true);
  const [infoFontSize, setInfoFontSize] = useState(11);

  const [artUrl, setArtUrl] = useState("");
  const [downloading, setDownloading] = useState(false);

  const artInput = useRef();
  const cardRef = useRef();
  const symbolMap = simbolImport;

  // Font dalla cartella assets/fonts
  const fontFace = `
    @font-face { font-family: 'CardName'; src: url('/src/assets/fonts/Beleren2016-Bold.ttf') format('truetype'); font-weight: bold; }
    @font-face { font-family: 'CardBody'; src: url('/src/assets/fonts/MPlantin.ttf') format('truetype'); }
    @font-face { font-family: 'CardBodyI'; src: url('/src/assets/fonts/MPlantin-Italic.ttf') format('truetype'); font-style: italic; }
    @font-face { font-family: 'CardType'; src: url('/src/assets/fonts/Beleren2016-Bold.ttf') format('truetype'); }
  `;

  const currentFrame = FRAME_MAP[mainFrameSet]?.[mainFrameIdx];
  const currentPtFrame = PT_FRAMES[ptFrameIdx];

  const handleArtChange = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setArtUrl(reader.result);
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  const handleDownload = async () => {
    if (!cardRef.current || downloading) return;
    setDownloading(true);
    try {
      const el = cardRef.current;
      const prev = { overflow: el.style.overflow, border: el.style.border, boxShadow: el.style.boxShadow };
      el.style.overflow = "visible"; el.style.border = "none"; el.style.boxShadow = "none";
      const canvas = await html2canvas(el, { scale: 3, useCORS: true, logging: false, allowTaint: true });
      el.style.overflow = prev.overflow; el.style.border = prev.border; el.style.boxShadow = prev.boxShadow;
      const link = document.createElement("a");
      link.download = `${name.replace(/[^a-zA-Z0-9]/g, "_")}_token.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) { console.error("Download error:", err); }
    finally { setDownloading(false); }
  };

  // ── CARD PREVIEW ──────────────────────────────────────────────────────────
  // Scala la carta in modo che stia nel contenitore mantenendo le proporzioni reali
  const PREVIEW_W = 310;
  const PREVIEW_H = Math.round(PREVIEW_W * (CARD_H / CARD_W)); // ≈ 445px
  const SCALE = PREVIEW_W / CARD_W; // fattore di scala

  // Posizioni layout reale MTG (in px su base 620×890)
  const layout = {
    // Area artwork: dall'alto ~90px, fino a ~610px
    artTop: 88, artLeft: 36, artW: 548, artH: 404,
    // Frame name bar: ~52px dal top, centrato
    nameTop: 24, nameLeft: 0, nameW: CARD_W,
    // Type line: ~636px dal top
    typeTop: 638, typeLeft: 50, typeW: 520,
    // Text box: ~668px dal top, fino a ~820px
    textTop: 668, textLeft: 44, textW: 508, textH: 144,
    // P/T frame: angolo in basso a destra
    ptFrameRight: 32, ptFrameBottom: 48, ptFrameW: 90, ptFrameH: 56,
    // Info bassa sinistra
    infoLeft: 10, infoBottom: 12,
    // Copyright
    copyrightRight: 20, copyrightBottom: 12,
  };

  const cardStyle = {
    position: "relative",
    width: PREVIEW_W,
    height: PREVIEW_H,
    borderRadius: 14 * SCALE,
    overflow: "hidden",
    boxShadow: "0 8px 40px rgba(0,0,0,.7), 0 0 0 1px rgba(201,162,39,.2)",
    flexShrink: 0,
    background: "#1a1206",
  };

  const abs = (top, left, width, height, extra = {}) => ({
    position: "absolute",
    top: top * SCALE,
    left: left * SCALE,
    width: width ? width * SCALE : undefined,
    height: height ? height * SCALE : undefined,
    ...extra,
  });

  return (
    <>
      <style>{fontFace}</style>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ── CARD PREVIEW ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", flexShrink: 0 }}>
          <div ref={cardRef} style={cardStyle}>

            {/* Artwork */}
            <div style={abs(layout.artTop, layout.artLeft, layout.artW, layout.artH, { overflow: "hidden", background: "#0a0a08" })}>
              {artUrl
                ? <img src={artUrl} alt="artwork" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.18)", fontSize: 11 * SCALE, fontStyle: "italic" }}>Carica artwork</div>
              }
            </div>

            {/* Frame principale (overlay su tutto) */}
            {currentFrame && (
              <img src={currentFrame.url} alt="frame" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none", zIndex: 2 }} />
            )}

            {/* Nome */}
            <div style={{ ...abs(layout.nameTop, layout.nameLeft, layout.nameW, 52), display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3, paddingInline: 60 * SCALE }}>
              <span style={{ fontFamily: "'CardName', 'Cinzel', 'Palatino Linotype', serif", fontSize: nameFontSize * SCALE, fontWeight: 700, color: nameColor, letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", lineHeight: 1 }}>
                {name}
              </span>
            </div>

            {/* Riga Tipo */}
            <div style={{ ...abs(layout.typeTop, layout.typeLeft, layout.typeW, 30), display: "flex", alignItems: "center", zIndex: 3 }}>
              <span style={{ fontFamily: "'CardType', 'Cinzel', serif", fontSize: typeFontSize * SCALE, fontWeight: 700, color: typeColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", lineHeight: 1 }}>
                {type}
              </span>
            </div>

            {/* Text box abilità */}
            {showAbility && (
              <div style={{ ...abs(layout.textTop, layout.textLeft, layout.textW, layout.textH), zIndex: 3, display: "flex", alignItems: "flex-start", overflow: "hidden" }}>
                <div style={{ fontFamily: "'CardBody', 'Palatino Linotype', 'Book Antiqua', serif", width: "100%", lineHeight: 1.45 }}>
                  {ability.split("\n").map((line, i, arr) => (
                    <div key={i} style={{ marginBottom: i < arr.length - 1 ? 4 * SCALE : 0 }}>
                      <ManaText text={line} symbolMap={symbolMap} fontSize={abilityFontSize * SCALE} color={abilityColor} lineHeight={1.45} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* P/T Frame */}
            {showPT && currentPtFrame && (
              <img src={currentPtFrame.url} alt="pt frame"
                style={{ position: "absolute", right: layout.ptFrameRight * SCALE, bottom: layout.ptFrameBottom * SCALE, width: layout.ptFrameW * SCALE, height: layout.ptFrameH * SCALE, objectFit: "fill", zIndex: 3, pointerEvents: "none" }}
              />
            )}

            {/* P/T Testo */}
            {showPT && (
              <div style={{ position: "absolute", right: layout.ptFrameRight * SCALE, bottom: layout.ptFrameBottom * SCALE, width: layout.ptFrameW * SCALE, height: layout.ptFrameH * SCALE, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4 }}>
                <span style={{ fontFamily: "'CardName', 'Cinzel', serif", fontSize: ptFontSize * SCALE, fontWeight: 700, color: ptColor, letterSpacing: ".02em", lineHeight: 1 }}>
                  {power}/{toughness}
                </span>
              </div>
            )}

            {/* Info bassa sinistra */}
            {showInfo && (
              <div style={{ position: "absolute", left: layout.infoLeft * SCALE, bottom: layout.infoBottom * SCALE, zIndex: 3, lineHeight: 1.3 }}>
                <div style={{ fontFamily: "monospace", fontSize: infoFontSize * SCALE, color: "#a0a0a0" }}>{year} {rarity}</div>
                <div style={{ fontFamily: "monospace", fontSize: infoFontSize * SCALE, color: "#a0a0a0" }}>{setCode} • {lang}</div>
                <div style={{ fontFamily: "monospace", fontSize: infoFontSize * SCALE, color: "#a0a0a0" }}>Illus. {artist}</div>
              </div>
            )}

            {/* Copyright */}
            {showCopyright && (
              <div style={{ position: "absolute", right: layout.copyrightRight * SCALE, bottom: layout.copyrightBottom * SCALE, zIndex: 3 }}>
                <span style={{ fontFamily: "monospace", fontSize: infoFontSize * SCALE, color: "#a0a0a0" }}>© {year} Wizards of the Coast</span>
              </div>
            )}
          </div>

          {/* Download button */}
          <button
            onClick={handleDownload} disabled={downloading}
            style={{ background: downloading ? "var(--surf-off)" : "var(--primary)", color: downloading ? "var(--muted)" : "#0f0e0c", border: "none", borderRadius: "var(--r-lg)", padding: "12px 20px", fontSize: ".92rem", fontWeight: 900, cursor: downloading ? "not-allowed" : "pointer", transition: "all var(--tr)", width: PREVIEW_W, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {downloading
              ? <><span style={{ width: 14, height: 14, border: "2px solid rgba(0,0,0,.3)", borderTopColor: "var(--muted)", borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block" }} /> Generazione…</>
              : <>⬇ Scarica PNG UHD</>
            }
          </button>
        </div>

        {/* ── CONTROLS ── */}
        <div style={{ flex: 1, minWidth: 280, maxWidth: 420, display: "flex", flexDirection: "column", gap: 8 }}>

          <Accordion title="🖼 Frame & Artwork" defaultOpen={true}>
            <Field label="Set Frame">
              <select value={mainFrameSet} onChange={e => { setMainFrameSet(e.target.value); setMainFrameIdx(0); }}
                style={{ background: "var(--surf-off)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", color: "var(--text)", padding: "7px 10px", fontSize: ".83rem", width: "100%", outline: "none" }}>
                {allFrameKeys.map(k => <option key={k} value={k}>{k.replace("token", "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, a => a.toUpperCase()) || k}</option>)}
              </select>
            </Field>

            {/* Thumbnails frame */}
            {(FRAME_MAP[mainFrameSet] || []).length > 0 && (
              <Field label="Frame specifico">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(FRAME_MAP[mainFrameSet] || []).map((f, idx) => (
                    <button key={f.url} onClick={() => setMainFrameIdx(idx)}
                      style={{ padding: 2, borderRadius: 4, border: `2px solid ${mainFrameIdx === idx ? "var(--primary)" : "var(--border)"}`, background: "var(--surf-off)", cursor: "pointer", transition: "border-color var(--tr)" }}>
                      <img src={f.url} alt={f.name} style={{ width: 38, height: 54, objectFit: "cover", borderRadius: 2, display: "block" }} />
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {/* Thumbnails P/T frame */}
            {PT_FRAMES.length > 0 && (
              <Field label="Frame P/T">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {PT_FRAMES.map((f, idx) => (
                    <button key={f.url} onClick={() => setPtFrameIdx(idx)}
                      style={{ padding: 2, borderRadius: 4, border: `2px solid ${ptFrameIdx === idx ? "var(--primary)" : "var(--border)"}`, background: "var(--surf-off)", cursor: "pointer", transition: "border-color var(--tr)" }}>
                      <img src={f.url} alt={f.name} style={{ width: 54, height: 34, objectFit: "cover", borderRadius: 2, display: "block" }} />
                    </button>
                  ))}
                </div>
              </Field>
            )}

            <button onClick={() => artInput.current.click()}
              style={{ background: "var(--primary)", color: "#0f0e0c", border: "none", borderRadius: "var(--r-lg)", padding: "9px 16px", fontSize: ".83rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, transition: "all var(--tr)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              {artUrl ? "Cambia artwork" : "Carica artwork"}
            </button>
            {artUrl && <button onClick={() => setArtUrl("")} style={{ background: "none", border: "1px solid var(--border)", borderRadius: "var(--r-md)", color: "var(--muted)", padding: "6px 12px", fontSize: ".8rem", cursor: "pointer" }}>✕ Rimuovi artwork</button>}
            <input ref={artInput} type="file" accept="image/*" style={{ display: "none" }} onChange={handleArtChange} />
          </Accordion>

          <Accordion title="✏️ Nome" defaultOpen={true}>
            <Field label="Testo nome">
              <Input value={name} onChange={setName} />
            </Field>
            <SliderRow label="Font size" value={nameFontSize} onChange={setNameFontSize} min={14} max={48} />
            <Field label="Colore">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="color" value={nameColor} onChange={e => setNameColor(e.target.value)} style={{ width: 34, height: 30, border: "2px solid var(--border)", borderRadius: 5, background: "none", cursor: "pointer", padding: 0 }} />
                <Input value={nameColor} onChange={setNameColor} style={{ fontFamily: "monospace" }} />
              </div>
            </Field>
          </Accordion>

          <Accordion title="📋 Tipo">
            <Field label="Riga tipo">
              <Input value={type} onChange={setType} />
            </Field>
            <SliderRow label="Font size" value={typeFontSize} onChange={setTypeFontSize} min={10} max={32} />
          </Accordion>

          <Accordion title="⚡ Abilità">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".83rem", color: "var(--muted)", cursor: "pointer" }}>
              <input type="checkbox" checked={showAbility} onChange={e => setShowAbility(e.target.checked)} style={{ accentColor: "var(--primary)", width: 15, height: 15 }} />
              Mostra testo abilità
            </label>
            <Field label="Testo (usa {W} {U} {B} {R} {G} {T} {2} …)">
              <Textarea value={ability} onChange={setAbility} rows={4} />
            </Field>
            <SliderRow label="Font size" value={abilityFontSize} onChange={setAbilityFontSize} min={8} max={24} step={0.5} />
            <Field label="Colore">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="color" value={abilityColor} onChange={e => setAbilityColor(e.target.value)} style={{ width: 34, height: 30, border: "2px solid var(--border)", borderRadius: 5, background: "none", cursor: "pointer", padding: 0 }} />
                <Input value={abilityColor} onChange={setAbilityColor} />
              </div>
            </Field>
          </Accordion>

          <Accordion title="⚔️ Power / Toughness">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".83rem", color: "var(--muted)", cursor: "pointer" }}>
              <input type="checkbox" checked={showPT} onChange={e => setShowPT(e.target.checked)} style={{ accentColor: "var(--primary)", width: 15, height: 15 }} />
              Mostra P/T
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Field label="Power"><Input value={power} onChange={setPower} /></Field>
              <Field label="Toughness"><Input value={toughness} onChange={setToughness} /></Field>
            </div>
            <SliderRow label="Font size" value={ptFontSize} onChange={setPtFontSize} min={16} max={52} />
            <Field label="Colore P/T">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="color" value={ptColor} onChange={e => setPtColor(e.target.value)} style={{ width: 34, height: 30, border: "2px solid var(--border)", borderRadius: 5, background: "none", cursor: "pointer", padding: 0 }} />
                <Input value={ptColor} onChange={setPtColor} />
              </div>
            </Field>
          </Accordion>

          <Accordion title="ℹ️ Info & Copyright">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Field label="Anno"><Input value={year} onChange={setYear} /></Field>
              <Field label="Rarità"><Input value={rarity} onChange={setRarity} /></Field>
              <Field label="Set"><Input value={setCode} onChange={setSetCode} /></Field>
              <Field label="Lingua"><Input value={lang} onChange={setLang} /></Field>
            </div>
            <Field label="Artista"><Input value={artist} onChange={setArtist} /></Field>
            <SliderRow label="Font size info" value={infoFontSize} onChange={setInfoFontSize} min={7} max={18} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".83rem", color: "var(--muted)", cursor: "pointer" }}>
                <input type="checkbox" checked={showInfo} onChange={e => setShowInfo(e.target.checked)} style={{ accentColor: "var(--primary)", width: 15, height: 15 }} /> Mostra info
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".83rem", color: "var(--muted)", cursor: "pointer" }}>
                <input type="checkbox" checked={showCopyright} onChange={e => setShowCopyright(e.target.checked)} style={{ accentColor: "var(--primary)", width: 15, height: 15 }} /> Mostra copyright
              </label>
            </div>
          </Accordion>

        </div>
      </div>
    </>
  );
}
