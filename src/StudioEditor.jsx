import React, { useState, useRef, useEffect } from "react";
import { 
  Move, 
  Type, 
  Image as ImageIcon, 
  Layers, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Download, 
  Plus,
  Maximize,
  RotateCw,
  Copy,
  Cloud,
  Check,
  Save,
  Loader2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Layers as LayersIcon
} from "lucide-react";
import html2canvas from "html2canvas";
import "./editor.css";
import { useAuth } from "./context/AuthContext";
import { saveUserToken, getUserTokens, deleteUserToken } from "./services/dbService";
import { useLanguage } from "./context/LanguageContext";

const CW = 620, CH = 890;

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

export default function StudioEditor() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [layers, setLayers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [bgArt, setBgArt] = useState(null);
  const canvasRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  const [projectName, setProjectName] = useState(t('studio.new_project') || "Nuovo Progetto");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1000);
  const [zoom, setZoom] = useState(0.75);
  const [activeTab, setActiveTab] = useState('preview');
  const [snaps, setSnaps] = useState({ v: null, h: null });

  const activeLayer = layers.find(l => l.id === selectedId);

  useEffect(() => {
    const fn = () => {
      const mobile = window.innerWidth < 1000;
      setIsMobile(mobile);
      if (mobile) {
        setZoom(Math.min((window.innerWidth - 30) / CW, (window.innerHeight - 250) / CH, 0.85));
      } else {
        setZoom(0.7);
      }
    };
    window.addEventListener("resize", fn);
    fn();
    return () => window.removeEventListener("resize", fn);
  }, []);

  const addLayer = (type, content = "") => {
    const newLayer = {
      id: "layer_" + Math.random().toString(36).substr(2, 9),
      type,
      x: 100, y: 100,
      width: type === 'text' ? 300 : 200,
      height: type === 'text' ? 80 : 200,
      rotate: 0,
      opacity: 1,
      content,
      aspectRatio: type === 'image' ? 1 : null,
      style: {
        color: "#ffffff",
        fontSize: 32,
        fontFamily: "BelerenBold",
        textAlign: "center",
        fontWeight: "bold",
        textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
        bend: 0, skew: 0, letterSpacing: 0
      }
    };
    setLayers([...layers, newLayer]);
    setSelectedId(newLayer.id);
  };

  const handleAssetUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const ar = img.width / img.height;
        const w = ar > 1 ? 250 : 250 * ar;
        const h = ar > 1 ? 250 / ar : 250;
        const newLayer = {
          id: "layer_" + Math.random().toString(36).substr(2, 9),
          type: 'image',
          x: (CW - w) / 2, y: (CH - h) / 2,
          width: Math.round(w), height: Math.round(h),
          rotate: 0, opacity: 1, content: ev.target.result, aspectRatio: ar, style: { opacity: 1 }
        };
        setLayers([...layers, newLayer]);
        setSelectedId(newLayer.id);
        if(isMobile) setActiveTab('preview');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const updateLayer = (id, patch) => {
    setLayers(prev => prev.map(l => {
      if (l.id === id) {
        let next = { ...l, ...patch };
        if (l.aspectRatio && ('width' in patch || 'height' in patch)) {
          if ('width' in patch) next.height = Math.round(patch.width / l.aspectRatio);
          else next.width = Math.round(patch.height * l.aspectRatio);
        }
        return next;
      }
      return l;
    }));
  };

  const updateStyle = (id, patch) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, style: { ...l.style, ...patch } } : l));
  };

  const moveLayer = (id, direction) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx === -1) return;
    const newLayers = [...layers];
    if (direction === "up" && idx < layers.length - 1) {
      [newLayers[idx], newLayers[idx + 1]] = [newLayers[idx + 1], newLayers[idx]];
    } else if (direction === "down" && idx > 0) {
      [newLayers[idx], newLayers[idx - 1]] = [newLayers[idx - 1], newLayers[idx]];
    }
    setLayers(newLayers);
  };

  const duplicateLayer = (id) => {
    const layer = layers.find(l => l.id === id);
    if (!layer) return;
    const newLayer = { ...JSON.parse(JSON.stringify(layer)), id: "layer_" + Math.random().toString(36).substr(2, 9), x: layer.x + 20, y: layer.y + 20 };
    setLayers([...layers, newLayer]);
    setSelectedId(newLayer.id);
  };

  const deleteLayer = (id) => {
    setLayers(layers.filter(l => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleSaveCloud = async (isDraft = true) => {
    if (!user) return alert(t('studio.login_required'));
    setIsSaving(true);
    setSaveStatus('saving');
    try {
      const thumbCanvas = await html2canvas(canvasRef.current, { scale: 0.2, useCORS: true, backgroundColor: null, logging: false });
      await saveUserToken(user.uid, { name: projectName, layers, bgArt, isDraft, previewUrl: thumbCanvas.toDataURL("image/webp", 0.5) }, isDraft, 'studio');
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) { setSaveStatus('error'); } finally { setIsSaving(false); }
  };

  const exportCanvas = async () => {
    const canvas = await html2canvas(canvasRef.current, { scale: 4, useCORS: true, backgroundColor: null, logging: false });
    const link = document.createElement("a");
    link.download = "studio_card.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const onHandleMouseDown = (e, handle, id) => {
    e.stopPropagation();
    setIsResizing(true);
    const l = layers.find(x => x.id === id);
    const t = e.touches?.[0] || e;
    resizeRef.current = { id, handle, startX: t.clientX, startY: t.clientY, iX: l.x, iY: l.y, iW: l.width, iH: l.height };
  };

  const onMouseDown = (id, e) => {
    if (e.button !== 0 && e.type !== 'touchstart') return;
    setSelectedId(id);
    setIsDragging(true);
    const l = layers.find(x => x.id === id);
    const t = e.touches?.[0] || e;
    dragRef.current = { id, startX: t.clientX, startY: t.clientY, iX: l.x, iY: l.y };
  };

  useEffect(() => {
    const onMove = (e) => {
      const t = e.touches?.[0] || e;
      if (isResizing && resizeRef.current) {
        const { handle, id, startX, startY, iX, iY, iW, iH } = resizeRef.current;
        const dx = (t.clientX - startX) / zoom;
        const dy = (t.clientY - startY) / zoom;
        let p = {};
        if (handle.includes('e')) p.width = Math.max(20, iW + dx);
        if (handle.includes('w')) { p.width = Math.max(20, iW - dx); p.x = iX + (iW - p.width); }
        if (handle.includes('s')) p.height = Math.max(20, iH + dy);
        if (handle.includes('n')) { p.height = Math.max(20, iH - dy); p.y = iY + (iH - p.height); }
        updateLayer(id, p);
      } else if (isDragging && dragRef.current) {
        const { id, startX, startY, iX, iY } = dragRef.current;
        const dx = (t.clientX - startX) / zoom;
        const dy = (t.clientY - startY) / zoom;
        let nx = iX + dx;
        let ny = iY + dy;
        
        let sv = null, sh = null;
        const l = layers.find(x => x.id === id);
        if (Math.abs(nx + l.width/2 - CW/2) < 10) { nx = CW/2 - l.width/2; sv = CW/2; }
        if (Math.abs(ny + l.height/2 - CH/2) < 10) { ny = CH/2 - l.height/2; sh = CH/2; }
        setSnaps({ v: sv, h: sh });

        updateLayer(id, { x: nx, y: ny });
      }
    };
    const onEnd = () => { setIsDragging(false); setIsResizing(false); setSnaps({ v: null, h: null }); };
    if (isDragging || isResizing) {
      window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onEnd);
      window.addEventListener("touchmove", onMove, { passive: false }); window.addEventListener("touchend", onEnd);
    }
    return () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onEnd);
    };
  }, [isDragging, isResizing, zoom, layers]);

  const renderCurvedText = (layer) => {
    const { bend, letterSpacing, skew, textAlign, color, fontSize, fontFamily, fontWeight, textShadow } = layer.style;
    const text = layer.content || "";
    const baseStyle = { color, fontSize, fontFamily, fontWeight, textShadow };
    if (bend === 0) return (
      <div style={{ ...baseStyle, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start', transform: `skewX(${skew}deg)` }}>
        {text}
      </div>
    );
    const chars = text.split("");
    return (
      <div style={{ ...baseStyle, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `skewX(${skew}deg)` }}>
        {chars.map((char, i) => {
          const offset = i - chars.length/2 + 0.5;
          return <span key={i} style={{ display: 'inline-block', transform: `rotate(${offset * bend}deg) translateY(${Math.abs(offset) * Math.abs(bend) * 0.8}px)`, margin: `0 ${letterSpacing/2}px` }}>{char}</span>;
        })}
      </div>
    );
  };

  const handleBgUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setBgArt(ev.target.result); if(isMobile) setActiveTab('preview'); };
    reader.readAsDataURL(file);
  };

  return (
    <div className={`editor-layout studio-mode ${isMobile ? 'is-mobile' : ''}`}>
      {/* ── TOP BAR ────────────────────────────────────────── */}
      <header className="studio-top-bar">
        <div className="flex items-center gap-4">
          <div className="text-accent font-black tracking-tighter text-xl">STUDIO</div>
          <input className="bg-transparent border-none text-white font-bold outline-none w-32 md:w-48" value={projectName} onChange={e => setProjectName(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost p-2 md:px-3 text-xs" onClick={() => { addLayer('text', 'NUOVO TESTO'); if(isMobile) setActiveTab('preview'); }} title="Testo"><Type size={16}/> <span className="hidden md:inline ml-2">Testo</span></button>
          <label className="btn btn-ghost p-2 md:px-3 text-xs cursor-pointer" title="Asset">
            <ImageIcon size={16}/> <span className="hidden md:inline ml-2">Asset</span>
            <input type="file" hidden accept="image/*" onChange={handleAssetUpload} />
          </label>
          <div className="w-[1px] h-6 bg-[#444] mx-1 md:mx-2"></div>
          <button className="btn btn-primary p-2 md:px-3 text-xs" onClick={exportCanvas} title="Esporta"><Download size={16}/> <span className="hidden md:inline ml-2">Esporta</span></button>
        </div>
      </header>

      {isMobile && (
        <div className="mobile-editor-tabs">
          <button className={`mobile-editor-tab ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>Carta</button>
          <button className={`mobile-editor-tab ${activeTab === 'layers' ? 'active' : ''}`} onClick={() => setActiveTab('layers')}>Livelli</button>
          <button className={`mobile-editor-tab ${activeTab === 'inspector' ? 'active' : ''}`} onClick={() => setActiveTab('inspector')}>Proprietà</button>
        </div>
      )}

      {/* ── LEFT PANEL (LAYERS) ───────────────────────────── */}
      {(!isMobile || activeTab === 'layers') && (
        <aside className="studio-left-panel" style={isMobile ? { gridColumn: '1 / -1' } : {}}>
          <div className="p-4 border-b border-[#333] text-[10px] font-black uppercase opacity-40 tracking-widest">Livelli</div>
          <div className="flex-1 overflow-y-auto p-2">
            {[...layers].reverse().map(l => (
              <div key={l.id} className={`layer-item ${selectedId === l.id ? 'active' : ''}`} onClick={() => { setSelectedId(l.id); if(isMobile) setActiveTab('inspector'); }}>
                {l.type === 'text' ? <Type size={14}/> : <ImageIcon size={14}/>}
                <span className="truncate flex-1">{l.type === 'text' ? l.content : 'Immagine'}</span>
                <button onClick={(e) => { e.stopPropagation(); deleteLayer(l.id); }}><Trash2 size={12}/></button>
              </div>
            ))}
            {layers.length === 0 && <div className="p-8 text-center text-muted text-xs opacity-30 italic">Nessun elemento</div>}
          </div>
          <div className="p-4 border-t border-[#333]">
             <CloudLibrary user={user} onLoad={t => { setLayers(t.layers); setBgArt(t.bgArt); setProjectName(t.name); setActiveTab('preview'); }} />
          </div>
        </aside>
      )}

      {/* ── CENTER (CANVAS) ──────────────────────────────── */}
      {(!isMobile || activeTab === 'preview') && (
        <main className="studio-canvas-area">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', position: 'relative' }}>
            <div 
              ref={canvasRef} 
              className="canvas-wrapper studio-canvas" 
              style={{ width: CW, height: CH, background: bgArt ? `url(${bgArt}) center/cover no-repeat` : '#000', borderRadius: '26px', position: 'relative', overflow: 'hidden' }}
              onClick={() => setSelectedId(null)}
            >
              {layers.map(l => (
                <div 
                  key={l.id} 
                  onMouseDown={e => onMouseDown(l.id, e)}
                  onTouchStart={e => onMouseDown(l.id, e)}
                  style={{ position: 'absolute', left: l.x, top: l.y, width: l.width, height: l.height, transform: `rotate(${l.rotate}deg)`, opacity: l.opacity, zIndex: layers.indexOf(l), userSelect: 'none', touchAction: 'none' }}
                >
                  {l.type === 'image' ? <img src={l.content} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} alt="" /> : renderCurvedText(l)}
                </div>
              ))}

              {/* Bounding Box & Handles */}
              {activeLayer && (
                <div className="bounding-box" style={{ left: activeLayer.x, top: activeLayer.y, width: activeLayer.width, height: activeLayer.height, transform: `rotate(${activeLayer.rotate}deg)` }}>
                  {['nw','n','ne','e','se','s','sw','w'].map(h => (
                    <div key={h} className={`resize-handle handle-${h}`} onMouseDown={e => onHandleMouseDown(e, h, selectedId)} onTouchStart={e => onHandleMouseDown(e, h, selectedId)} />
                  ))}
                </div>
              )}

              {/* Snaps */}
              {snaps.v && <div className="snap-guide snap-v" style={{ left: snaps.v }} />}
              {snaps.h && <div className="snap-guide snap-h" style={{ top: snaps.h }} />}
            </div>
          </div>
        </main>
      )}

      {/* ── RIGHT PANEL (INSPECTOR) ──────────────────────── */}
      {(!isMobile || activeTab === 'inspector') && (
        <aside className="studio-right-panel" style={isMobile ? { gridColumn: '1 / -1' } : {}}>
          <div className="p-4 border-b border-[#333] text-[10px] font-black uppercase opacity-40 tracking-widest flex justify-between items-center">
            Proprietà
            {isMobile && selectedId && <button className="text-accent text-[10px]" onClick={() => setActiveTab('preview')}>Vedi Carta</button>}
          </div>
          {activeLayer ? (
            <div className="p-5 flex flex-col gap-5 overflow-y-auto h-full pb-10">
              <div className="grid grid-cols-2 gap-4">
                <div className="control-field"><span className="text-[10px] text-muted uppercase font-bold">X</span><input type="number" value={Math.round(activeLayer.x)} onChange={e => updateLayer(selectedId, { x: parseInt(e.target.value) })} className="control-input" /></div>
                <div className="control-field"><span className="text-[10px] text-muted uppercase font-bold">Y</span><input type="number" value={Math.round(activeLayer.y)} onChange={e => updateLayer(selectedId, { y: parseInt(e.target.value) })} className="control-input" /></div>
                <div className="control-field"><span className="text-[10px] text-muted uppercase font-bold">L</span><input type="number" value={Math.round(activeLayer.width)} onChange={e => updateLayer(selectedId, { width: parseInt(e.target.value) })} className="control-input" /></div>
                <div className="control-field"><span className="text-[10px] text-muted uppercase font-bold">A</span><input type="number" value={Math.round(activeLayer.height)} onChange={e => updateLayer(selectedId, { height: parseInt(e.target.value) })} className="control-input" /></div>
              </div>

              <div className="control-field">
                <div className="flex justify-between mb-1"><span className="text-[10px] text-muted uppercase font-bold">Rotazione</span><span className="text-xs">{activeLayer.rotate}°</span></div>
                <input type="range" min="0" max="360" value={activeLayer.rotate} onChange={e => updateLayer(selectedId, { rotate: parseInt(e.target.value) })} className="w-full" />
              </div>

              <div className="control-field">
                <div className="flex justify-between mb-1"><span className="text-[10px] text-muted uppercase font-bold">Opacità</span><span className="text-xs">{Math.round(activeLayer.opacity * 100)}%</span></div>
                <input type="range" min="0" max="1" step="0.01" value={activeLayer.opacity} onChange={e => updateLayer(selectedId, { opacity: parseFloat(e.target.value) })} className="w-full" />
              </div>

              {activeLayer.type === 'text' && (
                <>
                  <div className="control-field"><span className="text-[10px] text-muted uppercase font-bold">Contenuto</span><textarea value={activeLayer.content} onChange={e => updateLayer(selectedId, { content: e.target.value })} className="control-input h-20" /></div>
                  <div className="control-field">
                    <span className="text-[10px] text-muted uppercase font-bold">Allineamento</span>
                    <div className="flex gap-2 mt-1">
                      {['left', 'center', 'right'].map(a => (
                        <button key={a} className={`btn btn-ghost flex-1 py-1 ${activeLayer.style.textAlign === a ? 'active' : ''}`} onClick={() => updateStyle(selectedId, { textAlign: a })}>
                          {a === 'left' ? <AlignLeft size={14}/> : a === 'center' ? <AlignCenter size={14}/> : <AlignRight size={14}/>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="control-field">
                    <span className="text-[10px] text-muted uppercase font-bold">Font</span>
                    <select className="control-input mt-1" value={activeLayer.style.fontFamily} onChange={e => updateStyle(selectedId, { fontFamily: e.target.value })}>
                      {FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="control-field"><span className="text-[10px] text-muted uppercase font-bold">Size</span><input type="number" value={activeLayer.style.fontSize} onChange={e => updateStyle(selectedId, { fontSize: parseInt(e.target.value) })} className="control-input" /></div>
                    <div className="control-field"><span className="text-[10px] text-muted uppercase font-bold">Colore</span><input type="color" value={activeLayer.style.color} onChange={e => updateStyle(selectedId, { color: e.target.value })} className="h-9 w-full bg-transparent border-none cursor-pointer" /></div>
                  </div>
                  <div className="control-field">
                    <div className="flex justify-between mb-1"><span className="text-[10px] text-muted uppercase font-bold">Arco ({activeLayer.style.bend})</span></div>
                    <input type="range" min="-20" max="20" step="0.5" value={activeLayer.style.bend} onChange={e => updateStyle(selectedId, { bend: parseFloat(e.target.value) })} className="w-full" />
                  </div>
                  <div className="control-field">
                    <div className="flex justify-between mb-1"><span className="text-[10px] text-muted uppercase font-bold">Inclinazione ({activeLayer.style.skew})</span></div>
                    <input type="range" min="-45" max="45" value={activeLayer.style.skew} onChange={e => updateStyle(selectedId, { skew: parseInt(e.target.value) })} className="w-full" />
                  </div>
                  <div className="control-field">
                    <div className="flex justify-between mb-1"><span className="text-[10px] text-muted uppercase font-bold">Spaziatura ({activeLayer.style.letterSpacing})</span></div>
                    <input type="range" min="-5" max="20" value={activeLayer.style.letterSpacing} onChange={e => updateStyle(selectedId, { letterSpacing: parseInt(e.target.value) })} className="w-full" />
                  </div>
                </>
              )}

              <div className="flex flex-col gap-2 pt-4 border-t border-[#333]">
                <div className="flex gap-2">
                  <button className="btn btn-ghost flex-1 text-xs" onClick={() => moveLayer(selectedId, 'up')}><ArrowUp size={14}/> Su</button>
                  <button className="btn btn-ghost flex-1 text-xs" onClick={() => moveLayer(selectedId, 'down')}><ArrowDown size={14}/> Giù</button>
                </div>
                <button className="btn btn-ghost w-full text-xs" onClick={() => duplicateLayer(selectedId)}><Copy size={14}/> {t('common.duplicate')}</button>
              </div>

              <div className="flex gap-2 mt-4">
                <button className="btn btn-ghost flex-1 text-xs" onClick={() => handleSaveCloud(true)} disabled={isSaving}>{isSaving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Bozza</button>
                <button className="btn btn-primary flex-1 text-xs" onClick={() => handleSaveCloud(false)} disabled={isSaving}>{saveStatus === 'success' ? <Check size={12}/> : <Check size={12}/>} Definitivo</button>
              </div>
            </div>
          ) : (
            <div className="p-8 flex flex-col gap-4">
              <div className="text-center text-muted text-xs italic mb-4">Sfondo della Carta</div>
              <label className="btn btn-ghost w-full text-center cursor-pointer">
                 {t('studio.bg_upload')}
                 <input type="file" hidden accept="image/*" onChange={handleBgUpload} />
              </label>
              {bgArt && <button className="btn btn-ghost text-error text-xs" onClick={() => setBgArt(null)}>Rimuovi Sfondo</button>}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function CloudLibrary({ user, onLoad }) {
  const [tokens, setTokens] = useState([]);
  const refresh = async () => { if (user) { const d = await getUserTokens(user.uid); setTokens(d.filter(x => x.tool === 'studio')); } };
  useEffect(() => { refresh(); }, [user]);
  if (!user) return null;
  return (
    <div className="mt-4">
      <div className="text-[10px] font-black uppercase opacity-40 mb-3 tracking-widest flex justify-between">
        Libreria Cloud
        <RotateCw size={10} className="cursor-pointer" onClick={refresh} />
      </div>
      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
        {tokens.map(item => (
          <div key={item.id} className="token-item-card" onClick={() => onLoad(item)}>
            <span className="truncate text-[11px] font-bold">{item.name}</span>
            <Trash2 size={11} className="opacity-30 hover:opacity-100" />
          </div>
        ))}
        {tokens.length === 0 && <div className="text-[10px] opacity-30 text-center">Vuota</div>}
      </div>
    </div>
  );
}
