import React, { useState, useRef, useCallback } from "react";
import TokenPreviewSinglePtFrame from "./TokenPreviewSinglePtFrame";
import { PDFDocument, rgb } from "pdf-lib";

// ── COSTANTI ──────────────────────────────────────────────────────────────────
const CARD_WIDTH_MM = 63, CARD_HEIGHT_MM = 88;
const BLEED_MM = 3;
const mmToPt = mm => (mm / 25.4) * 72;
const CARD_W = mmToPt(CARD_WIDTH_MM);
const CARD_H = mmToPt(CARD_HEIGHT_MM);
const PAGE_W = 595.28, PAGE_H = 841.89;

// ── UTILITY ───────────────────────────────────────────────────────────────────
function dataURLtoBuffer(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
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
      const img2 = new Image();
      img2.onload = () => {
        const c = document.createElement("canvas");
        c.width = img2.naturalWidth; c.height = img2.naturalHeight;
        c.getContext("2d").drawImage(img2, 0, 0);
        try { res(c.toDataURL("image/png")); } catch { rej(new Error("CORS: " + url)); }
      };
      img2.onerror = rej;
      img2.src = url;
    };
    img.src = url;
  });
}
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
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// ── SCRYFALL SEARCH PANEL ─────────────────────────────────────────────────────
function ScryfallSearchPanel({ onAddCards }) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [selected, setSelected] = useState({}); // cardId → qty

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(""); setResults([]); setSelected({});
    try {
      const r = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`
      );
      const json = await r.json();
      if (json.object === "error") setError("Nessun risultato: " + (json.details || query));
      else setResults(json.data.slice(0, 18));
    } catch { setError("Errore di rete."); }
    setLoading(false);
  };

  const toggleSelect = (card) => {
    setSelected(prev => {
      if (prev[card.id]) {
        const n = { ...prev }; delete n[card.id]; return n;
      }
      return { ...prev, [card.id]: 1 };
    });
  };

  const setQty = (id, qty) =>
    setSelected(prev => ({ ...prev, [id]: Math.max(1, Math.min(20, Number(qty))) }));

  const addSelected = async () => {
    const cards = results.filter(c => selected[c.id]);
    if (!cards.length) return;
    const items = [];
    for (const card of cards) {
      const qty = selected[card.id] || 1;
      const imgUrl = card.image_uris?.normal
        || card.image_uris?.large
        || card.card_faces?.[0]?.image_uris?.normal;
      if (!imgUrl) continue;
      try {
        const blob = await fetch(imgUrl).then(r => r.blob());
        const localUrl = URL.createObjectURL(blob);
        const file = new File([blob], `${card.name}.jpg`, { type: blob.type });
        for (let i = 0; i < qty; i++) {
          items.push({
            id: card.id + "_" + i + "_" + Math.random(),
            name: card.name,
            url: localUrl,
            file,
            srcType: "scryfall",
            set: card.set_name,
            thumb: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small,
          });
        }
      } catch {
        for (let i = 0; i < qty; i++) {
          items.push({
            id: card.id + "_" + i + "_" + Math.random(),
            name: card.name, url: imgUrl, srcType: "scryfall",
            thumb: card.image_uris?.small,
          });
        }
      }
    }
    onAddCards(items);
    setSelected({});
  };

  const selectedCount = Object.values(selected).reduce((a, b) => a + b, 0);
  const G = "#4f98a3", BD = "#393836", SURFACE = "#252420";

  return (
    <div style={{ background: "#201f1d", border: `1px solid ${BD}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <span style={{ fontWeight: 700, color: G, fontSize: 14 }}>Cerca carte su Scryfall</span>
      </div>

      {/* Search bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          placeholder="Es. Lightning Bolt, t:creature c:red …"
          style={{ flex: 1, background: SURFACE, color: "#cdccca", border: `1px solid ${BD}`,
            borderRadius: 6, padding: "7px 10px", fontSize: 13, outline: "none" }}
        />
        <button onClick={search} disabled={loading || !query.trim()}
          style={{ padding: "7px 16px", borderRadius: 6, background: G, color: "#000",
            border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
            opacity: loading || !query.trim() ? 0.5 : 1 }}>
          {loading ? "…" : "Cerca"}
        </button>
      </div>

      {/* Error */}
      {error && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>{error}</div>}

      {/* Risultati */}
      {results.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "#797876", marginBottom: 8 }}>
            {results.length} risultati — clicca per selezionare, imposta la quantità
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8, marginBottom: 12, maxHeight: 320, overflowY: "auto" }}>
            {results.map(card => {
              const isOn = !!selected[card.id];
              const thumb = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small;
              return (
                <div key={card.id}
                  onClick={() => toggleSelect(card)}
                  style={{ position: "relative", borderRadius: 6, overflow: "visible", cursor: "pointer",
                    border: `2px solid ${isOn ? G : BD}`,
                    boxShadow: isOn ? `0 0 0 2px ${G}44` : "none",
                    background: "#1a1917", transition: "border-color .15s" }}>
                  <img src={thumb} alt={card.name}
                    style={{ width: "100%", display: "block", borderRadius: 4 }} />
                  <div style={{ fontSize: 9, color: "#797876", padding: "3px 4px",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {card.name}
                  </div>
                  {isOn && (
                    <div style={{ position: "absolute", top: 4, right: 4, zIndex: 10 }}
                      onClick={e => e.stopPropagation()}>
                      <input
                        type="number" min={1} max={20} value={selected[card.id]}
                        onChange={e => setQty(card.id, e.target.value)}
                        style={{ width: 38, background: "#000", color: G, border: `1px solid ${G}`,
                          borderRadius: 4, padding: "2px 4px", fontSize: 12, fontWeight: 700,
                          textAlign: "center", outline: "none" }}
                      />
                    </div>
                  )}
                  {isOn && (
                    <div style={{ position: "absolute", top: 4, left: 4,
                      background: G, borderRadius: "50%", width: 18, height: 18,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, color: "#000", fontWeight: 800, pointerEvents: "none" }}>✓</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add button */}
          <button onClick={addSelected} disabled={!selectedCount}
            style={{ width: "100%", padding: "9px", borderRadius: 7,
              background: selectedCount ? G : "#333", color: selectedCount ? "#000" : "#555",
              border: "none", fontWeight: 700, fontSize: 13, cursor: selectedCount ? "pointer" : "not-allowed",
              transition: "background .2s" }}>
            {selectedCount
              ? `➕ Aggiungi ${selectedCount} cop${selectedCount === 1 ? "ia" : "ie"} alla coda di stampa`
              : "Seleziona almeno una carta"}
          </button>
        </>
      )}
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function MTGProxyCreator() {
  const [tab, setTab]           = useState("proxy");
  const [images, setImages]     = useState([]);
  const [dragIdx, setDragIdx]   = useState(null);
  const [isDrop, setIsDrop]     = useState(false);
  const [isGen, setIsGen]       = useState(false);
  const [loadRnd, setLoadRnd]   = useState(false);
  const [printOpen, setPrintOpen]   = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [snack, setSnack]       = useState({ show: false, msg: "", type: "s" });
  const [printCols, setPrintCols] = useState(3);
  const [printRows, setPrintRows] = useState(3);
  const [printGap, setPrintGap] = useState(2);
  const [cutMarks, setCutMarks] = useState(true);
  const [bleedPDF, setBleedPDF] = useState(false);
  const [showScryfall, setShowScryfall] = useState(false);
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

  const fetchRandom = async () => {
    setLoadRnd(true);
    try {
      const results = [];
      for (let i = 0; i < 9; i++) {
        const d = await fetch("https://api.scryfall.com/cards/random").then(r => r.json());
        const imgUrl = d.image_uris?.normal || d.image_uris?.large || d.card_faces?.[0]?.image_uris?.normal;
        if (!imgUrl) continue;
        try {
          const blob = await fetch(imgUrl).then(r => r.blob());
          const localUrl = URL.createObjectURL(blob);
          const file = new File([blob], `${d.name}.jpg`, { type: blob.type });
          results.push({ id: d.id + "_" + Math.random(), name: d.name, url: localUrl, file, srcType: "scryfall" });
        } catch {
          results.push({ id: d.id + "_" + Math.random(), name: d.name, url: imgUrl, srcType: "scryfall" });
        }
      }
      setImages(prev => [...prev, ...results]);
      toast(`${results.length} carte casuali aggiunte!`);
    } catch (e) { toast("Errore Scryfall: " + e.message, "e"); }
    finally { setLoadRnd(false); }
  };

  // ── GENERA PDF ───────────────────────────────────────────────────────────────
  const genPDF = async () => {
    if (!images.length) { toast("Nessuna carta", "w"); return; }
    setIsGen(true);
    try {
      const perPage = printCols * printRows;
      const gapPt   = mmToPt(printGap);
      const bleedPt = bleedPDF ? mmToPt(BLEED_MM) : 0;
      const cardW   = CARD_W + bleedPt * 2;
      const cardH   = CARD_H + bleedPt * 2;
      const doc     = await PDFDocument.create();
      for (let start = 0; start < images.length; start += perPage) {
        const page  = doc.addPage([PAGE_W, PAGE_H]);
        page.drawRectangle({ x:0, y:0, width:PAGE_W, height:PAGE_H, color:rgb(1,1,1) });
        const batch = images.slice(start, start + perPage);
        const gW    = printCols * cardW + (printCols - 1) * gapPt;
        const gH    = printRows * cardH + (printRows - 1) * gapPt;
        const sx    = (PAGE_W - gW) / 2;
        const sy    = (PAGE_H - gH) / 2;
        for (let i = 0; i < batch.length; i++) {
          const item = batch[i];
          try {
            let dataUrl;
            if      (item.dataUrl) dataUrl = item.dataUrl;
            else if (item.file)    dataUrl = await fileToDataURL(item.file);
            else if (item.url)     dataUrl = await imgToDataURL(item.url);
            else throw new Error("Nessuna sorgente immagine");
            const buf  = dataURLtoBuffer(dataUrl);
            let pimg;
            if (dataUrl.startsWith("data:image/jpeg")) pimg = await doc.embedJpg(buf);
            else                                        pimg = await doc.embedPng(buf);
            const col  = i % printCols;
            const row  = Math.floor(i / printCols);
            const x    = sx + col * (cardW + gapPt);
            const y    = sy + (printRows - 1 - row) * (cardH + gapPt);
            page.drawImage(pimg, { x, y, width: cardW, height: cardH });
            if (cutMarks) {
              const mk = mmToPt(4), g2 = mmToPt(1);
              const c  = rgb(0.5, 0.5, 0.5), t = 0.4;
              const cx0 = x + bleedPt, cy0 = y + bleedPt;
              const cx1 = x + cardW - bleedPt, cy1 = y + cardH - bleedPt;
              [[cx0,cy0],[cx1,cy0],[cx0,cy1],[cx1,cy1]].forEach(([px,py]) => {
                const signX = px === cx0 ? -1 : 1;
                const signY = py === cy0 ? -1 : 1;
                page.drawLine({ start:{x:px-(signX*(g2+mk)), y:py}, end:{x:px-signX*g2, y:py}, color:c, thickness:t });
                page.drawLine({ start:{x:px+signX*g2, y:py}, end:{x:px+signX*(g2+mk), y:py}, color:c, thickness:t });
                page.drawLine({ start:{x:px, y:py-(signY*(g2+mk))}, end:{x:px, y:py-signY*g2}, color:c, thickness:t });
                page.drawLine({ start:{x:px, y:py+signY*g2}, end:{x:px, y:py+signY*(g2+mk)}, color:c, thickness:t });
              });
            }
          } catch (e) {
            console.warn(`Carta ${i} saltata:`, e.message);
            const col = i % printCols, row = Math.floor(i / printCols);
            const x = sx + col*(cardW+gapPt), y = sy + (printRows-1-row)*(cardH+gapPt);
            page.drawRectangle({ x, y, width:cardW, height:cardH, color:rgb(0.9,0.9,0.9) });
            page.drawText("Errore caricamento", { x:x+10, y:y+cardH/2, size:8, color:rgb(0.5,0.5,0.5) });
          }
        }
      }
      const bytes = await doc.save();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes], { type:"application/pdf" }));
      a.download = "mtg-proxy-stampa.pdf";
      a.click();
      toast("✅ PDF scaricato!");
    } catch (e) {
      console.error(e); toast("Errore PDF: " + e.message, "e");
    } finally { setIsGen(false); }
  };

  const perPage = printCols * printRows;
  const pages   = Math.max(1, Math.ceil(images.length / perPage));
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 700);
  React.useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  const G = "#4f98a3", BD = "#393836";

  const s = {
    shell: { display:"flex", flexDirection:"column", minHeight:"100vh" },
    sidebar: { display:"flex", flexDirection:"column", background:"var(--surface)",
      borderRight:"1px solid var(--border)", padding:"20px 12px",
      position:"sticky", top:0, height:"100vh", overflowY:"auto", width:220, flexShrink:0 },
    main: { display:"flex", flexDirection:"column",
      padding: isMobile ? "14px 12px" : "28px 32px",
      gap:"20px", overflowX:"hidden", flex:1, minWidth:0 },
    navBtn: (active) => ({
      display:"flex", alignItems:"center", gap:10, padding:"10px 13px",
      borderRadius:"var(--r-lg)", color: active?"var(--primary)":"var(--muted)",
      background: active?"var(--primary-hl)":"transparent",
      fontSize:".85rem", fontWeight: active?700:500, cursor:"pointer",
      border:"none", width:"100%", textAlign:"left", transition:"all var(--tr)"
    }),
    btn: (v) => ({
      display:"inline-flex", alignItems:"center", gap:7, padding:"8px 16px",
      borderRadius:"var(--r-lg)", fontSize:".83rem", fontWeight:600, cursor:"pointer",
      border:"none", transition:"all var(--tr)", whiteSpace:"nowrap",
      background: v==="primary"?"var(--primary)":v==="accent"?"rgba(79,152,163,.15)":"transparent",
      color: v==="primary"?"#0f0e0c":v==="accent"?"var(--accent)":"var(--muted)",
      ...(v==="ghost"?{border:"1px solid var(--border)"}:{}),
      ...(v==="accent"?{border:"1px solid rgba(79,152,163,.35)"}:{})
    }),
    card: { position:"relative", aspectRatio:"63/88", borderRadius:"var(--r-md)",
      overflow:"hidden", background:"var(--surf-off)", boxShadow:"var(--sh-sm)",
      cursor:"grab", transition:"transform var(--tr),box-shadow var(--tr)" },
  };

  return (
    <div style={s.shell}>
      {/* SIDEBAR desktop */}
      {!isMobile && (
        <div style={{ display:"flex", flex:1 }}>
          <aside style={s.sidebar}>
            <div style={{ fontWeight:800, fontSize:"1rem", color:"var(--accent)", marginBottom:24, letterSpacing:".04em" }}>
              🃏 MTG Tools
            </div>
            {[
              { id:"proxy",   icon:"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", label:"Proxy Stampa" },
              { id:"token",   icon:"M12 5v14M5 12h14", label:"Token Creator" },
              { id:"import",  icon:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3", label:"Importa" },
            ].map(n => (
              <button key={n.id} style={s.navBtn(tab===n.id)} onClick={() => setTab(n.id)}>
                <Icon d={n.icon} size={16} />
                {n.label}
              </button>
            ))}
          </aside>
          <main style={s.main}>
            {tab === "proxy"  && <ProxyTab {...{ images, setImages, dragIdx, setDragIdx, isDrop, setIsDrop, isGen, loadRnd, printOpen, setPrintOpen, confirmOpen, setConfirmOpen, snack, printCols, setPrintCols, printRows, setPrintRows, printGap, setPrintGap, cutMarks, setCutMarks, bleedPDF, setBleedPDF, showScryfall, setShowScryfall, inputRef, toast, handleFiles, onDrop, reorder, remove, dup, clearAll, fetchRandom, genPDF, perPage, pages, s, isMobile }} />}
            {tab === "token"  && <TokenPreviewSinglePtFrame />}
          </main>
        </div>
      )}

      {/* MOBILE */}
      {isMobile && (
        <div style={{ display:"flex", flexDirection:"column", flex:1 }}>
          <div style={{ display:"flex", background:"var(--surface)", borderBottom:"1px solid var(--border)" }}>
            {[{id:"proxy",label:"🖨 Stampa"},{id:"token",label:"🃏 Token"}].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ flex:1, padding:"12px 4px", border:"none", cursor:"pointer",
                  background: tab===t.id ? "var(--primary-hl)" : "transparent",
                  color: tab===t.id ? G : "var(--muted)",
                  fontWeight: tab===t.id ? 700 : 500, fontSize:13,
                  borderBottom: tab===t.id ? `2px solid ${G}` : "2px solid transparent" }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ flex:1, overflow:"auto", padding:"14px 12px" }}>
            {tab === "proxy" && <ProxyTab {...{ images, setImages, dragIdx, setDragIdx, isDrop, setIsDrop, isGen, loadRnd, printOpen, setPrintOpen, confirmOpen, setConfirmOpen, snack, printCols, setPrintCols, printRows, setPrintRows, printGap, setPrintGap, cutMarks, setCutMarks, bleedPDF, setBleedPDF, showScryfall, setShowScryfall, inputRef, toast, handleFiles, onDrop, reorder, remove, dup, clearAll, fetchRandom, genPDF, perPage, pages, s, isMobile }} />}
            {tab === "token" && <TokenPreviewSinglePtFrame />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PROXY TAB ─────────────────────────────────────────────────────────────────
function ProxyTab({ images, setImages, dragIdx, setDragIdx, isDrop, setIsDrop, isGen, loadRnd,
  printOpen, setPrintOpen, confirmOpen, setConfirmOpen, snack,
  printCols, setPrintCols, printRows, setPrintRows, printGap, setPrintGap,
  cutMarks, setCutMarks, bleedPDF, setBleedPDF,
  showScryfall, setShowScryfall,
  inputRef, toast, handleFiles, onDrop, reorder, remove, dup, clearAll,
  fetchRandom, genPDF, perPage, pages, s, isMobile }) {

  const G = "#4f98a3", BD = "#393836";

  return (
    <>
      {/* Header */}
      <div style={{ display:"flex", flexWrap:"wrap", alignItems:"flex-start", gap:12, justifyContent:"space-between" }}>
        <div>
          <h1 style={{ fontSize:"1.35rem", fontWeight:800, color:"var(--text)", margin:0 }}>
            Proxy Card Printer
          </h1>
          <p style={{ color:"var(--muted)", marginTop:4, fontSize:".85rem" }}>
            Carica le tue carte e genera un PDF pronto per la stampa
          </p>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {images.length > 0 && (
            <button style={{...s.btn("ghost"), color:"#f87171"}}
              onClick={() => setConfirmOpen(true)}>
              <Icon d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" size={15}/>
              Svuota
            </button>
          )}
          <button style={s.btn("ghost")} disabled={loadRnd} onClick={fetchRandom}>
            {loadRnd
              ? <span style={{ fontSize:12 }}>Carico…</span>
              : <><Icon d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" size={15}/>9 casuali</>}
          </button>
          {images.length > 0 && (
            <button style={s.btn("primary")} disabled={isGen} onClick={genPDF}>
              {isGen
                ? <><span style={{fontSize:12}}>Generando…</span></>
                : <><Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" size={15}/> Genera PDF</>}
            </button>
          )}
        </div>
      </div>

      {/* ── SCRYFALL SEARCH ─────────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => setShowScryfall(v => !v)}
          style={{ display:"flex", alignItems:"center", gap:10, width:"100%",
            background: showScryfall ? "rgba(79,152,163,.12)" : "var(--surface)",
            border: `1px solid ${showScryfall ? G : BD}`,
            borderRadius: 10, padding:"11px 16px", cursor:"pointer",
            color: showScryfall ? G : "var(--muted)", fontWeight:600, fontSize:13,
            transition:"all .2s" }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          🔍 Cerca e aggiungi carte da Scryfall
          <span style={{ marginLeft:"auto", fontSize:11, opacity:.7 }}>
            {showScryfall ? "▲ chiudi" : "▼ apri"}
          </span>
        </button>

        {showScryfall && (
          <div style={{ marginTop:8 }}>
            <ScryfallSearchPanel onAddCards={cards => {
              setImages(prev => [...prev, ...cards]);
              toast(`✅ ${cards.length} cop${cards.length===1?"ia":"ie"} aggiunte alla coda!`);
            }} />
          </div>
        )}
      </div>

      {/* ── DROPZONE ────────────────────────────────────────────────────────── */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDrop(true); }}
        onDragLeave={() => setIsDrop(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{ border:`2px dashed ${isDrop ? G : BD}`,
          borderRadius:12, padding: isMobile ? "24px 16px" : "36px 24px",
          textAlign:"center", cursor:"pointer", transition:"all .2s",
          background: isDrop ? "rgba(79,152,163,.07)" : "var(--surface)" }}>
        <input ref={inputRef} type="file" accept="image/*" multiple style={{ display:"none" }}
          onChange={e => { handleFiles(e.target.files); e.target.value=""; }} />
        <div style={{ fontSize:32, marginBottom:8 }}>🖼️</div>
        <div style={{ fontWeight:600, color:"var(--text)", marginBottom:4 }}>
          Trascina le immagini qui o clicca per caricare
        </div>
        <div style={{ fontSize:".8rem", color:"var(--muted)" }}>
          PNG, JPG, WEBP — carte custom, screenshot, proxy
        </div>
      </div>

      {/* ── CODA DI STAMPA ──────────────────────────────────────────────────── */}
      {images.length > 0 && (
        <div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
            marginBottom:12, flexWrap:"wrap", gap:8 }}>
            <div style={{ fontWeight:700, color:"var(--text)", fontSize:".95rem" }}>
              Coda di stampa
              <span style={{ marginLeft:8, background:"var(--primary-hl)", color:G,
                padding:"2px 10px", borderRadius:20, fontSize:12, fontWeight:700 }}>
                {images.length} carte
              </span>
            </div>
            <button style={s.btn("accent")} onClick={() => setPrintOpen(v => !v)}>
              <Icon d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" size={14}/>
              {printOpen ? "Chiudi impostazioni" : "Impostazioni PDF"}
            </button>
          </div>

          {/* Impostazioni PDF collassabili */}
          {printOpen && (
            <div style={{ background:"var(--surface)", border:`1px solid ${BD}`,
              borderRadius:10, padding:16, marginBottom:16, display:"grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap:14 }}>
              {[
                { label:"Colonne", val:printCols, set:setPrintCols, min:1, max:4 },
                { label:"Righe",   val:printRows, set:setPrintRows, min:1, max:4 },
                { label:"Gap (mm)",val:printGap,  set:setPrintGap,  min:0, max:10 },
              ].map(f => (
                <label key={f.label} style={{ display:"flex", flexDirection:"column", gap:4, fontSize:12, color:"var(--muted)" }}>
                  {f.label}
                  <input type="number" min={f.min} max={f.max} value={f.val}
                    onChange={e => f.set(Number(e.target.value))}
                    style={{ background:"#252420", color:"var(--text)", border:`1px solid ${BD}`,
                      borderRadius:6, padding:"6px 10px", fontSize:13, outline:"none" }} />
                </label>
              ))}
              <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13, color:"var(--text)" }}>
                <input type="checkbox" checked={cutMarks} onChange={e=>setCutMarks(e.target.checked)}
                  style={{ accentColor:G, width:15, height:15 }}/>
                Segni di taglio
              </label>
              <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13, color:"var(--text)" }}>
                <input type="checkbox" checked={bleedPDF} onChange={e=>setBleedPDF(e.target.checked)}
                  style={{ accentColor:G, width:15, height:15 }}/>
                Bleed 3mm
              </label>
              <div style={{ fontSize:12, color:"var(--muted)", alignSelf:"center" }}>
                {printCols}×{printRows} = {perPage} carte/pag · {pages} pag
              </div>
            </div>
          )}

          {/* Griglia carte */}
          <div style={{ display:"grid",
            gridTemplateColumns:`repeat(auto-fill, minmax(${isMobile?80:100}px, 1fr))`,
            gap:10 }}>
            {images.map((img, idx) => (
              <div key={img.id}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={e => { e.preventDefault(); reorder(idx); }}
                onDragEnd={() => setDragIdx(null)}
                style={{ ...s.card,
                  opacity: dragIdx === idx ? 0.5 : 1,
                  transform: dragIdx === idx ? "scale(.96)" : "scale(1)" }}>
                <img src={img.url} alt={img.name}
                  style={{ width:"100%", height:"100%", objectFit:"cover",
                    display:"block", pointerEvents:"none" }} />
                {/* Overlay hover */}
                <div className="card-overlay"
                  style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.65)",
                    display:"flex", flexDirection:"column", alignItems:"center",
                    justifyContent:"center", gap:6, opacity:0, transition:"opacity .18s" }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                  <button title="Duplica" onClick={e=>{e.stopPropagation();dup(idx);}}
                    style={{ background:"rgba(255,255,255,.15)", border:"none", borderRadius:6,
                      color:"#fff", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>
                    ⧉ Duplica
                  </button>
                  <button title="Rimuovi" onClick={e=>{e.stopPropagation();remove(idx);}}
                    style={{ background:"rgba(220,50,50,.7)", border:"none", borderRadius:6,
                      color:"#fff", padding:"5px 10px", cursor:"pointer", fontSize:11 }}>
                    ✕ Rimuovi
                  </button>
                </div>
                {/* Nome carta da Scryfall */}
                {img.srcType === "scryfall" && img.name && (
                  <div style={{ position:"absolute", bottom:0, left:0, right:0,
                    background:"linear-gradient(transparent,rgba(0,0,0,.8))",
                    color:"#fff", fontSize:9, padding:"8px 4px 3px", textAlign:"center",
                    pointerEvents:"none", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {img.name}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer coda */}
          <div style={{ marginTop:16, display:"flex", justifyContent:"flex-end", gap:8, flexWrap:"wrap" }}>
            <button style={s.btn("ghost")} onClick={() => setConfirmOpen(true)}>
              🗑 Svuota tutto
            </button>
            <button style={s.btn("primary")} disabled={isGen} onClick={genPDF}>
              {isGen ? "⏳ Generando PDF…" : `⬇ Genera PDF (${images.length} carte, ${pages} pag)`}
            </button>
          </div>
        </div>
      )}

      {/* Stato vuoto */}
      {images.length === 0 && (
        <div style={{ textAlign:"center", padding:"40px 20px", color:"var(--muted)" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🃏</div>
          <div style={{ fontWeight:600, marginBottom:6 }}>Nessuna carta nella coda</div>
          <div style={{ fontSize:13 }}>
            Usa la ricerca Scryfall, carica immagini locali, o aggiungi 9 carte casuali
          </div>
        </div>
      )}

      {/* Snackbar */}
      {snack.show && (
        <div style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)",
          background: snack.type==="e"?"#7a1e1e":snack.type==="w"?"#5a3e10":"#1e3a2f",
          color:"#fff", padding:"10px 22px", borderRadius:50, fontSize:13, fontWeight:600,
          boxShadow:"0 4px 20px rgba(0,0,0,.4)", zIndex:9999,
          animation:"fadein .2s ease" }}>
          {snack.msg}
        </div>
      )}

      {/* Modal conferma svuota */}
      {confirmOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)",
          display:"flex", alignItems:"center", justifyContent:"center", zIndex:9000 }}
          onClick={() => setConfirmOpen(false)}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:"var(--surface)", border:`1px solid ${BD}`,
              borderRadius:14, padding:28, maxWidth:360, width:"90%", textAlign:"center" }}>
            <div style={{ fontSize:32, marginBottom:10 }}>🗑</div>
            <div style={{ fontWeight:700, fontSize:"1rem", marginBottom:6 }}>Svuota la coda?</div>
            <div style={{ color:"var(--muted)", fontSize:13, marginBottom:20 }}>
              Tutte le {images.length} carte verranno rimosse.
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button style={s.btn("ghost")} onClick={() => setConfirmOpen(false)}>Annulla</button>
              <button onClick={clearAll}
                style={{ ...s.btn("ghost"), background:"#7a1e1e", color:"#fff", border:"none" }}>
                Sì, svuota
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
