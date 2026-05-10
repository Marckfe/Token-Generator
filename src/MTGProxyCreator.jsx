import React, { useState, useRef, useCallback } from "react";
import { PDFDocument, rgb } from "pdf-lib";

// ── COSTANTI ──────────────────────────────────────────────────────────────────
const CARD_WIDTH_MM = 63, CARD_HEIGHT_MM = 88;
const BLEED_MM = 3; // bleed tipografico
const mmToPt = mm => (mm / 25.4) * 72;
const CARD_W  = mmToPt(CARD_WIDTH_MM);
const CARD_H  = mmToPt(CARD_HEIGHT_MM);
const PAGE_W  = 595.28, PAGE_H = 841.89; // A4 in pt

// ── UTILITY: dataURL → ArrayBuffer ────────────────────────────────────────────
function dataURLtoBuffer(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ── UTILITY: carica immagine su canvas e ritorna PNG dataURL ──────────────────
// Usato per le immagini Scryfall (CORS) — le disegna su canvas per estrarre i byte
function imgToDataURL(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      res(c.toDataURL("image/png"));
    };
    img.onerror = () => {
      // fallback: carica senza crossOrigin (alcune CDN lo permettono)
      const img2 = new Image();
      img2.onload = () => {
        const c = document.createElement("canvas");
        c.width = img2.naturalWidth; c.height = img2.naturalHeight;
        c.getContext("2d").drawImage(img2, 0, 0);
        try { res(c.toDataURL("image/png")); } catch { rej(new Error("CORS: impossibile leggere " + url)); }
      };
      img2.onerror = rej;
      img2.src = url;
    };
    img.src = url;
  });
}

// ── UTILITY: File → dataURL ───────────────────────────────────────────────────
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ── ICONS ─────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export default function MTGProxyCreator() {
  const [tab, setTab]             = useState("proxy");
  const [images, setImages]       = useState([]);
  const [dragIdx, setDragIdx]     = useState(null);
  const [isDrop, setIsDrop]       = useState(false);
  const [isGen, setIsGen]         = useState(false);
  const [loadRnd, setLoadRnd]     = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [snack, setSnack]         = useState({ show: false, msg: "", type: "s" });
  const [printCols, setPrintCols] = useState(3);
  const [printRows, setPrintRows] = useState(3);
  const [printGap, setPrintGap]   = useState(2);
  const [cutMarks, setCutMarks]   = useState(true);
  const [bleedPDF, setBleedPDF]   = useState(false); // bleed 3mm nel PDF
  const inputRef = useRef();

  const toast = useCallback((msg, type = "s") => {
    setSnack({ show: true, msg, type });
    setTimeout(() => setSnack(s => ({ ...s, show: false })), 3200);
  }, []);

  const handleFiles = useCallback(files => {
    const valid = ["image/png","image/jpeg","image/webp","image/gif"];
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
      const a = [...prev]; const [m] = a.splice(dragIdx, 1);
      a.splice(toIdx, 0, m); return a;
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
      const a = [...prev]; a.splice(idx + 1, 0, d); return a;
    });
    toast("Duplicata!");
  };

  const clearAll = () => {
    images.forEach(img => { if (img.file) URL.revokeObjectURL(img.url); });
    setImages([]); setConfirmOpen(false); toast("Tutte rimosse", "w");
  };

  const fetchRandom = async () => {
    setLoadRnd(true);
    try {
      const results = [];
      for (let i = 0; i < 9; i++) {
        const d = await fetch("https://api.scryfall.com/cards/random").then(r => r.json());
        const imgUrl = d.image_uris?.normal || d.image_uris?.large || d.card_faces?.[0]?.image_uris?.normal;
        if (!imgUrl) continue;
        // Scarica subito come blob — evita problemi CORS in fase di export PDF
        try {
          const blob = await fetch(imgUrl).then(r => r.blob());
          const localUrl = URL.createObjectURL(blob);
          const file = new File([blob], `${d.name}.jpg`, { type: blob.type });
          results.push({ id: d.id + "_" + Math.random(), name: d.name, url: localUrl, file, srcType: "scryfall" });
        } catch {
          // fallback: salva solo URL (potrebbe fallire in export)
          results.push({ id: d.id + "_" + Math.random(), name: d.name, url: imgUrl, srcType: "scryfall" });
        }
      }
      setImages(prev => [...prev, ...results]);
      toast(`${results.length} carte aggiunte!`);
    } catch (e) { toast("Errore Scryfall: " + e.message, "e"); }
    finally { setLoadRnd(false); }
  };

  // ── GENERA PDF ─────────────────────────────────────────────────────────────
  const genPDF = async () => {
    if (!images.length) { toast("Nessuna carta", "w"); return; }
    setIsGen(true);
    try {
      const perPage  = printCols * printRows;
      const gapPt    = mmToPt(printGap);
      // Se bleed attivo, le carte nel PDF sono leggermente più grandi
      const bleedPt  = bleedPDF ? mmToPt(BLEED_MM) : 0;
      const cardW    = CARD_W + bleedPt * 2;
      const cardH    = CARD_H + bleedPt * 2;

      const doc = await PDFDocument.create();

      for (let start = 0; start < images.length; start += perPage) {
        const page  = doc.addPage([PAGE_W, PAGE_H]);
        page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(1,1,1) });

        const batch = images.slice(start, start + perPage);
        const gW    = printCols * cardW + (printCols - 1) * gapPt;
        const gH    = printRows * cardH + (printRows - 1) * gapPt;
        const sx    = (PAGE_W - gW) / 2;
        const sy    = (PAGE_H - gH) / 2;

        for (let i = 0; i < batch.length; i++) {
          const item = batch[i];
          try {
            // ── Ottieni dataURL dell'immagine ────────────────────────────────
            let dataUrl;
            if (item.dataUrl) {
              // già in cache (canvas token)
              dataUrl = item.dataUrl;
            } else if (item.file) {
              // file caricato dall'utente
              dataUrl = await fileToDataURL(item.file);
            } else if (item.url) {
              // URL remoto (es. Scryfall) — passa per canvas per aggirare CORS
              dataUrl = await imgToDataURL(item.url);
            } else {
              throw new Error("Nessuna sorgente immagine");
            }

            // ── Converti dataURL → buffer → embed in PDF ────────────────────
            const buf = dataURLtoBuffer(dataUrl);
            let pimg;
            if (dataUrl.startsWith("data:image/jpeg")) {
              pimg = await doc.embedJpg(buf);
            } else {
              pimg = await doc.embedPng(buf);
            }

            // ── Posizione nella griglia ──────────────────────────────────────
            const col = i % printCols;
            const row = Math.floor(i / printCols);
            const x   = sx + col * (cardW + gapPt);
            const y   = sy + (printRows - 1 - row) * (cardH + gapPt);

            page.drawImage(pimg, { x, y, width: cardW, height: cardH });

            // ── Crop marks (sul bordo taglio, non sul bleed) ─────────────────
            if (cutMarks) {
              const mk = mmToPt(4), g2 = mmToPt(1);
              const c  = rgb(0.5, 0.5, 0.5), t = 0.4;
              // Coordinate del bordo taglio reale (senza bleed)
              const cx0 = x + bleedPt, cy0 = y + bleedPt;
              const cx1 = x + cardW - bleedPt, cy1 = y + cardH - bleedPt;
              const corners = [[cx0, cy0],[cx1, cy0],[cx0, cy1],[cx1, cy1]];
              corners.forEach(([px, py]) => {
                const signX = px === cx0 ? -1 : 1;
                const signY = py === cy0 ? -1 : 1;
                page.drawLine({ start:{x: px - signX*(g2+mk), y: py}, end:{x: px - signX*g2, y: py}, color:c, thickness:t });
                page.drawLine({ start:{x: px + signX*g2,     y: py}, end:{x: px + signX*(g2+mk), y: py}, color:c, thickness:t });
                page.drawLine({ start:{x: px, y: py - signY*(g2+mk)}, end:{x: px, y: py - signY*g2}, color:c, thickness:t });
                page.drawLine({ start:{x: px, y: py + signY*g2},     end:{x: px, y: py + signY*(g2+mk)}, color:c, thickness:t });
              });
            }
          } catch (e) {
            console.warn(`Carta ${i} saltata:`, e.message);
            // Disegna un placeholder grigio per la carta saltata
            const col = i % printCols, row = Math.floor(i / printCols);
            const x = sx + col*(cardW+gapPt), y = sy + (printRows-1-row)*(cardH+gapPt);
            page.drawRectangle({ x, y, width:cardW, height:cardH, color:rgb(0.9,0.9,0.9) });
            page.drawText("Errore caricamento", { x: x+10, y: y+cardH/2, size:8, color:rgb(0.5,0.5,0.5) });
          }
        }
      }

      const bytes = await doc.save();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      a.download = "mtg-proxy-stampa.pdf";
      a.click();
      toast("✅ PDF scaricato!");
    } catch (e) {
      console.error(e);
      toast("Errore PDF: " + e.message, "e");
    } finally {
      setIsGen(false);
    }
  };

  const perPage = printCols * printRows;
  const pages   = Math.max(1, Math.ceil(images.length / perPage));

  // ── STYLES ────────────────────────────────────────────────────────────────
  const s = {
    shell: { display:"grid", gridTemplateColumns:"220px 1fr", minHeight:"100vh" },
    sidebar: { display:"flex", flexDirection:"column", background:"var(--surface)", borderRight:"1px solid var(--border)", padding:"20px 12px", position:"sticky", top:0, height:"100vh", overflowY:"auto" },
    main: { display:"flex", flexDirection:"column", padding:"28px 32px", gap:"20px", overflowX:"hidden" },
    navBtn: (active) => ({ display:"flex", alignItems:"center", gap:10, padding:"10px 13px", borderRadius:"var(--r-lg)", color: active?"var(--primary)":"var(--muted)", background: active?"var(--primary-hl)":"transparent", fontSize:".85rem", fontWeight: active?700:500, cursor:"pointer", border:"none", width:"100%", textAlign:"left", transition:"all var(--tr)" }),
    btn: (v) => ({ display:"inline-flex", alignItems:"center", gap:7, padding:"8px 16px", borderRadius:"var(--r-lg)", fontSize:".83rem", fontWeight:600, cursor:"pointer", border:"none", transition:"all var(--tr)", whiteSpace:"nowrap", background: v==="primary"?"var(--primary)":v==="accent"?"rgba(79,152,163,.15)":"transparent", color: v==="primary"?"#0f0e0c":v==="accent"?"var(--accent)":"var(--muted)", ...(v==="ghost"?{border:"1px solid var(--border)"}:{}), ...(v==="accent"?{border:"1px solid rgba(79,152,163,.35)"}:{}) }),
    card: { position:"relative", aspectRatio:"63/88", borderRadius:"var(--r-md)", overflow:"hidden", background:"var(--surf-off)", boxShadow:"var(--sh-sm)", cursor:"grab", transition:"transform var(--tr),box-shadow var(--tr)" },
  };

  return (
    <div style={s.shell}>
      {/* SIDEBAR */}
      <aside style={s.sidebar}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28, paddingBottom:20, borderBottom:"1px solid var(--divider)" }}>
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
            <polygon points="16,2 30,10 30,22 16,30 2,22 2,10" stroke="#c9a227" strokeWidth="2"/>
            <polygon points="16,7 25,12 25,20 16,25 7,20 7,12" fill="rgba(201,162,39,.12)" stroke="#c9a227" strokeWidth="1"/>
            <text x="16" y="20" textAnchor="middle" fill="#c9a227" fontSize="10" fontWeight="900" fontFamily="serif">P</text>
          </svg>
          <span style={{ fontSize:"1.05rem", fontWeight:900, color:"var(--primary)", letterSpacing:"-.02em" }}>MTG Proxy</span>
        </div>
        <nav style={{ display:"flex", flexDirection:"column", gap:3, flex:1 }}>
          {[
            ["proxy","Proxy Stampa","M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"],
            ["token","Token Creator","M2 3h20v14H2zM8 21h8M12 17v4"]
          ].map(([id,label,d]) => (
            <button key={id} style={s.navBtn(tab===id)} onClick={() => setTab(id)}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={d}/></svg>
              {label}
            </button>
          ))}
        </nav>
        <div style={{ paddingTop:16, borderTop:"1px solid var(--divider)", fontSize:".72rem", color:"var(--faint)", textAlign:"center" }}>by Marco Feoli</div>
      </aside>

      {/* MAIN */}
      <main style={s.main}>
        {tab === "proxy" && (
          <>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:14, flexWrap:"wrap" }}>
              <div>
                <h1 style={{ fontSize:"1.55rem", fontWeight:900, color:"var(--text)", letterSpacing:"-.03em" }}>Proxy Card Printer</h1>
                <p style={{ fontSize:".82rem", color:"var(--muted)", marginTop:4 }}>
                  Carica le tue carte e genera un PDF pronto per la stampa
                </p>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button style={s.btn("ghost")} onClick={() => inputRef.current.click()}>
                  <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                  Carica immagini
                </button>
                <button style={s.btn("accent")} onClick={fetchRandom} disabled={loadRnd}>
                  <Icon d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                  {loadRnd ? "Caricamento…" : "9 carte random"}
                </button>
                {images.length > 0 && (
                  <button style={s.btn("primary")} onClick={() => setPrintOpen(true)}>
                    <Icon d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/>
                    Genera PDF ({images.length} carte)
                  </button>
                )}
              </div>
            </div>
            <input ref={inputRef} type="file" accept="image/*" multiple style={{ display:"none" }}
              onChange={e => { handleFiles(e.target.files); e.target.value=null; }} />

            {/* Drop zone */}
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setIsDrop(true); }}
              onDragLeave={() => setIsDrop(false)}
              onClick={() => !images.length && inputRef.current.click()}
              style={{ border:`2px dashed ${isDrop?"var(--primary)":"var(--border)"}`, borderRadius:"var(--r-xl)", padding: images.length?"16px":"60px 20px", textAlign:"center", background: isDrop?"var(--primary-hl)":"var(--surf-off)", transition:"all var(--tr)", cursor: images.length?"default":"pointer", minHeight: images.length?"auto":180 }}>
              {!images.length ? (
                <div style={{ color:"var(--muted)" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin:"0 auto 12px" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                  </svg>
                  <p style={{ fontWeight:600, marginBottom:4 }}>Trascina le immagini qui o clicca per caricare</p>
                  <p style={{ fontSize:".78rem" }}>PNG, JPG, WEBP — puoi caricare carte custom, screenshot, proxy</p>
                </div>
              ) : (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))", gap:10 }}>
                  {images.map((img, idx) => (
                    <div key={img.id} draggable
                      onDragStart={() => setDragIdx(idx)}
                      onDragOver={e => { e.preventDefault(); reorder(idx); }}
                      onDragEnd={() => setDragIdx(null)}
                      style={{ ...s.card, outline: dragIdx===idx?"2px solid var(--primary)":"none" }}>
                      <img src={img.url} alt={img.name||"card"} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                      <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0)", transition:"background var(--tr)", display:"flex", alignItems:"flex-end", padding:4, gap:3, opacity:0, pointerEvents:"none" }}
                        onMouseEnter={e => { e.currentTarget.style.background="rgba(0,0,0,.55)"; e.currentTarget.style.opacity=1; e.currentTarget.style.pointerEvents="auto"; }}
                        onMouseLeave={e => { e.currentTarget.style.background="rgba(0,0,0,0)"; e.currentTarget.style.opacity=0; e.currentTarget.style.pointerEvents="none"; }}>
                        <button onClick={() => dup(idx)} style={{ flex:1, background:"rgba(255,255,255,.15)", border:"none", color:"#fff", borderRadius:4, fontSize:10, padding:"3px 0", cursor:"pointer" }}>×2</button>
                        <button onClick={() => remove(idx)} style={{ flex:1, background:"rgba(200,50,50,.7)", border:"none", color:"#fff", borderRadius:4, fontSize:10, padding:"3px 0", cursor:"pointer" }}>✕</button>
                      </div>
                      <div style={{ position:"absolute", top:3, left:3, background:"rgba(0,0,0,.6)", color:"#fff", fontSize:9, padding:"1px 4px", borderRadius:3 }}>{idx+1}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {images.length > 0 && (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                <span style={{ fontSize:".82rem", color:"var(--muted)" }}>{images.length} carte • {pages} pagina{pages!==1?"e":""} PDF</span>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={s.btn("ghost")} onClick={() => setPrintOpen(true)}>⚙ Impostazioni stampa</button>
                  <button style={s.btn("ghost")} onClick={() => setConfirmOpen(true)} title="Rimuovi tutto">✕ Svuota</button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "token" && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:1, color:"var(--muted)", flexDirection:"column", gap:12 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h20v14H2zM8 21h8M12 17v4"/></svg>
            <p style={{ fontWeight:600 }}>Token Creator</p>
            <p style={{ fontSize:".82rem" }}>Usa il Tab Token Creator nel componente dedicato</p>
          </div>
        )}
      </main>

      {/* MODAL IMPOSTAZIONI STAMPA */}
      {printOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={e => e.target===e.currentTarget && setPrintOpen(false)}>
          <div style={{ background:"var(--surface)", borderRadius:"var(--r-xl)", padding:28, width:400, maxWidth:"90vw", border:"1px solid var(--border)" }}>
            <h2 style={{ fontWeight:800, marginBottom:20, color:"var(--text)" }}>Impostazioni PDF</h2>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
              {[["Colonne",printCols,setPrintCols,1,6],["Righe",printRows,setPrintRows,1,6]].map(([label,val,set,min,max]) => (
                <label key={label} style={{ fontSize:".83rem", color:"var(--muted)" }}>
                  {label}
                  <input type="number" min={min} max={max} value={val}
                    onChange={e => set(Math.max(min,Math.min(max,+e.target.value)))}
                    style={{ display:"block", width:"100%", marginTop:4, background:"var(--surf-off)", color:"var(--text)", border:"1px solid var(--border)", borderRadius:"var(--r-md)", padding:"6px 10px", fontSize:".9rem" }}/>
                </label>
              ))}
              <label style={{ fontSize:".83rem", color:"var(--muted)" }}>
                Margine (mm)
                <input type="number" min={0} max={10} step={0.5} value={printGap}
                  onChange={e => setPrintGap(+e.target.value)}
                  style={{ display:"block", width:"100%", marginTop:4, background:"var(--surf-off)", color:"var(--text)", border:"1px solid var(--border)", borderRadius:"var(--r-md)", padding:"6px 10px", fontSize:".9rem" }}/>
              </label>
            </div>
            <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:".83rem", color:"var(--muted)", marginBottom:10, cursor:"pointer" }}>
              <input type="checkbox" checked={cutMarks} onChange={e => setCutMarks(e.target.checked)}/> Segni di taglio (crop marks)
            </label>
            <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:".83rem", color:"var(--muted)", marginBottom:20, cursor:"pointer" }}>
              <input type="checkbox" checked={bleedPDF} onChange={e => setBleedPDF(e.target.checked)}/> Bleed tipografico 3mm (consigliato per tipografia)
            </label>
            <p style={{ fontSize:".78rem", color:"var(--faint)", marginBottom:20 }}>
              {printCols}×{printRows} = {perPage} carte per pagina • {pages} pagina{pages!==1?"e":""} • Formato A4
            </p>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button style={s.btn("ghost")} onClick={() => setPrintOpen(false)}>Annulla</button>
              <button style={s.btn("primary")} onClick={() => { setPrintOpen(false); genPDF(); }} disabled={isGen}>
                {isGen ? "⏳ Generazione…" : "⬇ Scarica PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFERMA SVUOTA */}
      {confirmOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"var(--surface)", borderRadius:"var(--r-xl)", padding:28, width:340, border:"1px solid var(--border)" }}>
            <h3 style={{ fontWeight:800, marginBottom:10, color:"var(--text)" }}>Svuotare la lista?</h3>
            <p style={{ fontSize:".83rem", color:"var(--muted)", marginBottom:20 }}>Tutte le {images.length} carte verranno rimosse.</p>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button style={s.btn("ghost")} onClick={() => setConfirmOpen(false)}>Annulla</button>
              <button style={{ ...s.btn("ghost"), color:"#e05050", borderColor:"#e05050" }} onClick={clearAll}>Svuota</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {snack.show && (
        <div style={{ position:"fixed", bottom:24, right:24, background: snack.type==="e"?"#7a1e1e":snack.type==="w"?"#5a4a00":"var(--primary)", color:"#fff", padding:"10px 18px", borderRadius:"var(--r-lg)", fontSize:".85rem", fontWeight:600, zIndex:200, boxShadow:"0 4px 20px rgba(0,0,0,.3)" }}>
          {snack.msg}
        </div>
      )}
    </div>
  );
}
