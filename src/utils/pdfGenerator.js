import { PDFDocument, rgb } from "pdf-lib";
import { dataURLtoBuffer, fileToDataURL, imgToDataURL } from "./imageHelpers";

export const CARD_WIDTH_MM = 63;
export const CARD_HEIGHT_MM = 88;
export const BLEED_MM = 3;
export const mmToPt = mm => (mm / 25.4) * 72;

export const CARD_W = mmToPt(CARD_WIDTH_MM);
export const CARD_H = mmToPt(CARD_HEIGHT_MM);
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;

export async function generatePDF({ images, printCols, printRows, printGap, cutMarks, bleedPDF, onProgress }) {
  const perPage = printCols * printRows;
  const gapPt = mmToPt(printGap);
  const bleedPt = bleedPDF ? mmToPt(BLEED_MM) : 0;
  const cardW = CARD_W + bleedPt * 2;
  const cardH = CARD_H + bleedPt * 2;
  
  const doc = await PDFDocument.create();
  
  for (let start = 0; start < images.length; start += perPage) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(1, 1, 1) });
    
    const batch = images.slice(start, start + perPage);
    const gW = printCols * cardW + (printCols - 1) * gapPt;
    const gH = printRows * cardH + (printRows - 1) * gapPt;
    const sx = (PAGE_W - gW) / 2;
    const sy = (PAGE_H - gH) / 2;
    
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
        
        // Robust image embedding with type check
        if (dataUrl.startsWith("data:image/jpeg")) {
          pimg = await doc.embedJpg(buf);
        } else if (dataUrl.startsWith("data:image/png")) {
          pimg = await doc.embedPng(buf);
        } else {
          // Handle WebP or other formats by converting to JPEG via canvas
          // This is essential as pdf-lib does not support WebP directly
          try {
            const img = new Image();
            img.src = dataUrl;
            await new Promise((res, rej) => { 
              img.onload = res; 
              img.onerror = () => rej(new Error("Errore caricamento immagine per conversione")); 
            });
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const convertedDataUrl = canvas.toDataURL("image/jpeg", 0.9);
            const convertedBuf = dataURLtoBuffer(convertedDataUrl);
            pimg = await doc.embedJpg(convertedBuf);
          } catch (err) {
            throw new Error(`Conversione immagine fallita: ${err.message}`);
          }
        }
        
        const col = i % printCols;
        const row = Math.floor(i / printCols);
        const x = sx + col * (cardW + gapPt);
        const y = sy + (printRows - 1 - row) * (cardH + gapPt);
        
        page.drawImage(pimg, { x, y, width: cardW, height: cardH });
        
        if (cutMarks) {
          const mk = mmToPt(4), g2 = mmToPt(1);
          const c = rgb(0.5, 0.5, 0.5), t = 0.4;
          const cx0 = x + bleedPt, cy0 = y + bleedPt;
          const cx1 = x + cardW - bleedPt, cy1 = y + cardH - bleedPt;
          
          [[cx0, cy0], [cx1, cy0], [cx0, cy1], [cx1, cy1]].forEach(([px, py]) => {
            const signX = px === cx0 ? -1 : 1;
            const signY = py === cy0 ? -1 : 1;
            page.drawLine({ start: { x: px - (signX * (g2 + mk)), y: py }, end: { x: px - signX * g2, y: py }, color: c, thickness: t });
            page.drawLine({ start: { x: px + signX * g2, y: py }, end: { x: px + signX * (g2 + mk), y: py }, color: c, thickness: t });
            page.drawLine({ start: { x: px, y: py - (signY * (g2 + mk)) }, end: { x: px, y: py - signY * g2 }, color: c, thickness: t });
            page.drawLine({ start: { x: px, y: py + signY * g2 }, end: { x: px, y: py + signY * (g2 + mk) }, color: c, thickness: t });
          });
        }
      } catch (e) {
        console.warn(`Carta ${i} saltata:`, e.message);
        const col = i % printCols, row = Math.floor(i / printCols);
        const x = sx + col * (cardW + gapPt), y = sy + (printRows - 1 - row) * (cardH + gapPt);
        page.drawRectangle({ x, y, width: cardW, height: cardH, color: rgb(0.9, 0.9, 0.9) });
        page.drawText("Errore caricamento", { x: x + 10, y: y + cardH / 2, size: 8, color: rgb(0.5, 0.5, 0.5) });
      }
      if (onProgress) onProgress(start + i + 1, images.length);
    }
  }
  
  const bytes = await doc.save();
  return bytes;
}
