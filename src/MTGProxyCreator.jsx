import React, { useState, useRef, useCallback } from "react";
import TokenPreviewSinglePtFrame from "./TokenPreviewSinglePtFrame";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const CARD_WIDTH_MM = 63, CARD_HEIGHT_MM = 88;
const BLEED_MM = 3;
const mmToPt = mm => (mm / 25.4) * 72;
const CARD_W = mmToPt(CARD_WIDTH_MM);
const CARD_H = mmToPt(CARD_HEIGHT_MM);
const PAGE_W = 595.28, PAGE_H = 841.89;
const FORMATS = ["standard", "pioneer", "modern", "legacy", "vintage", "commander", "duel", "pauper", "premodern"];
const MAX_SIDEBOARD = { commander: 0, duel: 0, default: 15 };
const MIN_MAINDECK = { commander: 100, duel: 100, default: 60 };
const BASIC_LANDS = new Set(["plains","island","swamp","mountain","forest","wastes","snow-covered plains","snow-covered island","snow-covered swamp","snow-covered mountain","snow-covered forest"]);
const DUEL_COMMANDER_BANLIST = new Set([
  "Ancestral Recall","Balance","Black Lotus","Channel","Chaos Orb","Demonic Consultation","Demonic Tutor","Dig Through Time","Emrakul, the Aeons Torn","Fastbond","Flash","Frantic Search","Gifts Ungiven","Grindstone","Imperial Seal","Karakas","Library of Alexandria","Lion's Eye Diamond","Lotus Petal","Mana Crypt","Mana Drain","Mana Vault","Memory Jar","Mental Misstep","Mind Twist","Mind's Desire","Mishra's Workshop","Mox Diamond","Mox Emerald","Mox Jet","Mox Pearl","Mox Ruby","Mox Sapphire","Mystical Tutor","Necropotence","Oath of Druids","Sensei's Divining Top","Skullclamp","Sol Ring","Strip Mine","Survival of the Fittest","Time Vault","Time Walk","Timetwister","Tinker","Tolarian Academy","Treasure Cruise","Vampiric Tutor","Wheel of Fortune","Yawgmoth's Bargain"
]);
const PREMODERN_BANLIST = new Set([
  "Amulet of Quoz","Balance","Brainstorm","Bronze Tablet","Channel","Demonic Consultation","Earthcraft","Flash","Force of Will","Goblin Recruiter","Jeweled Bird","Land Tax","Mana Vault","Memory Jar","Mind Twist","Mystical Tutor","Necropotence","Rebirth","Strip Mine","Tempest Efreet","Timmerian Fiends","Tolarian Academy","Vampiric Tutor","Windfall","Worldgorger Dragon","Yawgmoth's Bargain","Parallax Tide"
]);

function dataURLtoBuffer(dataUrl) { const base64 = dataUrl.split(",")[1]; const bin = atob(base64); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); return buf.buffer; }
function imgToDataURL(url) { return new Promise((res, rej) => { const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => { const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d").drawImage(img, 0, 0); res(c.toDataURL("image/png")); }; img.onerror = () => { const img2 = new Image(); img2.onload = () => { const c = document.createElement("canvas"); c.width = img2.naturalWidth; c.height = img2.naturalHeight; c.getContext("2d").drawImage(img2, 0, 0); try { res(c.toDataURL("image/png")); } catch { rej(new Error("CORS: " + url)); } }; img2.onerror = rej; img2.src = url; }; img.src = url; }); }
function fileToDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onloadend = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }

const Icon = ({ d, size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;

async function fetchAllPrints(name) {
  const term = name.trim(); const names = []; const seen = new Set();
  const pushName = n => { if (n && !seen.has(n)) { seen.add(n); names.push(n); } };
  try {
    let url = `https://api.scryfall.com/cards/search?q=name:${encodeURIComponent(term)}&unique=cards&order=released&dir=desc`;
    while (url) {
      const r = await fetch(url); if (!r.ok) break; const j = await r.json(); if (j.object === "error") break;
      (j.data || []).forEach(c => pushName(c.name)); url = j.has_more ? j.next_page : null; if (url) await new Promise(r => setTimeout(r, 80));
    }
  } catch {}
  if (!names.length) {
    try { const nr = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(term)}`); if (nr.ok) { const nj = await nr.json(); if (nj.object !== "error" && nj.name) pushName(nj.name); } } catch {}
  }
  const all = [];
  for (const cardName of names) {
    let url = `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(cardName)}"&unique=prints&order=released&dir=desc`;
    while (url) {
      const r = await fetch(url); if (!r.ok) break; const j = await r.json(); if (j.object === "error") break;
      all.push(...(j.data || [])); url = j.has_more ? j.next_page : null; if (url) await new Promise(r => setTimeout(r, 80));
    }
  }
  return all;
}

function parseDecklist(text) {
  const lines = String(text || "").split("
"); const main = []; const side = []; let isSide = false;
  for (const raw of lines) {
    const t = raw.trim(); if (!t) continue;
    if (/^sideboard:?$/i.test(t)) { isSide = true; continue; }
    let count = 1, name = t;
    let m = t.match(/^(\d+)\s*x?\s+(.+)$/i) || t.match(/^(.+?)\s+x(\d+)$/i);
    if (m) { if (/^\d+/.test(t)) { count = parseInt(m[1], 10); name = m[2]; } else { name = m[1]; count = parseInt(m[2], 10); } }
    name = name.split(" [")[0].trim();
    (isSide ? side : main).push({ name, count });
  }
  return { main, side };
}

async function validateDecklist(text, format) {
  const { main, side } = parseDecklist(text);
  const uniqueNames = [...new Set([...main, ...side].map(c => c.name))];
  const scryMap = {}; const errors = []; const warnings = [];
  try {
    for (let i = 0; i < uniqueNames.length; i += 75) {
      const identifiers = uniqueNames.slice(i, i + 75).map(name => ({ name }));
      const r = await fetch("https://api.scryfall.com/cards/collection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifiers }) });
      const j = await r.json();
      (j.data || []).forEach(c => { scryMap[c.name.toLowerCase()] = c; });
      (j.not_found || []).forEach(nf => errors.push(`Carta non trovata: ${nf.name}`));
      await new Promise(r => setTimeout(r, 80));
    }
  } catch { errors.push("Errore di connessione a Scryfall."); }

  let mainCount = 0, sideCount = 0; const cardCounts = {};
  const customBanlist = format === "duel" ? DUEL_COMMANDER_BANLIST : format === "premodern" ? PREMODERN_BANLIST : null;

  const inspect = (item, isSide) => {
    if (isSide) sideCount += item.count; else mainCount += item.count;
    const c = scryMap[item.name.toLowerCase()] || Object.values(scryMap).find(x => x.name.toLowerCase() === item.name.toLowerCase());
    if (!c) return;
    const nm = c.name; cardCounts[nm] = (cardCounts[nm] || 0) + item.count;
    if (customBanlist && customBanlist.has(nm)) errors.push(`${nm} è bannata in ${format}.`);
    if (!customBanlist && c.legalities && c.legalities[format]) {
      const l = c.legalities[format];
      if (l === "not_legal" || l === "banned") errors.push(`${nm} non è legale in ${format}.`);
      if (l === "restricted" && cardCounts[nm] > 1) errors.push(`${nm} è restricted in ${format}; trovate ${cardCounts[nm]} copie.`);
    }
    const oracle = c.oracle_text || "";
    const anyNumber = oracle.includes("A deck can have any number of cards named");
    if (!["commander", "duel"].includes(format) && !BASIC_LANDS.has(nm.toLowerCase()) && !anyNumber && cardCounts[nm] > 4) errors.push(`${nm}: max 4 copie, trovate ${cardCounts[nm]}.`);
    if (format === "premodern") {
      const d = new Date(c.released_at || "1990-01-01");
      const start = new Date("1995-10-01"); const end = new Date("2003-07-31");
      if (d < start || d > end) warnings.push(`${nm}: controlla la stampa/espansione; Premodern accetta set da 4th Edition/Ice Age a Scourge [page:1].`);
    }
  };
  main.forEach(x => inspect(x, false)); side.forEach(x => inspect(x, true));
  const minMain = MIN_MAINDECK[format] || MIN_MAINDECK.default; const maxSide = MAX_SIDEBOARD[format] ?? MAX_SIDEBOARD.default;
  if (["commander", "duel"].includes(format)) {
    if (mainCount !== 100) errors.push(`Il maindeck deve avere esattamente 100 carte in ${format}; trovate ${mainCount}.`);
  } else if (mainCount < minMain) errors.push(`Il maindeck deve avere almeno ${minMain} carte; trovate ${mainCount}.`);
  if (sideCount > maxSide) errors.push(`La sideboard non può superare ${maxSide} carte; trovate ${sideCount}.`);
  return { main, side, mainCount, sideCount, errors, warnings, isValid: errors.length === 0 };
}

function TournamentSheet({ data, format, player }) {
  const emptyMain = Math.max(0, 30 - (data?.main?.length || 0));
  const emptySide = Math.max(0, 15 - (data?.side?.length || 0));
  return <div className="sheet-container" style={{ background:'#fff', color:'#000', padding:28, fontFamily:"'Times New Roman', serif" }}>
    <div style={{ textAlign:'center', borderBottom:'2px solid #000', paddingBottom:8, marginBottom:18 }}>
      <div style={{ fontSize:26, fontWeight:700 }}>DECK REGISTRATION SHEET</div>
      <div style={{ fontSize:12 }}>PRINT CLEARLY USING ENGLISH CARD NAMES</div>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, marginBottom:16 }}>
      <div style={{ display:'grid', gridTemplateColumns:'90px 1fr', gap:8 }}>
        <b>Date:</b><div style={{ borderBottom:'1px solid #000' }}>{player.date || ''}</div>
        <b>Event:</b><div style={{ borderBottom:'1px solid #000' }}>{player.event || ''}</div>
        <b>Location:</b><div style={{ borderBottom:'1px solid #000' }}>{player.location || ''}</div>
        <b>Format:</b><div style={{ borderBottom:'1px solid #000', textTransform:'uppercase' }}>{format}</div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'90px 1fr', gap:8 }}>
        <b>Last Name:</b><div style={{ borderBottom:'1px solid #000' }}>{player.lastName || ''}</div>
        <b>First Name:</b><div style={{ borderBottom:'1px solid #000' }}>{player.firstName || ''}</div>
        <b>DCI / ID:</b><div style={{ borderBottom:'1px solid #000' }}>{player.dci || ''}</div>
      </div>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:28 }}>
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid #000', marginBottom:8 }}><b>MAIN DECK</b><span>({["commander","duel"].includes(format) ? '100 exactly' : '60 minimum'})</span></div>
        <div style={{ display:'flex', borderBottom:'1px solid #000', fontSize:12, marginBottom:4 }}><span style={{ width:42 }}><b>#</b></span><span><b>Card Name</b></span></div>
        {(data?.main || []).map((c, i) => <div key={i} style={{ display:'flex', borderBottom:'1px solid #ccc', minHeight:22 }}><span style={{ width:42, textAlign:'center' }}>{c.count}</span><span>{c.name}</span></div>)}
        {Array.from({ length: emptyMain }).map((_, i) => <div key={i} style={{ display:'flex', borderBottom:'1px solid #ccc', minHeight:22 }}><span style={{ width:42 }}></span><span></span></div>)}
        <div style={{ marginTop:8, textAlign:'right' }}>Total Cards in Main Deck: <span style={{ display:'inline-block', minWidth:32, borderBottom:'1px solid #000', textAlign:'center' }}>{data?.mainCount || ''}</span></div>
      </div>
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid #000', marginBottom:8 }}><b>SIDEBOARD</b><span>(up to {MAX_SIDEBOARD[format] ?? 15})</span></div>
        <div style={{ display:'flex', borderBottom:'1px solid #000', fontSize:12, marginBottom:4 }}><span style={{ width:42 }}><b>#</b></span><span><b>Card Name</b></span></div>
        {(data?.side || []).map((c, i) => <div key={i} style={{ display:'flex', borderBottom:'1px solid #ccc', minHeight:22 }}><span style={{ width:42, textAlign:'center' }}>{c.count}</span><span>{c.name}</span></div>)}
        {Array.from({ length: emptySide }).map((_, i) => <div key={i} style={{ display:'flex', borderBottom:'1px solid #ccc', minHeight:22 }}><span style={{ width:42 }}></span><span></span></div>)}
        <div style={{ marginTop:8, textAlign:'right' }}>Total Cards in Sideboard: <span style={{ display:'inline-block', minWidth:32, borderBottom:'1px solid #000', textAlign:'center' }}>{data?.sideCount || ''}</span></div>
        <div style={{ marginTop:30, border:'2px solid #000', padding:10 }}>
          <div style={{ textAlign:'center', fontWeight:700, marginBottom:8 }}>FOR OFFICIAL USE ONLY</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:12 }}>
            <div>Deck Check Rd #: _____</div><div>Status: __________</div><div>Judge: __________</div>
          </div>
        </div>
      </div>
    </div>
  </div>;
}

function DeckValidatorPanel() {
  const [decklist, setDecklist] = useState(""); const [format, setFormat] = useState("modern"); const [result, setResult] = useState(null); const [busy, setBusy] = useState(false);
  const [player, setPlayer] = useState({ firstName:'', lastName:'', dci:'', date:'', event:'', location:'' });
  const run = async () => { setBusy(true); setResult(null); const r = await validateDecklist(decklist, format); setResult(r); setBusy(false); };
  const printSheet = () => window.print();
  const exportPdf = async () => {
    if (!result?.isValid) return;
    const pdf = await PDFDocument.create(); const page = pdf.addPage([PAGE_W, PAGE_H]); const font = await pdf.embedFont(StandardFonts.Helvetica); const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const draw = (txt, x, y, size=10, bold=false) => page.drawText(String(txt || ''), { x, y, size, font: bold ? fontBold : font, color: rgb(0,0,0) });
    draw('DECK REGISTRATION SHEET', 180, 804, 18, true); draw('PRINT CLEARLY USING ENGLISH CARD NAMES', 180, 790, 8, false);
    page.drawLine({ start:{x:40,y:786}, end:{x:555,y:786}, thickness:1, color:rgb(0,0,0) });
    let y = 758; draw('Date:', 40, y, 10, true); draw(player.date, 90, y, 10); draw('Last Name:', 320, y, 10, true); draw(player.lastName, 395, y, 10);
    y -= 18; draw('Event:', 40, y, 10, true); draw(player.event, 90, y, 10); draw('First Name:', 320, y, 10, true); draw(player.firstName, 395, y, 10);
    y -= 18; draw('Location:', 40, y, 10, true); draw(player.location, 90, y, 10); draw('DCI / ID:', 320, y, 10, true); draw(player.dci, 395, y, 10);
    y -= 18; draw('Format:', 40, y, 10, true); draw(format.toUpperCase(), 90, y, 10);
    page.drawLine({ start:{x:40,y:680}, end:{x:290,y:680}, thickness:1, color:rgb(0,0,0) });
    page.drawLine({ start:{x:305,y:680}, end:{x:555,y:680}, thickness:1, color:rgb(0,0,0) });
    draw('MAIN DECK', 40, 686, 10, true); draw('SIDEBOARD', 305, 686, 10, true);
    let my = 662; for (const c of result.main) { draw(String(c.count), 42, my, 9); draw(c.name, 70, my, 9); my -= 16; }
    let sy = 662; for (const c of result.side) { draw(String(c.count), 307, sy, 9); draw(c.name, 335, sy, 9); sy -= 16; }
    draw(`Total Cards in Main Deck: ${result.mainCount}`, 120, 150, 10, false); draw(`Total Cards in Sideboard: ${result.sideCount}`, 365, 150, 10, false);
    const bytes = await pdf.save(); const blob = new Blob([bytes], { type:'application/pdf' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `deck-registration-${format}.pdf`; a.click();
  };
  return <div style={{ display:'grid', gridTemplateColumns:'minmax(320px,430px) minmax(0,1fr)', gap:16 }}>
    <div style={{ display:'grid', gap:12 }}>
      <Card title="Deck validator">
        <Field label="Formato"><select value={format} onChange={e => setFormat(e.target.value)} style={inputStyle}>{FORMATS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}</select></Field>
        <Field label="Decklist"><textarea value={decklist} onChange={e => setDecklist(e.target.value)} rows={16} style={{ ...inputStyle, resize:'vertical' }} placeholder={'4 Lightning Bolt
4 Counterspell

Sideboard:
2 Pyroblast'} /></Field>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}><button onClick={run} style={btnPrimary} disabled={busy || !decklist.trim()}>{busy ? 'Validazione…' : 'Valida lista'}</button><button onClick={printSheet} style={btnSecondary} disabled={!result?.isValid}>Stampa</button><button onClick={exportPdf} style={btnSecondary} disabled={!result?.isValid}>PDF</button></div>
        <div style={{ fontSize:12, color:'#b8b5b1' }}>Duel Commander usa banlist dedicata DuelCommander.org; Premodern include Parallax Tide bannata dal 2026 [page:1].</div>
        {result && <div style={{ marginTop:10, padding:12, borderRadius:10, background: result.isValid ? '#17301d' : '#3b1212', border:`1px solid ${result.isValid ? '#2e5c10' : '#7f1d1d'}` }}>
          <div style={{ fontWeight:700, color: result.isValid ? '#b6f1a8' : '#fecaca' }}>{result.isValid ? 'Deck valida' : 'Errori trovati'}</div>
          <div style={{ fontSize:13, marginTop:4 }}>Main: {result.mainCount} · Side: {result.sideCount}</div>
          {result.errors.length > 0 && <ul style={{ margin:'8px 0 0 18px', padding:0 }}>{result.errors.map((e, i) => <li key={i} style={{ marginBottom:4, color:'#fecaca', fontSize:13 }}>{e}</li>)}</ul>}
          {result.warnings.length > 0 && <ul style={{ margin:'8px 0 0 18px', padding:0 }}>{result.warnings.map((e, i) => <li key={i} style={{ marginBottom:4, color:'#fde68a', fontSize:13 }}>{e}</li>)}</ul>}
        </div>}
      </Card>
      <Card title="Dati giocatore">
        <Grid2><Field label="Nome"><input value={player.firstName} onChange={e => setPlayer({ ...player, firstName:e.target.value })} style={inputStyle} /></Field><Field label="Cognome"><input value={player.lastName} onChange={e => setPlayer({ ...player, lastName:e.target.value })} style={inputStyle} /></Field></Grid2>
        <Grid2><Field label="DCI / ID"><input value={player.dci} onChange={e => setPlayer({ ...player, dci:e.target.value })} style={inputStyle} /></Field><Field label="Data"><input type="date" value={player.date} onChange={e => setPlayer({ ...player, date:e.target.value })} style={inputStyle} /></Field></Grid2>
        <Field label="Evento"><input value={player.event} onChange={e => setPlayer({ ...player, event:e.target.value })} style={inputStyle} /></Field>
        <Field label="Location"><input value={player.location} onChange={e => setPlayer({ ...player, location:e.target.value })} style={inputStyle} /></Field>
      </Card>
    </div>
    <div style={{ background:'#fff', borderRadius:14, padding:16, overflow:'auto', maxHeight:'calc(100vh - 120px)' }}>
      <TournamentSheet data={result || { main:[], side:[], mainCount:'', sideCount:'' }} format={format} player={player} />
    </div>
  </div>;
}

function Card({ title, children }) { return <div style={{ background:'#1c1b19', border:'1px solid #393836', borderRadius:14, padding:14 }}><div style={{ fontWeight:700, marginBottom:10 }}>{title}</div><div style={{ display:'grid', gap:10 }}>{children}</div></div>; }
function Field({ label, children }) { return <label style={{ display:'grid', gap:6, fontSize:12, color:'#b8b5b1' }}><span>{label}</span>{children}</label>; }
function Grid2({ children }) { return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>{children}</div>; }
const inputStyle = { width:'100%', background:'#11100f', color:'#ece9e4', border:'1px solid #393836', borderRadius:8, padding:'9px 10px', fontSize:13, outline:'none' };
const btnPrimary = { padding:'10px 14px', borderRadius:10, border:'1px solid #4f98a3', background:'#4f98a3', color:'#0f1111', fontWeight:700, cursor:'pointer' };
const btnSecondary = { padding:'10px 14px', borderRadius:10, border:'1px solid #393836', background:'#201f1d', color:'#ece9e4', fontWeight:700, cursor:'pointer' };

function PrintGrid({ prints, selected, onToggle, onQty }) {
  const G = "#4f98a3", BD = "#393836";
  if (!prints.length) return null;
  return <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(128px,1fr))', gap:10 }}>{prints.map(p => { const active = !!selected[p.id]; return <div key={p.id} style={{ border:`1px solid ${active ? G : BD}`, borderRadius:12, overflow:'hidden', background:'#181715' }}><button onClick={() => onToggle(p)} style={{ display:'block', width:'100%', border:'none', background:'transparent', padding:0, cursor:'pointer' }}><img src={p.image_uris?.png || p.image_uris?.normal || p.card_faces?.[0]?.image_uris?.normal} alt={p.name} style={{ width:'100%', aspectRatio:'63/88', objectFit:'cover', display:'block' }} /></button><div style={{ padding:8, display:'grid', gap:6 }}><div style={{ fontSize:12, minHeight:30 }}>{p.name}</div><input type='number' min='1' value={selected[p.id]?.qty || 1} onChange={e => onQty(p.id, Math.max(1, parseInt(e.target.value || '1', 10)))} style={{ ...inputStyle, padding:'6px 8px' }} /></div></div>; })}</div>;
}

export default function MTGProxyCreator() {
  const [tab, setTab] = useState('print');
  const [query, setQuery] = useState('');
  const [prints, setPrints] = useState([]);
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const search = useCallback(async () => {
    if (!query.trim()) return; setBusy(true);
    try { setPrints(await fetchAllPrints(query)); } finally { setBusy(false); }
  }, [query]);
  const onToggle = useCallback(card => setSelected(prev => prev[card.id] ? (() => { const n = { ...prev }; delete n[card.id]; return n; })() : ({ ...prev, [card.id]: { card, qty:1 } })), []);
  const onQty = useCallback((id, qty) => setSelected(prev => prev[id] ? ({ ...prev, [id]: { ...prev[id], qty } }) : prev), []);

  const exportSelectedPdf = useCallback(async () => {
    const items = Object.values(selected); if (!items.length) return;
    const pdf = await PDFDocument.create();
    const margin = mmToPt(8); const gap = mmToPt(4);
    const cols = 3, rows = 3;
    let page = pdf.addPage([PAGE_W, PAGE_H]); let i = 0;
    for (const item of items) {
      for (let q = 0; q < item.qty; q++) {
        const idx = i % (cols * rows); if (i > 0 && idx === 0) page = pdf.addPage([PAGE_W, PAGE_H]);
        const col = idx % cols; const row = Math.floor(idx / cols);
        const x = margin + col * (CARD_W + gap); const y = PAGE_H - margin - CARD_H - row * (CARD_H + gap);
        const src = item.card.image_uris?.png || item.card.image_uris?.large || item.card.card_faces?.[0]?.image_uris?.png || item.card.card_faces?.[0]?.image_uris?.large;
        const data = await imgToDataURL(src); const img = await pdf.embedPng(dataURLtoBuffer(data));
        page.drawImage(img, { x, y, width: CARD_W, height: CARD_H }); i++;
      }
    }
    const bytes = await pdf.save(); const blob = new Blob([bytes], { type:'application/pdf' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mtg-print.pdf'; a.click();
  }, [selected]);

  return <div style={{ minHeight:'100vh', background:'#131211', color:'#ece9e4', padding:12 }}>
    <style>{`@media print { .app-shell { display:none !important; } .sheet-container { display:block !important; width:210mm; min-height:297mm; margin:0 auto; } body { background:#fff !important; } }`} </style>
    <div className='app-shell' style={{ maxWidth:1400, margin:'0 auto', display:'grid', gap:12 }}>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={() => setTab('print')} style={tab === 'print' ? btnPrimary : btnSecondary}><span style={{ display:'inline-flex', gap:8, alignItems:'center' }}><Icon d='M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2' />Stampa</span></button>
        <button onClick={() => setTab('token')} style={tab === 'token' ? btnPrimary : btnSecondary}><span style={{ display:'inline-flex', gap:8, alignItems:'center' }}><Icon d='M12 2l8 4v12l-8 4-8-4V6l8-4z' />Token</span></button>
        <button onClick={() => setTab('deckcheck')} style={tab === 'deckcheck' ? btnPrimary : btnSecondary}><span style={{ display:'inline-flex', gap:8, alignItems:'center' }}><Icon d='M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' />Deck Check</span></button>
      </div>
      {tab === 'print' && <div style={{ display:'grid', gridTemplateColumns:'380px 1fr', gap:16 }}>
        <div style={{ display:'grid', gap:12 }}>
          <Card title='Scryfall search'>
            <Field label='Cerca carta'><div style={{ display:'flex', gap:8 }}><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} style={inputStyle} placeholder='es. Lightning Bolt' /><button onClick={search} style={btnPrimary}>{busy ? '...' : 'Cerca'}</button></div></Field>
            <div style={{ fontSize:12, color:'#b8b5b1' }}>Seleziona le stampe e genera un PDF da stampa.</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}><button onClick={exportSelectedPdf} style={btnSecondary} disabled={!Object.keys(selected).length}>Esporta PDF</button><button onClick={() => setSelected({})} style={btnSecondary}>Reset selezione</button></div>
          </Card>
        </div>
        <div><PrintGrid prints={prints} selected={selected} onToggle={onToggle} onQty={onQty} /></div>
      </div>}
      {tab === 'token' && <TokenPreviewSinglePtFrame />}
      {tab === 'deckcheck' && <DeckValidatorPanel />}
    </div>
  </div>;
}
