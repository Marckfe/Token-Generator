import React, { useState, useRef, useCallback, useEffect } from "react";
import CardSearchPanel from "./CardSearchPanel";
import BulkImportPanel from "./BulkImportPanel";
import PrintQueue from "./PrintQueue";
import PdfSettings from "./PdfSettings";
import { generatePDF } from "../../utils/pdfGenerator";

function Icon({ d, size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

export default function ProxyCreatorMain({ isMobile, externalQueue, setExternalQueue }) {
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
    if (!arr.length) { toast("Nessuna immagine valida (PNG/JPG/WEBP)", "w"); return; }
    setImages(prev => [...prev, ...arr]);
    toast(`${arr.length} immagini caricate`);
  }, [toast]);

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
    toast("Rimossa", "w");
  };

  const dup = idx => {
    setImages(prev => {
      const d = { ...prev[idx], id: Date.now() + Math.random() };
      const a = [...prev];
      a.splice(idx + 1, 0, d);
      return a;
    });
    toast("Duplicata!");
  };

  const clearAll = () => {
    images.forEach(img => { if (img.file) URL.revokeObjectURL(img.url); });
    setImages([]); setConfirmOpen(false); toast("Tutte rimosse", "w");
  };

  const batchDuplicate = () => {
    if (!images.length) return;
    setImages(prev => {
      const cloned = prev.map(img => ({ ...img, id: Date.now() + Math.random() + "_" + img.id }));
      return [...prev, ...cloned];
    });
    toast("Coda raddoppiata!");
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
    toast("Ridotto a 1 copia per carta");
  };

  const perPage = printCols * printRows;
  const pages = Math.max(1, Math.ceil(images.length / perPage));

  const handleGenPDF = async () => {
    if (!images.length) { toast("Nessuna carta", "w"); return; }
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
      toast("✅ PDF scaricato!");
    } catch (e) {
      console.error(e); toast("Errore PDF: " + e.message, "e");
    } finally { setIsGen(false); }
  };

  return (
    <>
      {/* Header */}
      <div className="main-header">
        <div>
          <h1 className="main-title">Proxy Card Printer <span className="premium-badge">ELITE</span></h1>
          <p className="main-subtitle">Carica le tue carte e genera un PDF pronto per la stampa</p>
        </div>
        <div className="header-actions">
          {images.length > 0 && (
            <div className="batch-actions-bar">
               <button className="batch-btn" onClick={batchDuplicate} title="Duplica tutte le carte in coda">
                 <Icon d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" size={14}/>
                 <span>Duplica</span>
               </button>
               <button className="batch-btn" onClick={batchResetToOne} title="Mantieni solo 1 copia per ogni carta">
                 <Icon d="M4 7V4h16v3M9 20h6M12 4v16" size={14}/>
                 <span>Singoli</span>
               </button>
               <div className="batch-sep"></div>
               <button className="batch-btn text-error" onClick={() => setConfirmOpen(true)}>
                 <Icon d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" size={14}/>
                 <span>Svuota</span>
               </button>
            </div>
          )}

          {images.length > 0 && (
            <button className="btn btn-primary" disabled={isGen} onClick={handleGenPDF}>
              {isGen ? <span className="text-xs">Generando…</span> : <><Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" size={15}/> Genera PDF</>}
            </button>
          )}
        </div>
      </div>

      {/* Database Search & Bulk Import Accordion */}
      <div className="section">
        <button
          onClick={() => setShowDatabase(v => !v)}
          className={`accordion-trigger ${showDatabase ? "open" : ""}`}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          🔍 Cerca carte · Aggiungi lista
          <span className="accordion-icon">{showDatabase ? "▲ chiudi" : "▼ apri"}</span>
        </button>

        {showDatabase && (
          <div className="accordion-content">
            <CardSearchPanel onAddCards={cards => {
              setImages(prev => [...prev, ...cards]);
              toast(`✅ ${cards.length} cop${cards.length === 1 ? "ia" : "ie"} aggiunte!`);
            }} />
            <BulkImportPanel onAddCards={cards => {
              setImages(prev => [...prev, ...cards]);
              toast(`✅ ${cards.length} cop${cards.length === 1 ? "ia" : "ie"} aggiunte!`);
            }} toast={toast} />
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
        <div className="dropzone-title">Trascina le immagini qui o clicca per caricare</div>
        <div className="dropzone-subtitle">PNG, JPG, WEBP — carte custom, screenshot, proxy</div>
      </div>

      {/* Print Queue */}
      {images.length > 0 && (
        <div className="section queue-section">
          <div className="queue-header">
            <div className="queue-title">
              Coda di stampa
              <span className="queue-badge">{images.length} carte</span>
            </div>
            <button className={`btn ${printOpen ? 'btn-primary' : 'btn-accent'}`} onClick={() => setPrintOpen(v => !v)}>
              <Icon d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" size={14}/>
              {printOpen ? "Chiudi impostazioni" : "Impostazioni PDF"}
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
            <button className="btn btn-ghost" onClick={() => setConfirmOpen(true)}>🗑 Svuota tutto</button>
            <button className="btn btn-primary" disabled={isGen} onClick={handleGenPDF}>
              {isGen ? "⏳ Generando PDF…" : `⬇ Genera PDF (${images.length} carte, ${pages} pag)`}
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
            <div className="modal-title">Svuota la coda?</div>
            <div className="modal-body">Tutte le {images.length} carte verranno rimosse.</div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmOpen(false)}>Annulla</button>
              <button onClick={clearAll} className="btn btn-danger">Sì, svuota</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
