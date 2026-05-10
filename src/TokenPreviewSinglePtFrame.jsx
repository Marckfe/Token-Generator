
import React, { useState, useRef, useMemo } from "react";
import html2canvas from "html2canvas";
import {
  Accordion, AccordionSummary, AccordionDetails,
  Box, Button, Divider, FormControl, FormGroup, Grid, InputLabel,
  MenuItem, Select, Slider, Switch, TextField, Typography, FormControlLabel
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

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
  // Estrae tutti i simboli validi dal nome del file
  // esempio: "/src/assets/simbol/W.svg" => 'W'
  return Object.keys(simbolsObj).map(p =>
    p.split("/").pop().replace(/\.[^/.]+$/, "")
  );
}

const CARD_WIDTH = 620, CARD_HEIGHT = 890;

function ColorControl({ setter, keyName, value, label }) {
  return (
    <Grid container spacing={1} alignItems="center" sx={{ mb: 2 }}>
      <Grid item xs={12}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          {label}
        </Typography>
      </Grid>
      <Grid item>
        <input
          type="color"
          value={value}
          onChange={e => setter(val => ({ ...val, [keyName]: e.target.value }))}
          style={{
            width: 38,
            height: 34,
            border: "2.5px solid #777",
            borderRadius: 5,
            background: "#f9fafb",
            margin: 0,
            cursor: "pointer"
          }}
          aria-label={label}
        />
      </Grid>
      <Grid item xs>
        <TextField
          label="Hex"
          value={value}
          size="small"
          variant="outlined"
          onChange={e =>
            setter(val => ({ ...val, [keyName]: e.target.value }))
          }
          sx={{ ml: 1, maxWidth: 100 }}
          inputProps={{
            style: { fontFamily: "monospace" },
            maxLength: 7
          }}
        />
      </Grid>
    </Grid>
  );
}

// Parser per sostituire {SYMBOL} con l'immagine dalla cartella simboli
function parseManaSymbols(text, symbolMap) {
  const regex = /{([^}]+)}/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  // Calcola l'elenco simboli validi solo una volta
  const validSymbols = useMemo(() =>
    Object.keys(symbolMap).map(p =>
      p.split("/").pop().replace(/\.[^/.]+$/, "")
    )
  , [symbolMap]);

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const symbol = match[1].trim();
    // Trova la key della mappa con il simbolo richiesto (case sensitive)
    const symbolKey = Object.keys(symbolMap).find(p =>
      p.split("/").pop().replace(/\.[^/.]+$/, "") === symbol
    );
    let imgSrc = symbolKey ? symbolMap[symbolKey] : null;
    parts.push(
      imgSrc ?
        <img
          key={`manaimg-${key++}`}
          src={imgSrc}
          alt={`{${symbol}}`}
          style={{
            width: '22px',
            height: '22px',
            verticalAlign: 'middle',
            margin: '0 2px',
            display: 'inline-block',
          }}
        />
      :
        `{${match[1]}}`
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export default function MagicTokenEditor() {
  const [name, setName] = useState("CONSTRUCT");
  const [nameStyle, setNameStyle] = useState({ x: 0, y: 45, fontSize: 29.2, color: "#181818" });

  const [type, setType] = useState("Token Artifact Creature â€” Construct");
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

  function handleSlider(setter, key) {
    return (event, newValue) => {
      if (typeof newValue === 'number') {
        setter(val => ({ ...val, [key]: newValue }));
      }
    };
  }
  function handleInputChange(setter, key, min, max) {
    return e => {
      const value = e.target.value;
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        let clampedValue = numValue;
        if (min !== undefined) clampedValue = Math.max(min, clampedValue);
        if (max !== undefined) clampedValue = Math.min(max, clampedValue);
        setter(val => ({ ...val, [key]: clampedValue }));
      } else if (value === '') {
        setter(val => ({ ...val, [key]: value }));
      }
    };
  }
  const handleInputBlur = (setter, key, min, max, defaultValue = min !== undefined ? min : 0) => (e) => {
    const value = e.target.value;
    const numValue = parseFloat(value);
    if (value === '' || isNaN(numValue)) {
      setter(val => ({ ...val, [key]: defaultValue }));
    } else {
      let clampedValue = numValue;
      if (min !== undefined) clampedValue = Math.max(min, clampedValue);
      if (max !== undefined) clampedValue = Math.min(max, clampedValue);
      if (clampedValue !== numValue) {
        setter(val => ({ ...val, [key]: clampedValue }));
      } else {
        setter(val => ({ ...val, [key]: numValue }));
      }
    }
  };
  const handleDownload = async () => {
    if (!cardRef.current) return;
    const cardElement = cardRef.current;
    const originalOverflow = cardElement.style.overflow;
    const originalBorder = cardElement.style.border;
    const originalBoxShadow = cardElement.style.boxShadow;
    cardElement.style.overflow = 'visible';
    cardElement.style.border = 'none';
    cardElement.style.boxShadow = 'none';
    try {
      const html2canvasLib = (await import('html2canvas')).default;
      const canvas = await html2canvasLib(cardElement, {
        scale: 3, useCORS: true, logging: false
      });
      const link = document.createElement("a");
      link.download = `${name.replace(/[^a-zA-Z0-9]/g, '_')}_token.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Errore durante il download:", error);
    } finally {
      cardElement.style.overflow = originalOverflow;
      cardElement.style.border = originalBorder;
      cardElement.style.boxShadow = originalBoxShadow;
    }
  };
  const handleArtChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setArtUrl(reader.result);
      };
      reader.onerror = (error) => {
        console.error("Errore FileReader:", error);
      };
      reader.readAsDataURL(file);
      e.target.value = null;
    }
  };

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: "100%",
        bgcolor: "#f5f7fa",
        p: { xs: 1, md: 4 },
        boxSizing: "border-box"
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          justifyContent: "flex-start",
          alignItems: { xs: "center", md: "flex-start" },
          gap: { xs: 2, md: 6 },
          width: "100%",
          maxWidth: "100%"
        }}
      >
        <Box ref={cardRef}
          sx={{
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            position: "relative",
            background: "#deefff",
            overflow: "hidden",
            borderRadius: '17px',
            boxShadow: 6,
            flexShrink: 0,
            mr: { md: 4, xs: 0 },
            alignSelf: "flex-start",
            left: 0
          }}>
          {artUrl
            ? <img src={artUrl} alt="Token artwork" crossOrigin="anonymous" style={{
              position: "absolute", width: "100%", height: "100%", objectFit: "cover",
              left: 0, top: 0, zIndex: 1, borderRadius: '17px'
            }} />
            : <Box sx={{
              position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
              background: "#ccd7ee", color: "#9ab", fontSize: 22, display: "flex",
              alignItems: "center", justifyContent: "center", zIndex: 1, borderRadius: '17px'
            }}>
              Nessuna immagine
            </Box>
          }
          {FRAME_MAP[mainFrameSet] && FRAME_MAP[mainFrameSet][mainFrameIdx] && (
            <img
              src={FRAME_MAP[mainFrameSet][mainFrameIdx].url}
              alt={FRAME_MAP[mainFrameSet][mainFrameIdx].name}
              style={{
                position: "absolute", left: 0, top: 0,
                width: "100%", height: "100%",
                zIndex: 8, pointerEvents: "none"
              }}
            />
          )}

          <Typography component="div" sx={{
            position: "absolute", left: nameStyle.x, top: nameStyle.y,
            color: nameStyle.color, fontSize: nameStyle.fontSize, fontWeight: 700, textAlign: "center",
            fontFamily: "BelerenBold, Beleren, serif", letterSpacing: ".13em", zIndex: 30,
            width: CARD_WIDTH
          }}>{name}</Typography>

          <Typography component="div" sx={{
            position: "absolute", left: typeStyle.x, top: typeStyle.y,
            color: typeStyle.color, fontSize: typeStyle.fontSize, fontWeight: 680, textAlign: "left",
            fontFamily: "MatrixBoldSmallCaps, MatrixBold, serif", letterSpacing: ".01em", zIndex: 29,
            whiteSpace: "pre-line"
          }}>{type}</Typography>

          {showAbility && (
            <Typography component="div" sx={{
              position: "absolute", left: abilityStyle.x, top: abilityStyle.y,
              color: abilityStyle.color, fontSize: abilityStyle.fontSize,
              textAlign: "left", fontFamily: "Matrix, serif",
              fontWeight: 500, padding: "2px 9px", background: "rgba(255,255,255,0.02)",
              borderRadius: 7, zIndex: 25, whiteSpace: "pre-line"
            }}>
              {parseManaSymbols(ability, symbolMap)}
            </Typography>
          )}

          {showPT && PT_FRAMES[ptFrameIdx] && (
            <img
              src={PT_FRAMES[ptFrameIdx].url}
              alt={PT_FRAMES[ptFrameIdx].name}
              style={{
                position: "absolute",
                left: ptStyle.frameX, top: ptStyle.frameY,
                width: ptStyle.width, height: ptStyle.height,
                zIndex: 45, pointerEvents: "none"
              }}
            />
          )}

          {showPT && (
            <Box component="div" sx={{
              position: "absolute", left: ptStyle.x, top: ptStyle.y,
              width: ptStyle.width, height: ptStyle.height, zIndex: 50,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <Typography component="span" sx={{
                fontFamily: "MatrixBoldSmallCaps, serif", fontSize: ptStyle.fontSize,
                color: ptStyle.color, fontWeight: 800, letterSpacing: ".003em",
                transform: `translateX(${ptStyle.powerOffsetX}px)`
              }}>
                {pt.power}
              </Typography>
              <Typography component="span" sx={{
                fontFamily: "MatrixBoldSmallCaps, serif", fontSize: ptStyle.fontSize,
                color: ptStyle.color, fontWeight: 800, letterSpacing: ".003em",
                transform: `translateX(${ptStyle.slashOffsetX}px)`
              }}>
                /
              </Typography>
              <Typography component="span" sx={{
                fontFamily: "MatrixBoldSmallCaps, serif", fontSize: ptStyle.fontSize,
                color: ptStyle.color, fontWeight: 800, letterSpacing: ".003em",
                transform: `translateX(${ptStyle.toughnessOffsetX}px)`
              }}>
                {pt.toughness}
              </Typography>
            </Box>
          )}

          {showInfoLeft && (
            <Typography component="div" sx={{
              position: "absolute", left: infoLeft.x, bottom: infoLeft.y,
              fontFamily: "MatrixBoldSmallCaps, serif", fontSize: infoLeft.fontSize,
              color: "#fff", letterSpacing: ".055em", zIndex: 90,
              display: "flex", flexDirection: "row", alignItems: "center"
            }}>
              <Box component="span" sx={{ marginRight: 0.5, fontWeight: 600 }}>
                {infoLeft.year} {infoLeft.rarity}
              </Box>
              <Box component="span" sx={{ marginRight: 0.5, fontWeight: 600 }}>
                {infoLeft.setCode} â€¢ {infoLeft.lang}
              </Box>
              {showArtist && (
                <Box component="span"
                  sx={{
                    marginLeft: 1,
                    fontFamily: "Matrix, serif",
                    fontSize: infoLeft.fontSize - 1, color: "#fff"
                  }}>
                  Illus. <Box component="b">{infoLeft.artist}</Box>
                </Box>
              )}
            </Typography>
          )}

          {showCopyright && (
          <Typography component="div" sx={{
            position: "absolute", right: copyright.x, bottom: copyright.y,
            color: copyright.color, fontFamily: "Matrix, serif", fontSize: copyright.fontSize, zIndex: 99
          }}>
            Â© {copyright.year} Wizards of the Coast
          </Typography>
          )}
        </Box>
        <Box
          sx={{
            width: { xs: "100%", md: 470 },
            bgcolor: 'background.paper',
            borderRadius: '18px',
            boxShadow: 4,
            p: 1,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            alignSelf: "flex-start",
            minWidth: { xs: "unset", md: 320 },
            maxWidth: 520,
            overflowY: "auto"
          }}
        >

          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={700}>Frame & Artwork</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FormGroup sx={{ mb: 1 }}>
                <FormControl fullWidth margin="normal">
                  <InputLabel id="main-frame-set-label">Set Frame</InputLabel>
                  <Select
                    labelId="main-frame-set-label"
                    value={mainFrameSet}
                    label="Set Frame"
                    onChange={e => { setMainFrameSet(e.target.value); setMainFrameIdx(0); }}
                  >
                    {allFrameKeys.map(setKey => (
                      <MenuItem value={setKey} key={setKey}>
                        {setKey.replace("token", "").replace(/([a-z])([A-Z])/g, "\\\\$1 \$2").replace(/^./, a => a.toUpperCase())}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>Frame specifico:</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {(FRAME_MAP[mainFrameSet] || []).map((f, idx) => (
                    <Button
                      variant={idx === mainFrameIdx ? "contained" : "outlined"}
                      onClick={() => setMainFrameIdx(idx)}
                      key={f.url}
                      sx={{ p: '2.5px', minWidth: 0, '& img': { borderRadius: '2px' } }}
                    >
                      <img src={f.url} alt={f.name} style={{ width: 41, height: 56, objectFit: "cover" }} />
                    </Button>
                  ))}
                </Box>
                <Typography variant="subtitle1" sx={{ mt: 2, mb: 0 }}>Frame P/T</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {PT_FRAMES.map((f, idx) => (
                    <Button
                      variant={idx === ptFrameIdx ? "contained" : "outlined"}
                      onClick={() => setPTFrameIdx(idx)}
                      key={f.url}
                      sx={{ p: '2.5px', minWidth: 0, '& img': { borderRadius: '2px' } }}
                    >
                      <img src={f.url} alt={f.name} style={{ width: 33, height: 24, objectFit: "contain" }} />
                    </Button>
                  ))}
                </Box>
                <Divider sx={{my:2}} />
                <Typography variant="subtitle1" sx={{ mt: 2, mb: 0 }}>Artwork</Typography>
                <Button
                  variant="outlined"
                  color="white"
                  onClick={() => artInput.current.click()}
                  sx={{ borderRadius: 13,
                fontWeight: 900,
                fontSize: 18,
                minWidth: 200,
                py: 1.45,
                px: 2.8,
                boxShadow: "0 0 16px 3px #6366f14f, 0 2px 10px #fff3",
                background: "linear-gradient(99deg,#6366f1 67%,#818cf8 100%)",
                textTransform: "none",
                transition: "all 220ms cubic-bezier(.41,.98,.25,1.13)" }}
                >
                  Carica immagine
                </Button>
                <input ref={artInput} type="file" accept="image/*" hidden onChange={handleArtChange} />
                {artUrl && (
                  <img src={artUrl} alt="preview" style={{ width: "100%", borderRadius: 5, objectFit: "cover" }} />
                )}
              </FormGroup>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={700}>Nome</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField label="Nome" value={name} fullWidth sx={{ mb: 1 }} onChange={e => setName(e.target.value)} />
              <ColorControl setter={setNameStyle} keyName="color" value={nameStyle.color} label="Colore" />
              <Slider
                value={nameStyle.fontSize}
                min={18} max={60} step={0.2}
                onChange={handleSlider(setNameStyle, "fontSize")}
                sx={{ mt: 2 }}
                valueLabelDisplay="auto"
                marks={[{ value: 18, label: "18" }, { value: 29.2, label: "Default" }, { value: 60, label: "60" }]}
              />
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField label="Pos X" type="number"
                  value={nameStyle.x}
                  onChange={handleInputChange(setNameStyle, "x", 0)}
                  onBlur={handleInputBlur(setNameStyle, "x", 0, CARD_WIDTH - 50)}
                  size="small" />
                <TextField label="Pos Y" type="number"
                  value={nameStyle.y}
                  onChange={handleInputChange(setNameStyle, "y", 0)}
                  onBlur={handleInputBlur(setNameStyle, "y", 0, CARD_HEIGHT)}
                  size="small" />
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={700}>Tipo</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField label="Tipo" value={type} fullWidth sx={{ mb: 1 }} onChange={e => setType(e.target.value)} />
              <ColorControl setter={setTypeStyle} keyName="color" value={typeStyle.color} label="Colore" />
              <Slider
                value={typeStyle.fontSize}
                min={12} max={40} step={0.2}
                onChange={handleSlider(setTypeStyle, "fontSize")}
                sx={{ mt: 2 }}
                valueLabelDisplay="auto"
                marks={[{ value: 12, label: "12" }, { value: 24, label: "Default" }, { value: 40, label: "40" }]}
              />
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField label="Pos X" type="number"
                  value={typeStyle.x}
                  onChange={handleInputChange(setTypeStyle, "x", 0)}
                  onBlur={handleInputBlur(setTypeStyle, "x", 0, CARD_WIDTH - 100)}
                  size="small" />
                <TextField label="Pos Y" type="number"
                  value={typeStyle.y}
                  onChange={handleInputChange(setTypeStyle, "y", 0)}
                  onBlur={handleInputBlur(setTypeStyle, "y", 0, CARD_HEIGHT)}
                  size="small" />
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={700}>AbilitÃ </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FormControlLabel
                control={<Switch checked={showAbility} onChange={e => setShowAbility(e.target.checked)} />}
                label="Mostra testo AbilitÃ "
              />
              <TextField label="Testo AbilitÃ " value={ability} fullWidth sx={{ mb: 1 }} onChange={e => setAbility(e.target.value)} disabled={!showAbility} />
              <ColorControl setter={setAbilityStyle} keyName="color" value={abilityStyle.color} label="Colore" />
              <Slider
                value={abilityStyle.fontSize}
                min={9} max={32} step={0.1}
                onChange={handleSlider(setAbilityStyle, "fontSize")}
                sx={{ mt: 2 }}
                valueLabelDisplay="auto"
                marks={[{ value: 9, label: "9" }, { value: 15.6, label: "Default" }, { value: 32, label: "32" }]}
                disabled={!showAbility}
              />
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField label="Pos X" type="number"
                  value={abilityStyle.x}
                  onChange={handleInputChange(setAbilityStyle, "x", 0)}
                  onBlur={handleInputBlur(setAbilityStyle, "x", 0, CARD_WIDTH - 100)}
                  size="small"
                  disabled={!showAbility}
                />
                <TextField label="Pos Y" type="number"
                  value={abilityStyle.y}
                  onChange={handleInputChange(setAbilityStyle, "y", 0)}
                  onBlur={handleInputBlur(setAbilityStyle, "y", 0, CARD_HEIGHT)}
                  size="small"
                  disabled={!showAbility}
                />
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={700}>Power / Toughness</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FormControlLabel
                control={<Switch checked={showPT} onChange={e => setShowPT(e.target.checked)} />}
                label="Mostra Power/Toughness"
              />
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField label="Power" type="number" value={pt.power} disabled={!showPT}
                  onChange={e => setPT(ptf => ({ ...ptf, power: e.target.value }))}
                  size="small" />
                <TextField label="Toughness" type="number" value={pt.toughness} disabled={!showPT}
                  onChange={e => setPT(ptf => ({ ...ptf, toughness: e.target.value }))}
                  size="small" />
              </Box>
              <ColorControl setter={setPTStyle} keyName="color" value={ptStyle.color} label="Colore" />
              <Slider
                value={ptStyle.fontSize}
                min={16} max={60} step={0.1}
                onChange={handleSlider(setPTStyle, "fontSize")}
                sx={{ mt: 2 }}
                valueLabelDisplay="auto"
                marks={[{ value: 16, label: "16" }, { value: 36, label: "Default" }, { value: 60, label: "60" }]}
                disabled={!showPT}
              />
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField label="Pos X" type="number"
                  value={ptStyle.x}
                  onChange={handleInputChange(setPTStyle, "x", 0)}
                  onBlur={handleInputBlur(setPTStyle, "x", 0, CARD_WIDTH - 90)}
                  size="small"
                  disabled={!showPT}
                />
                <TextField label="Pos Y" type="number"
                  value={ptStyle.y}
                  onChange={handleInputChange(setPTStyle, "y", 0)}
                  onBlur={handleInputBlur(setPTStyle, "y", 0, CARD_HEIGHT)}
                  size="small"
                  disabled={!showPT}
                />
              </Box>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>Offset Power, Slash, Toughness</Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField label="Power X" type="number"
                  value={ptStyle.powerOffsetX}
                  onChange={handleInputChange(setPTStyle, "powerOffsetX")}
                  size="small"
                  disabled={!showPT}
                />
                <TextField label="Slash X" type="number"
                  value={ptStyle.slashOffsetX}
                  onChange={handleInputChange(setPTStyle, "slashOffsetX")}
                  size="small"
                  disabled={!showPT}
                />
                <TextField label="Tough X" type="number"
                  value={ptStyle.toughnessOffsetX}
                  onChange={handleInputChange(setPTStyle, "toughnessOffsetX")}
                  size="small"
                  disabled={!showPT}
                />
              </Box>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>Spostamento Frame P/T</Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  label="Frame X"
                  type="number"
                  value={ptStyle.frameX}
                  onChange={handleInputChange(setPTStyle, "frameX", 0, CARD_WIDTH - ptStyle.width)}
                  size="small"
                  disabled={!showPT}
                />
                <TextField
                  label="Frame Y"
                  type="number"
                  value={ptStyle.frameY}
                  onChange={handleInputChange(setPTStyle, "frameY", 0, CARD_HEIGHT - ptStyle.height)}
                  size="small"
                  disabled={!showPT}
                />
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={700}>Info Basso &amp; Copyright</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FormControlLabel
                control={<Switch checked={showInfoLeft} onChange={e => setShowInfoLeft(e.target.checked)} />}
                label="Mostra Info Bassa Sinistra"
              />
              <FormControlLabel
                control={<Switch checked={showArtist} onChange={e => setShowArtist(e.target.checked)} />}
                label="Mostra Artista"
              />
              <TextField label="Anno" type="text" value={infoLeft.year}
                onChange={e => setInfoLeft(val => ({ ...val, year: e.target.value }))}
                sx={{ my: 1 }} size="small" disabled={!showInfoLeft} />
              <TextField label="RaritÃ " type="text" value={infoLeft.rarity}
                onChange={e => setInfoLeft(val => ({ ...val, rarity: e.target.value }))}
                sx={{ mb: 1 }} size="small" disabled={!showInfoLeft} />
              <TextField label="Set" type="text" value={infoLeft.setCode}
                onChange={e => setInfoLeft(val => ({ ...val, setCode: e.target.value }))}
                sx={{ mb: 1 }} size="small" disabled={!showInfoLeft} />
              <TextField label="Lingua" type="text" value={infoLeft.lang}
                onChange={e => setInfoLeft(val => ({ ...val, lang: e.target.value }))}
                sx={{ mb: 1 }} size="small" disabled={!showInfoLeft} />
              <TextField label="Artista" type="text" value={infoLeft.artist}
                onChange={e => setInfoLeft(val => ({ ...val, artist: e.target.value }))}
                sx={{ mb: 1 }} size="small" disabled={!showArtist || !showInfoLeft} />
              <Slider
                value={infoLeft.fontSize}
                min={7} max={36} step={0.1}
                onChange={handleSlider(setInfoLeft, "fontSize")}
                sx={{ mt: 2 }}
                valueLabelDisplay="auto"
                marks={[{ value: 7, label: "7" }, { value: 13, label: "Default" }, { value: 36, label: "36" }]}
                disabled={!showInfoLeft}
              />
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField label="Pos X" type="number"
                  value={infoLeft.x}
                  onChange={handleInputChange(setInfoLeft, "x")}
                  size="small"
                  disabled={!showInfoLeft}
                />
                <TextField label="Pos Y" type="number"
                  value={infoLeft.y}
                  onChange={handleInputChange(setInfoLeft, "y")}
                  size="small"
                  disabled={!showInfoLeft}
                />
              </Box>
              <Divider sx={{ my: 1 }} />
              <FormControlLabel
                control={<Switch checked={showCopyright} onChange={e => setShowCopyright(e.target.checked)} />}
                label="Mostra Copyright"
              />
              <TextField label="Anno Copyright" type="text" value={copyright.year}
                onChange={e => setCopyright(val => ({ ...val, year: e.target.value }))}
                sx={{ mb: 1 }} size="small" disabled={!showCopyright} />
              <ColorControl setter={setCopyright} keyName="color" value={copyright.color} label="Colore Copyright" />
              <Slider
                value={copyright.fontSize}
                min={5} max={36} step={0.1}
                onChange={handleSlider(setCopyright, "fontSize")}
                sx={{ mt: 2 }} valueLabelDisplay="auto"
                marks={[{ value: 5, label: "5" }, { value: 15.5, label: "Def." }, { value: 36, label: "36" }]}
                disabled={!showCopyright}
              />
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField label="Pos X" type="number"
                  value={copyright.x}
                  onChange={handleInputChange(setCopyright, "x")}
                  size="small"
                  disabled={!showCopyright}
                />
                <TextField label="Pos Y" type="number"
                  value={copyright.y}
                  onChange={handleInputChange(setCopyright, "y")}
                  size="small"
                  disabled={!showCopyright}
                />
              </Box>
            </AccordionDetails>
          </Accordion>

          <Divider sx={{my:2}} />
          <Button variant="contained" color="primary" onClick={handleDownload} 
            sx={{ borderRadius: 13,
                fontWeight: 900,
                fontSize: 24,
                minWidth: 200,
                py: 1.45,
                px: 2.8,
                boxShadow: "0 0 16px 3px #6366f14f, 0 2px 10px #fff3",
                background: "linear-gradient(99deg,#6366f1 67%,#818cf8 100%)",
                textTransform: "none",
                transition: "all 220ms cubic-bezier(.41,.98,.25,1.13)" }}>
            Scarica come PNG UHD
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
