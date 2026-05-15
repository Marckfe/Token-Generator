import React, { useState, useRef, useEffect } from "react";
import { 
  Type, 
  Image as ImageIcon, 
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
  Settings,
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
  const [leftTab, setLeftTab] = useState('tools');
  const [snaps, setSnaps] = useState({ v: null, h: null });

  const activeLayer = layers.find(l => l.id === selectedId);

  useEffect(() => {
    const fn = () => {
      const mobile = window.innerWidth < 1000;
      setIsMobile(mobile);
      if (mobile) {
        setZoom(Math.min((window.innerWidth - 30) / CW, (window.innerHeight - 250) / CH, 0.85));
      } else {
        setZoom(0.65);
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
      <header className="studio-top-bar">
        <div className="studio-header-group">
          <div className="text-accent font-black tracking-tighter text-2xl drop-shadow-[0_0_10px_rgba(0,188,212,0.4)]">STUDIO ELITE</div>
          <div className="studio-project-box">
            <span className="studio-project-label">PROGETTO:</span>
            <input className="studio-project-input" value={projectName} onChange={e => setProjectName(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary px-6" onClick={exportCanvas}><Download size={18} style={{marginRight: '8px'}}/> Esporta PNG</button>
      </header>

      <div className="studio-main-container">
        {!isMobile && (
          <aside className="studio-tools-sidebar">
            <button className={`studio-tool-btn ${leftTab === 'tools' ? 'active' : ''}`} onClick={() => setLeftTab('tools')} title="Aggiungi"><Plus size={22}/></button>
            <button className={`studio-tool-btn ${leftTab === 'layers' ? 'active' : ''}`} onClick={() => setLeftTab('layers')} title="Livelli"><LayersIcon size={22}/></button>
            <button className={`studio-tool-btn ${leftTab === 'cloud' ? 'active' : ''}`} onClick={() => setLeftTab('cloud')} title="Cloud"><Cloud size={22}/></button>
          </aside>
        )}

        {!isMobile && (
           <div className="studio-sub-panel">
              {leftTab === 'tools' && (
                 <>
                    <div className="studio-panel-header-text">Strumenti Rapidi</div>
                    <div className="studio-panel-content">
                       <label className="studio-glass-card-btn" style={{borderColor: '#00bcd4', background: 'rgba(0,188,212,0.1)'}}>
                         <Maximize size={18} style={{marginRight: '12px', color: '#00bcd4'}}/> Carica Sfondo Carta
                         <input type="file" hidden accept="image/*" onChange={handleBgUpload} />
                       </label>
                       <div style={{height: '1px', background: 'rgba(255,255,255,0.1)', margin: '20px 0'}}></div>
                       <button className="studio-glass-card-btn" onClick={() => addLayer('text', 'NUOVO TESTO')}><Type size={18} style={{marginRight: '12px', color: '#00bcd4'}}/> Aggiungi Testo</button>
                       <label className="studio-glass-card-btn">
                         <ImageIcon size={18} style={{marginRight: '12px', color: '#00bcd4'}}/> Aggiungi Immagine
                         <input type="file" hidden accept="image/*" onChange={handleAssetUpload} />
                       </label>
                    </div>
                 </>
              )}
              {leftTab === 'layers' && (
                 <>
                    <div className="studio-panel-header-text">Livelli ({layers.length})</div>
                    <div className="studio-panel-content">
                       {[...layers].reverse().map(l => (
                          <div key={l.id} className={`studio-layer-item ${selectedId === l.id ? 'active' : ''}`} onClick={() => setSelectedId(l.id)}>
                             {l.type === 'text' ? <Type size={14}/> : <ImageIcon size={14}/>}
                             <span className="truncate" style={{flex: 1, fontSize: '12px'}}>{l.type === 'text' ? l.content : 'Immagine'}</span>
                             <button onClick={(e) => { e.stopPropagation(); deleteLayer(l.id); }} className="hover:text-error"><Trash2 size={12}/></button>
                          </div>
                       ))}
                       {layers.length === 0 && <div style={{textAlign: 'center', padding: '40px 0', opacity: 0.2, fontSize: '12px', fontStyle: 'italic'}}>Nessun elemento</div>}
                    </div>
                 </>
              )}
              {leftTab === 'cloud' && (
                 <>
                    <div className="studio-panel-header-text">Libreria Cloud</div>
                    <div className="studio-panel-content">
                       <CloudLibrary user={user} onLoad={t => { setLayers(t.layers); setBgArt(t.bgArt); setProjectName(t.name); setSelectedId(null); }} />
                    </div>
                 </>
              )}
           </div>
        )}

        <main className="studio-canvas-area">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', position: 'relative' }}>
            <div 
              ref={canvasRef} 
              className="canvas-wrapper studio-canvas" 
              style={{ width: CW, height: CH, background: bgArt ? `url(${bgArt}) center/cover no-repeat` : '#000', borderRadius: '26px', position: 'relative', overflow: 'hidden', boxShadow: '0 50px 100px rgba(0,0,0,0.8)' }}
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

              {activeLayer && (
                <div className="bounding-box" style={{ left: activeLayer.x, top: activeLayer.y, width: activeLayer.width, height: activeLayer.height, transform: `rotate(${activeLayer.rotate}deg)` }}>
                  {['nw','n','ne','e','se','s','sw','w'].map(h => (
                    <div key={h} className={`resize-handle handle-${h}`} onMouseDown={e => onHandleMouseDown(e, h, selectedId)} onTouchStart={e => onHandleMouseDown(e, h, selectedId)} />
                  ))}
                </div>
              )}

              {snaps.v && <div className="snap-guide snap-v" style={{ left: snaps.v }} />}
              {snaps.h && <div className="snap-guide snap-h" style={{ top: snaps.h }} />}
            </div>
          </div>
        </main>

        {activeLayer && (
           <aside className="studio-inspector-panel">
              <div className="studio-inspector-header">
                 <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                    <Settings size={16} className="text-accent"/>
                    <span className="studio-panel-header-text" style={{padding: 0, margin: 0, opacity: 1}}>Proprietà</span>
                 </div>
                 <button onClick={() => setSelectedId(null)} style={{background: 'none', border: 'none', color: '#fff', opacity: 0.4, cursor: 'pointer'}}>✕</button>
              </div>

              <div className="studio-inspector-section">
                 <div className="studio-property-grid">
                    <div className="studio-property-field"><span className="studio-property-label">X</span><input type="number" value={Math.round(activeLayer.x)} onChange={e => updateLayer(selectedId, { x: parseInt(e.target.value) })} className="control-input" /></div>
                    <div className="studio-property-field"><span className="studio-property-label">Y</span><input type="number" value={Math.round(activeLayer.y)} onChange={e => updateLayer(selectedId, { y: parseInt(e.target.value) })} className="control-input" /></div>
                    <div className="studio-property-field"><span className="studio-property-label">L</span><input type="number" value={Math.round(activeLayer.width)} onChange={e => updateLayer(selectedId, { width: parseInt(e.target.value) })} className="control-input" /></div>
                    <div className="studio-property-field"><span className="studio-property-label">A</span><input type="number" value={Math.round(activeLayer.height)} onChange={e => updateLayer(selectedId, { height: parseInt(e.target.value) })} className="control-input" /></div>
                 </div>

                 <div className="studio-property-row">
                    <div style={{display: 'flex', justifyContent: 'space-between'}}><span className="studio-property-label">Rotazione</span><span style={{fontSize: '12px', fontWeight: 'bold', color: '#00bcd4'}}>{activeLayer.rotate}°</span></div>
                    <input type="range" min="0" max="360" value={activeLayer.rotate} onChange={e => updateLayer(selectedId, { rotate: parseInt(e.target.value) })} style={{width: '100%', accentColor: '#00bcd4'}} />
                 </div>

                 <div className="studio-property-row">
                    <div style={{display: 'flex', justifyContent: 'space-between'}}><span className="studio-property-label">Opacità</span><span style={{fontSize: '12px', fontWeight: 'bold', color: '#00bcd4'}}>{Math.round(activeLayer.opacity * 100)}%</span></div>
                    <input type="range" min="0" max="1" step="0.01" value={activeLayer.opacity} onChange={e => updateLayer(selectedId, { opacity: parseFloat(e.target.value) })} style={{width: '100%', accentColor: '#00bcd4'}} />
                 </div>

                 {activeLayer.type === 'text' && (
                    <div className="studio-property-row" style={{gap: '20px'}}>
                       <div className="studio-property-field"><span className="studio-property-label">Contenuto</span><textarea value={activeLayer.content} onChange={e => updateLayer(selectedId, { content: e.target.value })} className="control-input" style={{height: '80px', fontSize: '12px'}} /></div>
                       
                       <div className="studio-property-field">
                          <span className="studio-property-label">Allineamento</span>
                          <div className="studio-alignment-group">
                             {['left', 'center', 'right'].map(a => (
                                <button key={a} className={`studio-align-btn ${activeLayer.style.textAlign === a ? 'active' : ''}`} onClick={() => updateStyle(selectedId, { textAlign: a })}>
                                   {a === 'left' ? <AlignLeft size={16}/> : a === 'center' ? <AlignCenter size={16}/> : <AlignRight size={16}/>}
                                </button>
                             ))}
                          </div>
                       </div>

                       <div className="studio-property-field">
                          <span className="studio-property-label">Font</span>
                          <select className="control-input" value={activeLayer.style.fontFamily} onChange={e => updateStyle(selectedId, { fontFamily: e.target.value })}>
                             {FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                       </div>

                       <div className="studio-property-grid">
                          <div className="studio-property-field"><span className="studio-property-label">Size</span><input type="number" value={activeLayer.style.fontSize} onChange={e => updateStyle(selectedId, { fontSize: parseInt(e.target.value) })} className="control-input" /></div>
                          <div className="studio-property-field"><span className="studio-property-label">Colore</span><input type="color" value={activeLayer.style.color} onChange={e => updateStyle(selectedId, { color: e.target.value })} style={{height: '38px', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer'}} /></div>
                       </div>

                       <div className="studio-property-field">
                          <span className="studio-property-label">Effetti Testo</span>
                          <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px'}}>
                             <div className="studio-property-row"><span style={{fontSize: '9px', opacity: 0.4}}>Arco ({activeLayer.style.bend})</span><input type="range" min="-20" max="20" step="0.5" value={activeLayer.style.bend} onChange={e => updateStyle(selectedId, { bend: parseFloat(e.target.value) })} /></div>
                             <div className="studio-property-row"><span style={{fontSize: '9px', opacity: 0.4}}>Inclinazione ({activeLayer.style.skew})</span><input type="range" min="-45" max="45" value={activeLayer.style.skew} onChange={e => updateStyle(selectedId, { skew: parseInt(e.target.value) })} /></div>
                             <div className="studio-property-row"><span style={{fontSize: '9px', opacity: 0.4}}>Spaziatura ({activeLayer.style.letterSpacing})</span><input type="range" min="-5" max="20" value={activeLayer.style.letterSpacing} onChange={e => updateStyle(selectedId, { letterSpacing: parseInt(e.target.value) })} /></div>
                          </div>
                       </div>
                    </div>
                 )}

                 <div className="studio-action-group">
                    <div style={{display: 'flex', gap: '10px'}}>
                       <button className="studio-align-btn" style={{flex: 1}} onClick={() => moveLayer(selectedId, 'up')}><ArrowUp size={14} style={{marginRight: '8px'}}/> Su</button>
                       <button className="studio-align-btn" style={{flex: 1}} onClick={() => moveLayer(selectedId, 'down')}><ArrowDown size={14} style={{marginRight: '8px'}}/> Giù</button>
                    </div>
                    <button className="studio-align-btn" onClick={() => duplicateLayer(selectedId)}><Copy size={14} style={{marginRight: '8px'}}/> {t('common.duplicate')}</button>
                    <button className="studio-align-btn" style={{color: '#ff4444', borderColor: 'transparent'}} onClick={() => deleteLayer(selectedId)}><Trash2 size={14} style={{marginRight: '8px'}}/> {t('common.delete')}</button>
                 </div>

                 <div className="studio-save-actions">
                    <button className="studio-align-btn" style={{flex: 1}} onClick={() => handleSaveCloud(true)} disabled={isSaving}>{isSaving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14} style={{marginRight: '8px'}}/>} Bozza</button>
                    <button className="btn btn-primary" style={{flex: 1}} onClick={() => handleSaveCloud(false)} disabled={isSaving}>{saveStatus === 'success' ? <Check size={14}/> : <Save size={14} style={{marginRight: '8px'}}/>} Definitivo</button>
                 </div>
              </div>
           </aside>
        )}
      </div>
    </div>
  );
}

function CloudLibrary({ user, onLoad }) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const refresh = async () => { if (user) { setLoading(true); const d = await getUserTokens(user.uid); setTokens(d.filter(x => x.tool === 'studio')); setLoading(false); } };
  useEffect(() => { refresh(); }, [user]);
  if (!user) return null;
  return (
    <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
        <span style={{fontSize: '11px', fontWeight: '900', opacity: 0.4, letterSpacing: '0.15em'}}>CLOUD</span>
        <button onClick={refresh} style={{background: 'none', border: 'none', color: '#00bcd4', cursor: 'pointer'}}><RotateCw size={14}/></button>
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto'}}>
        {loading ? <div style={{textAlign: 'center', padding: '20px', fontSize: '12px', opacity: 0.3}}>Caricamento...</div> : tokens.map(item => (
          <div key={item.id} className="studio-token-item-card" onClick={() => onLoad(item)}>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
               <div style={{width: '32px', height: '44px', background: '#000', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)'}}>
                  {item.previewUrl && <img src={item.previewUrl} style={{width: '100%', height: '100%', objectFit: 'cover'}} alt=""/>}
               </div>
               <span className="truncate" style={{fontSize: '11px', fontWeight: 'bold'}}>{item.name}</span>
            </div>
            <Trash2 size={12} style={{opacity: 0.3}} />
          </div>
        ))}
        {tokens.length === 0 && !loading && <div style={{textAlign: 'center', padding: '20px', fontSize: '10px', opacity: 0.2}}>Libreria vuota</div>}
      </div>
    </div>
  );
}
