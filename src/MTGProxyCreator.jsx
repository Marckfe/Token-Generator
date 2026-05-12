import React, { useState, useRef, useCallback } from "react";
import TokenPreviewSinglePtFrame from "./TokenPreviewSinglePtFrame";
import { PDFDocument, rgb } from "pdf-lib";

// ── COSTANTI ──────────────────────────────────────────────────────────────────
const CARD_WIDTH_MM = 63, CARD_HEIGHT_MM = 88;
const BLEED_MM = 3; // bleed tipografico
const mmToPt = mm => (mm / 25.4) * 72;
const CARD_W = mmToPt(CARD_WIDTH_MM);
const CARD_H = mmToPt(CARD_HEIGHT_MM);
const PAGE_W = 595.28, PAGE_H = 841.89; // A4 in pt

// ── UTILITY: dataURL → ArrayBuffer ────────────────────────────────────────────
function dataURLtoBuffer(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ── UTILITY: carica immagine su canvas e ritorna PNG dataURL ──────────────────
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
        try { res(c.toDataURL("image/png")); } catch { rej(new Error("CORS: impossibile leggere " + url)); }
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

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

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
  const [printGap, setPrintGap] = useState(2);
  const [cutMarks, setCutMarks] = useState(true);
  const [bleedPDF, setBleedPDF] = useState(false);
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
      toast(`${results.length} carte aggiunte!`);
    } catch (e) { toast("Errore Scryfall: " + e.message, "e"); }
    finally { setLoadRnd(false); }
  };

  const genPDF = async () => {
    if (!images.length) { toast("Nessuna carta", "w"); return; }
    setIsGen(true);
    try {
      const perPage  = printCols * printRows;
      const gapPt    = mmToPt(printGap);
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
            let dataUrl;
            if (item.dataUrl) dataUrl = item.dataUrl;
            else if (item.file) dataUrl = await fileToDataURL(item.file);
            else if (item.url) dataUrl = await imgToDataURL(item.url);
            else throw new Error("Nessuna sorgente immagine");
            const buf = dataURLtoBuffer(dataUrl);
            let pimg;
            if (dataUrl.startsWith("data:image/jpeg")) pimg = await doc.embedJpg(buf);
            else pimg = await doc.embedPng(buf);
            const col = i % printCols;
            const row = Math.floor(i / printCols);
            const x   = sx + col * (cardW + gapPt);
            const y   = sy + (printRows - 1 - row) * (cardH + gapPt);
            page.drawImage(pimg, { x, y, width: cardW, height: cardH });
            if (cutMarks) {
              const mk = mmToPt(4), g2 = mmToPt(1);
              const c  = rgb(0.5, 0.5, 0.5), t = 0.4;
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

  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 700);
  React.useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", fn); return () => window.removeEventListener("resize", fn);
  }, []);

  const s = {
    shell: { display:"flex", flexDirection:"column", minHeight:"100vh" },
    sidebar: { display:"flex", flexDirection:"column", background:"var(--surface)", borderRight:"1px solid var(--border)", padding:"20px 12px", position:"sticky", top:0, height:"100vh", overflowY:"auto", width:220, flexShrink:0 },
    main: { display:"flex", flexDirection:"column", padding: isMobile ? "14px 12px" : "28px 32px", gap:"20px", overflowX:"hidden", flex:1, minWidth:0 },
    navBtn: (active) => ({ display:"flex", alignItems:"center", gap:10, padding:"10px 13px", borderRadius:"var(--r-lg)", color: active?"var(--primary)":"var(--muted)", background: active?"var(--primary-hl)":"transparent", fontSize:".85rem", fontWeight: active?700:500, cursor:"pointer", border:"none", width:"100%", textAlign:"left", transition:"all var(--tr)" }),
    btn: (v) => ({ display:"inline-flex", alignItems:"center", gap:7, padding:"8px 16px", borderRadius:"var(--r-lg)", fontSize:".83rem", fontWeight:600, cursor:"pointer", border:"none", transition:"all var(--tr)", whiteSpace:"nowrap", background: v==="primary"?"var(--primary)":v==="accent"?"rgba(79,152,163,.15)":"transparent", color: v==="primary"?"#0f0e0c":v==="accent"?"var(--accent)":"var(--muted)", ...(v==="ghost"?{border:"1px solid var(--border)"}:{}), ...(v==="accent"?{border:"1px solid rgba(79,152,163,.35)"}:{}) }),
    card: { position:"relative", aspectRatio:"63/88", borderRadius:"var(--r-md)", overflow:"hidden", background:"var(--surf-off)", boxShadow:"var(--sh-sm)", cursor:"grab", transition:"transform var(--tr),box-shadow var(--tr)" },
  };

  return <div />;
}
