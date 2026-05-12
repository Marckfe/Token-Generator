import React, { useState, useRef, useEffect, useCallback } from "react";
import "./editor.css";

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
const FT = "Beleren, MatrixSC, Cinzel, Georgia, serif";
const FB = "MPlantin, 'Palatino Linotype', 'Book Antiqua', Georgia, serif";
const HISTORY_LIMIT = 40;

// --- IMAGE CACHE FOR 60FPS SYNCHRONOUS RENDERING ---
const imageCache = new Map();
let globalRenderCallback = null;

function getCachedImage(src) {
  if (!src) return null;
  if (imageCache.has(src)) {
    const cached = imageCache.get(src);
    return cached instanceof Image ? cached : null; // returns image if loaded, null if still loading or error
  }
  
  const img = new Image();
  img.crossOrigin = "anonymous";
  imageCache.set(src, "loading");
  
  img.onload = () => {
    imageCache.set(src, img);
    if (globalRenderCallback) globalRenderCallback();
  };
  img.onerror = () => {
    imageCache.set(src, null);
  };
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
        const img = getCachedImage(url);
        if (img) {
          ctx.drawImage(img, curX, y, symSize, symSize);
          curX += symSize + 1;
        } else {
          // If image is loading, draw placeholder text
          const token = `{${p.v}}`;
          ctx.fillText(token, curX, y);
          curX += ctx.measureText(token).width;
        }
      } else {
        const token = `{${p.v}}`;
        ctx.fillText(token, curX, y);
        curX += ctx.measureText(token).width;
      }
    }
  }
  return y;
}

function measureTextWidth(text, fontSize, family = FT, weight = "bold") {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.font = `${weight} ${fontSize}px ${family}`;
  return ctx.measureText(text || "").width;
}

function fitTextBox(text, startSize, minSize, width, linesLimit = 12) {
  const lines = String(text || "").split("\n");
  let size = startSize;
  while (size > minSize) {
    let ok = true;
    for (const line of lines) {
      if (measureTextWidth(line.replace(/\{[^}]+\}/g, "MM"), size, FB, "normal") > width) {
        ok = false; break;
      }
    }
    if (ok && lines.length <= linesLimit) return size;
    size -= 1;
  }
  return minSize;
}

function cloneState(s) { return JSON.parse(JSON.stringify(s)); }
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

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

  const fittedNameSize = state.autoFitName ? fitTextBox((name || "TOKEN").toUpperCase(), nameStyle.fontSize, 16, CW - 90, 1) : nameStyle.fontSize;
  ctx.save();
  ctx.font = `bold ${fittedNameSize}px ${FT}`;
  ctx.fillStyle = nameStyle.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = nameStyle.align || "center";
  const nameX = nameStyle.align === "left" ? nameStyle.x + 10 : nameStyle.align === "right" ? nameStyle.x + CW - 10 : nameStyle.x + CW / 2;
  ctx.fillText((name || "TOKEN").toUpperCase(), nameX, nameStyle.y);
  ctx.restore();

  const fittedTypeSize = state.autoFitType ? fitTextBox(type || "Token", typeStyle.fontSize, 14, CW - typeStyle.x - 40, 1) : typeStyle.fontSize;
  ctx.save();
  ctx.font = `bold ${fittedTypeSize}px ${FT}`;
  ctx.fillStyle = typeStyle.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = typeStyle.align || "left";
  ctx.fillText(type || "Token", typeStyle.x, typeStyle.y);
  ctx.restore();

  if (showAbility && ability) {
    const size = state.autoFitRules ? fitTextBox(ability, abilityStyle.fontSize, 14, abilityStyle.width || (CW - abilityStyle.x * 2), 10) : abilityStyle.fontSize;
    const lines = String(ability).split("\n");
    let curY = abilityStyle.y;
    for (const line of lines) {
      curY = drawManaText(ctx, line, abilityStyle.x, curY, size, abilityStyle.color, FB, abilityStyle.width || (CW - abilityStyle.x * 2));
      curY += Math.max(2, abilityStyle.lineGap || 4);
    }
  }

  if (showPT && ptFrame?.url) {
    const img = getCachedImage(ptFrame.url);
    if (img) ctx.drawImage(img, ptStyle.frameX, ptStyle.frameY, ptStyle.width, ptStyle.height);
    
    ctx.save();
    ctx.font = `bold ${ptStyle.fontSize}px ${FT}`;
    ctx.fillStyle = ptStyle.color;
    ctx.textBaseline = "middle";
    const pw = ctx.measureText(pt?.power || "0").width;
    const sw = ctx.measureText("/").width;
    const tw = pw + sw + ctx.measureText(pt?.toughness || "0").width;
    const ptCX = ptStyle.frameX + ptStyle.width / 2 + (ptStyle.powerOffsetX || 0);
    const ptCY = ptStyle.frameY + ptStyle.height / 2;
    ctx.textAlign = "left";
    ctx.fillText(pt?.power || "0", ptCX - tw / 2, ptCY);
    ctx.fillText("/", ptCX - tw / 2 + pw, ptCY);
    ctx.fillText(pt?.toughness || "0", ptCX - tw / 2 + pw + sw, ptCY);
    ctx.restore();
  }

  if (showInfoLeft && infoLeft) {
    ctx.save();
    ctx.font = `${infoLeft.fontSize || 11}px ${FT}`;
    ctx.fillStyle = infoLeft.color || "#1a1a1a";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(infoLeft.text || "", infoLeft.x || 18, CH - (infoLeft.y || 12));
    ctx.restore();
  }
  if (showArtist && infoLeft?.artist) {
    ctx.save();
    ctx.font = `${infoLeft.fontSize || 11}px ${FT}`;
    ctx.fillStyle = infoLeft.color || "#1a1a1a";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(`Illus. ${infoLeft.artist}`, infoLeft.x || 18, CH - (infoLeft.y || 12) + (infoLeft.fontSize || 11) + 2);
    ctx.restore();
  }
  if (showCopyright && copyright) {
    ctx.save();
    ctx.font = `${copyright.fontSize || 9}px ${FT}`;
    ctx.fillStyle = copyright.color || "#111";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "right";
    ctx.fillText(`™ & © ${copyright.year || new Date().getFullYear()} Wizards of the Coast`, CW - (copyright.x || 18), CH - (copyright.y || 12));
    ctx.restore();
  }
  ctx.restore();
}

function getGuideMetrics(state) {
  const nameSize = state.autoFitName ? fitTextBox((state.name || "TOKEN").toUpperCase(), state.nameStyle.fontSize, 16, CW - 90, 1) : state.nameStyle.fontSize;
  const typeSize = state.autoFitType ? fitTextBox(state.type || "Token", state.typeStyle.fontSize, 14, CW - state.typeStyle.x - 40, 1) : state.typeStyle.fontSize;
  const abilitySize = state.autoFitRules ? fitTextBox(state.ability || "", state.abilityStyle.fontSize, 14, state.abilityStyle.width || (CW - state.abilityStyle.x * 2), 10) : state.abilityStyle.fontSize;
  const typeWidth = measureTextWidth(state.type || "Token", typeSize, FT, "bold");
  const nameWidth = measureTextWidth((state.name || "TOKEN").toUpperCase(), nameSize, FT, "bold");
  const abilityLines = Math.max(1, String(state.ability || '').split('\n').length || 1);
  const abilityHeight = Math.max(54, abilityLines * (abilitySize * 1.45) + Math.max(8, state.abilityStyle.lineGap || 4) * (abilityLines - 1) + 12);
  const nameCenterX = state.nameStyle.align === 'left' ? state.nameStyle.x + 10 + nameWidth/2 : state.nameStyle.align === 'right' ? state.nameStyle.x + CW - 10 - nameWidth/2 : state.nameStyle.x + CW/2;
  
  return {
    name: { x: clamp(nameCenterX - nameWidth/2 - 10, 12, CW-12), y: state.nameStyle.y - Math.round(nameSize * 0.62), w: clamp(nameWidth + 20, 80, CW-24), h: Math.max(24, Math.round(nameSize * 1.18)), c: '#38bdf8' },
    type: { x: state.typeStyle.x - 4, y: state.typeStyle.y - Math.round(typeSize * 0.58), w: Math.max(100, typeWidth + 14), h: Math.max(22, Math.round(typeSize * 1.15)), c: '#22c55e' },
    ability: { x: state.abilityStyle.x - 4, y: state.abilityStyle.y - 4, w: state.abilityStyle.width || (CW - state.abilityStyle.x * 2), h: abilityHeight, c: '#f59e0b' },
    pt: { x: state.ptStyle.frameX + 6, y: state.ptStyle.frameY + 6, w: Math.max(20, state.ptStyle.width - 12), h: Math.max(20, state.ptStyle.height - 12), c: '#f472b6' },
    footer: { x: Math.max(10, (state.infoLeft?.x || 18) - 4), y: CH - (state.infoLeft?.y || 12) - Math.max(12, state.infoLeft?.fontSize || 11), w: CW - Math.max(10, (state.infoLeft?.x || 18) - 4) - Math.max(10, (state.copyright?.x || 18) - 4), h: Math.max(14, (state.infoLeft?.fontSize || 11) + 6), c: '#a78bfa' },
  };
}

function getDefaultFrame() { const firstSet = Object.keys(FRAME_MAP)[0]; return firstSet ? FRAME_MAP[firstSet][0] : null; }
function getDefaultPtFrame() { return PT_FRAMES[0] || null; }
const DEFAULT_STATE = {
  artUrl: "",
  artTransform: { zoom: 1, x: 0, y: 0 },
  frameSet: Object.keys(FRAME_MAP)[0] || "",
  frame: getDefaultFrame(),
  ptFrame: getDefaultPtFrame(),
  name: "Goblin",
  autoFitName: true,
  autoFitType: true,
  autoFitRules: false,
  nameStyle: { x: 0, y: 54, fontSize: 28, color: "#111111", align: "center" },
  type: "Token Creature — Goblin",
  typeStyle: { x: 44, y: 602, fontSize: 24, color: "#111111", align: "left" },
  ability: "Haste",
  abilityStyle: { x: 44, y: 644, width: 532, fontSize: 24, color: "#111111", lineGap: 4 },
  showAbility: true,
  pt: { power: "1", toughness: "1" },
  ptStyle: { frameX: 457, frameY: 789, width: 126, height: 54, fontSize: 28, color: "#111111", powerOffsetX: 0 },
  showPT: true,
  infoLeft: { text: "SET • EN", artist: "Artist", x: 18, y: 12, color: "#111111", fontSize: 11 },
  showInfoLeft: true,
  showArtist: true,
  copyright: { year: new Date().getFullYear(), x: 18, y: 12, color: "#111111", fontSize: 9 },
  showCopyright: true,
};

export default function TokenPreviewSinglePtFrame() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 900);
  const [state, setState] = useState(DEFAULT_STATE);
  const [history, setHistory] = useState([cloneState(DEFAULT_STATE)]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [activeLayer, setActiveLayer] = useState('art');
  const [showGuides, setShowGuides] = useState(true);
  const [withBleed, setWithBleed] = useState(false);
  const [pngScale, setPngScale] = useState(4);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [mobileTab, setMobileTab] = useState('preview');
  
  const canvasRef = useRef(null);
  const artInputRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const triggerRender = useCallback(() => {
    if (canvasRef.current) {
      renderCardSync(canvasRef.current, state, false);
    }
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

  // DRAG LOGIC
  const beginDrag = (kind, e) => {
    e.preventDefault(); e.stopPropagation();
    const t = e.touches?.[0] || e;
    dragRef.current = { kind, startX: t.clientX, startY: t.clientY, snapshot: cloneState(state) };
    setActiveLayer(kind);
    
    const move = ev => {
      if (!dragRef.current) return;
      // We use requestAnimationFrame implicitly by relying on React state updates 
      // which are fast because of synchronous canvas drawing.
      const p = ev.touches?.[0] || ev;
      const baseScale = isMobile ? Math.min((window.innerWidth - 20) / CW, (window.innerHeight - 200) / CH) : Math.min(0.9, (window.innerWidth - 450) / CW);
      const pScale = isMobile ? Math.max(0.46, baseScale) : Math.max(0.34, baseScale * (previewZoom / 100));
      
      const dx = (p.clientX - dragRef.current.startX) / pScale;
      const dy = (p.clientY - dragRef.current.startY) / pScale;
      
      const snap = dragRef.current.snapshot;
      let next = cloneState(snap);
      
      if (kind === 'art') next.artTransform = { ...next.artTransform, x: Math.round(snap.artTransform.x + dx), y: Math.round(snap.artTransform.y + dy) };
      if (kind === 'name') next.nameStyle = { ...next.nameStyle, x: Math.round(snap.nameStyle.x + dx), y: Math.round(snap.nameStyle.y + dy) };
      if (kind === 'type') next.typeStyle = { ...next.typeStyle, x: Math.round(snap.typeStyle.x + dx), y: Math.round(snap.typeStyle.y + dy) };
      if (kind === 'ability') next.abilityStyle = { ...next.abilityStyle, x: Math.round(snap.abilityStyle.x + dx), y: Math.round(snap.abilityStyle.y + dy) };
      if (kind === 'pt') next.ptStyle = { ...next.ptStyle, frameX: Math.round(snap.ptStyle.frameX + dx), frameY: Math.round(snap.ptStyle.frameY + dy) };
      if (kind === 'footer') next.infoLeft = { ...next.infoLeft, x: Math.round((snap.infoLeft?.x||18) + dx), y: Math.round((snap.infoLeft?.y||12) - dy) };
      
      dragRef.current.lastState = next;
      applyState(next, false);
    };
    
    const up = () => {
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

  const nudge = (layer, dx, dy) => {
    let next = cloneState(state);
    if (layer === 'art') next.artTransform = { ...next.artTransform, x: next.artTransform.x + dx, y: next.artTransform.y + dy };
    if (layer === 'name') next.nameStyle = { ...next.nameStyle, x: next.nameStyle.x + dx, y: next.nameStyle.y + dy };
    if (layer === 'type') next.typeStyle = { ...next.typeStyle, x: next.typeStyle.x + dx, y: next.typeStyle.y + dy };
    if (layer === 'ability') next.abilityStyle = { ...next.abilityStyle, x: next.abilityStyle.x + dx, y: next.abilityStyle.y + dy };
    if (layer === 'pt') next.ptStyle = { ...next.ptStyle, frameX: next.ptStyle.frameX + dx, frameY: next.ptStyle.frameY + dy };
    if (layer === 'footer') next.infoLeft = { ...next.infoLeft, x: next.infoLeft.x + dx, y: next.infoLeft.y - dy };
    applyState(next);
  };

  useEffect(() => {
    const onKey = e => {
      if (!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) return;
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      
      const step = e.shiftKey ? 10 : 1;
      e.preventDefault();
      if (e.key === 'ArrowUp') nudge(activeLayer, 0, -step);
      if (e.key === 'ArrowDown') nudge(activeLayer, 0, step);
      if (e.key === 'ArrowLeft') nudge(activeLayer, -step, 0);
      if (e.key === 'ArrowRight') nudge(activeLayer, step, 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeLayer, state]);

  // Actions
  const onArtFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => applyState({ ...state, artUrl: ev.target.result, artTransform: { zoom: 1, x: 0, y: 0 } });
    reader.readAsDataURL(file);
  };
  
  const onFrameSetChange = setName => {
    const frames = FRAME_MAP[setName] || [];
    applyState({ ...state, frameSet: setName, frame: frames[0] || null });
  };
  
  const exportPNG = () => {
    const c = document.createElement('canvas');
    renderCardSync(c, state, withBleed);
    const out = document.createElement('canvas');
    out.width = c.width * pngScale;
    out.height = c.height * pngScale;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(c, 0, 0, out.width, out.height);
    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `${(state.name || 'token').replace(/\s+/g,'_')}_${pngScale}x.png`;
    a.click();
  };
  
  const resetAll = () => {
    const next = { ...DEFAULT_STATE, artUrl:'', artTransform:{ zoom:1, x:0, y:0 }, copyright:{ ...DEFAULT_STATE.copyright, year:new Date().getFullYear() } };
    applyState(next);
    if (artInputRef.current) artInputRef.current.value = '';
  };
  
  const undo = () => {
    if (historyIdx === 0) return;
    const prev = cloneState(history[historyIdx - 1]);
    setState(prev); setHistoryIdx(historyIdx - 1);
  };
  const redo = () => {
    if (historyIdx >= history.length - 1) return;
    const next = cloneState(history[historyIdx + 1]);
    setState(next); setHistoryIdx(historyIdx + 1);
  };

  const baseScale = isMobile ? Math.min((window.innerWidth - 20) / CW, (window.innerHeight - 200) / CH) : Math.min(0.9, (window.innerWidth - 450) / CW);
  const pScale = isMobile ? Math.max(0.46, baseScale) : Math.max(0.34, baseScale * (previewZoom / 100));
  const boxes = getGuideMetrics(state);

  return (
    <div className={`editor-layout ${isMobile ? 'mobile' : ''}`}>
      {/* Mobile Tabs */}
      {isMobile && (
        <div className="mobile-editor-tabs">
          <button className={`mobile-editor-tab ${mobileTab === 'preview' ? 'active' : ''}`} onClick={() => setMobileTab('preview')}>Anteprima</button>
          <button className={`mobile-editor-tab ${mobileTab === 'controls' ? 'active' : ''}`} onClick={() => setMobileTab('controls')}>Strumenti</button>
        </div>
      )}

      {/* Sidebar Controls */}
      {(!isMobile || mobileTab === 'controls') && (
        <aside className="editor-sidebar">
          {/* Layer Chips */}
          <div className="layer-chips">
            {['art','name','type','ability','pt','footer'].map(key => (
              <button 
                key={key} 
                className={`layer-chip ${activeLayer === key ? 'active' : ''}`} 
                onClick={() => setActiveLayer(key)}
              >
                {{art:'🎨 Artwork', name:'📝 Nome', type:'🏷️ Tipo', ability:'📜 Regole', pt:'⚔️ P/T', footer:'©️ Footer'}[key]}
              </button>
            ))}
          </div>

          <div className="control-group">
            <div className="control-group-header">Artwork & Frame</div>
            <div className="control-row">
              <div className="control-field">
                <span className="control-label">Immagine</span>
                <input ref={artInputRef} type="file" accept="image/*" onChange={onArtFile} className="control-input" style={{ padding: '6px' }} />
              </div>
            </div>
            <div className="control-row">
              <div className="control-field">
                <span className="control-label">Zoom ({state.artTransform.zoom}x)</span>
                <input type="range" min="0.8" max="2.2" step="0.01" value={state.artTransform.zoom} onChange={e => update('artTransform', { zoom: Number(e.target.value) })} className="control-input" />
              </div>
            </div>
            <div className="control-row">
              <div className="control-field">
                <span className="control-label">Set</span>
                <select className="control-input control-select" value={state.frameSet} onChange={e => onFrameSetChange(e.target.value)}>
                  {Object.keys(FRAME_MAP).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="control-field">
                <span className="control-label">Stile</span>
                <select className="control-input control-select" value={state.frame?.name || ''} onChange={e => applyState({ ...state, frame: (FRAME_MAP[state.frameSet] || []).find(f => f.name === e.target.value) || null })}>
                  {(FRAME_MAP[state.frameSet] || []).map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="control-group">
            <div className="control-group-header">Testi Principali</div>
            <div className="control-row">
              <div className="control-field" style={{ flex: 2 }}>
                <span className="control-label">Nome Carta</span>
                <input type="text" className="control-input" value={state.name} onChange={e => applyState({ ...state, name: e.target.value })} />
              </div>
              <div className="control-field">
                <span className="control-label">Size</span>
                <input type="number" className="control-input" value={state.nameStyle.fontSize} onChange={e => update('nameStyle', { fontSize: Number(e.target.value) })} disabled={state.autoFitName} />
              </div>
            </div>
            <div className="control-row">
              <div className="control-field" style={{ flex: 2 }}>
                <span className="control-label">Tipo</span>
                <input type="text" className="control-input" value={state.type} onChange={e => applyState({ ...state, type: e.target.value })} />
              </div>
              <div className="control-field">
                <span className="control-label">Size</span>
                <input type="number" className="control-input" value={state.typeStyle.fontSize} onChange={e => update('typeStyle', { fontSize: Number(e.target.value) })} disabled={state.autoFitType} />
              </div>
            </div>
          </div>

          <div className="control-group">
            <div className="control-group-header">Testo Regole</div>
            <div className="control-field mb-2">
              <span className="control-label">Testo (usa {'{G}'} per i simboli mana)</span>
              <textarea className="control-input control-textarea" value={state.ability} onChange={e => applyState({ ...state, ability: e.target.value })} />
            </div>
            <div className="control-row">
              <label className="checkbox-label" style={{ fontSize: '0.75rem' }}><input type="checkbox" checked={state.showAbility} onChange={e => applyState({ ...state, showAbility: e.target.checked })} className="custom-checkbox"/> Mostra</label>
              <label className="checkbox-label" style={{ fontSize: '0.75rem' }}><input type="checkbox" checked={state.autoFitRules} onChange={e => applyState({ ...state, autoFitRules: e.target.checked })} className="custom-checkbox"/> Auto-fit</label>
            </div>
          </div>

          <div className="control-group">
            <div className="control-group-header">Forza/Costituzione & Frame P/T</div>
            <div className="control-row">
              <div className="control-field">
                <span className="control-label">Forza</span>
                <input type="text" className="control-input" value={state.pt.power} onChange={e => applyState({ ...state, pt: { ...state.pt, power: e.target.value } })} />
              </div>
              <div className="control-field">
                <span className="control-label">Costituzione</span>
                <input type="text" className="control-input" value={state.pt.toughness} onChange={e => applyState({ ...state, pt: { ...state.pt, toughness: e.target.value } })} />
              </div>
            </div>
            <div className="control-row">
              <div className="control-field">
                <span className="control-label">Frame P/T</span>
                <select className="control-input control-select" value={state.ptFrame?.name || ''} onChange={e => applyState({ ...state, ptFrame: PT_FRAMES.find(f => f.name === e.target.value) || null })}>
                  {PT_FRAMES.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                </select>
              </div>
              <label className="checkbox-label mt-3" style={{ fontSize: '0.75rem' }}><input type="checkbox" checked={state.showPT} onChange={e => applyState({ ...state, showPT: e.target.checked })} className="custom-checkbox"/> Mostra</label>
            </div>
          </div>

        </aside>
      )}

      {/* Main Workspace (Toolbar + Canvas) */}
      {(!isMobile || mobileTab === 'preview') && (
        <main className="editor-workspace">
          {/* Top Toolbar */}
          <div className="editor-toolbar">
            <button className="btn btn-icon" onClick={undo} disabled={historyIdx === 0} title="Annulla">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>
            </button>
            <button className="btn btn-icon" onClick={redo} disabled={historyIdx >= history.length - 1} title="Ripeti">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/></svg>
            </button>
            <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 8px' }}></div>
            
            <label className="checkbox-label" style={{ fontSize: '0.8rem' }} title="Mostra guide tratteggiate">
              <input type="checkbox" checked={showGuides} onChange={e => setShowGuides(e.target.checked)} className="custom-checkbox"/> Guide
            </label>
            
            <div className="ml-auto flex" style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-ghost text-xs" onClick={resetAll}>Reset</button>
              <button className="btn btn-primary" onClick={exportPNG}>⬇ Esporta PNG</button>
            </div>
          </div>

          {/* Canvas Area */}
          <div className="editor-canvas-container">
            <div className="canvas-wrapper" style={{ width: CW * pScale, height: CH * pScale }}>
              <canvas 
                ref={canvasRef} 
                style={{ width: '100%', height: '100%', display: 'block', borderRadius: 16 * (pScale/0.5), background: '#0d0d0d' }} 
              />
              
              {showGuides && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', border: '1px dashed rgba(255,255,255,.1)' }} />
                  {Object.entries(boxes).map(([k, b]) => (
                    <div 
                      key={k} 
                      className={`canvas-layer-guide ${activeLayer === k ? 'active' : ''}`}
                      style={{ left: b.x * pScale, top: b.y * pScale, width: b.w * pScale, height: b.h * pScale, borderColor: b.c }} 
                    />
                  ))}
                </div>
              )}

              {/* Interaction Layer */}
              <div 
                style={{ position: 'absolute', inset: 0, cursor: activeLayer === 'art' ? 'grab' : 'default', zIndex: 50 }}
                onMouseDown={e => beginDrag('art', e)}
                onTouchStart={e => beginDrag('art', e)}
              >
                {/* Specific draggable handles for text boxes over the art layer */}
                {Object.entries(boxes).map(([k, b]) => (
                  <div 
                    key={k}
                    onMouseDown={e => beginDrag(k === 'footer' ? 'footer' : k, e)}
                    onTouchStart={e => beginDrag(k === 'footer' ? 'footer' : k, e)}
                    onClick={(e) => { e.stopPropagation(); setActiveLayer(k); }}
                    style={{ position: 'absolute', left: b.x * pScale, top: b.y * pScale, width: b.w * pScale, height: b.h * pScale, cursor: 'move' }} 
                  />
                ))}
              </div>
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 10, right: 20, fontSize: 11, color: 'var(--faint)' }}>
            Trascina sulla carta. Maiusc + Frecce = Muovi
          </div>
        </main>
      )}
    </div>
  );
}