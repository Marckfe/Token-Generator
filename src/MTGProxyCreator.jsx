import React, { useState, useRef, useCallback } from "react";
import TokenPreviewSinglePtFrame from './TokenPreviewSinglePtFrame';
import { PDFDocument, rgb } from "pdf-lib";

// ── ICONS (inline SVG per evitare dipendenze extra) ────────────────────────────
const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const CARD_WIDTH_MM = 63, CARD_HEIGHT_MM = 88;
const mmToPt = mm => (mm / 25.4) * 72;
const CARD_W = mmToPt(CARD_WIDTH_MM);
const CARD_H = mmToPt(CARD_HEIGHT_MM);
const PAGE_W = 595.28, PAGE_H = 841.89;

export default function MTGProxyCreator() {
  const [tab, setTab] = useState("proxy");
  const [images, setImages] = useState([]);
  const [dragIdx, setDragIdx] = useState(null);
  const [isDrop, setIsDrop] = useState(false);
  const [isGen, setIsGen] = useState(false);
  const [loadRnd, setLoadRnd] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [snack, setSnack] = useState({ show: false, msg: "", type: "s" });
  const [printCols, setPrintCols] = useState(3);
  const [printRows, setPrintRows] = useState(3);
  const [printGap, setPrintGap] = useState(3);
  const [cutMarks, setCutMarks] = useState(true);
  const inputRef = useRef();

  const toast = useCallback((msg, type = "s") => {
    setSnack({ show: true, msg, type });
    setTimeout(() => setSnack(s => ({ ...s, show: false })), 3200);
  }, []);

  const handleFiles = useCallback(files => {
    const arr = Array.from(files).map(f => ({
      id: Date.now() + Math.random(), name: f.name,
      url: URL.createObjectURL(f), file: f,
    }));
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
    setImages(prev => { if (prev[idx].file) URL.revokeObjectURL(prev[idx].url); return prev.filter((_, i) => i !== idx); });
    toast("Immagine rimossa", "w");
  };

  const dup = idx => {
    setImages(prev => { const d = { ...prev[idx], id: Date.now() + Math.random() }; const a = [...prev]; a.splice(idx + 1, 0, d); return a; });
    toast("Carta duplicata!");
  };

  const clearAll = () => {
    images.forEach(img => { if (img.file) URL.revokeObjectURL(img.url); });
    setImages([]); setConfirmOpen(false); toast("Tutte le immagini rimosse", "w");
  };

  const fetchRandom = async () => {
    setLoadRnd(true);
    try {
      const results = [];
      for (let i = 0; i < 9; i++) {
        const d = await fetch("https://api.scryfall.com/cards/random").then(r => r.json());
        const url = d.image_uris?.normal || d.image_uris?.large || d.card_faces?.[0]?.image_uris?.normal;
        if (url) results.push({ id: d.id + "_" + Math.random(), name: d.name, url, srcType: "scryfall" });
      }
      setImages(prev => [...prev, ...results]);
      toast(`${results.length} carte random aggiunte!`);
    } catch (e) { toast("Errore Scryfall: " + e.message, "e"); }
    finally { setLoadRnd(false); }
  };

  const genPDF = async () => {
    if (!images.length) { toast("Nessuna carta da stampare", "w"); return; }
    setIsGen(true);
    try {
      const perPage = printCols * printRows;
      const gapPt = mmToPt(printGap);
      const doc = await PDFDocument.create();
      for (let start = 0; start < images.length; start += perPage) {
        const page = doc.addPage([PAGE_W, PAGE_H]);
        page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(1, 1, 1) });
        const batch = images.slice(start, start + perPage);
        const gW = printCols * CARD_W + (printCols - 1) * gapPt;
        const gH = printRows * CARD_H + (printRows - 1) * gapPt;
        const sx = (PAGE_W - gW) / 2, sy = (PAGE_H - gH) / 2;
        for (let i = 0; i < batch.length; i++) {
          try {
            let bytes = batch[i].file ? await batch[i].file.arrayBuffer() : await fetch(batch[i].url).then(r => r.arrayBuffer());
            const col = i % printCols, row = Math.floor(i / printCols);
            const x = sx + col * (CARD_W + gapPt);
            const y = sy + (printRows - 1 - row) * (CARD_H + gapPt);
            let pimg;
            try { pimg = await doc.embedJpg(bytes); } catch { pimg = await doc.embedPng(bytes); }
            page.drawImage(pimg, { x, y, width: CARD_W, height: CARD_H });
            if (cutMarks) {
              const mk = 8, g2 = 2, c = rgb(.65, .65, .65), t = .4;
              [[x, y + CARD_H], [x + CARD_W, y + CARD_H], [x, y], [x + CARD_W, y]].forEach(([cx, cy]) => {
                page.drawLine({ start: { x: cx - mk - g2, y: cy }, end: { x: cx - g2, y: cy }, color: c, thickness: t });
                page.drawLine({ start: { x: cx + g2, y: cy }, end: { x: cx + mk + g2, y: cy }, color: c, thickness: t });
                page.drawLine({ start: { x: cx, y: cy - mk - g2 }, end: { x: cx, y: cy - g2 }, color: c, thickness: t });
                page.drawLine({ start: { x: cx, y: cy + g2 }, end: { x: cx, y: cy + mk + g2 }, color: c, thickness: t });
              });
            }
          } catch (e) { console.warn("skip img", e); }
        }
      }
      const bytes = await doc.save();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      a.download = "mtg-proxy-print.pdf"; a.click();
      toast("PDF scaricato!");
    } catch (e) { toast("Errore PDF: " + e.message, "e"); }
    finally { setIsGen(false); }
  };

  const perPage = printCols * printRows;
  const pages = Math.max(1, Math.ceil(images.length / perPage));

  // ── STYLES INLINE ──────────────────────────────────────────────────────────
  const s = {
    shell: { display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "100vh" },
    sidebar: { display: "flex", flexDirection: "column", background: "var(--surface)", borderRight: "1px solid var(--border)", padding: "20px 12px", position: "sticky", top: 0, height: "100vh", overflowY: "auto" },
    main: { display: "flex", flexDirection: "column", padding: "28px 32px", gap: "20px", overflowX: "hidden" },
    navBtn: (active) => ({ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: "var(--r-lg)", color: active ? "var(--primary)" : "var(--muted)", background: active ? "var(--primary-hl)" : "transparent", fontSize: ".85rem", fontWeight: active ? 700 : 500, cursor: "pointer", border: "none", width: "100%", textAlign: "left", transition: "all var(--tr)" }),
    btn: (variant) => ({ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: "var(--r-lg)", fontSize: ".83rem", fontWeight: 600, cursor: "pointer", border: "none", transition: "all var(--tr)", whiteSpace: "nowrap", background: variant === "primary" ? "var(--primary)" : variant === "accent" ? "rgba(79,152,163,.15)" : "transparent", color: variant === "primary" ? "#0f0e0c" : variant === "accent" ? "var(--accent)" : "var(--muted)", ...(variant === "ghost" ? { border: "1px solid var(--border)" } : {}), ...(variant === "accent" ? { border: "1px solid rgba(79,152,163,.35)" } : {}) }),
    card: { position: "relative", aspectRatio: "63/88", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surf-off)", boxShadow: "var(--sh-sm)", cursor: "grab", transition: "transform var(--tr),box-shadow var(--tr)" },
  };

  return (
    <div style={s.shell}>
      {/* ── SIDEBAR ── */}
      <aside style={s.sidebar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid var(--divider)" }}>
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
            <polygon points="16,2 30,10 30,22 16,30 2,22 2,10" stroke="#c9a227" strokeWidth="2" />
            <polygon points="16,7 25,12 25,20 16,25 7,20 7,12" fill="rgba(201,162,39,.12)" stroke="#c9a227" strokeWidth="1" />
            <text x="16" y="20" textAnchor="middle" fill="#c9a227" fontSize="10" fontWeight="900" fontFamily="serif">P</text>
          </svg>
          <span style={{ fontSize: "1.05rem", fontWeight: 900, color: "var(--primary)", letterSpacing: "-.02em" }}>MTG Proxy</span>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
          {[["proxy", "Proxy Stampa", "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"],
            ["token", "Token Creator", "M2 3h20a0 0 0 0 1 0 14H2zM8 21h8M12 17v4"]].map(([id, label, d]) => (
            <button key={id} style={s.navBtn(tab === id)} onClick={() => setTab(id)}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={d} />
              </svg>
              {label}
            </button>
          ))}
        </nav>
        <div style={{ paddingTop: 16, borderTop: "1px solid var(--divider)", fontSize: ".72rem", color: "var(--faint)", textAlign: "center" }}>by Marco Feoli</div>
      </aside>

      {/* ── MAIN ── */}
      <main style={s.main}>
        {/* ═══ TAB PROXY ═══ */}
        {tab === "proxy" && (
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
              <div>
                <h1 style={{ fontSize: "1.55rem", fontWeight: 900, color: "var(--text)", letterSpacing: "-.03em" }}>Proxy Card Printer</h1>
                <p style={{ fontSize: ".82rem", color: "var(--muted)", marginTop: 3 }}>Carica, ordina e stampa le tue carte proxy MTG in alta qualità</p>
              </div>
              {images.length > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={s.btn("ghost")} onClick={() => setConfirmOpen(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                    Rimuovi tutte
                  </button>
                  <button style={s.btn("primary")} onClick={() => setPrintOpen(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Stampa / PDF
                  </button>
                </div>
              )}
            </div>

            {/* Slot bar */}
            {images.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)" }}>
                <span style={{ fontSize: ".83rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                  <strong style={{ color: "var(--primary)" }}>{images.length}</strong> carte · {pages} {pages === 1 ? "pagina" : "pagine"} A4
                </span>
                <div style={{ flex: 1, height: 4, background: "var(--surf-off)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${((images.length % perPage || perPage) / perPage * 100)}%`, background: "linear-gradient(90deg,var(--primary),var(--accent))", borderRadius: 999, transition: "width .4s" }} />
                </div>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDrop(true); }}
              onDragLeave={() => setIsDrop(false)}
              onDrop={onDrop}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 11, padding: "44px 28px", background: isDrop ? "var(--primary-hl)" : "var(--surface)", border: `2px dashed ${isDrop ? "var(--primary)" : "var(--border)"}`, borderRadius: "var(--r-xl)", textAlign: "center", transition: "all var(--tr)" }}
            >
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={isDrop ? "var(--primary)" : "var(--faint)"} strokeWidth="1.4"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
              <p style={{ fontSize: "1.08rem", fontWeight: 700, color: "var(--text)" }}>Trascina le immagini qui</p>
              <p style={{ fontSize: ".82rem", color: "var(--muted)" }}>PNG, JPG, WEBP · Dimensione consigliata 63×88mm</p>
              <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
                <button style={s.btn("primary")} onClick={() => inputRef.current.click()}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                  Carica file
                </button>
                <button style={{ ...s.btn("accent"), opacity: loadRnd ? .6 : 1 }} onClick={fetchRandom} disabled={loadRnd}>
                  {loadRnd
                    ? <><span style={{ width: 14, height: 14, border: "2px solid rgba(79,152,163,.3)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block" }} /> Ricerca…</>
                    : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg> 9 carte random</>
                  }
                </button>
              </div>
              <input ref={inputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
            </div>

            {/* Gallery */}
            {images.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(118px,1fr))", gap: 10 }}>
                {images.map((img, idx) => (
                  <div key={img.id}
                    draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragEnter={() => reorder(idx)}
                    onDragEnd={() => setDragIdx(null)}
                    onDragOver={e => e.preventDefault()}
                    style={{ ...s.card, opacity: dragIdx === idx ? .5 : 1 }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px) scale(1.02)"; e.currentTarget.style.boxShadow = "var(--sh-md)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "var(--sh-sm)"; }}
                  >
                    <img src={img.url} alt={img.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {/* Overlay */}
                    <div className="card-ov" style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,rgba(0,0,0,.75) 0%,transparent 45%,transparent 55%,rgba(0,0,0,.65) 100%)", opacity: 0, transition: "opacity var(--tr)", display: "flex", justifyContent: "flex-end", alignItems: "flex-start", padding: 6, gap: 4 }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 1}
                      onMouseLeave={e => e.currentTarget.style.opacity = 0}
                    >
                      <button onClick={e => { e.stopPropagation(); dup(idx); }} style={{ width: 26, height: 26, borderRadius: 5, background: "rgba(255,255,255,.15)", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,.2)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, cursor: "pointer" }} title="Duplica">⧉</button>
                      <button onClick={e => { e.stopPropagation(); remove(idx); }} style={{ width: 26, height: 26, borderRadius: 5, background: "rgba(248,113,113,.3)", backdropFilter: "blur(4px)", border: "1px solid rgba(248,113,113,.4)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, cursor: "pointer" }} title="Rimuovi">✕</button>
                    </div>
                    <span style={{ position: "absolute", bottom: 5, left: 5, background: "rgba(0,0,0,.78)", color: "var(--primary)", fontSize: ".68rem", fontWeight: 700, padding: "2px 5px", borderRadius: 999 }}>{idx + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══ TAB TOKEN ═══ */}
        {tab === "token" && <TokenPreviewSinglePtFrame />}
      </main>

      {/* ── MODAL STAMPA ── */}
      {printOpen && (
        <div onClick={closePrint} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.82)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", width: "100%", maxWidth: 650, maxHeight: "92vh", overflowY: "auto", boxShadow: "var(--sh-lg)" }}>
            {/* head */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--divider)" }}>
              <span style={{ fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 9 }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Opzioni di Stampa
              </span>
              <button onClick={() => setPrintOpen(false)} style={{ width: 34, height: 34, borderRadius: "var(--r-md)", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>✕</button>
            </div>
            {/* body */}
            <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* A4 preview */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "start" }}>
                <div style={{ aspectRatio: "210/297", background: "white", borderRadius: "var(--r-md)", border: "1px solid var(--border)", maxHeight: 280, display: "grid", gridTemplateColumns: `repeat(${printCols},1fr)`, gridTemplateRows: `repeat(${printRows},1fr)`, gap: 3, padding: 6, boxShadow: "var(--sh-md)" }}>
                  {Array.from({ length: perPage }).map((_, i) => (
                    <div key={i} style={{ background: "#e0e0e0", borderRadius: 2, overflow: "hidden" }}>
                      {images[i] && <img src={images[i].url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[["Carte totali", images.length], ["Per pagina", perPage], ["Pagine A4", pages]].map(([l, v]) => (
                    <div key={l} style={{ padding: "10px 13px", background: "var(--surf-off)", borderRadius: "var(--r-lg)", minWidth: 105 }}>
                      <div style={{ fontSize: ".68rem", color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 600 }}>{l}</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--primary)" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* options */}
              <div style={{ background: "var(--surf-off)", borderRadius: "var(--r-lg)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <h3 style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>⚙ Layout PDF</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  {[["Colonne", printCols, setPrintCols, 1, 4], ["Righe", printRows, setPrintRows, 1, 4], ["Gap (mm)", printGap, setPrintGap, 0, 10]].map(([l, v, set, min, max]) => (
                    <div key={l} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <label style={{ fontSize: ".73rem", color: "var(--muted)", fontWeight: 600 }}>{l}</label>
                      <div style={{ display: "flex", alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
                        <button onClick={() => set(x => Math.max(min, x - 1))} style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "1.1rem", fontWeight: 600, cursor: "pointer", border: "none", background: "none" }}>−</button>
                        <span style={{ flex: 1, textAlign: "center", fontSize: ".88rem", fontWeight: 700, color: "var(--text)" }}>{v}</span>
                        <button onClick={() => set(x => Math.min(max, x + 1))} style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "1.1rem", fontWeight: 600, cursor: "pointer", border: "none", background: "none" }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: ".83rem", color: "var(--muted)", fontWeight: 500, cursor: "pointer" }}>
                  <input type="checkbox" checked={cutMarks} onChange={e => setCutMarks(e.target.checked)} style={{ width: 15, height: 15, accentColor: "var(--primary)" }} />
                  Segni di taglio
                </label>
              </div>
            </div>
            {/* foot */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 9, padding: "16px 22px", borderTop: "1px solid var(--divider)" }}>
              <button style={s.btn("ghost")} onClick={() => window.print()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Stampa diretta
              </button>
              <button style={{ ...s.btn("primary"), opacity: isGen ? .7 : 1 }} onClick={genPDF} disabled={isGen}>
                {isGen
                  ? <><span style={{ width: 14, height: 14, border: "2px solid rgba(0,0,0,.3)", borderTopColor: "#0f0e0c", borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block" }} /> Generazione…</>
                  : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Scarica PDF</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DIALOG ── */}
      {confirmOpen && (
        <div onClick={() => setConfirmOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.82)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "32px 28px", maxWidth: 380, width: "100%", textAlign: "center", boxShadow: "var(--sh-lg)" }}>
            <div style={{ color: "var(--warn)", display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: 8 }}>Rimuovere tutte le carte?</h3>
            <p style={{ fontSize: ".85rem", color: "var(--muted)", marginBottom: 22 }}>Questa azione non può essere annullata.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button style={s.btn("ghost")} onClick={() => setConfirmOpen(false)}>Annulla</button>
              <button style={{ ...s.btn("primary"), background: "#991b1b", color: "white" }} onClick={clearAll}>Rimuovi tutte</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SNACK ── */}
      <div style={{
        position: "fixed", bottom: 22, left: "50%",
        transform: `translateX(-50%) translateY(${snack.show ? 0 : 80}px)`,
        zIndex: 500, padding: "9px 20px", borderRadius: 999,
        fontSize: ".82rem", fontWeight: 600, boxShadow: "var(--sh-lg)",
        whiteSpace: "nowrap", pointerEvents: "none",
        opacity: snack.show ? 1 : 0, transition: "transform .25s cubic-bezier(.16,1,.3,1),opacity .25s",
        background: snack.type === "s" ? "#14532d" : snack.type === "w" ? "#431407" : snack.type === "e" ? "#7f1d1d" : "var(--surface2)",
        color: snack.type === "s" ? "#86efac" : snack.type === "w" ? "#fdba74" : snack.type === "e" ? "#fca5a5" : "var(--text)",
        border: `1px solid ${snack.type === "s" ? "#16a34a" : snack.type === "w" ? "#ea580c" : snack.type === "e" ? "#dc2626" : "var(--border)"}`,
      }}>
        {snack.msg}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .card-ov:hover{opacity:1!important}`}</style>
    </div>
  );

  function closePrint() { setPrintOpen(false); }
}
