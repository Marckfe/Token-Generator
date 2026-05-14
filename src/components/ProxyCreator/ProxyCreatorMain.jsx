import React, { useState, useRef, useCallback, useEffect } from "react";
import CardSearchPanel from "./CardSearchPanel";
import BulkImportPanel from "./BulkImportPanel";
import PrintQueue from "./PrintQueue";
import PdfSettings from "./PdfSettings";
import { generatePDF } from "../../utils/pdfGenerator";
import { useLanguage } from "../../context/LanguageContext";

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
  const [dbType, setDbType] = useState('single'); // 'single' or 'bulk'
  
  const inputRef = useRef();

  // Sync with global queue if provided
  useEffect(() => {
    if (externalQueue && externalQueue.length !== images.length) {
      setImages(externalQueue);
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

      {/* Database Search & Bulk Import Section */}
      <div className="section">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--accent-hl)] rounded-lg text-[var(--accent)]">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-light leading-tight">{t('proxy.search_bulk_toggle')}</h2>
              <p className="text-xs text-muted">{t('proxy.search_subtitle')}</p>
            </div>
          </div>
          
          <div className="flex bg-black/20 p-1 rounded-xl border border-[var(--border)]">
            <button 
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${!showDatabase || dbType === 'single' ? 'bg-[var(--accent)] text-black shadow-lg' : 'opacity-50 hover:opacity-100'}`}
              onClick={() => { setShowDatabase(true); setDbType('single'); }}
            >
              🃏 {t('proxy.search_tab')}
            </button>
            <button 
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${showDatabase && dbType === 'bulk' ? 'bg-[var(--accent)] text-black shadow-lg' : 'opacity-50 hover:opacity-100'}`}
              onClick={() => { setShowDatabase(true); setDbType('bulk'); }}
            >
              📝 {t('proxy.bulk_tab')}
            </button>
            {showDatabase && (
              <button 
                className="ml-2 px-3 py-2 text-xs font-bold text-error opacity-60 hover:opacity-100"
                onClick={() => setShowDatabase(false)}
              >
                ✕ {t('common.close')}
              </button>
            )}
          </div>
        </div>

        {showDatabase && (
          <div className="accordion-content pt-0 border-none shadow-none bg-transparent">
            {dbType === 'single' ? (
              <CardSearchPanel onAddCards={cards => {
                setImages(prev => [...prev, ...cards]);
                const suffix = cards.length === 1 ? (lang === 'it' ? "ia" : "") : (lang === 'it' ? "ie" : "s");
                toast(t('proxy.cards_added', { count: cards.length, suffix }));
              }} />
            ) : (
              <BulkImportPanel onAddCards={cards => {
                setImages(prev => [...prev, ...cards]);
                const suffix = cards.length === 1 ? (lang === 'it' ? "ia" : "") : (lang === 'it' ? "ie" : "s");
                toast(t('proxy.cards_added', { count: cards.length, suffix }));
              }} toast={toast} />
            )}
          </div>
        )}
      </div>

      {/* Dropzone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDrop(true); }}
        onDragLeave={() => setIsDrop(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`dropzone ${isDrop ? "active" : ""}`}
        style={{ padding: isMobile ? "24px 16px" : "36px 24px" }}
      >
        <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
          onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
        <div className="dropzone-icon">🖼️</div>
        <div className="dropzone-title">{t('proxy.dropzone_title')}</div>
        <div className="dropzone-subtitle">{t('proxy.dropzone_subtitle')}</div>
      </div>

      {/* Print Queue */}
      {images.length > 0 && (
        <div className="section queue-section">
          <div className="queue-header">
            <div className="queue-title">
              {t('proxy.queue_title')}
              <span className="queue-badge">{t('proxy.queue_badge', { count: images.length })}</span>
            </div>
            <button className={`btn ${printOpen ? 'btn-primary' : 'btn-accent'}`} onClick={() => setPrintOpen(v => !v)}>
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
            dragIdx={dragIdx}
            setDragIdx={setDragIdx}
            reorder={reorder}
            remove={remove}
            dup={dup}
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

      {/* Empty State */}
      {images.length === 0 && <PrintQueue images={[]} />}

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
