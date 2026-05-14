import React, { useState, useRef, useEffect, useCallback } from "react";
import "./editor.css";
import { useLanguage } from "./context/LanguageContext";
import { useAuth } from "./context/AuthContext";
import { saveUserToken, getUserTokens, deleteUserToken } from "./services/dbService";
import { Cloud, Save, Trash2, Loader2, Check } from "lucide-react";

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

const CW = 620, CH = 890;
const BLEED = 21;
const FT_DEFAULT = "BelerenBold, MatrixBold, Cinzel, Georgia, serif";
const FB_DEFAULT = "Mplantin, 'Palatino Linotype', 'Book Antiqua', Georgia, serif";

const FONT_OPTIONS = [
  { id: 'BelerenBold', name: 'Beleren Bold' },
  { id: 'MatrixBold', name: 'Matrix Bold' },
  { id: 'MatrixBoldSmallCaps', name: 'Matrix Small Caps' },
  { id: 'Mplantin', name: 'MPlantin' },
  { id: 'magic-font', name: 'Magic Font' },
  { id: 'Cinzel', name: 'Cinzel' },
  { id: 'Georgia', name: 'Georgia' },
  { id: 'serif', name: 'Serif Standard' }
];
const HISTORY_LIMIT = 40;

// --- IMAGE CACHE FOR 60FPS SYNCHRONOUS RENDERING ---
const imageCache = new Map();
let globalRenderCallback = null;

function getCachedImage(src) {
  if (!src) return null;
  if (imageCache.has(src)) {
    const cached = imageCache.get(src);
    return cached instanceof Image ? cached : null;
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  imageCache.set(src, "loading");
  img.onload = () => { imageCache.set(src, img); if (globalRenderCallback) globalRenderCallback(); };
  img.onerror = () => { imageCache.set(src, null); };
  img.src = src;
  return null;
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
  const parts = [];
  let last = 0, m;
  while ((m = rx.exec(text || "")) !== null) {
    if (m.index > last) parts.push({ type: "txt", v: text.slice(last, m.index) });
    parts.push({ type: "sym", v: m[1].trim() });
    last = rx.lastIndex;
  }
  if (last < (text || "").length) parts.push({ type: "txt", v: text.slice(last) });
  return parts;
}

function drawManaText(ctx, text, x, y, fontSize, color, font, maxWidth) {
  const parts = parseMana(text);
  const symSize = fontSize * 1.1;
  const lineH = fontSize * 1.45;
  
  ctx.save();
  ctx.font = `${fontSize}px ${font}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  
  let curX = x;
  let curY = y;
  let maxY = y + lineH;
  
  for (const p of parts) {
    if (p.type === "txt") {
      const words = p.v.split(" ");
      for (let i = 0; i < words.length; i++) {
        const word = (i === 0 ? "" : " ") + words[i];
        const w = ctx.measureText(word).width;
        if (maxWidth && curX + w > x + maxWidth && curX > x) {
          curX = x; 
          curY += lineH;
          maxY = curY + lineH;
        }
        ctx.fillText(word, curX, curY);
        curX += ctx.measureText(word).width;
      }
    } else {
      const url = symbolUrl(p.v);
      if (url) {
        const img = getCachedImage(url);
        if (img) { 
          ctx.drawImage(img, curX, curY + (lineH - symSize)/2, symSize, symSize); 
          curX += symSize + 2; 
        } else { 
          const token = `{${p.v}}`; 
          ctx.fillText(token, curX, curY); 
          curX += ctx.measureText(token).width; 
        }
      } else {
        const token = `{${p.v}}`; 
        ctx.fillText(token, curX, curY); 
        curX += ctx.measureText(token).width;
      }
    }
  }
  ctx.restore();
  return maxY;
}

const measureCanvas = document.createElement("canvas");
const measureCtx = measureCanvas.getContext("2d");

function measureTextWidth(text, fontSize, family = FT_DEFAULT, weight = "bold") {
  measureCtx.font = `${weight} ${fontSize}px ${family}`;
  return measureCtx.measureText(text || "").width;
}

function calculateAbilityHeight(text, fontSize, width, family = FB_DEFAULT, lineGap = 4) {
  const lines = String(text || "").split("\n");
  const lineH = fontSize * 1.45 + lineGap;
  const symSize = fontSize * 1.1;
  measureCtx.font = `${fontSize}px ${family}`;
  
  let totalH = 0;
  for (const line of lines) {
    const parts = parseMana(line);
    let curX = 0;
    let lineCount = 1;
    
    for (const p of parts) {
      if (p.type === "txt") {
        const words = p.v.split(" ");
        for (let i = 0; i < words.length; i++) {
          const word = (i === 0 ? "" : " ") + words[i];
          const w = measureCtx.measureText(word).width;
          if (width && curX + w > width && curX > 0) {
            curX = 0;
            lineCount++;
          }
          curX += measureCtx.measureText(word).width;
        }
      } else {
        const sW = symSize + 2;
        if (width && curX + sW > width && curX > 0) {
          curX = 0;
          lineCount++;
        }
        curX += sW;
      }
    }
    totalH += lineCount * lineH;
  }
  return totalH;
}

function fitTextBox(text, startSize, minSize, width, linesLimit = 99, maxHeight = 9999, lineGap = 4) {
  let size = startSize;
  while (size > minSize) {
    const totalH = calculateAbilityHeight(text, size, width, FB_DEFAULT, lineGap);
    if (totalH <= maxHeight) return size;
    size -= 0.5;
  }
  return minSize;
}

function cloneState(s) { return JSON.parse(JSON.stringify(s)); }
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

// --- REUSABLE UI COMPONENTS ---
const ColorPickerField = ({ label, value, onChange, onTarget, fontValue, onFontChange }) => (
  <div className="control-field mb-4">
    <div className="flex justify-between items-center mb-1">
      <span className="control-label m-0">{label}</span>
      {onTarget && <span className="text-xs opacity-60 hover:opacity-100 cursor-pointer" onClick={onTarget}>🎯 Seleziona Layer</span>}
    </div>
    
    <div className="color-picker-input-group mb-2">
      <div className="color-preview-block" style={{ backgroundColor: value }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} />
      </div>
      <input 
        type="text" 
        className="control-input hex-input" 
        value={value} 
        onChange={e => onChange(e.target.value)}
        placeholder="#FFFFFF"
      />
    </div>

    {onFontChange && (
      <select className="control-input py-1 text-xs" value={fontValue} onChange={e => onFontChange(e.target.value)}>
        {FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
    )}
  </div>
);

// --- SYNCHRONOUS RENDER CARD ---
function renderCardSync(canvas, state, withBleed = false) {
  if (!canvas) return;
  const { artUrl, artTransform, frame, ptFrame, name, nameStyle, type, typeStyle, ability, abilityStyle, showAbility, pt, ptStyle, showPT, infoLeft, showInfoLeft, showArtist, copyright, showCopyright } = state;
  const B = withBleed ? BLEED : 0;
  const TW = CW + B * 2;
  const TH = CH + B * 2;
  canvas.width = TW;
  canvas.height = TH;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, TW, TH);

  // Classic light checkerboard for transparency/missing art
  const size = 40;
  for (let y = 0; y < TH; y += size) {
    for (let x = 0; x < TW; x += size) {
      ctx.fillStyle = (Math.floor(x / size) + Math.floor(y / size)) % 2 === 0 ? "#f0f0f0" : "#ffffff";
      ctx.fillRect(x, y, size, size);
    }
  }

  if (artUrl) {
    const img = getCachedImage(artUrl);
    if (img) {
      const zoom = artTransform?.zoom || 1;
      const offsetX = artTransform?.x || 0;
      const offsetY = artTransform?.y || 0;
      const drawW = TW * zoom;
      const drawH = TH * zoom;
      const dx = (TW - drawW) / 2 + offsetX;
      const dy = (TH - drawH) / 2 + offsetY;
      ctx.drawImage(img, dx, dy, drawW, drawH);
    }
  }

  ctx.save();
  ctx.translate(B, B);

  if (frame?.url) {
    const img = getCachedImage(frame.url);
    if (img) ctx.drawImage(img, 0, 0, CW, CH);
  }

  if (state.showName !== false) {
    const fittedNameSize = state.autoFitName ? fitTextBox((name || "TOKEN").toUpperCase(), nameStyle.fontSize, 16, CW - 90, 1, 40, nameStyle.fontFamily || FT_DEFAULT) : nameStyle.fontSize;
    ctx.save();
    ctx.font = `bold ${fittedNameSize}px ${nameStyle.fontFamily || FT_DEFAULT}`;
    ctx.fillStyle = nameStyle.color;
    ctx.textBaseline = "middle";
    ctx.textAlign = nameStyle.align || "center";
    const nameX = nameStyle.align === "left" ? nameStyle.x + 10 : nameStyle.align === "right" ? nameStyle.x + CW - 10 : nameStyle.x + CW / 2;
    ctx.fillText(name || "TOKEN", nameX, nameStyle.y);
    ctx.restore();
  }

  if (state.showType !== false) {
    const fittedTypeSize = state.autoFitType ? fitTextBox(type || "Token", typeStyle.fontSize, 14, CW - typeStyle.x - 40, 1, 40, typeStyle.fontFamily || FT_DEFAULT) : typeStyle.fontSize;
    ctx.save();
    ctx.font = `bold ${fittedTypeSize}px ${typeStyle.fontFamily || FT_DEFAULT}`;
    ctx.fillStyle = typeStyle.color;
    ctx.textBaseline = "middle";
    ctx.textAlign = typeStyle.align || "left";
    ctx.fillText(type || "Token", typeStyle.x, typeStyle.y);
    ctx.restore();
  }

  if (showAbility && ability) {
    const size = state.autoFitRules ? fitTextBox(ability, abilityStyle.fontSize, 14, abilityStyle.width || (CW - abilityStyle.x * 2), 10, 840 - abilityStyle.y, abilityStyle.lineGap || 4) : abilityStyle.fontSize;
    const lines = String(ability).split("\n");
    let nextY = abilityStyle.y;
    for (const line of lines) {
      nextY = drawManaText(ctx, line, abilityStyle.x, nextY, size, abilityStyle.color, abilityStyle.fontFamily || FB_DEFAULT, abilityStyle.width || (CW - abilityStyle.x * 2));
      nextY += Math.max(0, abilityStyle.lineGap || 0);
    }
  }

  if (showPT && ptFrame?.url) {
    const img = getCachedImage(ptFrame.url);
    if (img) ctx.drawImage(img, ptStyle.frameX, ptStyle.frameY, ptStyle.width, ptStyle.height);
    ctx.save();
    ctx.fillStyle = ptStyle.color;
    ctx.textBaseline = "middle";
    
    // Auto-fit per numeri doppi (es. 10/10)
    let ptSize = ptStyle.fontSize || 36;
    let pw, sw, rw, totalW;
    do {
      ctx.font = `bold ${ptSize}px ${ptStyle.fontFamily || FT_DEFAULT}`;
      pw = ctx.measureText(pt?.power || "0").width;
      sw = ctx.measureText("/").width;
      rw = ctx.measureText(pt?.toughness || "0").width;
      totalW = pw + sw + rw;
      if (totalW <= ptStyle.width - 24 || ptSize <= 16) break;
      ptSize -= 1;
    } while (true);

    const ptCX = ptStyle.frameX + ptStyle.width / 2 + (ptStyle.powerOffsetX || 0);
    const ptCY = ptStyle.frameY + ptStyle.height / 2 + 2; // +2 per centrare meglio otticamente
    ctx.textAlign = "left";
    
    const startX = ptCX - totalW / 2;
    ctx.fillText(pt?.power || "0", startX, ptCY);
    ctx.fillText("/", startX + pw, ptCY);
    ctx.fillText(pt?.toughness || "0", startX + pw + sw, ptCY);
    ctx.restore();
  }

  if (state.showInfoLeft !== false && infoLeft) {
    ctx.save();
    ctx.font = `${infoLeft.fontSize || 11}px ${infoLeft.fontFamily || FT_DEFAULT}`;
    ctx.fillStyle = infoLeft.color || "#1a1a1a";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(infoLeft.text || "", infoLeft.x || 18, CH - (infoLeft.y || 12));
    ctx.restore();
  }
  if (state.showArtist !== false && state.artist) {
    ctx.save();
    ctx.font = `${state.artistStyle?.fontSize || 11}px ${state.artistStyle?.fontFamily || FT_DEFAULT}`;
    ctx.fillStyle = state.artistStyle?.color || "#1a1a1a";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(`Illus. ${state.artist}`, state.artistStyle?.x || 18, CH - (state.artistStyle?.y || 26));
    ctx.restore();
  }
  if (state.showCopyright !== false && copyright) {
    ctx.save();
    ctx.font = `${copyright.fontSize || 9}px ${copyright.fontFamily || FT_DEFAULT}`;
    ctx.fillStyle = copyright.color || "#111";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "right";
    ctx.fillText(copyright.text || `™ & © ${new Date().getFullYear()} Wizards of the Coast`, CW - (copyright.x || 18), CH - (copyright.y || 12));
    ctx.restore();
  }
  ctx.restore();
}

function getGuideMetrics(state) {
  const nameSize = state.autoFitName ? fitTextBox((state.name || "TOKEN").toUpperCase(), state.nameStyle.fontSize, 16, CW - 90, 1, state.nameStyle.fontFamily || FT_DEFAULT) : state.nameStyle.fontSize;
  const typeSize = state.autoFitType ? fitTextBox(state.type || "Token", state.typeStyle.fontSize, 14, CW - state.typeStyle.x - 40, 1, state.typeStyle.fontFamily || FT_DEFAULT) : state.typeStyle.fontSize;
  const abilitySize = state.autoFitRules ? fitTextBox(state.ability || "", state.abilityStyle.fontSize, 14, state.abilityStyle.width || (CW - state.abilityStyle.x * 2), 10, 840 - state.abilityStyle.y, state.abilityStyle.lineGap || 4) : state.abilityStyle.fontSize;
  const typeWidth = measureTextWidth(state.type || "Token", typeSize, state.typeStyle.fontFamily || FT_DEFAULT, "bold");
  const nameWidth = measureTextWidth((state.name || "TOKEN").toUpperCase(), nameSize, state.nameStyle.fontFamily || FT_DEFAULT, "bold");
  const abilityLines = Math.max(1, String(state.ability || '').split('\n').length || 1);
  const abilityHeight = Math.max(54, abilityLines * (abilitySize * 1.45) + Math.max(8, state.abilityStyle.lineGap || 4) * (abilityLines - 1) + 12);
  const nameCenterX = state.nameStyle.align === 'left' ? state.nameStyle.x + 10 + nameWidth/2 : state.nameStyle.align === 'right' ? state.nameStyle.x + CW - 10 - nameWidth/2 : state.nameStyle.x + CW/2;
  
  const boxes = {
    name: state.showName !== false ? { x: clamp(nameCenterX - nameWidth/2 - 10, 12, CW-12), y: state.nameStyle.y - Math.round(nameSize * 0.62), w: clamp(nameWidth + 20, 80, CW-24), h: Math.max(24, Math.round(nameSize * 1.18)), c: '#38bdf8' } : null,
    type: state.showType !== false ? { x: state.typeStyle.x - 4, y: state.typeStyle.y - Math.round(typeSize * 0.58), w: Math.max(100, typeWidth + 14), h: Math.max(22, Math.round(typeSize * 1.15)), c: '#22c55e' } : null,
    ability: state.showAbility !== false ? { x: state.abilityStyle.x - 4, y: state.abilityStyle.y - 4, w: state.abilityStyle.width || (CW - state.abilityStyle.x * 2), h: abilityHeight, c: '#f59e0b' } : null,
    pt: state.showPT !== false ? { x: state.ptStyle.frameX + 6, y: state.ptStyle.frameY + 6, w: Math.max(20, state.ptStyle.width - 12), h: Math.max(20, state.ptStyle.height - 12), c: '#f472b6' } : null,
    infoLeft: state.showInfoLeft !== false ? { x: Math.max(10, (state.infoLeft?.x || 18) - 4), y: CH - (state.infoLeft?.y || 12) - Math.max(12, state.infoLeft?.fontSize || 11), w: Math.max(40, measureTextWidth(state.infoLeft?.text, state.infoLeft?.fontSize || 11, state.infoLeft?.fontFamily || FT_DEFAULT, 'normal') + 8), h: Math.max(14, (state.infoLeft?.fontSize || 11) + 6), c: '#a78bfa' } : null,
    artist: state.showArtist !== false ? { x: Math.max(10, (state.artistStyle?.x || 18) - 4), y: CH - (state.artistStyle?.y || 26) - Math.max(12, state.artistStyle?.fontSize || 11), w: Math.max(60, measureTextWidth("Illus. " + state.artist, state.artistStyle?.fontSize || 11, state.artistStyle?.fontFamily || FT_DEFAULT, 'normal') + 8), h: Math.max(14, (state.artistStyle?.fontSize || 11) + 6), c: '#a78bfa' } : null,
    copyright: state.showCopyright !== false ? { x: CW - (state.copyright?.x || 18) - measureTextWidth(state.copyright?.text || `™ & © ${new Date().getFullYear()} Wizards of the Coast`, state.copyright?.fontSize || 9, state.copyright?.fontFamily || FT_DEFAULT, 'normal') - 4, y: CH - (state.copyright?.y || 12) - Math.max(10, state.copyright?.fontSize || 9), w: Math.max(80, measureTextWidth(state.copyright?.text || `™ & © ${new Date().getFullYear()} Wizards of the Coast`, state.copyright?.fontSize || 9, state.copyright?.fontFamily || FT_DEFAULT, 'normal') + 8), h: Math.max(12, (state.copyright?.fontSize || 9) + 6), c: '#a78bfa' } : null,
  };
  for (let k in boxes) if (!boxes[k]) delete boxes[k];
  return boxes;
}

function getDefaultFrame() { const firstSet = Object.keys(FRAME_MAP)[0]; return firstSet ? FRAME_MAP[firstSet][0] : null; }
function getDefaultPtFrame() { return PT_FRAMES[0] || null; }
const DEFAULT_STATE = {
  artUrl: "", artTransform: { zoom: 1, x: 0, y: 0 },
  frameSet: Object.keys(FRAME_MAP)[0] || "", frame: getDefaultFrame(), ptFrame: getDefaultPtFrame(),
  name: "Goblin", showName: true, autoFitName: true, autoFitType: true, autoFitRules: false,
  nameStyle: { x: 0, y: 54, fontSize: 28, color: "#111111", align: "center", fontFamily: 'BelerenBold' },
  type: "Token Creature — Goblin", showType: true, typeStyle: { x: 44, y: 602, fontSize: 24, color: "#111111", align: "left", fontFamily: 'BelerenBold' },
  ability: "Haste", abilityStyle: { x: 44, y: 644, width: 532, fontSize: 24, color: "#111111", lineGap: 4, fontFamily: 'Mplantin' }, showAbility: true,
  pt: { power: "1", toughness: "1" }, ptStyle: { frameX: 457, frameY: 789, width: 126, height: 54, fontSize: 36, color: "#111111", powerOffsetX: 0, fontFamily: 'BelerenBold' }, showPT: true,
  infoLeft: { text: "SET • EN", x: 18, y: 12, color: "#111111", fontSize: 11, fontFamily: 'BelerenBold' }, showInfoLeft: true,
  artist: "Artist Name", artistStyle: { x: 18, y: 26, color: "#111111", fontSize: 11, fontFamily: 'BelerenBold' }, showArtist: true,
  copyright: { text: `™ & © ${new Date().getFullYear()} Wizards of the Coast`, x: 18, y: 12, color: "#111111", fontSize: 9, fontFamily: 'Mplantin' }, showCopyright: true,
};

// ptFrame name maps to files in /src/assets/frames/pt/
// Colors are always #111111 on these frames (dark text on light textbox)
const TOKEN_TEMPLATES = [
  { id: 'treasure', name: 'Tesoro',    icon: '💰', type: 'Token Artifact — Treasure', ability: '{T}, Sacrifice this artifact: Add one mana of any color.', frame: 'tokenFrameAShort', ptFrame: 'm15PTA', frameSet: 'tokenshort', showPT: false },
  { id: 'food',     name: 'Cibo',      icon: '🍞', type: 'Token Artifact — Food',     ability: '{2}, {T}, Sacrifice this artifact: You gain 3 life.',     frame: 'tokenFrameAShort', ptFrame: 'm15PTA', frameSet: 'tokenshort', showPT: false },
  { id: 'clue',     name: 'Indizio',   icon: '🔍', type: 'Token Artifact — Clue',     ability: '{2}, Sacrifice this artifact: Draw a card.',               frame: 'tokenFrameAShort', ptFrame: 'm15PTA', frameSet: 'tokenshort', showPT: false },
  { id: 'goblin',   name: 'Goblin',    icon: '👺', type: 'Token Creature — Goblin',   ability: 'Haste', pt: { power: '1', toughness: '1' },                  frame: 'tokenFrameRShort', ptFrame: 'm15PTR', frameSet: 'tokenshort', showPT: true  },
  { id: 'beast',    name: 'Bestia',    icon: '🐗', type: 'Token Creature — Beast',    ability: '', pt: { power: '3', toughness: '3' },                       frame: 'tokenFrameGShort', ptFrame: 'm15PTG', frameSet: 'tokenshort', showPT: true  },
  { id: 'knight',   name: 'Cavaliere', icon: '⚔️', type: 'Token Creature — Knight',   ability: 'Vigilance', pt: { power: '2', toughness: '2' },              frame: 'tokenFrameWShort', ptFrame: 'm15PTW', frameSet: 'tokenshort', showPT: true  },
  { id: 'spirit',   name: 'Spirito',   icon: '👻', type: 'Token Creature — Spirit',   ability: 'Flying', pt: { power: '1', toughness: '1' },                 frame: 'tokenFrameWShort', ptFrame: 'm15PTW', frameSet: 'tokenshort', showPT: true  },
  { id: 'zombie',   name: 'Zombie',    icon: '🧟', type: 'Token Creature — Zombie',   ability: '', pt: { power: '2', toughness: '2' },                       frame: 'tokenFrameBShort', ptFrame: 'm15PTB', frameSet: 'tokenshort', showPT: true  },
  { id: 'elemental',name: 'Elementale',icon: '🔥', type: 'Token Creature — Elemental',ability: 'Haste, Trample', pt: { power: '4', toughness: '4' },          frame: 'tokenFrameRShort', ptFrame: 'm15PTR', frameSet: 'tokenshort', showPT: true  },
  { id: 'soldier',  name: 'Soldato',   icon: '🛡️', type: 'Token Creature — Soldier',  ability: '', pt: { power: '1', toughness: '1' },                       frame: 'tokenFrameWShort', ptFrame: 'm15PTW', frameSet: 'tokenshort', showPT: true  },
];

export default function TokenPreviewSinglePtFrame() {
  const { t } = useLanguage();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 900);
  const [state, setState] = useState(DEFAULT_STATE);
  const [history, setHistory] = useState([cloneState(DEFAULT_STATE)]);
  const [historyIdx, setHistoryIdx] = useState(0);
  
  const [activeTab, setActiveTab] = useState('templates'); // 'templates', 'art', 'frame', 'pt', 'text', 'settings'
  const [activeLayer, setActiveLayer] = useState('art');
  const [showGuides, setShowGuides] = useState(true);
  const [pngScale, setPngScale] = useState(4);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [exportBleed, setExportBleed] = useState(false);
  const [exportCropMarks, setExportCropMarks] = useState(false);
  
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [snapGuides, setSnapGuides] = useState({ x: null, y: null });
  
  const canvasRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const triggerRender = useCallback(() => {
    if (canvasRef.current) renderCardSync(canvasRef.current, state, false);
  }, [state]);

  useEffect(() => {
    globalRenderCallback = triggerRender;
    triggerRender();
    return () => { globalRenderCallback = null; };
  }, [triggerRender]);

  const pushHistory = useCallback((next) => {
    setHistory(prev => {
      const base = prev.slice(0, historyIdx + 1);
      return [...base, cloneState(next)].slice(-HISTORY_LIMIT);
    });
    setHistoryIdx(i => Math.min(HISTORY_LIMIT - 1, i + 1));
  }, [historyIdx]);

  const applyState = useCallback((next, commit = true) => {
    setState(next);
    if (commit) pushHistory(next);
  }, [pushHistory]);

  const update = useCallback((key, patch) => {
    const next = { ...state, [key]: { ...state[key], ...patch } };
    applyState(next);
  }, [state, applyState]);

  const undo = () => {
    if (historyIdx > 0) {
      setHistoryIdx(i => i - 1);
      setState(history[historyIdx - 1]);
    }
  };

  const redo = () => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx(i => i + 1);
      setState(history[historyIdx + 1]);
    }
  };

  // DRAG LOGIC WITH SMART SNAPPING
  const beginDrag = (kind, e) => {
    e.preventDefault(); e.stopPropagation();
    const touch = e.touches?.[0] || e;
    dragRef.current = { kind, startX: touch.clientX, startY: touch.clientY, snapshot: cloneState(state) };
    setActiveLayer(kind);
    if (!isMobile) {
      if (kind === 'name' || kind === 'type' || kind === 'ability') setActiveTab('text');
      else if (kind === 'pt') setActiveTab('pt');
      else if (kind === 'infoLeft' || kind === 'artist' || kind === 'copyright') setActiveTab('settings');
      else if (kind === 'art') setActiveTab('art');
    }
    
    const move = ev => {
      if (!dragRef.current) return;
      const p = ev.touches?.[0] || ev;
      const baseScale = isMobile ? Math.min((window.innerWidth - 20) / CW, (window.innerHeight - 200) / CH) : Math.min(0.9, (window.innerWidth - 450) / CW);
      const pScale = isMobile ? Math.max(0.46, baseScale) : Math.max(0.34, baseScale * (previewZoom / 100));
      
      let dx = (p.clientX - dragRef.current.startX) / pScale;
      let dy = (p.clientY - dragRef.current.startY) / pScale;
      
      const snap = dragRef.current.snapshot;
      let next = cloneState(snap);
      let sGuides = { x: null, y: null };
      const SNAP_TOLERANCE = 10;
      const MARGIN = 10; // Reduced margin as requested
      
      if (kind === 'art') {
        let ax = snap.artTransform.x + dx;
        let ay = snap.artTransform.y + dy;
        if (Math.abs(ax) < SNAP_TOLERANCE) { ax = 0; sGuides.x = CW/2; }
        if (Math.abs(ay) < SNAP_TOLERANCE) { ay = 0; sGuides.y = CH/2; }
        
        next.artTransform = { ...next.artTransform, x: Math.round(ax), y: Math.round(ay) };
      } else {
        // 1. Initial position update
        if (kind === 'name') {
          let nx = snap.nameStyle.x + dx;
          if (Math.abs(nx) < SNAP_TOLERANCE) { nx = 0; sGuides.x = CW/2; }
          next.nameStyle = { ...next.nameStyle, x: Math.round(nx), y: Math.round(snap.nameStyle.y + dy) };
        } else if (kind === 'type') {
          next.typeStyle = { ...next.typeStyle, x: Math.round(snap.typeStyle.x + dx), y: Math.round(snap.typeStyle.y + dy) };
        } else if (kind === 'ability') {
          next.abilityStyle = { ...next.abilityStyle, x: Math.round(snap.abilityStyle.x + dx), y: Math.round(snap.abilityStyle.y + dy) };
        } else if (kind === 'pt') {
          next.ptStyle = { ...next.ptStyle, frameX: Math.round(snap.ptStyle.frameX + dx), frameY: Math.round(snap.ptStyle.frameY + dy) };
        } else if (kind === 'infoLeft') {
          next.infoLeft = { ...next.infoLeft, x: Math.round((snap.infoLeft?.x||18) + dx), y: Math.round((snap.infoLeft?.y||12) - dy) };
        } else if (kind === 'artist') {
          next.artistStyle = { ...next.artistStyle, x: Math.round((snap.artistStyle?.x||18) + dx), y: Math.round((snap.artistStyle?.y||26) - dy) };
        } else if (kind === 'copyright') {
          next.copyright = { ...next.copyright, x: Math.round((snap.copyright?.x||18) - dx), y: Math.round((snap.copyright?.y||12) - dy) };
        }

        // 2. Strict Clamping Logic
        if (kind === 'name') {
          const nSize = state.autoFitName ? fitTextBox((state.name||"TOKEN").toUpperCase(), state.nameStyle.fontSize, 16, CW-90, 1, 40, state.nameStyle.fontFamily||FT_DEFAULT) : state.nameStyle.fontSize;
          const nWidth = measureTextWidth((state.name||"TOKEN").toUpperCase(), nSize, state.nameStyle.fontFamily||FT_DEFAULT, "bold");
          const offset = state.nameStyle.align === "left" ? 10 : state.nameStyle.align === "right" ? CW - 10 : CW/2;
          const minX = MARGIN - offset + nWidth/2;
          const maxX = CW - MARGIN - offset - nWidth/2;
          next.nameStyle.x = Math.max(minX, Math.min(maxX, next.nameStyle.x));
          next.nameStyle.y = Math.max(MARGIN + 10, Math.min(CH/2, next.nameStyle.y)); // Keep name in upper half
        } else if (kind === 'type') {
          const tSize = state.autoFitType ? fitTextBox(state.type||"Token", state.typeStyle.fontSize, 14, CW-state.typeStyle.x-40, 1, 40, state.typeStyle.fontFamily||FT_DEFAULT) : state.typeStyle.fontSize;
          const tWidth = measureTextWidth(state.type||"Token", tSize, state.typeStyle.fontFamily||FT_DEFAULT, "bold");
          next.typeStyle.x = Math.max(MARGIN + 15, Math.min(CW - tWidth - MARGIN - 15, next.typeStyle.x));
          next.typeStyle.y = Math.max(CH/2, Math.min(CH - MARGIN - 40, next.typeStyle.y));
        } else if (kind === 'ability') {
          const aSize = state.autoFitRules ? fitTextBox(state.ability||"", state.abilityStyle.fontSize, 14, state.abilityStyle.width || (CW - state.abilityStyle.x * 2), 10, 840 - state.abilityStyle.y, state.abilityStyle.lineGap || 4) : state.abilityStyle.fontSize;
          const aLines = Math.max(1, String(state.ability || '').split('\n').length);
          const aHeight = aLines * (aSize * 1.45);
          next.abilityStyle.x = Math.max(MARGIN + 15, Math.min(CW - (next.abilityStyle.width||400) - MARGIN - 15, next.abilityStyle.x));
          next.abilityStyle.y = Math.max(CH/2 - 100, Math.min(CH - aHeight - MARGIN - 60, next.abilityStyle.y));
        } else if (kind === 'pt') {
          next.ptStyle.frameX = Math.max(MARGIN, Math.min(CW - next.ptStyle.width - MARGIN, next.ptStyle.frameX));
          next.ptStyle.frameY = Math.max(CH/2, Math.min(CH - next.ptStyle.height - MARGIN, next.ptStyle.frameY));
        } else if (kind === 'infoLeft' || kind === 'artist' || kind === 'copyright') {
          const isInfo = kind === 'infoLeft';
          const isArtist = kind === 'artist';
          const target = isInfo ? next.infoLeft : isArtist ? next.artistStyle : next.copyright;
          const text = isInfo ? state.infoLeft.text : isArtist ? "Illus. " + state.artist : state.copyright.text;
          const fSize = target.fontSize || 11;
          const tWidth = measureTextWidth(text, fSize, target.fontFamily || FT_DEFAULT, 'normal');
          
          if (kind === 'copyright') {
            target.x = Math.max(MARGIN, Math.min(CW - tWidth - MARGIN, target.x));
          } else {
            target.x = Math.max(MARGIN, Math.min(CW - tWidth - MARGIN, target.x));
          }
          target.y = Math.max(10, Math.min(60, target.y)); // Clamp vertical offset from bottom
        }
      }

      setSnapGuides(sGuides);
      dragRef.current.lastState = next;
      applyState(next, false);
    };
    
    const up = () => {
      setSnapGuides({ x: null, y: null });
      if (dragRef.current && dragRef.current.lastState) {
        applyState(cloneState(dragRef.current.lastState), true);
      }
      dragRef.current = null;
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up);
    };
    
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => {
        applyState({ ...state, artUrl: ev.target.result, artTransform: { zoom: 1, x: 0, y: 0 } });
        setActiveTab('art');
        setActiveLayer('art');
      };
      reader.readAsDataURL(file);
    }
  };

  const exportPNG = () => {
    const c = document.createElement('canvas');
    renderCardSync(c, state, exportBleed);

    let finalCanvas = c;
    if (exportCropMarks && exportBleed) {
       const octx = c.getContext('2d');
       octx.strokeStyle = '#ffffff';
       octx.lineWidth = 1;
       const drawMark = (x1, y1, x2, y2) => { octx.beginPath(); octx.moveTo(x1, y1); octx.lineTo(x2, y2); octx.stroke(); };
       
       const b = 21; // BLEED_PX
       const w = c.width; const h = c.height;

       drawMark(0, b, b, b); drawMark(b, 0, b, b);
       drawMark(w - b, 0, w - b, b); drawMark(w - b, b, w, b);
       drawMark(0, h - b, b, h - b); drawMark(b, h - b, b, h);
       drawMark(w - b, h, w - b, h - b); drawMark(w - b, h - b, w, h - b);
    }

    const out = document.createElement('canvas');
    out.width = finalCanvas.width * pngScale; out.height = finalCanvas.height * pngScale;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
    octx.drawImage(finalCanvas, 0, 0, out.width, out.height);
    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `${(state.name || 'token').replace(/\s+/g,'_')}${exportBleed ? '_bleed' : ''}${exportCropMarks ? '_crop' : ''}.png`;
    a.click();
  };

  const saveProject = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `token_project_${(state.name || 'token').replace(/\s+/g,'_')}.json`;
    a.click();
  };

  const loadProject = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const loaded = JSON.parse(ev.target.result);
        applyState({ ...DEFAULT_STATE, ...loaded });
      } catch (err) {
        alert(t('token.invalid_json'));
      }
    };
    reader.readAsText(file);
    e.target.value = null; // reset input
  };

  const resetFooterAlign = () => {
    applyState({
      ...state,
      infoLeft: { ...state.infoLeft, x: 18, y: 12 },
      artistStyle: { ...state.artistStyle, x: 18, y: 26 },
      copyright: { ...state.copyright, x: 18, y: 12 }
    });
  };

  const baseScale = isMobile ? Math.min((window.innerWidth - 20) / CW, (window.innerHeight - 200) / CH) : Math.min(0.9, (window.innerWidth - 450) / CW);
  const pScale = isMobile ? Math.max(0.46, baseScale) : Math.max(0.34, baseScale * (previewZoom / 100));
  const boxes = getGuideMetrics(state);

  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [myTokens, setMyTokens] = useState([]);

  const loadMyTokens = useCallback(async () => {
    if (!user) return;
    const tokens = await getUserTokens(user.uid);
    setMyTokens(tokens.filter(t => t.tool === 'token' || !t.tool));
  }, [user]);

  useEffect(() => {
    if (user) loadMyTokens();
  }, [user, loadMyTokens]);

  const handleSaveCloud = async (isDraft = true) => {
    if (!user) { alert(t('studio.login_required')); return; }
    setIsSaving(true);
    setSaveStatus('saving');
    try {
      // GENERATE THUMBNAIL
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 150; 
      thumbCanvas.height = 215; 
      renderCardSync(thumbCanvas, state, false);
      const previewUrl = thumbCanvas.toDataURL('image/webp', 0.6);

      const tokenData = {
        name: state.name || "Senza nome",
        previewUrl,
        ...state
      };
      await saveUserToken(user.uid, tokenData, isDraft, 'token');
      setSaveStatus('success');
      loadMyTokens();
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      alert(err.message);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('common.confirm_delete'))) return;
    await deleteUserToken(user.uid, id);
    loadMyTokens();
  };

  const Icon = ({ d }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
  );

  return (
    <div className={`editor-layout ${isMobile ? 'mobile' : ''}`}>
      
      {/* CANVA-STYLE LEFT NAVIGATION */}
      {!isMobile && (
        <nav className="editor-nav">
          <div className={`nav-item ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
            <Icon d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /> {t('common.template')}
          </div>
          <div className={`nav-item ${activeTab === 'art' ? 'active' : ''}`} onClick={() => setActiveTab('art')}>
            <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /> {t('common.artwork')}
          </div>
          <div className={`nav-item ${activeTab === 'frame' ? 'active' : ''}`} onClick={() => setActiveTab('frame')}>
            <Icon d="M4 4h16v16H4zM4 9h16" /> {t('common.frames')}
          </div>
          <div className={`nav-item ${activeTab === 'pt' ? 'active' : ''}`} onClick={() => setActiveTab('pt')}>
            <Icon d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" /> {t('common.pt')}
          </div>
          <div className={`nav-item ${activeTab === 'text' ? 'active' : ''}`} onClick={() => setActiveTab('text')}>
            <Icon d="M4 7V4h16v3M9 20h6M12 4v16" /> {t('common.layers')}
          </div>
          <div className={`nav-item ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>
            <Icon d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /> {t('token.artist')}
          </div>
          <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')} style={{ marginTop: 'auto' }}>
            <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /> {t('common.export')}
          </div>
        </nav>
      )}

      {isMobile && (
        <div className="mobile-editor-tabs">
          <button className={`mobile-editor-tab ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>{t('common.preview')}</button>
          <button className={`mobile-editor-tab ${activeTab !== 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('frame')}>{t('common.tools')}</button>
        </div>
      )}

      {/* SIDEBAR CONTEXTUAL PANELS */}
      {(!isMobile || activeTab !== 'preview') && (
        <aside className="editor-sidebar" style={isMobile ? { width: '100vw', padding: '10px' } : {}}>
          
          {isMobile && (
             <div className="mobile-subnav mb-4 flex gap-2 overflow-x-auto pb-2 border-b border-[var(--border)]" style={{ WebkitOverflowScrolling: 'touch' }}>
               {[
                 { id: 'templates', label: '🚀 ' + t('token.templates') },
                 { id: 'frame', label: '🖼️ Frame' },
                 { id: 'art', label: '🎨 ' + t('studio.bg_placeholder') },
                 { id: 'text', label: '📝 ' + t('token.title') },
                 { id: 'pt', label: '⚔️ P/T' },
                 { id: 'info', label: '📜 ' + t('token.artist') },
                 { id: 'settings', label: '⚙️ ' + t('common.settings') }
               ].map(item => (
                 <button 
                   key={item.id} 
                   className={`px-3 py-1 text-sm rounded whitespace-nowrap font-semibold ${activeTab === item.id ? 'bg-[var(--primary)] text-[var(--bg)]' : 'bg-[var(--surf-off)] text-[var(--text)]'}`} 
                   onClick={() => setActiveTab(item.id)}
                 >
                   {item.label}
                 </button>
               ))}
             </div>
          )}

          {/* TAB: TEMPLATES */}
          {activeTab === 'templates' && (
            <>
              <div className="sidebar-panel-title">🚀 {t('token.templates')}</div>
              <div className="control-group">
                <p className="text-xs text-muted mb-4">{t('token.templates')}</p>
                <div className="template-grid">
                  {TOKEN_TEMPLATES.map(item => (
                    <div 
                      key={item.id} 
                      className="template-item" 
                      onClick={() => {
                        const frameObj = FRAME_MAP[item.frameSet]?.find(f => f.name === item.frame);
                        const ptFrameObj = PT_FRAMES.find(f => f.name === item.ptFrame) || state.ptFrame;
                        applyState({
                          ...DEFAULT_STATE,
                          name: item.name,
                          type: item.type,
                          ability: item.ability,
                          showAbility: !!item.ability,
                          showPT: item.showPT,
                          pt: item.pt || DEFAULT_STATE.pt,
                          frameSet: item.frameSet,
                          frame: frameObj || state.frame,
                          ptFrame: ptFrameObj,
                          artUrl: state.artUrl,
                          artTransform: state.artTransform,
                        });
                      }}
                    >
                      <div className="template-icon">{item.icon}</div>
                      <div className="template-name">{item.name}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sidebar-panel-title mt-8">☁️ {t('studio.cloud_library')}</div>
              <div className="flex gap-2 mb-4">
                <button onClick={() => handleSaveCloud(true)} className="btn btn-ghost flex-1 py-3 text-xs gap-2" disabled={isSaving}>
                  {isSaving && saveStatus === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={14} />}
                  {t('studio.save_draft')}
                </button>
                <button onClick={() => handleSaveCloud(false)} className="btn btn-primary flex-1 py-3 text-xs gap-2" disabled={isSaving}>
                  {isSaving && saveStatus === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {t('studio.save_final')}
                </button>
              </div>

              {myTokens.length > 0 && (
                <div className="asset-grid">
                  {myTokens.map(item => (
                    <div key={item.id} className="asset-item group relative">
                      <div 
                        className="template-icon" 
                        style={{ cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}
                        onClick={() => {
                          const { id, tool, isDraft, updatedAt, createdAt, previewUrl, ...loadedState } = item;
                          applyState(loadedState); // Replace current state with loaded state
                        }}
                      >
                        {item.previewUrl ? (
                          <img src={item.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          item.isDraft ? "📝" : "⭐"
                        )}
                      </div>
                      <div className="template-name">{item.name}</div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                        className="absolute -top-1 -right-1 p-1 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        <Trash2 size={10} color="white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TAB: ARTWORK */}
          {activeTab === 'art' && (
            <>
              <div className="sidebar-panel-title">🎨 {t('studio.bg_placeholder')}</div>
              <div className="control-group">
                <div className="control-field">
                  <label className="btn btn-primary" style={{ textAlign: 'center', cursor: 'pointer' }}>
                    {t('studio.upload_bg_btn')}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                      const f = e.target.files?.[0]; if(!f) return;
                      const r = new FileReader(); r.onload = ev => applyState({ ...state, artUrl: ev.target.result, artTransform: { zoom: 1, x: 0, y: 0 } });
                      r.readAsDataURL(f);
                    }} />
                  </label>
                  <p className="text-xs text-muted mt-2 text-center">{t('proxy.dropzone_title')}</p>
                </div>
                <hr className="my-4 border-[var(--border)]" />
                <div className="control-field mt-4">
                  <span className="control-label">Zoom ({state.artTransform.zoom}x)</span>
                  <input type="range" min="0.8" max="2.2" step="0.01" value={state.artTransform.zoom} onChange={e => update('artTransform', { zoom: Number(e.target.value) })} className="control-input" />
                </div>
                <div className="control-row mt-4">
                  <div className="control-field"><span className="control-label">Pos X</span><input type="number" className="control-input" value={state.artTransform.x} onChange={e => update('artTransform', { x: Number(e.target.value) })} /></div>
                  <div className="control-field"><span className="control-label">Pos Y</span><input type="number" className="control-input" value={state.artTransform.y} onChange={e => update('artTransform', { y: Number(e.target.value) })} /></div>
                </div>
              </div>
            </>
          )}

          {/* TAB: FRAMES */}
          {activeTab === 'frame' && (
            <>
              <div className="sidebar-panel-title">🎴 {t('token.set_frame')}</div>
              <div className="control-group">
                <div className="control-field">
                  <span className="control-label">{t('common.settings')}</span>
                  <select className="control-input control-select" value={state.frameSet} onChange={e => {
                    const setName = e.target.value;
                    applyState({ ...state, frameSet: setName, frame: FRAME_MAP[setName][0] || null });
                  }}>
                    {Object.keys(FRAME_MAP).map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                
                {/* Visual Asset Grid */}
                <div className="asset-grid">
                  {(FRAME_MAP[state.frameSet] || []).map(f => (
                    <div key={f.name} className={`asset-item ${state.frame?.name === f.name ? 'active' : ''}`} onClick={() => applyState({ ...state, frame: f })}>
                      <img src={f.url} alt={f.name} loading="lazy" />
                      <div className="asset-item-name">{f.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* TAB: P/T */}
          {activeTab === 'pt' && (
            <>
              <div className="sidebar-panel-title">⚔️ {t('token.power_toughness')}</div>
              <div className="control-group">
                <div className="control-row">
                  <div className="control-field">
                    <span className="control-label">{t('common.power')}</span>
                    <input type="text" className="control-input" value={state.pt.power} onChange={e => applyState({ ...state, pt: { ...state.pt, power: e.target.value } })} />
                  </div>
                  <div className="control-field">
                    <span className="control-label">{t('common.toughness')}</span>
                    <input type="text" className="control-input" value={state.pt.toughness} onChange={e => applyState({ ...state, pt: { ...state.pt, toughness: e.target.value } })} />
                  </div>
                </div>
                
                <ColorPickerField 
                  label="Colore Testo P/T" 
                  value={state.ptStyle.color} 
                  onChange={v => update('ptStyle', { color: v })}
                  fontValue={state.ptStyle.fontFamily}
                  onFontChange={v => update('ptStyle', { fontFamily: v })}
                />

                <div className="control-row">
                  <div className="control-field">
                    <span className="control-label">Dimensione ({state.ptStyle.fontSize}px)</span>
                    <input type="range" min="10" max="80" value={state.ptStyle.fontSize} onChange={e => update('ptStyle', { fontSize: Number(e.target.value) })} className="control-input" />
                  </div>
                </div>

                <label className="checkbox-label mb-4" style={{ fontSize: '0.8rem' }}><input type="checkbox" checked={state.showPT} onChange={e => applyState({ ...state, showPT: e.target.checked })} className="custom-checkbox"/> {t('token.pt_frame')}</label>
                
                <span className="control-label mb-2">{t('token.pt_frame')}</span>
                <div className="pt-badge-grid">
                  {PT_FRAMES.map(f => (
                    <div key={f.name} className={`pt-badge-item ${state.ptFrame?.name === f.name ? 'active' : ''}`} onClick={() => applyState({ ...state, ptFrame: f })}>
                      <img src={f.url} alt={f.name} />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* TAB: TEXT */}
          {activeTab === 'text' && (
            <>
              <div className="sidebar-panel-title">📝 {t('token.title')}</div>
              <div className="control-group">
                <div className="control-field mb-4">
                  <span className="control-label">{t('token.card_name')}</span>
                  <input type="text" className="control-input" value={state.name} onChange={e => applyState({ ...state, name: e.target.value })} onClick={() => setActiveLayer('name')} list="token-names" />
                  <label className="checkbox-label mt-2" style={{ fontSize: '0.8rem' }}><input type="checkbox" checked={state.showName !== false} onChange={e => applyState({ ...state, showName: e.target.checked })} className="custom-checkbox"/> {t('common.preview')} {t('token.card_name')}</label>
                </div>
                
                <ColorPickerField 
                  label="Colore Nome" 
                  value={state.nameStyle.color} 
                  onChange={v => update('nameStyle', { color: v })}
                  onTarget={() => setActiveLayer('name')}
                  fontValue={state.nameStyle.fontFamily}
                  onFontChange={v => update('nameStyle', { fontFamily: v })}
                />

                <div className="control-row">
                  <div className="control-field">
                    <span className="control-label">Dimensione Nome ({state.nameStyle.fontSize}px)</span>
                    <input type="range" min="10" max="60" value={state.nameStyle.fontSize} onChange={e => update('nameStyle', { fontSize: Number(e.target.value) })} className="control-input" />
                  </div>
                </div>

                <hr className="my-4 border-[var(--border)] opacity-30" />

                <div className="control-field mb-4">
                  <span className="control-label">{t('token.type_line')}</span>
                  <input type="text" className="control-input" value={state.type} onChange={e => applyState({ ...state, type: e.target.value })} onClick={() => setActiveLayer('type')} list="token-types" />
                  <label className="checkbox-label mt-2" style={{ fontSize: '0.8rem' }}><input type="checkbox" checked={state.showType !== false} onChange={e => applyState({ ...state, showType: e.target.checked })} className="custom-checkbox"/> {t('common.preview')} {t('token.type_line')}</label>
                </div>

                <ColorPickerField 
                  label="Colore Tipo" 
                  value={state.typeStyle.color} 
                  onChange={v => update('typeStyle', { color: v })}
                  onTarget={() => setActiveLayer('type')}
                  fontValue={state.typeStyle.fontFamily}
                  onFontChange={v => update('typeStyle', { fontFamily: v })}
                />
                
                <div className="control-row">
                  <div className="control-field">
                    <span className="control-label">Dimensione Tipo ({state.typeStyle.fontSize}px)</span>
                    <input type="range" min="10" max="40" value={state.typeStyle.fontSize} onChange={e => update('typeStyle', { fontSize: Number(e.target.value) })} className="control-input" />
                  </div>
                </div>

                <hr className="my-4 border-[var(--border)] opacity-30" />

                <div className="control-field mb-4">
                  <span className="control-label">{t('token.rules_text')}</span>
                  <textarea className="control-input control-textarea" value={state.ability} onChange={e => applyState({ ...state, ability: e.target.value })} onClick={() => setActiveLayer('ability')} />
                  <label className="checkbox-label mt-2" style={{ fontSize: '0.8rem' }}><input type="checkbox" checked={state.showAbility} onChange={e => applyState({ ...state, showAbility: e.target.checked })} className="custom-checkbox"/> {t('common.preview')} {t('token.rules_text')}</label>
                </div>

                <ColorPickerField 
                  label="Colore Regole" 
                  value={state.abilityStyle.color} 
                  onChange={v => update('abilityStyle', { color: v })}
                  onTarget={() => setActiveLayer('ability')}
                  fontValue={state.abilityStyle.fontFamily}
                  onFontChange={v => update('abilityStyle', { fontFamily: v })}
                />

                <div className="control-row">
                  <div className="control-field">
                    <span className="control-label">Dimensione ({state.abilityStyle.fontSize}px)</span>
                    <input type="range" min="8" max="40" value={state.abilityStyle.fontSize} onChange={e => update('abilityStyle', { fontSize: Number(e.target.value) })} className="control-input" />
                  </div>
                  <div className="control-field">
                    <span className="control-label">Interlinea ({state.abilityStyle.lineGap}px)</span>
                    <input type="range" min="0" max="20" value={state.abilityStyle.lineGap} onChange={e => update('abilityStyle', { lineGap: Number(e.target.value) })} className="control-input" />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB: INFO / CREDITS */}
          {activeTab === 'info' && (
            <>
              <div className="sidebar-panel-title">📜 {t('token.artist')} & {t('token.copyright')}</div>
              <div className="control-group">
                <ColorPickerField 
                  label="Testo Extra (Sx)" 
                  value={state.infoLeft.color} 
                  onChange={v => update('infoLeft', { color: v })}
                  onTarget={() => setActiveLayer('infoLeft')}
                  fontValue={state.infoLeft.fontFamily}
                  onFontChange={v => update('infoLeft', { fontFamily: v })}
                />
                <input type="text" className="control-input mb-2" value={state.infoLeft.text} onChange={e => update('infoLeft', { text: e.target.value })} placeholder="Es. C10/C20" />
                <label className="checkbox-label mb-4" style={{ fontSize: '0.8rem' }}><input type="checkbox" checked={state.showInfoLeft !== false} onChange={e => applyState({ ...state, showInfoLeft: e.target.checked })} className="custom-checkbox"/> {t('common.preview')} Extra</label>

                <hr className="my-4 border-[var(--border)] opacity-30" />

                <ColorPickerField 
                  label={t('token.artist')} 
                  value={state.artistStyle?.color || "#111111"} 
                  onChange={v => update('artistStyle', { color: v })}
                  onTarget={() => setActiveLayer('artist')}
                  fontValue={state.artistStyle.fontFamily}
                  onFontChange={v => update('artistStyle', { fontFamily: v })}
                />
                <input type="text" className="control-input mb-2" value={state.artist} onChange={e => applyState({ ...state, artist: e.target.value })} placeholder={t('token.artist')} />
                <label className="checkbox-label mb-4" style={{ fontSize: '0.8rem' }}><input type="checkbox" checked={state.showArtist !== false} onChange={e => applyState({ ...state, showArtist: e.target.checked })} className="custom-checkbox"/> {t('common.preview')} {t('token.artist')}</label>

                <hr className="my-4 border-[var(--border)] opacity-30" />

                <ColorPickerField 
                  label={t('token.copyright')} 
                  value={state.copyright.color} 
                  onChange={v => update('copyright', { color: v })}
                  onTarget={() => setActiveLayer('copyright')}
                  fontValue={state.copyright.fontFamily}
                  onFontChange={v => update('copyright', { fontFamily: v })}
                />
                <input type="text" className="control-input mb-2" value={state.copyright.text} onChange={e => update('copyright', { text: e.target.value })} placeholder="TM & © 2024 Wizards" />
                
                <div className="control-row">
                  <div className="control-field">
                    <span className="control-label">Dimensione ({state.copyright.fontSize}px)</span>
                    <input type="range" min="6" max="20" value={state.copyright.fontSize} onChange={e => update('copyright', { fontSize: Number(e.target.value) })} className="control-input" />
                  </div>
                </div>

                <label className="checkbox-label mb-2" style={{ fontSize: '0.8rem' }}><input type="checkbox" checked={state.showCopyright !== false} onChange={e => applyState({ ...state, showCopyright: e.target.checked })} className="custom-checkbox"/> {t('common.preview')} {t('token.copyright')}</label>

                <button className="btn btn-ghost w-full mt-6 text-xs" style={{ background: 'var(--surf-off)' }} onClick={resetFooterAlign}>🔄 {t('studio.refresh_lib')}</button>
              </div>
            </>
          )}

          {/* TAB: SETTINGS */}
          {activeTab === 'settings' && (
            <>
              <div className="sidebar-panel-title">⚙️ {t('common.export')} & {t('common.settings')}</div>
              <div className="control-group">
                <div className="control-field mb-2">
                  <label className="checkbox-label"><input type="checkbox" checked={exportBleed} onChange={e => setExportBleed(e.target.checked)} className="custom-checkbox"/> {t('pdf_settings.bleed')}</label>
                </div>
                <div className="control-field mb-4">
                  <label className="checkbox-label"><input type="checkbox" checked={exportCropMarks} onChange={e => setExportCropMarks(e.target.checked)} className="custom-checkbox"/> {t('pdf_settings.cut_marks')}</label>
                </div>
                <button className="btn btn-primary w-full" onClick={exportPNG}>⬇ {t('token.export_png')}</button>
                
                <hr className="my-4 border-[var(--border)]" />
                <div className="sidebar-panel-title" style={{ border: 'none', padding: '0 0 12px 0' }}>💾 {t('token.reset')}</div>
                <button className="btn btn-ghost w-full mb-2" style={{ background: 'var(--surf-off)' }} onClick={saveProject}>💾 {t('common.save')} JSON</button>
                <label className="btn btn-ghost w-full" style={{ background: 'var(--surf-off)', textAlign: 'center', cursor: 'pointer' }}>
                  📂 {t('common.open')} JSON
                  <input type="file" accept=".json" style={{ display: 'none' }} onChange={loadProject} />
                </label>
                <button className="btn btn-ghost w-full mt-4 text-error" onClick={() => applyState(DEFAULT_STATE)}>🗑️ {t('token.reset')}</button>
              </div>
            </>
          )}
        </aside>
      )}

      {/* MAIN WORKSPACE */}
      {(!isMobile || activeTab === 'preview') && (
        <main 
          className="editor-workspace"
          onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={e => { e.preventDefault(); setIsDraggingOver(false); }}
          onDrop={handleDrop}
        >
          {/* Universal Drop Overlay */}
          <div className={`drop-overlay ${isDraggingOver ? 'active' : ''}`}>
            Rilascia l'immagine per aggiornare l'Artwork
          </div>

          <div className="editor-toolbar justify-center gap-3">
            <button 
              className={`history-btn ${historyIdx > 0 ? 'active' : ''}`} 
              onClick={undo} 
              disabled={historyIdx === 0} 
              title={t('token.undo')}
            >
              <Icon d="M3 7v6h6M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
              <span className="history-label">{t('token.undo').toUpperCase()}</span>
            </button>
            <button 
              className={`history-btn ${historyIdx < history.length - 1 ? 'active' : ''}`} 
              onClick={redo} 
              disabled={historyIdx >= history.length - 1} 
              title={t('token.redo')}
            >
              <span className="history-label">{t('token.redo').toUpperCase()}</span>
              <Icon d="M21 7v6h-6M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" />
            </button>
            <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 8px' }}></div>
            <label className="checkbox-label" style={{ fontSize: '0.8rem' }}>
              <input type="checkbox" checked={showGuides} onChange={e => setShowGuides(e.target.checked)} className="custom-checkbox"/> {t('common.guides')}
            </label>
            {!isMobile && (
              <div className="ml-auto" style={{ display: 'flex', gap: '8px' }}>
                <select className="control-input py-1 text-xs w-auto" value={previewZoom} onChange={e => setPreviewZoom(Number(e.target.value))}>
                  <option value="75">75% Zoom</option><option value="100">100% Zoom</option><option value="125">125% Zoom</option>
                </select>
                <button className="btn btn-primary text-xs py-1" onClick={exportPNG}>{t('common.export')}</button>
              </div>
            )}
          </div>

          <div className="editor-canvas-container">
            {/* FLOATING CONTEXT MENU (Visible when a text layer is selected) */}
            {activeLayer !== 'art' && activeLayer !== 'frame' && activeLayer !== 'footer' && (
              <div className="context-menu" style={{ transform: `translateX(-50%) translateY(${isMobile ? 0 : -20}px)` }}>
                {activeLayer === 'name' && <input type="color" className="control-color" value={state.nameStyle.color} onChange={e => update('nameStyle', { color: e.target.value })} title="Colore Nome" />}
                {activeLayer === 'type' && <input type="color" className="control-color" value={state.typeStyle.color} onChange={e => update('typeStyle', { color: e.target.value })} title="Colore Tipo" />}
                {activeLayer === 'ability' && <input type="color" className="control-color" value={state.abilityStyle.color} onChange={e => update('abilityStyle', { color: e.target.value })} title="Colore Regole" />}
                {activeLayer === 'pt' && <input type="color" className="control-color" value={state.ptStyle.color} onChange={e => update('ptStyle', { color: e.target.value })} title="Colore PT" />}
                {activeLayer === 'infoLeft' && <input type="color" className="control-color" value={state.infoLeft.color} onChange={e => update('infoLeft', { color: e.target.value })} title="Colore Extra" />}
                {activeLayer === 'artist' && <input type="color" className="control-color" value={state.artistStyle.color} onChange={e => update('artistStyle', { color: e.target.value })} title="Colore Artista" />}
                {activeLayer === 'copyright' && <input type="color" className="control-color" value={state.copyright.color} onChange={e => update('copyright', { color: e.target.value })} title="Colore Copyright" />}
                <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }}></div>
                {activeLayer === 'name' && (
                  <>
                    <button className="btn btn-icon" onClick={() => update('nameStyle', { align: 'left' })}><Icon d="M3 6h18 M3 12h12 M3 18h18"/></button>
                    <button className="btn btn-icon" onClick={() => update('nameStyle', { align: 'center' })}><Icon d="M3 6h18 M6 12h12 M3 18h18"/></button>
                  </>
                )}
                {/* AutoFit Toggle */}
                <button className="btn btn-ghost text-xs px-2" onClick={() => {
                  if(activeLayer === 'name') update('autoFitName', !state.autoFitName);
                  if(activeLayer === 'type') update('autoFitType', !state.autoFitType);
                  if(activeLayer === 'ability') update('autoFitRules', !state.autoFitRules);
                }}>
                  { (activeLayer==='name'&&state.autoFitName) || (activeLayer==='type'&&state.autoFitType) || (activeLayer==='ability'&&state.autoFitRules) ? 'AutoFit: ON' : 'AutoFit: OFF' }
                </button>
              </div>
            )}

            <div className="canvas-wrapper" style={{ 
              width: CW * pScale, 
              height: CH * pScale,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              borderRadius: 26 * pScale,
              background: '#ffffff'
            }}>
              <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', background: 'transparent' }} />
              
              {!state.artUrl && (
                <div style={{ 
                  position: 'absolute', 
                  inset: 0, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  textAlign: 'center',
                  padding: '0 40px',
                  color: '#000',
                  fontWeight: 'bold',
                  opacity: 0.2,
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  pointerEvents: 'none',
                  fontSize: `${1.2 * pScale}rem`,
                  zIndex: 5
                }}>
                  {t('studio.bg_placeholder')}
                </div>
              )}
              <div className={`snap-line vertical ${snapGuides.x !== null ? 'visible' : ''}`} style={{ left: (snapGuides.x || 0) * pScale }} />
              <div className={`snap-line horizontal ${snapGuides.y !== null ? 'visible' : ''}`} style={{ top: (snapGuides.y || 0) * pScale }} />

              {showGuides && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', border: '1px dashed rgba(255,255,255,.05)' }} />
                  {Object.entries(boxes).map(([k, b]) => (
                    <div 
                      key={k} 
                      className={`canvas-layer-guide ${activeLayer === k ? 'active' : ''}`}
                      style={{ left: b.x * pScale, top: b.y * pScale, width: b.w * pScale, height: b.h * pScale, borderColor: b.c }} 
                    />
                  ))}
                </div>
              )}

              {/* Interaction Drag Layer */}
              <div 
                style={{ position: 'absolute', inset: 0, cursor: activeLayer === 'art' ? 'grab' : 'default', zIndex: 50 }}
                onMouseDown={e => beginDrag('art', e)}
                onTouchStart={e => beginDrag('art', e)}
              >
                {Object.entries(boxes).map(([k, b]) => (
                  <div 
                    key={k}
                    onMouseDown={e => beginDrag(k, e)}
                    onTouchStart={e => beginDrag(k, e)}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setActiveLayer(k); 
                      if (!isMobile) {
                        if(k==='name'||k==='type'||k==='ability') setActiveTab('text'); 
                        else if (k==='pt') setActiveTab('pt'); 
                        else if (k==='infoLeft'||k==='artist'||k==='copyright') setActiveTab('settings'); 
                      }
                    }}
                    style={{ position: 'absolute', left: b.x * pScale, top: b.y * pScale, width: b.w * pScale, height: b.h * pScale, cursor: 'move' }} 
                  />
                ))}
              </div>
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 10, right: 20, fontSize: 11, color: 'var(--faint)' }}>
            ✨ Canva Mode {t('common.success')}
          </div>
        </main>
      )}

      {/* Datalists for Token Suggestions */}
      <datalist id="token-names">
        <option value="Goblin" />
        <option value="Zombie" />
        <option value="Elf Warrior" />
        <option value="Treasure" />
        <option value="Clue" />
        <option value="Food" />
        <option value="Blood" />
        <option value="Angel" />
        <option value="Dragon" />
        <option value="Beast" />
        <option value="Construct" />
      </datalist>
      <datalist id="token-types">
        <option value="Token Creature — Goblin" />
        <option value="Token Creature — Zombie" />
        <option value="Token Creature — Elf Warrior" />
        <option value="Token Artifact — Treasure" />
        <option value="Token Artifact — Clue" />
        <option value="Token Artifact — Food" />
        <option value="Token Artifact — Blood" />
        <option value="Token Creature — Angel" />
        <option value="Token Creature — Dragon" />
        <option value="Token Creature — Beast" />
        <option value="Token Artifact Creature — Construct" />
      </datalist>
    </div>
  );
}