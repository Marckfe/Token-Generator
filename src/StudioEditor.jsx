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
  Loader2
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
  const dragRef = useRef(null);

  const [projectName, setProjectName] = useState(t('studio.new_project'));
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving', 'success', 'error'

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1000);
  const [zoom, setZoom] = useState(1);
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' or 'tools'

  const handleSaveCloud = async (isDraft = true) => {
    if (!user) {
      alert(t('studio.login_required'));
      return;
    }
    setIsSaving(true);
    setSaveStatus('saving');
    try {
      const tokenData = {
        name: projectName,
        layers: layers,
        bgArt: bgArt,
        isDraft: isDraft
      };
      await saveUserToken(user.uid, tokenData, isDraft, 'studio');
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const fn = () => {
      const mobile = window.innerWidth < 1000;
      setIsMobile(mobile);
      if (mobile) {
        const availableW = window.innerWidth - 30;
        const availableH = window.innerHeight - 150; // More space by removing toolbar
        const zoomW = availableW / CW;
        const zoomH = availableH / CH;
        setZoom(Math.min(zoomW, zoomH, 0.85));
      } else {
        setZoom(0.75);
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
      x: 50,
      y: 50,
      width: type === 'text' ? 200 : 150,
      height: type === 'text' ? 60 : 150,
      rotate: 0,
      opacity: 1,
      content,
      aspectRatio: type === 'image' ? 1 : null,
      style: {
        color: "#ffffff",
        fontSize: 24,
        fontFamily: "BelerenBold",
        textAlign: "left",
        fontWeight: "bold",
        textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
        bend: 0,
        skew: 0,
        letterSpacing: 0
      }
    };
    setLayers([...layers, newLayer]);
    setSelectedId(newLayer.id);
  };

  const handleBgUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setBgArt(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleAssetUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const ar = img.width / img.height;
        const MAX_SIZE = 150;
        const width = ar > 1 ? MAX_SIZE : MAX_SIZE * ar;
        const height = ar > 1 ? MAX_SIZE / ar : MAX_SIZE;
        
        const newLayer = {
          id: "layer_" + Math.random().toString(36).substr(2, 9),
          type: 'image',
          x: (CW - width) / 2,
          y: (CH - height) / 2,
          width: Math.round(width),
          height: Math.round(height),
          rotate: 0,
          opacity: 1,
          content: ev.target.result,
          aspectRatio: ar,
          style: { opacity: 1 }
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
        if (l.aspectRatio) {
          if ('width' in patch) return { ...l, ...patch, height: Math.round(patch.width / l.aspectRatio) };
          if ('height' in patch) return { ...l, ...patch, width: Math.round(patch.height * l.aspectRatio) };
        }
        return { ...l, ...patch };
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

  const exportCanvas = async () => {
    if (!canvasRef.current) return;
    const canvas = await html2canvas(canvasRef.current, {
      useCORS: true,
      backgroundColor: null,
      logging: false,
      imageTimeout: 0,
      scale: 4,
      onclone: (clonedDoc) => {
        const el = clonedDoc.querySelector('.studio-canvas');
        if (el) {
          el.style.transform = 'none';
          el.style.width = CW + 'px';
          el.style.height = CH + 'px';
          el.style.borderRadius = '0'; // No rounded corners in export
        }
      }
    });
    const link = document.createElement("a");
    link.download = "studio_card.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const activeLayer = layers.find(l => l.id === selectedId);

  // DRAG LOGIC
  // SIDEBAR DRAG REORDERING
  const handleLayerDragStart = (e, index) => {
    e.dataTransfer.setData("index", index);
  };

  const handleLayerDrop = (e, targetIndex) => {
    const sourceIndex = parseInt(e.dataTransfer.getData("index"));
    if (sourceIndex === targetIndex) return;
    
    const newLayers = [...layers];
    const [removed] = newLayers.splice(sourceIndex, 1);
    newLayers.splice(targetIndex, 0, removed);
    setLayers(newLayers);
  };

  const renderCurvedText = (layer) => {
    const text = layer.content || "";
    const bend = layer.style.bend || 0;
    const spacing = layer.style.letterSpacing || 0;
    
    if (bend === 0) return <div style={{ 
      ...layer.style, 
      letterSpacing: `${spacing}px`,
      transform: `skew(${layer.style.skew || 0}deg)`,
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: layer.style.textAlign === 'center' ? 'center' : layer.style.textAlign === 'right' ? 'flex-end' : 'flex-start'
    }}>{text}</div>;

    const chars = text.split("");
    const center = chars.length / 2;
    
    return (
      <div style={{ 
        ...layer.style, 
        display: 'flex', 
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `skew(${layer.style.skew || 0}deg)`,
      }}>
        {chars.map((char, i) => {
          const offset = i - center + 0.5;
          const rotate = offset * bend;
          const translateY = Math.abs(offset) * Math.abs(bend) * 0.8;
          return (
            <span key={i} style={{ 
              display: 'inline-block', 
              transform: `rotate(${rotate}deg) translateY(${translateY}px)`,
              transformOrigin: 'bottom center',
              whiteSpace: 'pre',
              margin: `0 ${spacing/2}px`
            }}>
              {char}
            </span>
          );
        })}
      </div>
    );
  };

  const onMouseDown = (id, e) => {
    if (e.button !== 0 && e.type !== 'touchstart') return;
    setSelectedId(id);
    setIsDragging(true);
    const layer = layers.find(l => l.id === id);
    const t = e.touches?.[0] || e;
    dragRef.current = {
      id,
      startX: t.clientX,
      startY: t.clientY,
      initialX: layer.x,
      initialY: layer.y
    };
    if (e.type !== 'touchstart') e.stopPropagation();
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!isDragging || !dragRef.current) return;
      const t = e.touches?.[0] || e;
      const dx = (t.clientX - dragRef.current.startX) / zoom;
      const dy = (t.clientY - dragRef.current.startY) / zoom;

      const layer = layers.find(l => l.id === dragRef.current.id);
      if (!layer) return;

      const newX = Math.round(dragRef.current.initialX + dx);
      const newY = Math.round(dragRef.current.initialY + dy);

      updateLayer(dragRef.current.id, {
        x: Math.max(10, Math.min(CW - layer.width - 10, newX)),
        y: Math.max(10, Math.min(CH - layer.height - 10, newY))
      });
    };
    const onEnd = () => setIsDragging(false);
    
    if (isDragging) {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onEnd);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onEnd);
    }
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [isDragging, zoom]);

  return (
    <div className={`editor-layout studio-mode ${isMobile ? 'is-mobile' : ''}`}>
      {!isMobile && (
        <nav className="editor-nav">
          <div className="nav-item" onClick={() => addLayer('text', t('studio.new_text'))}>
            <Type size={20} /> <span className="nav-label">{t('studio.text')}</span>
          </div>
          <label className="nav-item">
            <ImageIcon size={20} /> <span className="nav-label">Asset</span>
            <input type="file" hidden accept="image/*" onChange={handleAssetUpload} />
          </label>
          <div className="nav-item" onClick={() => setSelectedId(null)}>
            <Layers size={20} /> <span className="nav-label">{t('common.layers')}</span>
          </div>
          <div className="nav-item" style={{ marginTop: 'auto' }} onClick={exportCanvas}>
            <Download size={20} /> <span className="nav-label">{t('common.export')}</span>
          </div>
        </nav>
      )}

      {isMobile && (
        <div className="mobile-editor-tabs">
          <button className={`mobile-editor-tab ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>{t('common.preview')}</button>
          <button className={`mobile-editor-tab ${activeTab === 'tools' ? 'active' : ''}`} onClick={() => setActiveTab('tools')}>{t('common.tools')}</button>
        </div>
      )}

      {isMobile && selectedId && activeTab === 'preview' && (
        <div className="mobile-properties-bar">
           <button className="btn btn-ghost" onClick={() => setSelectedId(null)}>✕ {t('common.close')}</button>
           <span className="text-xs opacity-60">{t('studio.editing')}: {activeLayer.type === 'text' ? t('studio.text') : t('studio.image')}</span>
        </div>
      )}

      {(!isMobile || activeTab === 'tools') && (
        <aside className="editor-sidebar" style={isMobile ? { width: '100vw', flex: 1, height: 'auto', overflowY: 'auto' } : {}}>
          {isMobile && (
             <div className="mobile-subnav mb-4 flex gap-2 overflow-x-auto p-4 border-b border-[var(--border)]">
                <button className="btn btn-ghost text-xs" onClick={() => addLayer('text', 'NUOVO TESTO')}><Type size={14}/> + Testo</button>
                <label className="btn btn-ghost text-xs cursor-pointer">
                  <ImageIcon size={14}/> + Asset
                  <input type="file" hidden accept="image/*" onChange={handleAssetUpload} />
                </label>
                <button className="btn btn-ghost text-xs" onClick={exportCanvas}><Download size={14}/> Esporta</button>
             </div>
          )}
          
          {selectedId ? (
            <div className="control-group">
              <div className="sidebar-panel-title flex justify-between items-center">
                <span>{t('studio.properties')}</span>
                <button onClick={() => setSelectedId(null)}>✕</button>
              </div>
              
              <div className="control-field mb-4">
                <span className="control-label">{t('studio.pos')} X / Y</span>
                <div className="control-row">
                  <input type="number" value={activeLayer.x} onChange={e => updateLayer(selectedId, { x: parseInt(e.target.value) })} className="control-input" />
                  <input type="number" value={activeLayer.y} onChange={e => updateLayer(selectedId, { y: parseInt(e.target.value) })} className="control-input" />
                </div>
              </div>

              <div className="control-field mb-4">
                <span className="control-label">{t('studio.size')} L / A</span>
                <div className="control-row">
                  <input type="number" value={activeLayer.width} onChange={e => updateLayer(selectedId, { width: parseInt(e.target.value) })} className="control-input" />
                  <input type="number" value={activeLayer.height} onChange={e => updateLayer(selectedId, { height: parseInt(e.target.value) })} className="control-input" />
                </div>
              </div>

              <div className="control-field mb-4">
                <span className="control-label">Rotazione ({activeLayer.rotate}°)</span>
                <input type="range" min="0" max="360" value={activeLayer.rotate} onChange={e => updateLayer(selectedId, { rotate: parseInt(e.target.value) })} className="control-input" />
              </div>

              <div className="control-field mb-4">
                <span className="control-label">Opacità ({Math.round(activeLayer.opacity * 100)}%)</span>
                <input type="range" min="0" max="1" step="0.01" value={activeLayer.opacity} onChange={e => updateLayer(selectedId, { opacity: parseFloat(e.target.value) })} className="control-input" />
              </div>

              {activeLayer.type === 'text' && (
                <>
                  <div className="control-field mb-4">
                    <span className="control-label">{t('studio.content')}</span>
                    <textarea className="control-input" value={activeLayer.content} onChange={e => updateLayer(selectedId, { content: e.target.value })} />
                  </div>
                  <div className="control-field mb-4">
                    <span className="control-label">Font Size ({activeLayer.style.fontSize}px)</span>
                    <input type="range" min="8" max="120" value={activeLayer.style.fontSize} onChange={e => updateStyle(selectedId, { fontSize: parseInt(e.target.value) })} className="control-input" />
                  </div>
                  <div className="control-field mb-4">
                    <span className="control-label">Font Family</span>
                    <select 
                      className="control-input" 
                      value={activeLayer.style.fontFamily} 
                      onChange={e => updateStyle(selectedId, { fontFamily: e.target.value })}
                    >
                      {FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="control-field mb-4">
                    <span className="control-label">Allineamento Testo</span>
                    <div className="flex gap-2">
                      {['left', 'center', 'right'].map(a => (
                        <button 
                          key={a} 
                          className={`btn btn-ghost flex-1 py-1 text-xs ${activeLayer.style.textAlign === a ? 'active' : ''}`}
                          onClick={() => updateStyle(selectedId, { textAlign: a })}
                          style={{ background: activeLayer.style.textAlign === a ? 'var(--accent-hl)' : 'var(--surf-off)' }}
                        >
                          {a === 'left' ? t('studio.align_left') : a === 'center' ? t('studio.align_center') : t('studio.align_right')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="control-field mb-4">
                    <span className="control-label">Curvatura Arco ({activeLayer.style.bend}°)</span>
                    <input type="range" min="-20" max="20" step="0.5" value={activeLayer.style.bend} onChange={e => updateStyle(selectedId, { bend: parseFloat(e.target.value) })} className="control-input" />
                  </div>
                  <div className="control-field mb-4">
                    <span className="control-label">Inclinazione / Skew ({activeLayer.style.skew}°)</span>
                    <input type="range" min="-45" max="45" value={activeLayer.style.skew} onChange={e => updateStyle(selectedId, { skew: parseInt(e.target.value) })} className="control-input" />
                  </div>
                  <div className="control-field mb-4">
                    <span className="control-label">Spaziatura Lettere ({activeLayer.style.letterSpacing}px)</span>
                    <input type="range" min="-5" max="20" value={activeLayer.style.letterSpacing} onChange={e => updateStyle(selectedId, { letterSpacing: parseInt(e.target.value) })} className="control-input" />
                  </div>
                  <div className="control-field mb-4">
                    <span className="control-label">Colore Testo</span>
                    <input type="color" value={activeLayer.style.color} onChange={e => updateStyle(selectedId, { color: e.target.value })} className="control-input" style={{ height: '40px', padding: '2px' }} />
                  </div>
                </>
              )}

              <div className="flex gap-2 mt-6">
                <button className="btn btn-ghost flex-1" onClick={() => moveLayer(selectedId, 'up')}><ArrowUp size={16}/> Su</button>
                <button className="btn btn-ghost flex-1" onClick={() => moveLayer(selectedId, 'down')}><ArrowDown size={16}/> Giù</button>
              </div>
              <div className="flex gap-2 mt-2">
                <button className="btn btn-ghost flex-1" onClick={() => duplicateLayer(selectedId)}><Copy size={16}/> {t('common.duplicate')}</button>
                <button className="btn btn-ghost flex-1 text-error" onClick={() => deleteLayer(selectedId)}><Trash2 size={16}/> {t('common.delete')}</button>
              </div>
            </div>
          ) : (
            <div className="control-group">
              <div className="sidebar-panel-title flex items-center gap-2">
                <Cloud size={16} />
                <span>Salvataggio Cloud</span>
              </div>
              <div className="control-field mb-4">
                <span className="control-label">Nome Progetto</span>
                <input 
                  type="text" 
                  value={projectName} 
                  onChange={e => setProjectName(e.target.value)} 
                  className="control-input"
                  placeholder={t('studio.project_name_placeholder')}
                />
              </div>
              <div className="flex gap-2">
                <button 
                  className="btn btn-ghost flex-1 text-xs" 
                  onClick={() => handleSaveCloud(true)}
                  disabled={isSaving}
                >
                  {saveStatus === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  <span className="ml-2">Bozza</span>
                </button>
                <button 
                  className="btn btn-primary flex-1 text-xs" 
                  onClick={() => handleSaveCloud(false)}
                  disabled={isSaving}
                >
                  {saveStatus === 'success' ? <Check size={14} /> : <Check size={14} />}
                  <span className="ml-2">{t('studio.save_final')}</span>
                </button>
              </div>
              {saveStatus === 'success' && <p className="text-[10px] text-success mt-2 text-center font-bold">✓ Salvato con successo nel Cloud!</p>}

              <div className="sidebar-panel-title mt-8">Progetto Studio</div>
              <div className="control-field mb-6">
                <span className="control-label">{t('studio.bg_fullart')}</span>
                <label className="btn btn-primary w-full text-center cursor-pointer">
                  {t('studio.bg_upload')}
                  <input type="file" hidden accept="image/*" onChange={handleBgUpload} />
                </label>
              </div>

              <CloudLibrary user={user} onLoad={(token) => {
                setLayers(token.layers || []);
                setBgArt(token.bgArt || null);
                setProjectName(token.name || "Token Caricato");
              }} />

              <div className="sidebar-panel-title mt-6" style={{ fontSize: '0.9rem' }}>Livelli ({layers.length})</div>
              <div className="layers-list">
                {layers.length === 0 && <div className="p-4 text-center text-muted text-sm">Nessun elemento aggiunto</div>}
                {[...layers].reverse().map((l, idx) => {
                  const actualIndex = layers.length - 1 - idx;
                  return (
                    <div 
                      key={l.id} 
                      className={`layer-item ${selectedId === l.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(l.id)}
                      draggable
                      onDragStart={(e) => handleLayerDragStart(e, actualIndex)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleLayerDrop(e, actualIndex)}
                    >
                      <div className="flex items-center gap-3 flex-1 overflow-hidden">
                        <div className="drag-handle opacity-30 cursor-grab active:cursor-grabbing">
                          <Move size={14} />
                        </div>
                        {l.type === 'text' ? <Type size={14} className="flex-shrink-0" /> : <ImageIcon size={14} className="flex-shrink-0" />}
                        <span className="truncate">{l.type === 'text' ? l.content : 'Immagine'}</span>
                      </div>
                      <div className="layer-item-actions">
                        <button onClick={(e) => { e.stopPropagation(); deleteLayer(l.id); }} className="hover:text-error transition-colors"><Trash2 size={14}/></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      )}

      {(!isMobile || activeTab === 'preview') && (
        <main className="editor-workspace">
          {!isMobile && (
            <div className="editor-toolbar justify-between px-6">
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold opacity-60 uppercase tracking-widest">Studio Mode</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-primary text-xs py-1 px-4" onClick={exportCanvas}><Download size={14} className="mr-2"/> Esporta PNG</button>
              </div>
            </div>
          )}

          <div className="editor-canvas-container" style={isMobile ? { padding: '10px 0' } : {}}>
            <div style={{ 
              width: CW * zoom, 
              height: CH * zoom, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              position: 'relative'
            }}>
              <div 
                ref={canvasRef}
                className="canvas-wrapper studio-canvas"
                style={{ 
                  width: CW, 
                  height: CH, 
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                  background: bgArt ? `url(${bgArt}) center/cover no-repeat` : 'repeating-conic-gradient(#f0f0f0 0% 25%, #ffffff 0% 50%) 50% / 40px 40px',
                  position: 'absolute',
                  overflow: 'hidden',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                  borderRadius: '26px'
                }}
                onClick={() => setSelectedId(null)}
              >
                {!bgArt && (
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
                    fontSize: '1.2rem'
                  }}>
                    {t('studio.bg_placeholder')}
                  </div>
                )}
                
                {layers.map((l) => (
                  <div
                    key={l.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(l.id);
                    }}
                    onMouseDown={(e) => onMouseDown(l.id, e)}
                    onTouchStart={(e) => onMouseDown(l.id, e)}
                    style={{
                      position: 'absolute',
                      left: l.x,
                      top: l.y,
                      width: l.width,
                      height: l.height,
                      transform: `rotate(${l.rotate}deg)`,
                      opacity: l.opacity,
                      cursor: isDragging && selectedId === l.id ? 'grabbing' : 'grab',
                      border: selectedId === l.id ? '2px solid var(--accent)' : '2px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: layers.indexOf(l) + 1,
                      userSelect: 'none',
                      touchAction: 'none'
                    }}
                  >
                    {l.type === 'image' ? (
                      <img src={l.content} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                    ) : (
                      renderCurvedText(l)
                    )}
                    {selectedId === l.id && (
                      <div className="layer-resize-handle" onMouseDown={(e) => {
                        e.stopPropagation();
                        // Basic resize logic could be added here
                      }}></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

function CloudLibrary({ user, onLoad }) {
  const { t } = useLanguage();
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    const data = await getUserTokens(user.uid);
    setTokens(data);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [user]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (window.confirm("Vuoi davvero eliminare questo progetto?")) {
      await deleteUserToken(user.uid, id);
      refresh();
    }
  };

  if (!user) return null;

  return (
    <div className="cloud-library-section mt-6">
      <div className="sidebar-panel-title flex items-center justify-between">
        <span>{t('studio.cloud_library')}</span>
        <button
          onClick={refresh}
          title="Aggiorna libreria"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surf-off)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.querySelector('svg').style.transform = 'rotate(180deg)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.querySelector('svg').style.transform = 'rotate(0deg)'; }}
        >
          <RotateCw size={13} style={{ transition: 'transform 0.4s ease' }} />
        </button>
      </div>
      <div className="tokens-grid mt-4">
        {loading ? (
          <div className="text-center py-4 opacity-50 text-xs">{t('common.loading')}...</div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-4 opacity-50 text-xs italic">Nessun progetto salvato</div>
        ) : (
          tokens.map(item => (
            <div key={item.id} className="token-item-card" onClick={() => onLoad(item)}>
              <div className="token-item-info">
                <div className="token-item-name">{item.name}</div>
                <div className={`token-item-badge ${item.isDraft ? 'draft' : 'final'}`}>
                  {item.isDraft ? t('studio.save_draft') : t('studio.save_final')}
                </div>
              </div>
              <button className="token-item-delete" onClick={(e) => handleDelete(e, item.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
