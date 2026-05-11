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
const DISPLAY_W = 460;
const DISPLAY_H = Math.round(CH * DISPLAY_W / CW);
const FT = "Beleren, MatrixSC, Cinzel, Georgia, serif";
const FB = "MPlantin, 'Palatino Linotype', 'Book Antiqua', Georgia, serif";

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
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "txt", v: text.slice(last, m.index) });
    parts.push({ type: "sym", v: m[1].trim() });
    last = rx.lastIndex;
  }
  if (last < text.length) parts.push({ type: "txt", v: text.slice(last) });
  return parts;
}

async function drawManaText(ctx, text, x, y, fontSize, color, font, maxWidth) {
  const parts = parseMana(text || "");
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

async function renderCard(canvas, state, withBleed = false) {
  const {
    artUrl, artTransform, frame, ptFrame,
    name, nameStyle,
    type, typeStyle,
    ability, abilityStyle, showAbility,
    pt, ptStyle, showPT,
    infoLeft, showInfoLeft, showArtist,
    copyright, showCopyright,
  } = state;

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

  ctx.save();
  ctx.font = `bold ${nameStyle.fontSize}px ${FT}`;
  ctx.fillStyle = nameStyle.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = nameStyle.align || "center";
  const nameBoxW = CW;
  const nameX = nameStyle.align === "left" ? nameStyle.x + 10 : nameStyle.align === "right" ? nameStyle.x + nameBoxW - 10 : nameStyle.x + nameBoxW / 2;
  ctx.fillText((name || "TOKEN").toUpperCase(), nameX, nameStyle.y);
  ctx.restore();

  ctx.save();
  ctx.font = `bold ${typeStyle.fontSize}px ${FT}`;
  ctx.fillStyle = typeStyle.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = typeStyle.align || "left";
  ctx.fillText(type || "Token", typeStyle.x, typeStyle.y);
  ctx.restore();

  if (showAbility && ability) {
    const lines = String(ability).split("\n");
    let curY = abilityStyle.y;
    for (const line of lines) {
      curY = await drawManaText(ctx, line, abilityStyle.x, curY, abilityStyle.fontSize, abilityStyle.color, FB, abilityStyle.width || (CW - abilityStyle.x * 2));
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
    const slash = "/";
    const sw = ctx.measureText(slash).width;
    const tw = pw + sw + ctx.measureText(pt?.toughness || "0").width;
    const ptCX = ptStyle.frameX + ptStyle.width / 2 + (ptStyle.powerOffsetX || 0);
    const ptCY = ptStyle.frameY + ptStyle.height / 2;
    ctx.textAlign = "left";
    ctx.fillText(pt?.power || "0", ptCX - tw / 2, ptCY);
    ctx.fillText(slash, ptCX - tw / 2 + pw, ptCY);
    ctx.fillText(pt?.toughness || "0", ptCX - tw / 2 + pw + sw, ptCY);
    ctx.restore();
  }

  if (showInfoLeft && infoLeft) {
    ctx.save();
    ctx.font = `${infoLeft.fontSize || 11}px ${FT}`;
    ctx.fillStyle = infoLeft.color || "#1a1a1a";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(infoLeft.text || "", infoLeft.x || 18, CH - (infoLeft.y || 10));
    ctx.restore();
  }

  if (showArtist && infoLeft?.artist) {
    ctx.save();
    ctx.font = `${infoLeft.fontSize || 11}px ${FT}`;
    ctx.fillStyle = infoLeft.color || "#1a1a1a";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(`Illus. ${infoLeft.artist}`, infoLeft.x || 18, CH - (infoLeft.y || 10) + (infoLeft.fontSize || 11) + 2);
    ctx.restore();
  }

  if (showCopyright && copyright) {
    ctx.save();
    ctx.font = `${copyright.fontSize || 9}px ${FT}`;
    ctx.fillStyle = copyright.color || "#111";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "right";
    ctx.fillText(`™ & © ${copyright.year || new Date().getFullYear()} Wizards of the Coast`, CW - (copyright.x || 18), CH - (copyright.y || 10));
    ctx.restore();
  }

  ctx.restore();
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function useResponsiveScale() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1440);
  useEffect(() => {
    const onR = () => setW(window.innerWidth);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  if (w < 420) return 0.68;
  if (w < 560) return 0.78;
  if (w < 900) return 0.9;
  return 1;
}

function Section({ title, right, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border:"1px solid #393836", borderRadius:12, overflow:"hidden", background:"#1c1b19" }}>
      <button onClick={() => setOpen(v => !v)} style={{ width:"100%", padding:"11px 14px", background:"#252420", border:"none", color:"#e7e5e4", display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
        <strong style={{ fontSize:13 }}>{title}</strong>
        <span style={{ marginLeft:"auto", fontSize:11, opacity:.8 }}>{right}</span>
        <span style={{ fontSize:11, opacity:.7 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ padding:12, display:"grid", gap:10 }}>{children}</div>}
    </div>
  );
}

function Row({ children }) {
  return <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:8 }}>{children}</div>;
}

function Field({ label, children }) {
  return <label style={{ display:"grid", gap:6, fontSize:12, color:"#b8b5b1" }}><span>{label}</span>{children}</label>;
}

function Input(props) {
  return <input {...props} style={{ width:"100%", background:"#11100f", color:"#ece9e4", border:"1px solid #393836", borderRadius:8, padding:"9px 10px", fontSize:13, outline:"none", ...(props.style||{}) }} />;
}

function Textarea(props) {
  return <textarea {...props} style={{ width:"100%", background:"#11100f", color:"#ece9e4", border:"1px solid #393836", borderRadius:8, padding:"9px 10px", fontSize:13, outline:"none", resize:"vertical", ...(props.style||{}) }} />;
}

function Select(props) {
  return <select {...props} style={{ width:"100%", background:"#11100f", color:"#ece9e4", border:"1px solid #393836", borderRadius:8, padding:"9px 10px", fontSize:13, outline:"none", ...(props.style||{}) }} />;
}

function LayerChip({ active, label, onClick }) {
  return <button onClick={onClick} style={{ padding:"8px 10px", borderRadius:999, border:`1px solid ${active ? '#4f98a3' : '#393836'}`, background: active ? 'rgba(79,152,163,.15)' : '#201f1d', color: active ? '#7dd3dc' : '#c7c4bf', fontSize:12, cursor:'pointer' }}>{label}</button>;
}

function GuideOverlay({ activeLayer, state, scale }) {
  const boxes = {
    name: { x: 16, y: state.nameStyle.y - 18, w: CW - 32, h: 36, c: '#38bdf8' },
    type: { x: state.typeStyle.x - 6, y: state.typeStyle.y - 16, w: 320, h: 32, c: '#22c55e' },
    ability: { x: state.abilityStyle.x - 6, y: state.abilityStyle.y - 6, w: state.abilityStyle.width || (CW - state.abilityStyle.x * 2), h: 210, c: '#f59e0b' },
    pt: { x: state.ptStyle.frameX, y: state.ptStyle.frameY, w: state.ptStyle.width, h: state.ptStyle.height, c: '#f472b6' },
    footer: { x: 12, y: CH - 52, w: CW - 24, h: 40, c: '#a78bfa' },
  };
  return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none' }}>
      <div style={{ position:'absolute', left:BLEED*scale, top:BLEED*scale, width:CW*scale, height:CH*scale, border:'1px dashed rgba(255,255,255,.2)' }} />
      {Object.entries(boxes).map(([k, b]) => (
        <div key={k} style={{ position:'absolute', left:b.x*scale, top:b.y*scale, width:b.w*scale, height:b.h*scale, border:`${activeLayer===k ? 2 : 1}px dashed ${b.c}`, background: activeLayer===k ? `${b.c}20` : 'transparent', borderRadius:6 }} />
      ))}
    </div>
  );
}

function PreviewCard({ canvasRef, previewScale, showGuides, activeLayer, state, setState, setActiveLayer }) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);

  const beginDrag = (kind, e) => {
    e.preventDefault();
    e.stopPropagation();
    const t = e.touches?.[0] || e;
    dragRef.current = {
      kind,
      startX: t.clientX,
      startY: t.clientY,
      snapshot: JSON.parse(JSON.stringify(state)),
    };
    const move = ev => {
      if (!dragRef.current) return;
      const p = ev.touches?.[0] || ev;
      const dx = (p.clientX - dragRef.current.startX) / previewScale;
      const dy = (p.clientY - dragRef.current.startY) / previewScale;
      const snap = dragRef.current.snapshot;
      if (dragRef.current.kind === 'art') {
        setState(prev => ({ ...prev, artTransform: { ...(prev.artTransform||{zoom:1,x:0,y:0}), x: Math.round(snap.artTransform.x + dx), y: Math.round(snap.artTransform.y + dy) } }));
      }
      if (dragRef.current.kind === 'name') setState(prev => ({ ...prev, nameStyle:{ ...prev.nameStyle, x: Math.round(snap.nameStyle.x + dx), y: Math.round(snap.nameStyle.y + dy) } }));
      if (dragRef.current.kind === 'type') setState(prev => ({ ...prev, typeStyle:{ ...prev.typeStyle, x: Math.round(snap.typeStyle.x + dx), y: Math.round(snap.typeStyle.y + dy) } }));
      if (dragRef.current.kind === 'ability') setState(prev => ({ ...prev, abilityStyle:{ ...prev.abilityStyle, x: Math.round(snap.abilityStyle.x + dx), y: Math.round(snap.abilityStyle.y + dy) } }));
      if (dragRef.current.kind === 'pt') setState(prev => ({ ...prev, ptStyle:{ ...prev.ptStyle, frameX: Math.round(snap.ptStyle.frameX + dx), frameY: Math.round(snap.ptStyle.frameY + dy) } }));
      if (dragRef.current.kind === 'footer') setState(prev => ({ ...prev, infoLeft:{ ...prev.infoLeft, x: Math.round((snap.infoLeft?.x||18) + dx), y: Math.round((snap.infoLeft?.y||10) - dy) }, copyright:{ ...prev.copyright, x: Math.round((snap.copyright?.x||18) - dx), y: Math.round((snap.copyright?.y||10) - dy) } }));
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive:false });
    window.addEventListener('touchend', up);
  };

  return (
    <div style={{ position:'sticky', top:12 }}>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
        <LayerChip active={activeLayer==='art'} label='Artwork' onClick={() => setActiveLayer('art')} />
        <LayerChip active={activeLayer==='name'} label='Name' onClick={() => setActiveLayer('name')} />
        <LayerChip active={activeLayer==='type'} label='Type' onClick={() => setActiveLayer('type')} />
        <LayerChip active={activeLayer==='ability'} label='Text' onClick={() => setActiveLayer('ability')} />
        <LayerChip active={activeLayer==='pt'} label='P/T' onClick={() => setActiveLayer('pt')} />
        <LayerChip active={activeLayer==='footer'} label='Footer' onClick={() => setActiveLayer('footer')} />
      </div>
      <div ref={stageRef} style={{ position:'relative', overflow:'auto', background:'#141311', border:'1px solid #393836', borderRadius:16, padding:14, minHeight:520 }}>
        <div style={{ position:'relative', width: CW*previewScale, height: CH*previewScale, margin:'0 auto', boxShadow:'0 12px 30px rgba(0,0,0,.35)' }}>
          <canvas ref={canvasRef} style={{ width:CW*previewScale, height:CH*previewScale, display:'block', borderRadius:18, background:'#0d0d0d' }} />
          {showGuides && <GuideOverlay activeLayer={activeLayer} state={state} scale={previewScale} />}
          <button onMouseDown={e => { setActiveLayer('art'); beginDrag('art', e); }} onTouchStart={e => { setActiveLayer('art'); beginDrag('art', e); }} style={{ position:'absolute', inset:0, border:'none', background:'transparent', cursor:'grab' }} />
          <div onMouseDown={e => beginDrag('name', e)} onTouchStart={e => beginDrag('name', e)} onClick={() => setActiveLayer('name')} style={{ position:'absolute', left:16*previewScale, top:(state.nameStyle.y-18)*previewScale, width:(CW-32)*previewScale, height:36*previewScale, cursor:'move' }} />
          <div onMouseDown={e => beginDrag('type', e)} onTouchStart={e => beginDrag('type', e)} onClick={() => setActiveLayer('type')} style={{ position:'absolute', left:(state.typeStyle.x-6)*previewScale, top:(state.typeStyle.y-16)*previewScale, width:320*previewScale, height:32*previewScale, cursor:'move' }} />
          <div onMouseDown={e => beginDrag('ability', e)} onTouchStart={e => beginDrag('ability', e)} onClick={() => setActiveLayer('ability')} style={{ position:'absolute', left:(state.abilityStyle.x-6)*previewScale, top:(state.abilityStyle.y-6)*previewScale, width:(state.abilityStyle.width || (CW-state.abilityStyle.x*2))*previewScale, height:210*previewScale, cursor:'move' }} />
          <div onMouseDown={e => beginDrag('pt', e)} onTouchStart={e => beginDrag('pt', e)} onClick={() => setActiveLayer('pt')} style={{ position:'absolute', left:state.ptStyle.frameX*previewScale, top:state.ptStyle.frameY*previewScale, width:state.ptStyle.width*previewScale, height:state.ptStyle.height*previewScale, cursor:'move' }} />
          <div onMouseDown={e => beginDrag('footer', e)} onTouchStart={e => beginDrag('footer', e)} onClick={() => setActiveLayer('footer')} style={{ position:'absolute', left:12*previewScale, top:(CH-52)*previewScale, width:(CW-24)*previewScale, height:40*previewScale, cursor:'move' }} />
        </div>
      </div>
    </div>
  );
}

function getDefaultFrame() {
  const firstSet = Object.keys(FRAME_MAP)[0];
  return firstSet ? FRAME_MAP[firstSet][0] : null;
}
function getDefaultPtFrame() {
  return PT_FRAMES[0] || null;
}

const DEFAULT_STATE = {
  artUrl: "",
  artTransform: { zoom: 1, x: 0, y: 0 },
  frameSet: Object.keys(FRAME_MAP)[0] || "",
  frame: getDefaultFrame(),
  ptFrame: getDefaultPtFrame(),
  name: "Goblin",
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
  const [state, setState] = useState(DEFAULT_STATE);
  const [activeLayer, setActiveLayer] = useState('art');
  const [showGuides, setShowGuides] = useState(true);
  const [withBleed, setWithBleed] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(100);
  const canvasRef = useRef(null);
  const responsiveScale = useResponsiveScale();
  const previewScale = useMemo(() => (DISPLAY_W / CW) * responsiveScale * (previewZoom / 100), [responsiveScale, previewZoom]);
  const frameSetNames = Object.keys(FRAME_MAP);
  const currentSetFrames = FRAME_MAP[state.frameSet] || [];

  useEffect(() => {
    if (canvasRef.current) renderCard(canvasRef.current, state, false);
  }, [state, previewScale]);

  const update = useCallback((key, patch) => setState(prev => ({ ...prev, [key]: { ...prev[key], ...patch } })), []);

  const onArtFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setState(prev => ({ ...prev, artUrl: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const onFrameSetChange = setName => {
    const frames = FRAME_MAP[setName] || [];
    setState(prev => ({ ...prev, frameSet: setName, frame: frames[0] || null }));
  };

  const exportPNG = async () => {
    const c = document.createElement('canvas');
    await renderCard(c, state, withBleed);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `${(state.name || 'token').replace(/\s+/g,'_')}.png`;
    a.click();
  };

  const nudge = (layer, dx, dy) => {
    if (layer === 'art') return setState(prev => ({ ...prev, artTransform:{ ...prev.artTransform, x: prev.artTransform.x + dx, y: prev.artTransform.y + dy } }));
    if (layer === 'name') return setState(prev => ({ ...prev, nameStyle:{ ...prev.nameStyle, x: prev.nameStyle.x + dx, y: prev.nameStyle.y + dy } }));
    if (layer === 'type') return setState(prev => ({ ...prev, typeStyle:{ ...prev.typeStyle, x: prev.typeStyle.x + dx, y: prev.typeStyle.y + dy } }));
    if (layer === 'ability') return setState(prev => ({ ...prev, abilityStyle:{ ...prev.abilityStyle, x: prev.abilityStyle.x + dx, y: prev.abilityStyle.y + dy } }));
    if (layer === 'pt') return setState(prev => ({ ...prev, ptStyle:{ ...prev.ptStyle, frameX: prev.ptStyle.frameX + dx, frameY: prev.ptStyle.frameY + dy } }));
    if (layer === 'footer') return setState(prev => ({ ...prev, infoLeft:{ ...prev.infoLeft, x:(prev.infoLeft.x||18)+dx, y:(prev.infoLeft.y||12)-dy }, copyright:{ ...prev.copyright, x:(prev.copyright.x||18)-dx, y:(prev.copyright.y||12)-dy } }));
  };

  useEffect(() => {
    const onKey = e => {
      const step = e.shiftKey ? 10 : 1;
      if (!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      if (e.key === 'ArrowUp') nudge(activeLayer, 0, -step);
      if (e.key === 'ArrowDown') nudge(activeLayer, 0, step);
      if (e.key === 'ArrowLeft') nudge(activeLayer, -step, 0);
      if (e.key === 'ArrowRight') nudge(activeLayer, step, 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeLayer]);

  return (
    <div style={{ minHeight:'100vh', background:'#131211', color:'#ece9e4', padding:12 }}>
      <div style={{ maxWidth:1500, margin:'0 auto', display:'grid', gridTemplateColumns:'minmax(320px,460px) minmax(0,1fr)', gap:12 }}>
        <div style={{ display:'grid', gap:12, alignSelf:'start' }}>
          <Section title='Artwork' right='drag on preview'>
            <Field label='Immagine'>
              <Input type='file' accept='image/*' onChange={onArtFile} />
            </Field>
            <Row>
              <Field label='Zoom'>
                <Input type='range' min='0.8' max='2.2' step='0.01' value={state.artTransform.zoom} onChange={e => update('artTransform', { zoom:Number(e.target.value) })} />
              </Field>
              <Field label='X'>
                <Input type='number' value={state.artTransform.x} onChange={e => update('artTransform', { x:Number(e.target.value) })} />
              </Field>
              <Field label='Y'>
                <Input type='number' value={state.artTransform.y} onChange={e => update('artTransform', { y:Number(e.target.value) })} />
              </Field>
            </Row>
          </Section>

          <Section title='Frame' right={state.frame?.name || 'selezione'}>
            <Row>
              <Field label='Set'>
                <Select value={state.frameSet} onChange={e => onFrameSetChange(e.target.value)}>
                  {frameSetNames.map(n => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
              <Field label='Frame'>
                <Select value={state.frame?.name || ''} onChange={e => setState(prev => ({ ...prev, frame: currentSetFrames.find(f => f.name===e.target.value) || null }))}>
                  {currentSetFrames.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                </Select>
              </Field>
              <Field label='PT Frame'>
                <Select value={state.ptFrame?.name || ''} onChange={e => setState(prev => ({ ...prev, ptFrame: PT_FRAMES.find(f => f.name===e.target.value) || null }))}>
                  {PT_FRAMES.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                </Select>
              </Field>
            </Row>
          </Section>

          <Section title='Testi' right={activeLayer}>
            <Field label='Nome'>
              <Input value={state.name} onChange={e => setState(prev => ({ ...prev, name:e.target.value }))} />
            </Field>
            <Row>
              <Field label='Name size'><Input type='number' value={state.nameStyle.fontSize} onChange={e => update('nameStyle', { fontSize:Number(e.target.value) })} /></Field>
              <Field label='Name Y'><Input type='number' value={state.nameStyle.y} onChange={e => update('nameStyle', { y:Number(e.target.value) })} /></Field>
              <Field label='Align'>
                <Select value={state.nameStyle.align} onChange={e => update('nameStyle', { align:e.target.value })}>
                  <option value='left'>left</option>
                  <option value='center'>center</option>
                  <option value='right'>right</option>
                </Select>
              </Field>
            </Row>
            <Field label='Type line'>
              <Input value={state.type} onChange={e => setState(prev => ({ ...prev, type:e.target.value }))} />
            </Field>
            <Row>
              <Field label='Type size'><Input type='number' value={state.typeStyle.fontSize} onChange={e => update('typeStyle', { fontSize:Number(e.target.value) })} /></Field>
              <Field label='Type X'><Input type='number' value={state.typeStyle.x} onChange={e => update('typeStyle', { x:Number(e.target.value) })} /></Field>
              <Field label='Type Y'><Input type='number' value={state.typeStyle.y} onChange={e => update('typeStyle', { y:Number(e.target.value) })} /></Field>
            </Row>
            <Field label='Rules text'>
              <Textarea rows={5} value={state.ability} onChange={e => setState(prev => ({ ...prev, ability:e.target.value }))} />
            </Field>
            <Row>
              <Field label='Show text'><input type='checkbox' checked={state.showAbility} onChange={e => setState(prev => ({ ...prev, showAbility:e.target.checked }))} /></Field>
              <Field label='Text size'><Input type='number' value={state.abilityStyle.fontSize} onChange={e => update('abilityStyle', { fontSize:Number(e.target.value) })} /></Field>
              <Field label='Text width'><Input type='number' value={state.abilityStyle.width} onChange={e => update('abilityStyle', { width:Number(e.target.value) })} /></Field>
              <Field label='Text X'><Input type='number' value={state.abilityStyle.x} onChange={e => update('abilityStyle', { x:Number(e.target.value) })} /></Field>
              <Field label='Text Y'><Input type='number' value={state.abilityStyle.y} onChange={e => update('abilityStyle', { y:Number(e.target.value) })} /></Field>
            </Row>
          </Section>

          <Section title='P/T e footer' right='dettagli'>
            <Row>
              <Field label='Power'><Input value={state.pt.power} onChange={e => setState(prev => ({ ...prev, pt:{ ...prev.pt, power:e.target.value } }))} /></Field>
              <Field label='Toughness'><Input value={state.pt.toughness} onChange={e => setState(prev => ({ ...prev, pt:{ ...prev.pt, toughness:e.target.value } }))} /></Field>
              <Field label='Show PT'><input type='checkbox' checked={state.showPT} onChange={e => setState(prev => ({ ...prev, showPT:e.target.checked }))} /></Field>
            </Row>
            <Row>
              <Field label='PT X'><Input type='number' value={state.ptStyle.frameX} onChange={e => update('ptStyle', { frameX:Number(e.target.value) })} /></Field>
              <Field label='PT Y'><Input type='number' value={state.ptStyle.frameY} onChange={e => update('ptStyle', { frameY:Number(e.target.value) })} /></Field>
              <Field label='PT W'><Input type='number' value={state.ptStyle.width} onChange={e => update('ptStyle', { width:Number(e.target.value) })} /></Field>
              <Field label='PT H'><Input type='number' value={state.ptStyle.height} onChange={e => update('ptStyle', { height:Number(e.target.value) })} /></Field>
              <Field label='PT size'><Input type='number' value={state.ptStyle.fontSize} onChange={e => update('ptStyle', { fontSize:Number(e.target.value) })} /></Field>
            </Row>
            <Row>
              <Field label='Info left'><Input value={state.infoLeft.text} onChange={e => setState(prev => ({ ...prev, infoLeft:{ ...prev.infoLeft, text:e.target.value } }))} /></Field>
              <Field label='Artist'><Input value={state.infoLeft.artist} onChange={e => setState(prev => ({ ...prev, infoLeft:{ ...prev.infoLeft, artist:e.target.value } }))} /></Field>
              <Field label='Year'><Input value={state.copyright.year} onChange={e => setState(prev => ({ ...prev, copyright:{ ...prev.copyright, year:e.target.value } }))} /></Field>
            </Row>
          </Section>

          <Section title='Editor tools' right='precisione'>
            <Row>
              <Field label='Preview zoom'>
                <Select value={previewZoom} onChange={e => setPreviewZoom(Number(e.target.value))}>
                  <option value='75'>75%</option>
                  <option value='100'>100%</option>
                  <option value='125'>125%</option>
                  <option value='150'>150%</option>
                  <option value='200'>200%</option>
                </Select>
              </Field>
              <Field label='Guide'><input type='checkbox' checked={showGuides} onChange={e => setShowGuides(e.target.checked)} /></Field>
              <Field label='Bleed export'><input type='checkbox' checked={withBleed} onChange={e => setWithBleed(e.target.checked)} /></Field>
            </Row>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button onClick={() => nudge(activeLayer, 0, -1)} style={btnSecondary}>↑</button>
              <button onClick={() => nudge(activeLayer, -1, 0)} style={btnSecondary}>←</button>
              <button onClick={() => nudge(activeLayer, 1, 0)} style={btnSecondary}>→</button>
              <button onClick={() => nudge(activeLayer, 0, 1)} style={btnSecondary}>↓</button>
              <button onClick={() => setState(DEFAULT_STATE)} style={btnDanger}>Reset</button>
              <button onClick={exportPNG} style={btnPrimary}>Esporta PNG</button>
            </div>
            <div style={{ fontSize:12, color:'#9d9891' }}>Suggerimento: trascina direttamente i box in preview; con Shift + frecce sposti di 10px.</div>
          </Section>
        </div>

        <PreviewCard
          canvasRef={canvasRef}
          previewScale={previewScale}
          showGuides={showGuides}
          activeLayer={activeLayer}
          state={state}
          setState={setState}
          setActiveLayer={setActiveLayer}
        />
      </div>
    </div>
  );
}

const btnPrimary = {
  padding:'10px 14px', borderRadius:10, border:'1px solid #4f98a3', background:'#4f98a3', color:'#0f1111', fontWeight:700, cursor:'pointer'
};
const btnSecondary = {
  padding:'10px 14px', borderRadius:10, border:'1px solid #393836', background:'#201f1d', color:'#ece9e4', fontWeight:700, cursor:'pointer'
};
const btnDanger = {
  padding:'10px 14px', borderRadius:10, border:'1px solid #7f1d1d', background:'#3b1212', color:'#fecaca', fontWeight:700, cursor:'pointer'
};
