import React, { useState, useRef, useMemo } from "react";
import html2canvas from "html2canvas";
import {
  Accordion, AccordionSummary, AccordionDetails,
  Box, Button, Divider, FormControl, FormGroup, Grid, InputLabel,
  MenuItem, Select, Slider, Switch, TextField, Typography, FormControlLabel
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

/* ── Asset glob (Vite) ───────────────────────────────────────
   Struttura attesa in src/assets/:
     frames/masterframes/{SetName}/*.{png,jpg,jpeg,webp,svg}
     frames/pt/*.{png,jpg,jpeg,webp,svg}
     simbol/*.{svg,png,jpg,jpeg,webp}
────────────────────────────────────────────────────────────── */
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
    map[setKey].push({
      name: path.split("/").pop().replace(/\.[a-z]+$/, ""),
      url: allFrames[path],
    });
  }
  for (const k in map) {
    map[k] = map[k].sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
}

const FRAME_MAP = groupFramesBySet(ALL_FRAME_SETS);

const framePT = import.meta.glob(
  "/src/assets/frames/pt/*.{png,jpg,jpeg,webp,svg}",
  { eager: true, import: "default" }
);
const PT_FRAMES = Object.entries(framePT).map(([p, url]) => ({
  name: p.split("/").pop().replace(/\.[a-z]+$/, ""),
  url,
}));

const simbolImport = import.meta.glob(
  "/src/assets/simbol/*.{svg,png,jpg,jpeg,webp}",
  { eager: true, import: "default" }
);

function getAvailableSymbolsFromFolder(simbolsObj) {
  return Object.keys(simbolsObj).map(p =>
    p.split("/").pop().replace(/\.[^/.]+$/, "")
  );
}

const CARD_WIDTH = 620;
const CARD_HEIGHT = 890;

/* ── ColorControl ────────────────────────────────────────── */
function ColorControl({ setter, keyName, value, label }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
      <Typography variant="body2" sx={{ minWidth: 120, color: "#ccc" }}>{label}</Typography>
      <input
        type="color"
        value={value}
        onChange={e => setter(val => ({ ...val, [keyName]: e.target.value }))}
        style={{
          width: 38, height: 34,
          border: "2.5px solid #555", borderRadius: 5,
          background: "#1a1a1a", margin: 0, cursor: "pointer"
        }}
        aria-label={label}
      />
      <TextField
        value={value}
        onChange={e => setter(val => ({ ...val, [keyName]: e.target.value }))}
        size="small"
        sx={{ ml: 1, maxWidth: 100, "& input": { color: "#eee" }, "& .MuiOutlinedInput-root": { "& fieldset": { borderColor: "#444" } } }}
        inputProps={{ style: { fontFamily: "monospace" }, maxLength: 7 }}
      />
    </Box>
  );
}

/* ── parseManaSymbols ────────────────────────────────────── */
function parseManaSymbols(text, symbolMap) {
  const regex = /{([^}]+)}/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const symbol = match[1].trim();
    const symbolKey = Object.keys(symbolMap).find(p =>
      p.split("/").pop().replace(/\.[^/.]+$/, "") === symbol
    );
    const imgSrc = symbolKey ? symbolMap[symbolKey] : null;
    parts.push(
      imgSrc
        ? <img key={key++} src={imgSrc} alt={`{${symbol}}`}
            style={{ width: 18, height: 18, verticalAlign: "middle", display: "inline-block", margin: "0 1px" }} />
        : `{${match[1]}}`
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/* ── SliderRow ───────────────────────────────────────────── */
function SliderRow({ label, value, min, max, step = 1, setter, keyName }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="caption" sx={{ color: "#aaa" }}>{label}</Typography>
        <TextField
          value={value}
          size="small"
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) setter(s => ({ ...s, [keyName]: Math.min(max, Math.max(min, v)) }));
          }}
          sx={{ width: 72, "& input": { color: "#eee", textAlign: "center", padding: "2px 4px" }, "& .MuiOutlinedInput-root": { "& fieldset": { borderColor: "#444" } } }}
          inputProps={{ style: { fontFamily: "monospace" } }}
        />
      </Box>
      <Slider
        value={typeof value === "number" ? value : min}
        min={min} max={max} step={step}
        onChange={(_, v) => setter(s => ({ ...s, [keyName]: v }))}
        sx={{ color: "#c9a227", "& .MuiSlider-thumb": { width: 14, height: 14 } }}
      />
    </Box>
  );
}

/* ── MagicTokenEditor (main export) ─────────────────────── */
export default function MagicTokenEditor() {
  const [name, setName] = useState("CONSTRUCT");
  const [nameStyle, setNameStyle] = useState({ x: 0, y: 45, fontSize: 29.2, color: "#181818" });

  const [type, setType] = useState("Token Artifact Creature — Construct");
  const [typeStyle, setTypeStyle] = useState({ x: 53, y: 730, fontSize: 24, color: "#181818" });

  const [ability, setAbility] = useState("This creature gets +1/+1 for each {W} you control.\n{T}: Add {G} or {R}.");
  const [abilityStyle, setAbilityStyle] = useState({ x: 43, y: 787, fontSize: 15.6, color: "#181818" });
  const [showAbility, setShowAbility] = useState(true);

  const [pt, setPT] = useState({ power: 0, toughness: 0 });
  const [ptStyle, setPTStyle] = useState({
    x: 503, y: 775, frameX: 498, frameY: 778, width: 89, height: 58,
    fontSize: 36, color: "#181818",
    powerOffsetX: 0, slashOffsetX: 0, toughnessOffsetX: 0
  });
  const [showPT, setShowPT] = useState(true);

  const allFrameKeys = Object.keys(FRAME_MAP);
  const [mainFrameSet, setMainFrameSet] = useState(allFrameKeys[0] || "");
  const [mainFrameIdx, setMainFrameIdx] = useState(0);
  const [ptFrameIdx, setPTFrameIdx] = useState(0);

  const [showInfoLeft, setShowInfoLeft] = useState(true);
  const [showArtist, setShowArtist] = useState(true);
  const [infoLeft, setInfoLeft] = useState({
    year: "2025", rarity: "P", setCode: "MTG", lang: "EN",
    fontSize: 13, x: 9, y: 21, artist: "Jn Avon"
  });

  const [copyright, setCopyright] = useState({ year: "2025", color: "#b2b2b2", x: 24, y: 21, fontSize: 15.5 });
  const [showCopyright, setShowCopyright] = useState(true);

  const [artUrl, setArtUrl] = useState("");
  const artInput = useRef();
  const cardRef = useRef();

  const symbolMap = simbolImport;
  const availableSymbols = useMemo(
    () => getAvailableSymbolsFromFolder(symbolMap),
    [symbolMap]
  );

  const handleDownload = async () => {
    if (!cardRef.current) return;
    const el = cardRef.current;
    const origOverflow = el.style.overflow;
    const origBorder = el.style.border;
    const origShadow = el.style.boxShadow;
    el.style.overflow = "visible";
    el.style.border = "none";
    el.style.boxShadow = "none";
    try {
      const html2canvasLib = (await import("html2canvas")).default;
      const canvas = await html2canvasLib(el, { scale: 3, useCORS: true, logging: false });
      const link = document.createElement("a");
      link.download = `${name.replace(/[^a-zA-Z0-9]/g, "_")}_token.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Errore download:", err);
    } finally {
      el.style.overflow = origOverflow;
      el.style.border = origBorder;
      el.style.boxShadow = origShadow;
    }
  };

  const handleArtChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setArtUrl(reader.result);
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  /* ── CARD PREVIEW ─────────────────────────────────────── */
  const currentFrame = FRAME_MAP[mainFrameSet]?.[mainFrameIdx];
  const currentPTFrame = PT_FRAMES[ptFrameIdx];

  const cardPreview = (
    <Box
      ref={cardRef}
      sx={{
        position: "relative",
        width: CARD_WIDTH, height: CARD_HEIGHT,
        overflow: "hidden", borderRadius: "4.5%",
        boxShadow: "0 8px 40px #000a",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {/* Artwork */}
      {artUrl
        ? <img src={artUrl} alt="artwork" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        : <Box sx={{ position: "absolute", inset: 0, background: "#2a2820", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography sx={{ color: "#555", fontSize: 14 }}>Nessuna immagine</Typography>
          </Box>
      }

      {/* Frame principale */}
      {currentFrame && (
        <img src={currentFrame.url} alt="frame" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }} />
      )}

      {/* Nome */}
      <Typography sx={{
        position: "absolute", left: "50%", top: nameStyle.y,
        transform: `translateX(calc(-50% + ${nameStyle.x}px))`,
        fontSize: nameStyle.fontSize, fontWeight: 900, color: nameStyle.color,
        fontFamily: "serif", letterSpacing: "0.04em", pointerEvents: "none",
        textShadow: "0 1px 2px rgba(255,255,255,0.3)",
      }}>
        {name}
      </Typography>

      {/* Tipo */}
      <Typography sx={{
        position: "absolute", left: typeStyle.x, bottom: CARD_HEIGHT - typeStyle.y,
        fontSize: typeStyle.fontSize, color: typeStyle.color,
        fontFamily: "serif", fontWeight: 600, pointerEvents: "none",
      }}>
        {type}
      </Typography>

      {/* Abilità */}
      {showAbility && (
        <Box sx={{
          position: "absolute", left: abilityStyle.x, bottom: CARD_HEIGHT - abilityStyle.y,
          width: CARD_WIDTH - abilityStyle.x * 2,
          fontSize: abilityStyle.fontSize, color: abilityStyle.color,
          fontFamily: "serif", lineHeight: 1.35, pointerEvents: "none",
          whiteSpace: "pre-wrap",
        }}>
          {parseManaSymbols(ability, symbolMap)}
        </Box>
      )}

      {/* Frame P/T */}
      {showPT && currentPTFrame && (
        <img src={currentPTFrame.url} alt="pt-frame" style={{
          position: "absolute", left: ptStyle.frameX, top: ptStyle.frameY,
          width: ptStyle.width, height: ptStyle.height, pointerEvents: "none",
        }} />
      )}

      {/* P/T values */}
      {showPT && (
        <Typography sx={{
          position: "absolute", left: ptStyle.x, top: ptStyle.y,
          fontSize: ptStyle.fontSize, fontWeight: 900, color: ptStyle.color,
          fontFamily: "serif", pointerEvents: "none",
          display: "flex", gap: "2px",
        }}>
          <span style={{ transform: `translateX(${ptStyle.powerOffsetX}px)` }}>{pt.power}</span>
          <span style={{ transform: `translateX(${ptStyle.slashOffsetX}px)` }}>/</span>
          <span style={{ transform: `translateX(${ptStyle.toughnessOffsetX}px)` }}>{pt.toughness}</span>
        </Typography>
      )}

      {/* Info basso sx */}
      {showInfoLeft && (
        <Box sx={{ position: "absolute", left: infoLeft.x, bottom: infoLeft.y, pointerEvents: "none" }}>
          <Typography sx={{ fontSize: infoLeft.fontSize, color: "#aaa", lineHeight: 1.2, fontFamily: "monospace" }}>
            {infoLeft.year} {infoLeft.rarity}
          </Typography>
          <Typography sx={{ fontSize: infoLeft.fontSize, color: "#aaa", lineHeight: 1.2, fontFamily: "monospace" }}>
            {infoLeft.setCode} • {infoLeft.lang}
          </Typography>
          {showArtist && (
            <Typography sx={{ fontSize: infoLeft.fontSize - 1, color: "#888", fontFamily: "monospace" }}>
              Illus. {infoLeft.artist}
            </Typography>
          )}
        </Box>
      )}

      {/* Copyright */}
      {showCopyright && (
        <Typography sx={{
          position: "absolute", right: copyright.x, bottom: copyright.y,
          fontSize: copyright.fontSize / 2, color: copyright.color,
          fontFamily: "monospace", pointerEvents: "none",
        }}>
          © {copyright.year} Wizards of the Coast
        </Typography>
      )}
    </Box>
  );

  /* ── SIDEBAR CONTROLS ────────────────────────────────── */
  const accordionSx = {
    background: "#1c1a16", color: "#e8e4d8",
    "&:before": { display: "none" },
    border: "1px solid #3a3830",
    borderRadius: "8px !important",
    mb: 1,
  };
  const summaryTextSx = { fontWeight: 700, fontSize: 13, color: "#c9a227" };

  return (
    <Box sx={{ display: "flex", gap: 3, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* ── Card Preview ── */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", flexShrink: 0 }}>
        {cardPreview}
        <Button
          variant="contained"
          onClick={handleDownload}
          sx={{
            borderRadius: 3, fontWeight: 900, fontSize: 15,
            background: "#c9a227", color: "#0f0e0c",
            "&:hover": { background: "#e6b82a" },
            textTransform: "none", px: 4, py: 1.2,
          }}
        >
          Scarica come PNG UHD
        </Button>
      </Box>

      {/* ── Controls ── */}
      <Box sx={{ flex: 1, minWidth: 300, maxWidth: 420, display: "flex", flexDirection: "column", gap: 1 }}>

        {/* Frame & Artwork */}
        <Accordion defaultExpanded sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "#c9a227" }} />}>
            <Typography sx={summaryTextSx}>Frame & Artwork</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {/* Set frame selector */}
            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
              <InputLabel sx={{ color: "#888" }}>Set Frame</InputLabel>
              <Select
                value={mainFrameSet}
                label="Set Frame"
                onChange={e => { setMainFrameSet(e.target.value); setMainFrameIdx(0); }}
                sx={{ color: "#eee", "& .MuiOutlinedInput-notchedOutline": { borderColor: "#444" } }}
              >
                {allFrameKeys.map(k => (
                  <MenuItem key={k} value={k}>
                    {k.replace("token", "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, a => a.toUpperCase()) || k}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Frame thumbnails */}
            <Typography variant="caption" sx={{ color: "#888", mb: 0.5, display: "block" }}>Frame specifico:</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
              {(FRAME_MAP[mainFrameSet] || []).map((f, idx) => (
                <Box
                  key={f.url}
                  onClick={() => setMainFrameIdx(idx)}
                  sx={{
                    width: 44, height: 62, borderRadius: 1, overflow: "hidden", cursor: "pointer",
                    border: idx === mainFrameIdx ? "2px solid #c9a227" : "2px solid #444",
                    transition: "border-color 0.15s",
                  }}
                >
                  <img src={f.url} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </Box>
              ))}
              {(FRAME_MAP[mainFrameSet] || []).length === 0 && (
                <Typography variant="caption" sx={{ color: "#555" }}>
                  Nessun frame — aggiungi PNG in src/assets/frames/masterframes/{mainFrameSet || "SetName"}/
                </Typography>
              )}
            </Box>

            {/* PT Frame */}
            <Typography variant="caption" sx={{ color: "#888", mb: 0.5, display: "block" }}>Frame P/T:</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
              {PT_FRAMES.map((f, idx) => (
                <Box key={f.url} onClick={() => setPTFrameIdx(idx)}
                  sx={{
                    width: 60, height: 38, borderRadius: 1, overflow: "hidden", cursor: "pointer",
                    border: idx === ptFrameIdx ? "2px solid #c9a227" : "2px solid #444",
                  }}
                >
                  <img src={f.url} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </Box>
              ))}
              {PT_FRAMES.length === 0 && (
                <Typography variant="caption" sx={{ color: "#555" }}>Aggiungi PNG in src/assets/frames/pt/</Typography>
              )}
            </Box>

            {/* Artwork */}
            <Typography variant="caption" sx={{ color: "#888", mb: 0.5, display: "block" }}>Artwork</Typography>
            <Button variant="outlined" onClick={() => artInput.current.click()}
              sx={{ borderRadius: 2, fontWeight: 700, fontSize: 13, borderColor: "#c9a227", color: "#c9a227", textTransform: "none", mb: 1 }}>
              Carica immagine
            </Button>
            {artUrl && (
              <Button onClick={() => setArtUrl("")} size="small"
                sx={{ ml: 1, color: "#f87171", borderColor: "#f87171", textTransform: "none" }} variant="outlined">
                Rimuovi
              </Button>
            )}
            <input ref={artInput} type="file" accept="image/*" style={{ display: "none" }} onChange={handleArtChange} />
          </AccordionDetails>
        </Accordion>

        {/* Nome */}
        <Accordion sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "#c9a227" }} />}>
            <Typography sx={summaryTextSx}>Nome</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <TextField fullWidth size="small" value={name} onChange={e => setName(e.target.value)}
              sx={{ mb: 1, "& input": { color: "#eee" }, "& .MuiOutlinedInput-root": { "& fieldset": { borderColor: "#444" } } }} />
            <SliderRow label="Font Size" value={nameStyle.fontSize} min={10} max={60} step={0.2} setter={setNameStyle} keyName="fontSize" />
            <SliderRow label="Offset X" value={nameStyle.x} min={-200} max={200} setter={setNameStyle} keyName="x" />
            <SliderRow label="Pos Y" value={nameStyle.y} min={0} max={200} setter={setNameStyle} keyName="y" />
            <ColorControl setter={setNameStyle} keyName="color" value={nameStyle.color} label="Colore" />
          </AccordionDetails>
        </Accordion>

        {/* Tipo */}
        <Accordion sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "#c9a227" }} />}>
            <Typography sx={summaryTextSx}>Tipo</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <TextField fullWidth size="small" value={type} onChange={e => setType(e.target.value)}
              sx={{ mb: 1, "& input": { color: "#eee" }, "& .MuiOutlinedInput-root": { "& fieldset": { borderColor: "#444" } } }} />
            <SliderRow label="Font Size" value={typeStyle.fontSize} min={8} max={40} step={0.2} setter={setTypeStyle} keyName="fontSize" />
            <SliderRow label="Pos X" value={typeStyle.x} min={0} max={400} setter={setTypeStyle} keyName="x" />
            <SliderRow label="Pos Y" value={typeStyle.y} min={600} max={900} setter={setTypeStyle} keyName="y" />
            <ColorControl setter={setTypeStyle} keyName="color" value={typeStyle.color} label="Colore" />
          </AccordionDetails>
        </Accordion>

        {/* Abilità */}
        <Accordion sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "#c9a227" }} />}>
            <Typography sx={summaryTextSx}>Abilità</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <FormControlLabel
              control={<Switch checked={showAbility} onChange={e => setShowAbility(e.target.checked)} sx={{ "& .MuiSwitch-thumb": { bgcolor: "#c9a227" } }} />}
              label={<Typography sx={{ color: "#ccc", fontSize: 13 }}>Mostra testo Abilità</Typography>}
              sx={{ mb: 1 }}
            />
            <TextField fullWidth multiline minRows={3} size="small" value={ability}
              onChange={e => setAbility(e.target.value)} disabled={!showAbility}
              sx={{ mb: 1, "& textarea": { color: "#eee" }, "& .MuiOutlinedInput-root": { "& fieldset": { borderColor: "#444" } } }} />
            <Typography variant="caption" sx={{ color: "#666", display: "block", mb: 1 }}>
              Simboli disponibili: {availableSymbols.length > 0 ? availableSymbols.join(", ") : "nessuno (aggiungi SVG in src/assets/simbol/)"}
            </Typography>
            <SliderRow label="Font Size" value={abilityStyle.fontSize} min={8} max={30} step={0.2} setter={setAbilityStyle} keyName="fontSize" />
            <ColorControl setter={setAbilityStyle} keyName="color" value={abilityStyle.color} label="Colore" />
          </AccordionDetails>
        </Accordion>

        {/* Power / Toughness */}
        <Accordion sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "#c9a227" }} />}>
            <Typography sx={summaryTextSx}>Power / Toughness</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <FormControlLabel
              control={<Switch checked={showPT} onChange={e => setShowPT(e.target.checked)} sx={{ "& .MuiSwitch-thumb": { bgcolor: "#c9a227" } }} />}
              label={<Typography sx={{ color: "#ccc", fontSize: 13 }}>Mostra P/T</Typography>}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
              <TextField label="Power" size="small" value={pt.power}
                onChange={e => setPT(p => ({ ...p, power: e.target.value }))}
                sx={{ flex: 1, "& input": { color: "#eee" }, "& .MuiOutlinedInput-root": { "& fieldset": { borderColor: "#444" } }, "& label": { color: "#888" } }} />
              <TextField label="Toughness" size="small" value={pt.toughness}
                onChange={e => setPT(p => ({ ...p, toughness: e.target.value }))}
                sx={{ flex: 1, "& input": { color: "#eee" }, "& .MuiOutlinedInput-root": { "& fieldset": { borderColor: "#444" } }, "& label": { color: "#888" } }} />
            </Box>
            <SliderRow label="Font Size" value={ptStyle.fontSize} min={12} max={60} setter={setPTStyle} keyName="fontSize" />
            <SliderRow label="Pos X" value={ptStyle.x} min={300} max={620} setter={setPTStyle} keyName="x" />
            <SliderRow label="Pos Y" value={ptStyle.y} min={600} max={890} setter={setPTStyle} keyName="y" />
            <SliderRow label="Frame X" value={ptStyle.frameX} min={300} max={620} setter={setPTStyle} keyName="frameX" />
            <SliderRow label="Frame Y" value={ptStyle.frameY} min={600} max={890} setter={setPTStyle} keyName="frameY" />
            <SliderRow label="Frame W" value={ptStyle.width} min={40} max={200} setter={setPTStyle} keyName="width" />
            <SliderRow label="Frame H" value={ptStyle.height} min={20} max={120} setter={setPTStyle} keyName="height" />
            <SliderRow label="Power Offset X" value={ptStyle.powerOffsetX} min={-30} max={30} setter={setPTStyle} keyName="powerOffsetX" />
            <SliderRow label="Slash Offset X" value={ptStyle.slashOffsetX} min={-30} max={30} setter={setPTStyle} keyName="slashOffsetX" />
            <SliderRow label="Toughness Offset X" value={ptStyle.toughnessOffsetX} min={-30} max={30} setter={setPTStyle} keyName="toughnessOffsetX" />
            <ColorControl setter={setPTStyle} keyName="color" value={ptStyle.color} label="Colore" />
          </AccordionDetails>
        </Accordion>

        {/* Info & Copyright */}
        <Accordion sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "#c9a227" }} />}>
            <Typography sx={summaryTextSx}>Info Basso & Copyright</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <FormControlLabel
              control={<Switch checked={showInfoLeft} onChange={e => setShowInfoLeft(e.target.checked)} />}
              label={<Typography sx={{ color: "#ccc", fontSize: 13 }}>Mostra Info</Typography>}
              sx={{ mb: 1 }}
            />
            <FormControlLabel
              control={<Switch checked={showArtist} onChange={e => setShowArtist(e.target.checked)} disabled={!showInfoLeft} />}
              label={<Typography sx={{ color: "#ccc", fontSize: 13 }}>Mostra Artista</Typography>}
              sx={{ mb: 1 }}
            />
            {[["Anno", "year"], ["Rarità", "rarity"], ["Set", "setCode"], ["Lingua", "lang"], ["Artista", "artist"]].map(([label, key]) => (
              <TextField key={key} label={label} size="small" fullWidth
                value={infoLeft[key]}
                onChange={e => setInfoLeft(v => ({ ...v, [key]: e.target.value }))}
                disabled={!showInfoLeft || (key === "artist" && !showArtist)}
                sx={{ mb: 1, "& input": { color: "#eee" }, "& .MuiOutlinedInput-root": { "& fieldset": { borderColor: "#444" } }, "& label": { color: "#888" } }}
              />
            ))}
            <Divider sx={{ my: 1, borderColor: "#333" }} />
            <FormControlLabel
              control={<Switch checked={showCopyright} onChange={e => setShowCopyright(e.target.checked)} />}
              label={<Typography sx={{ color: "#ccc", fontSize: 13 }}>Mostra Copyright</Typography>}
              sx={{ mb: 1 }}
            />
            <TextField label="Anno copyright" size="small" fullWidth
              value={copyright.year}
              onChange={e => setCopyright(v => ({ ...v, year: e.target.value }))}
              disabled={!showCopyright}
              sx={{ mb: 1, "& input": { color: "#eee" }, "& .MuiOutlinedInput-root": { "& fieldset": { borderColor: "#444" } }, "& label": { color: "#888" } }}
            />
            <ColorControl setter={setCopyright} keyName="color" value={copyright.color} label="Colore copyright" />
          </AccordionDetails>
        </Accordion>

      </Box>
    </Box>
  );
}
