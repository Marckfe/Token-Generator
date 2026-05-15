import React, { useState, useRef, useCallback, useEffect } from "react";
import CardSearchPanel from "./CardSearchPanel";
import BulkImportPanel from "./BulkImportPanel";
import PrintQueue from "./PrintQueue";
import PdfSettings from "./PdfSettings";
import CloudDeckPanel from "./CloudDeckPanel";
import { generatePDF } from "../../utils/pdfGenerator";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { saveUserDeck } from "../../services/dbService";
import { Loader2, Save } from "lucide-react";

function Icon({ d, size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

export default function ProxyCreatorMain({ isMobile, externalQueue, setExternalQueue }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [images, setImages] = useState(externalQueue || []);
  const [dragIdx, setDragIdx] = useState(null);
  const [isDrop, setIsDrop] = useState(false);
  const [isGen, setIsGen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [snack, setSnack] = useState({ show: false, msg: "", type: "s" });
  
  const [printCols, setPrintCols] = useState(3);
  const [printRows, setPrintRows] = useState(3);
  const [printGap, setPrintGap] = useState(2);
  const [cutMarks, setCutMarks] = useState(true);
  const [bleedPDF, setBleedPDF] = useState(false);
  const [showDatabase, setShowDatabase] = useState(false);
  const [dbType, setDbType] = useState('single'); // 'single', 'bulk', or 'cloud'
  const [bulkInitialText, setBulkInitialText] = useState("");
  const [currentDeckName, setCurrentDeckName] = useState("");
  const [isSavingDeck, setIsSavingDeck] = useState(false);
  
  const inputRef = useRef();

  // Sync with global queue if provided
  useEffect(() => {
    if (externalQueue) {
      // Use ID string comparison for a stable and efficient check
      const currentIds = images.map(img => img.id).join(',');
      const externalIds = externalQueue.map(img => img.id).join(',');
      if (currentIds !== externalIds) {
        setImages(externalQueue);
      }
    }
  }, [externalQueue]);

  // Update global queue when local changes
  useEffect(() => {
    if (setExternalQueue) {
      setExternalQueue(images);
    }
  }, [images, setExternalQueue]);

  const toast = useCallback((msg, type = "s") => {
    setSnack({ show: true, msg, type });
    setTimeout(() => setSnack(s => ({ ...s, show: false })), 3200);
  }, []);

  const handleFiles = useCallback(files => {
    const valid = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    const arr = Array.from(files)
      .filter(f => valid.includes(f.type))
      .map(f => ({ id: Date.now() + Math.random(), name: f.name, file: f, url: URL.createObjectURL(f) }));
    if (!arr.length) { toast(t('proxy.toast_no_valid'), "w"); return; }
    setImages(prev => [...prev, ...arr]);
    toast(t('proxy.toast_loaded', { count: arr.length }));
  }, [toast, t]);

  const onDrop = e => {
    e.preventDefault(); setIsDrop(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const reorder = toIdx => {
    if (dragIdx === null || dragIdx === toIdx) return;
    setImages(prev => {
      const a = [...prev];
      const [m] = a.splice(dragIdx, 1);
      a.splice(toIdx, 0, m);
      return a;
    });
    setDragIdx(toIdx);
  };

  const remove = idx => {
    setImages(prev => {
      if (prev[idx].file) URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
    toast(t('proxy.toast_removed'), "w");
  };

  const dup = idx => {
    setImages(prev => {
      const d = { ...prev[idx], id: Date.now() + Math.random() };
      const a = [...prev];
      a.splice(idx + 1, 0, d);
      return a;
    });
    toast(t('proxy.toast_duplicated'));
  };

  const clearAll = () => {
    images.forEach(img => { if (img.file) URL.revokeObjectURL(img.url); });
    setImages([]); setConfirmOpen(false); toast(t('proxy.toast_all_removed'), "w");
  };

  const batchDuplicate = () => {
    if (!images.length) return;
    setImages(prev => {
      const cloned = prev.map(img => ({ ...img, id: Date.now() + Math.random() + "_" + img.id }));
      return [...prev, ...cloned];
    });
    toast(t('proxy.toast_doubled'));
  };

  const batchResetToOne = () => {
    if (!images.length) return;
    setImages(prev => {
      const seen = new Set();
      return prev.filter(img => {
        const key = img.name + "_" + (img.url || "");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
    toast(t('proxy.toast_reduced'));
  };

  const perPage = printCols * printRows;
  const pages = Math.max(1, Math.ceil(images.length / perPage));
  
  const saveQueueAsDeck = async () => {
    if (!user) { toast(t('studio.login_required'), "e"); return; }
    if (!images.length) return;
    
    setIsSavingDeck(true);
    try {
      const maindeck = images.map(img => `1 ${img.name}`).join('\n');
      await saveUserDeck(user.uid, {
        name: currentDeckName || `Queue ${new Date().toLocaleDateString()}`,
        maindeck: maindeck,
        sideboard: "",
        format: 'custom'
      });
      toast(t('proxy.cloud_sync_success'), "s");
    } catch (err) {
      toast(t('common.error') + ": " + err.message, "e");
    } finally {
      setIsSavingDeck(false);
    }
  };

  const handleGenPDF = async () => {
    if (!images.length) { toast(t('proxy.toast_no_valid'), "w"); return; }
    setIsGen(true);
    try {
      const bytes = await generatePDF({
        images, printCols, printRows, printGap, cutMarks, bleedPDF,
        onProgress: (done, total) => {
           // could show progress
        }
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      a.download = "mtg-proxy-stampa.pdf";
      a.click();
      toast(t('proxy.toast_pdf_success'));
    } catch (e) {
      console.error(e); toast(t('proxy.toast_pdf_error', { error: e.message }), "e");
    } finally { setIsGen(false); }
  };

  return (
    <>
      {/* Header */}
      <div className="main-header">
        <div>
          <h1 className="main-title">{t('proxy.title')} <span className="premium-badge">ELITE</span></h1>
          <p className="main-subtitle">{t('proxy.subtitle')}</p>
        </div>
        <div className="header-actions">
          {images.length > 0 && (
            <div className="batch-actions-bar">
               <button className="batch-btn" onClick={batchDuplicate} title={t('proxy.batch_duplicate')}>
                 <Icon d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" size={14}/>
                 <span>{t('proxy.batch_duplicate')}</span>
               </button>
               <button className="batch-btn" onClick={batchResetToOne} title={t('proxy.batch_singles')}>
                 <Icon d="M4 7V4h16v3M9 20h6M12 4v16" size={14}/>
                 <span>{t('proxy.batch_singles')}</span>
               </button>
               <div className="batch-sep"></div>
               <button className="batch-btn text-error" onClick={() => setConfirmOpen(true)}>
                 <Icon d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" size={14}/>
                 <span>{t('proxy.batch_clear')}</span>
               </button>
            </div>
          )}

          {images.length > 0 && (
            <button className="btn btn-primary" disabled={isGen} onClick={handleGenPDF}>
              {isGen ? <span className="text-xs">{t('proxy.generating')}</span> : <><Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" size={15}/> {t('proxy.generate_pdf')}</>}
            </button>
          )}
        </div>
      </div>

      {/* Unified Elite Toolbox */}
      <div className="proxy-toolbox">
        <div className="toolbox-tabs">
          <button 
            className={`toolbox-tab ${dbType === 'single' ? 'active' : ''}`} 
            onClick={() => { setDbType('single'); setShowDatabase(true); }}
          >
            <Icon d="m21 21-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" size={16} />
            {t('proxy.search_tab')}
          </button>
          <button 
            className={`toolbox-tab ${dbType === 'bulk' ? 'active' : ''}`} 
            onClick={() => { setDbType('bulk'); setShowDatabase(true); }}
          >
            <Icon d="M4 7V4h16v3M9 20h6M12 4v16" size={16} />
            {t('proxy.bulk_tab')}
          </button>
          <button 
            className={`toolbox-tab ${dbType === 'cloud' ? 'active' : ''}`} 
            onClick={() => { setDbType('cloud'); setShowDatabase(true); }}
          >
            <Icon d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" size={16} />
            {t('proxy.cloud_tab')}
          </button>
          <button 
            className="toolbox-tab" 
            onClick={() => inputRef.current.click()}
          >
            <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" size={16} />
            {t('proxy.upload_local')}
          </button>
        </div>

        <div className="toolbox-content">
          <input type="file" ref={inputRef} style={{ display: "none" }} multiple onChange={e => handleFiles(e.target.files)} accept="image/*" />
          
          {dbType === 'single' && (
            <CardSearchPanel onAddCards={cards => { 
              setImages(prev => [...prev, ...cards]); 
              toast(t('proxy.toast_loaded', { 
                count: cards.length,
                suffix: cards.length === 1 
                  ? (lang === 'it' ? 'copia' : 'copy') 
                  : (lang === 'it' ? 'copie' : 'copies')
              })); 
            }} />
          )}
          {dbType === 'bulk' && (
            <BulkImportPanel 
              onAddCards={cards => { 
                setImages(prev => [...prev, ...cards]); 
                toast(t('proxy.toast_loaded', { 
                  count: cards.length,
                  suffix: cards.length === 1 
                    ? (lang === 'it' ? 'copia' : 'copy') 
                    : (lang === 'it' ? 'copie' : 'copies')
                })); 
              }} 
              toast={toast} 
              initialText={bulkInitialText}
              onClearInitial={() => setBulkInitialText("")}
            />
          )}
          {dbType === 'cloud' && (
            <CloudDeckPanel onImport={(text) => { setDbType('bulk'); /* Indirectly use BulkImportPanel's logic? No, better use a direct method if possible */ 
              // We'll set the bulk tab active with the text. But BulkImportPanel needs to handle it.
              // Let's pass the text to BulkImportPanel.
              setBulkInitialText(text);
              setDbType('bulk');
            }} toast={toast} />
          )}
        </div>
      </div>

      {/* Main Queue Area */}
      <div 
        className={`proxy-workspace ${isDrop ? "drag-active" : ""}`}
        onDragOver={e => { e.preventDefault(); setIsDrop(true); }}
        onDragLeave={() => setIsDrop(false)}
        onDrop={onDrop}
      >
        {images.length === 0 ? (
          <div className="empty-state-container" onClick={() => inputRef.current.click()}>
            <div className="empty-state-art">
              <div className="empty-icon-pulse">
                <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" size={48} />
              </div>
            </div>
            <h3 className="empty-state-title">{t('proxy.empty_queue')}</h3>
            <p className="empty-state-desc">{t('proxy.empty_subtitle')}</p>
            <div className="empty-state-action">
              <span>{t('proxy.drag_hint')}</span>
            </div>
          </div>
        ) : (
          <div className="queue-container">
            <div className="queue-header">
               <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                 <h2 className="queue-title">📦 {t('proxy.queue')} <span className="queue-count">{images.length}</span></h2>
                 <input 
                   type="text" 
                   className="control-input" 
                   style={{ padding: '4px 12px', fontSize: '0.75rem', width: '180px' }}
                   placeholder={t('proxy.deck_name_placeholder')} 
                   value={currentDeckName}
                   onChange={e => setCurrentDeckName(e.target.value)}
                 />
                 <button className="btn btn-accent" style={{ padding: '4px 12px', fontSize: '0.75rem', gap: '4px' }} onClick={saveQueueAsDeck} disabled={isSavingDeck}>
                   {isSavingDeck ? <Loader2 size={12} className="loading-spin" /> : <Save size={12} />}
                   {t('proxy.save_to_cloud')}
                 </button>
               </div>
               <div className="queue-pages">({pages} {pages === 1 ? t('proxy.page') : t('proxy.pages')})</div>
               
               <button className={`btn ml-auto ${printOpen ? 'btn-primary' : 'btn-accent'}`} onClick={() => setPrintOpen(v => !v)}>
                 <Icon d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" size={14}/>
                 {printOpen ? t('proxy.close_settings') : t('proxy.pdf_settings_toggle')}
               </button>
            </div>

            {printOpen && (
              <PdfSettings
                printCols={printCols} setPrintCols={setPrintCols}
                printRows={printRows} setPrintRows={setPrintRows}
                printGap={printGap} setPrintGap={setPrintGap}
                cutMarks={cutMarks} setCutMarks={setCutMarks}
                bleedPDF={bleedPDF} setBleedPDF={setBleedPDF}
                perPage={perPage} pages={pages} isMobile={isMobile}
              />
            )}
            
            <PrintQueue 
              images={images} 
              onRemove={remove} 
              onDup={dup} 
              onReorder={reorder}
              dragIdx={dragIdx}
              setDragIdx={setDragIdx}
              isMobile={isMobile}
            />

            <div className="queue-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmOpen(true)}>{t('proxy.clear_all')}</button>
              <button className="btn btn-primary" disabled={isGen} onClick={handleGenPDF}>
                {isGen ? t('proxy.generating') : t('proxy.generate_btn', { count: images.length, pages })}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Snackbar */}
      {snack.show && (
        <div className={`snackbar ${snack.type === "e" ? "error" : snack.type === "w" ? "warning" : "success"}`}>
          {snack.msg}
        </div>
      )}

      {/* Confirm Modal */}
      {confirmOpen && (
        <div className="modal-backdrop" onClick={() => setConfirmOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-icon">🗑</div>
            <div className="modal-title">{t('proxy.modal_clear_title')}</div>
            <div className="modal-body">{t('proxy.modal_clear_body', { count: images.length })}</div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</button>
              <button onClick={clearAll} className="btn btn-danger">{t('proxy.modal_clear_confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
