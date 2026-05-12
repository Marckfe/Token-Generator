import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";

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
function cloneState(s) { return JSON.parse(JSON.stringify(s)); }
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

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

async function renderCard(canvas, state, withBleed = false) {
  const { artUrl, artTransform, frame, ptFrame, name, nameStyle, type, typeStyle, ability, abilityStyle, showAbility, pt, ptStyle, showPT, infoLeft, showInfoLeft, showArtist, copyright, showCopyright } = state;
  const B = withBleed ? BLEED : 0;
  const TW = CW + B * 2;
  const TH = CH + B * 2;
  canvas.width = TW;
  canvas.height = TH;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, TW, TH);

  if (artUrl) {
    try {
      const img = await loadImg(artUrl);
      const zoom = artTransform?.zoom || 1;
      const offsetX = artTransform?.x || 0;
      const offsetY = artTransform?.y || 0;
      const drawW = TW * zoom;
      const drawH = TH * zoom;
      const dx = (TW - drawW) / 2 + offsetX;
      const dy = (TH - drawH) / 2 + offsetY;
      ctx.drawImage(img, dx, dy, drawW, drawH);
    } catch {}
  }

  ctx.save();
  ctx.translate(B, B);

  if (frame?.url) {
    try {
      const img = await loadImg(frame.url);
      ctx.drawImage(img, 0, 0, CW, CH);
    } catch {}
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
      curY = await drawManaText(ctx, line, abilityStyle.x, curY, size, abilityStyle.color, FB, abilityStyle.width || (CW - abilityStyle.x * 2));
      curY += Math.max(2, abilityStyle.lineGap || 4);
    }
  }

  if (showPT && ptFrame?.url) {
    try {
      const img = await loadImg(ptFrame.url);
      ctx.drawImage(img, ptStyle.frameX, ptStyle.frameY, ptStyle.width, ptStyle.height);
    } catch {}
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

function useScreenInfo() {
  const [info, setInfo] = useState({ w: typeof window !== "undefined" ? window.innerWidth : 1440, h: typeof window !== "undefined" ? window.innerHeight : 900 });
  useEffect(() => {
    const onResize = () => setInfo({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return { ...info, mobile: info.w < 900 };
}

const Input = React.forwardRef(function Input(props, ref) {
  return <input ref={ref} {...props} style={{ width:"100%", background:"#11100f", color:"#ece9e4", border:"1px solid #393836", borderRadius:8, padding:"9px 10px", fontSize:13, outline:"none", ...(props.style||{}) }} />;
});
function Textarea(props) { return <textarea {...props} style={{ width:"100%", background:"#11100f", color:"#ece9e4", border:"1px solid #393836", borderRadius:8, padding:"9px 10px", fontSize:13, outline:"none", resize:"both", minHeight:120, ...(props.style||{}) }} />; }
function Select(props) { return <select {...props} style={{ width:"100%", background:"#11100f", color:"#ece9e4", border:"1px solid #393836", borderRadius:8, padding:"9px 10px", fontSize:13, outline:"none", ...(props.style||{}) }} />; }
function Field({ label, children }) { return <label style={{ display:"grid", gap:6, fontSize:12, color:"#b8b5b1" }}><span>{label}</span>{children}</label>; }
function Row({ children }) { return <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:8 }}>{children}</div>; }
function LayerChip({ active, label, onClick }) { return <button onClick={onClick} style={{ padding:"8px 10px", borderRadius:999, border:`1px solid ${active ? '#4f98a3' : '#393836'}`, background: active ? 'rgba(79,152,163,.15)' : '#201f1d', color: active ? '#7dd3dc' : '#c7c4bf', fontSize:12, cursor:'pointer' }}>{label}</button>; }
function Section({ title, right, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border:"1px solid #393836", borderRadius:12, overflow:"hidden", background:"#1c1b19" }}>
      <button onClick={() => setOpen(v => !v)} style={{ width:"100%", padding:"11px 14px", background:"#252420", border:"none", color:"#e7e5e4", display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
        <strong style={{ fontSize:13 }}>{title}</strong><span style={{ marginLeft:"auto", fontSize:11, opacity:.8 }}>{right}</span><span style={{ fontSize:11, opacity:.7 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ padding:12, display:"grid", gap:10 }}>{children}</div>}
    </div>
  );
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
function GuideOverlay({ activeLayer, state, scale }) {
  const boxes = getGuideMetrics(state);
  return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none' }}>
      <div style={{ position:'absolute', left:0, top:0, width:CW*scale, height:CH*scale, border:'1px dashed rgba(255,255,255,.2)' }} />
      {Object.entries(boxes).map(([k, b]) => (
        <div key={k} style={{ position:'absolute', left:b.x*scale, top:b.y*scale, width:b.w*scale, height:b.h*scale, border:`${activeLayer===k ? 2 : 1}px dashed ${b.c}`, background: activeLayer===k ? `${b.c}20` : 'transparent', borderRadius:6 }} />
      ))}
    </div>
  );
}

function PreviewCard({ mobile, canvasRef, previewScale, showGuides, activeLayer, state, applyState, setActiveLayer }) {
  const dragRef = useRef(null);
  const beginDrag = (kind, e) => {
    e.preventDefault(); e.stopPropagation();
    const t = e.touches?.[0] || e;
    dragRef.current = { kind, startX:t.clientX, startY:t.clientY, snapshot: cloneState(state) };
    const move = ev => {
      if (!dragRef.current) return;
      const p = ev.touches?.[0] || ev;
      const dx = (p.clientX - dragRef.current.startX) / previewScale;
      const dy = (p.clientY - dragRef.current.startY) / previewScale;
      const snap = dragRef.current.snapshot;
      let next = cloneState(snap);
      if (kind === 'art') next.artTransform = { ...next.artTransform, x: Math.round(snap.artTransform.x + dx), y: Math.round(snap.artTransform.y + dy) };
      if (kind === 'name') next.nameStyle = { ...next.nameStyle, x: Math.round(snap.nameStyle.x + dx), y: Math.round(snap.nameStyle.y + dy) };
      if (kind === 'type') next.typeStyle = { ...next.typeStyle, x: Math.round(snap.typeStyle.x + dx), y: Math.round(snap.typeStyle.y + dy) };
      if (kind === 'ability') next.abilityStyle = { ...next.abilityStyle, x: Math.round(snap.abilityStyle.x + dx), y: Math.round(snap.abilityStyle.y + dy) };
      if (kind === 'pt') next.ptStyle = { ...next.ptStyle, frameX: Math.round(snap.ptStyle.frameX + dx), frameY: Math.round(snap.ptStyle.frameY + dy) };
      if (kind === 'footer') next.infoLeft = { ...next.infoLeft, x: Math.round((snap.infoLeft?.x||18) + dx), y: Math.round((snap.infoLeft?.y||12) - dy) };
      applyState(next, false);
    };
    const up = () => {
      if (dragRef.current) applyState(cloneState(dragRef.current.snapshot), true, kind);
      dragRef.current = null;
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive:false });
    window.addEventListener('touchend', up);
  };
  const boxes = getGuideMetrics(state);
  return (
    <div style={{ position: mobile ? 'relative' : 'sticky', top:12 }}>
      {!mobile && <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
        {['art','name','type','ability','pt','footer'].map(key => <LayerChip key={key} active={activeLayer===key} label={{art:'Artwork',name:'Name',type:'Type',ability:'Text',pt:'P/T',footer:'Footer'}[key]} onClick={() => setActiveLayer(key)} />)}
      </div>}
      <div style={{ position:'relative', overflow: mobile ? 'hidden' : 'auto', background:'#141311', border:'1px solid #393836', borderRadius:16, padding: mobile ? 8 : 14, minHeight: mobile ? 'auto' : 520 }}>
        <div style={{ position:'relative', width:CW*previewScale, height:CH*previewScale, margin:'0 auto', boxShadow:'0 12px 30px rgba(0,0,0,.35)', maxWidth:'100%' }}>
          <canvas ref={canvasRef} style={{ width:CW*previewScale, height:CH*previewScale, display:'block', borderRadius:18, background:'#0d0d0d' }} />
          {showGuides && <GuideOverlay activeLayer={activeLayer} state={state} scale={previewScale} />}
          <button onMouseDown={e => { setActiveLayer('art'); beginDrag('art', e); }} onTouchStart={e => { setActiveLayer('art'); beginDrag('art', e); }} style={{ position:'absolute', inset:0, border:'none', background:'transparent', cursor:'grab' }} />
          {Object.entries(boxes).map(([k,b]) => <div key={k} onMouseDown={e => beginDrag(k==='footer'?'footer':k, e)} onTouchStart={e => beginDrag(k==='footer'?'footer':k, e)} onClick={() => setActiveLayer(k)} style={{ position:'absolute', left:b.x*previewScale, top:b.y*previewScale, width:b.w*previewScale, height:b.h*previewScale, cursor:'move' }} />)}
        </div>
      </div>
    </div>
  );
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
  const screen = useScreenInfo();
  const [state, setState] = useState(DEFAULT_STATE);
  const [history, setHistory] = useState([cloneState(DEFAULT_STATE)]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [activeLayer, setActiveLayer] = useState('art');
  const [showGuides, setShowGuides] = useState(true);
  const [withBleed, setWithBleed] = useState(false);
  const [pngScale, setPngScale] = useState(4);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [mobilePanel, setMobilePanel] = useState('preview');
  const canvasRef = useRef(null);
  const artInputRef = useRef(null);

  const basePreviewScale = screen.mobile ? Math.min((screen.w - 24) / CW, ((screen.h - 170)) / CH) : Math.min(0.9, (screen.w - 560) / CW);
  const previewScale = screen.mobile ? Math.max(0.46, basePreviewScale) : Math.max(0.34, basePreviewScale * (previewZoom / 100));

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

  useEffect(() => { if (canvasRef.current) renderCard(canvasRef.current, state, false); }, [state]);

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

  const exportPNG = async () => {
    const c = document.createElement('canvas');
    await renderCard(c, state, withBleed);
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
  const exportPreset = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(state.name || 'token').replace(/\s+/g,'_')}.json`;
    a.click();
  };
  const importPreset = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const next = { ...DEFAULT_STATE, ...parsed, artTransform:{ ...DEFAULT_STATE.artTransform, ...(parsed.artTransform||{}) }, infoLeft:{ ...DEFAULT_STATE.infoLeft, ...(parsed.infoLeft||{}) }, copyright:{ ...DEFAULT_STATE.copyright, ...(parsed.copyright||{}) } };
        applyState(next);
      } catch {}
    };
    r.readAsText(f); e.target.value = '';
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
    if (artInputRef.current && !prev.artUrl) artInputRef.current.value = '';
  };
  const redo = () => {
    if (historyIdx >= history.length - 1) return;
    const next = cloneState(history[historyIdx + 1]);
    setState(next); setHistoryIdx(historyIdx + 1);
  };

  const frameSetNames = Object.keys(FRAME_MAP);
  const currentSetFrames = FRAME_MAP[state.frameSet] || [];
  const editorPanel = (
    <div style={{ display:'grid', gap:12, alignSelf:'start' }}>
      <Section title='Artwork' right='crop + move'>
        <Field label='Immagine'><Input ref={artInputRef} type='file' accept='image/*' onChange={onArtFile} /></Field>
        <Row>
          <Field label='Zoom'><Input type='range' min='0.8' max='2.2' step='0.01' value={state.artTransform.zoom} onChange={e => update('artTransform', { zoom:Number(e.target.value) })} /></Field>
          <Field label='X'><Input type='number' value={state.artTransform.x} onChange={e => update('artTransform', { x:Number(e.target.value) })} /></Field>
          <Field label='Y'><Input type='number' value={state.artTransform.y} onChange={e => update('artTransform', { y:Number(e.target.value) })} /></Field>
        </Row>
      </Section>

      <Section title='Frame' right={state.frame?.name || 'selezione'}>
        <Row>
          <Field label='Set'><Select value={state.frameSet} onChange={e => onFrameSetChange(e.target.value)}>{frameSetNames.map(n => <option key={n} value={n}>{n}</option>)}</Select></Field>
          <Field label='Frame'><Select value={state.frame?.name || ''} onChange={e => applyState({ ...state, frame: currentSetFrames.find(f => f.name===e.target.value) || null })}>{currentSetFrames.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}</Select></Field>
          <Field label='PT Frame'><Select value={state.ptFrame?.name || ''} onChange={e => applyState({ ...state, ptFrame: PT_FRAMES.find(f => f.name===e.target.value) || null })}>{PT_FRAMES.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}</Select></Field>
        </Row>
      </Section>

      <Section title='Text' right={activeLayer}>
        <Field label='Nome'><Input value={state.name} onChange={e => applyState({ ...state, name:e.target.value })} /></Field>
        <Row>
          <Field label='Auto fit'><input type='checkbox' checked={state.autoFitName} onChange={e => applyState({ ...state, autoFitName:e.target.checked })} /></Field>
          <Field label='Name size'><Input type='number' value={state.nameStyle.fontSize} onChange={e => update('nameStyle', { fontSize:Number(e.target.value) })} /></Field>
          <Field label='Name Y'><Input type='number' value={state.nameStyle.y} onChange={e => update('nameStyle', { y:Number(e.target.value) })} /></Field>
          <Field label='Name color'><Input type='color' value={state.nameStyle.color} onChange={e => update('nameStyle', { color:e.target.value })} style={{ padding:4, height:42 }} /></Field>
          <Field label='Align'><Select value={state.nameStyle.align} onChange={e => update('nameStyle', { align:e.target.value })}><option value='left'>left</option><option value='center'>center</option><option value='right'>right</option></Select></Field>
        </Row>
        <Field label='Type line'><Input value={state.type} onChange={e => applyState({ ...state, type:e.target.value })} /></Field>
        <Row>
          <Field label='Auto fit'><input type='checkbox' checked={state.autoFitType} onChange={e => applyState({ ...state, autoFitType:e.target.checked })} /></Field>
          <Field label='Type size'><Input type='number' value={state.typeStyle.fontSize} onChange={e => update('typeStyle', { fontSize:Number(e.target.value) })} /></Field>
          <Field label='Type X'><Input type='number' value={state.typeStyle.x} onChange={e => update('typeStyle', { x:Number(e.target.value) })} /></Field>
          <Field label='Type Y'><Input type='number' value={state.typeStyle.y} onChange={e => update('typeStyle', { y:Number(e.target.value) })} /></Field>
          <Field label='Type color'><Input type='color' value={state.typeStyle.color} onChange={e => update('typeStyle', { color:e.target.value })} style={{ padding:4, height:42 }} /></Field>
        </Row>
        <Field label='Rules text'><Textarea rows={6} value={state.ability} onChange={e => applyState({ ...state, ability:e.target.value })} /></Field>
        <Row>
          <Field label='Show text'><input type='checkbox' checked={state.showAbility} onChange={e => applyState({ ...state, showAbility:e.target.checked })} /></Field>
          <Field label='Auto fit'><input type='checkbox' checked={state.autoFitRules} onChange={e => applyState({ ...state, autoFitRules:e.target.checked })} /></Field>
          <Field label='Text size'><Input type='number' value={state.abilityStyle.fontSize} onChange={e => update('abilityStyle', { fontSize:Number(e.target.value) })} /></Field>
          <Field label='Text width'><Input type='number' value={state.abilityStyle.width} onChange={e => update('abilityStyle', { width:Number(e.target.value) })} /></Field>
          <Field label='Text X'><Input type='number' value={state.abilityStyle.x} onChange={e => update('abilityStyle', { x:Number(e.target.value) })} /></Field>
          <Field label='Text Y'><Input type='number' value={state.abilityStyle.y} onChange={e => update('abilityStyle', { y:Number(e.target.value) })} /></Field>
          <Field label='Text color'><Input type='color' value={state.abilityStyle.color} onChange={e => update('abilityStyle', { color:e.target.value })} style={{ padding:4, height:42 }} /></Field>
        </Row>
      </Section>

      <Section title='P/T + Footer' right='details'>
        <Row>
          <Field label='Power'><Input value={state.pt.power} onChange={e => applyState({ ...state, pt:{ ...state.pt, power:e.target.value } })} /></Field>
          <Field label='Toughness'><Input value={state.pt.toughness} onChange={e => applyState({ ...state, pt:{ ...state.pt, toughness:e.target.value } })} /></Field>
          <Field label='Show PT'><input type='checkbox' checked={state.showPT} onChange={e => applyState({ ...state, showPT:e.target.checked })} /></Field>
        </Row>
        <Row>
          <Field label='PT X'><Input type='number' value={state.ptStyle.frameX} onChange={e => update('ptStyle', { frameX:Number(e.target.value) })} /></Field>
          <Field label='PT Y'><Input type='number' value={state.ptStyle.frameY} onChange={e => update('ptStyle', { frameY:Number(e.target.value) })} /></Field>
          <Field label='PT W'><Input type='number' value={state.ptStyle.width} onChange={e => update('ptStyle', { width:Number(e.target.value) })} /></Field>
          <Field label='PT H'><Input type='number' value={state.ptStyle.height} onChange={e => update('ptStyle', { height:Number(e.target.value) })} /></Field>
          <Field label='PT size'><Input type='number' value={state.ptStyle.fontSize} onChange={e => update('ptStyle', { fontSize:Number(e.target.value) })} /></Field>
          <Field label='PT color'><Input type='color' value={state.ptStyle.color} onChange={e => update('ptStyle', { color:e.target.value })} style={{ padding:4, height:42 }} /></Field>
        </Row>
        <Row>
          <Field label='Info left'><Input value={state.infoLeft.text} onChange={e => applyState({ ...state, infoLeft:{ ...state.infoLeft, text:e.target.value } })} /></Field>
          <Field label='Artist'><Input value={state.infoLeft.artist} onChange={e => applyState({ ...state, infoLeft:{ ...state.infoLeft, artist:e.target.value } })} /></Field>
          <Field label='Year'><Input value={state.copyright.year} onChange={e => applyState({ ...state, copyright:{ ...state.copyright, year:e.target.value } })} /></Field>
          <Field label='Footer color'><Input type='color' value={state.infoLeft.color} onChange={e => applyState({ ...state, infoLeft:{ ...state.infoLeft, color:e.target.value }, copyright:{ ...state.copyright, color:e.target.value } })} style={{ padding:4, height:42 }} /></Field>
          <Field label='Footer X'><Input type='number' value={state.infoLeft.x} onChange={e => applyState({ ...state, infoLeft:{ ...state.infoLeft, x:Number(e.target.value) } })} /></Field>
          <Field label='Footer Y'><Input type='number' value={state.infoLeft.y} onChange={e => applyState({ ...state, infoLeft:{ ...state.infoLeft, y:Number(e.target.value) } })} /></Field>
          <Field label='Footer size'><Input type='number' value={state.infoLeft.fontSize} onChange={e => applyState({ ...state, infoLeft:{ ...state.infoLeft, fontSize:Number(e.target.value) }, copyright:{ ...state.copyright, fontSize:Math.max(8, Number(e.target.value)-2) } })} /></Field>
          <Field label='Copyright Y'><Input type='number' value={state.copyright.y} onChange={e => applyState({ ...state, copyright:{ ...state.copyright, y:Number(e.target.value) } })} /></Field>
        </Row>
      </Section>

      {screen.mobile && <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>{['art','name','type','ability','pt','footer'].map(key => <LayerChip key={key} active={activeLayer===key} label={{art:'Artwork',name:'Name',type:'Type',ability:'Text',pt:'P/T',footer:'Footer'}[key]} onClick={() => setActiveLayer(key)} />)}</div>}
      <Section title='Tools' right='workflow'>
        <Row>
          <Field label='Preview zoom'><Select value={previewZoom} onChange={e => setPreviewZoom(Number(e.target.value))}><option value='75'>75%</option><option value='100'>100%</option><option value='125'>125%</option><option value='150'>150%</option></Select></Field>
          <Field label='PNG scale'><Select value={pngScale} onChange={e => setPngScale(Number(e.target.value))}><option value='1'>1x</option><option value='2'>2x</option><option value='4'>4x</option><option value='8'>8x</option></Select></Field>
          <Field label='Guides'><input type='checkbox' checked={showGuides} onChange={e => setShowGuides(e.target.checked)} /></Field>
          <Field label='Bleed export'><input type='checkbox' checked={withBleed} onChange={e => setWithBleed(e.target.checked)} /></Field>
        </Row>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => nudge(activeLayer, 0, -1)} style={btnSecondary}>↑</button>
          <button onClick={() => nudge(activeLayer, -1, 0)} style={btnSecondary}>←</button>
          <button onClick={() => nudge(activeLayer, 1, 0)} style={btnSecondary}>→</button>
          <button onClick={() => nudge(activeLayer, 0, 1)} style={btnSecondary}>↓</button>
          <button onClick={undo} style={btnSecondary}>Undo</button>
          <button onClick={redo} style={btnSecondary}>Redo</button>
          <button onClick={resetAll} style={btnDanger}>Reset</button>
          <button onClick={exportPNG} style={btnPrimary}>Esporta PNG</button>
          <button onClick={exportPreset} style={btnSecondary}>Export preset</button>
          <label style={btnSecondary}><span>Import preset</span><input type='file' accept='application/json' style={{display:'none'}} onChange={importPreset} /></label>
        </div>
        <div style={{ fontSize:12, color:'#9d9891' }}>Su mobile apri la preview dedicata. Trascina i box direttamente sulla carta; con Shift + frecce sposti di 10px.</div>
      </Section>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#131211', color:'#ece9e4', padding: screen.mobile ? 8 : 12 }}>
      <div style={{ maxWidth:1500, margin:'0 auto' }}>
        {screen.mobile && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10, position:'sticky', top:0, zIndex:20, background:'#131211', paddingBottom:8 }}>
            <button onClick={() => setMobilePanel('preview')} style={mobilePanel==='preview' ? btnPrimary : btnSecondary}>Preview</button>
            <button onClick={() => setMobilePanel('controls')} style={mobilePanel==='controls' ? btnPrimary : btnSecondary}>Controlli</button>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns: screen.mobile ? '1fr' : 'minmax(340px,460px) minmax(0,1fr)', gap:12, alignItems:'start' }}>
          {(!screen.mobile || mobilePanel === 'controls') && editorPanel}
          {(!screen.mobile || mobilePanel === 'preview') && (
            <PreviewCard mobile={screen.mobile} canvasRef={canvasRef} previewScale={previewScale} showGuides={showGuides} activeLayer={activeLayer} state={state} applyState={applyState} setActiveLayer={setActiveLayer} />
          )}
        </div>
      </div>
    </div>
  );
}

const btnPrimary = { padding:'10px 14px', borderRadius:10, border:'1px solid #4f98a3', background:'#4f98a3', color:'#0f1111', fontWeight:700, cursor:'pointer' };
const btnSecondary = { padding:'10px 14px', borderRadius:10, border:'1px solid #393836', background:'#201f1d', color:'#ece9e4', fontWeight:700, cursor:'pointer' };
const btnDanger = { padding:'10px 14px', borderRadius:10, border:'1px solid #7f1d1d', background:'#3b1212', color:'#fecaca', fontWeight:700, cursor:'pointer' };