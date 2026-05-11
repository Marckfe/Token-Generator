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
// Cerca carte che contengono il testo nel nome, poi recupera tutte le stampe
async function fetchAllPrints(name) {
  const term = name.trim();
  const names = [];
  const seen = new Set();
  const pushName = (n) => { if (n && !seen.has(n)) { seen.add(n); names.push(n); } };

  try {
    let url = `https://api.scryfall.com/cards/search?q=name:${encodeURIComponent(term)}&unique=cards&order=released&dir=desc`;
    while (url) {
      const r = await fetch(url);
      if (!r.ok) break;
      const j = await r.json();
      if (j.object === "error") break;
      (j.data || []).forEach(c => pushName(c.name));
      url = j.has_more ? j.next_page : null;
      if (url) await new Promise(r => setTimeout(r, 80));
    }
  } catch {}

  if (!names.length) {
    try {
      const nr = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(term)}`);
      if (nr.ok) {
        const nj = await nr.json();
        if (nj.object !== "error" && nj.name) pushName(nj.name);
      }
    } catch {}
  }

  const all = [];
  for (const cardName of names) {
    let url = `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(cardName)}"&unique=prints&order=released&dir=desc`;
    while (url) {
      const r = await fetch(url);
      if (!r.ok) break;
      const j = await r.json();
      if (j.object === "error") break;
      all.push(...(j.data || []));
      url = j.has_more ? j.next_page : null;
      if (url) await new Promise(r => setTimeout(r, 80));
    }
  }
  return all;
}

function PrintGrid({ prints, selected, onToggle, onQty }) {
  const G = "#4f98a3", BD = "#393836";
  if (!prints.length) return null;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(88px, 1fr))", gap:8 }}>
      {prints.map(card => {
        const thumb  = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small;
        const isOn   = !!selected[card.id];
        const artist = card.artist || "";
        const yr     = card.released_at?.slice(0,4) || "";
        const border = card.border_color === "borderless" ? "🔲" : card.frame_effects?.includes("extendedart") ? "🖼" : "";
        return (
          <div key={card.id} onClick={() => onToggle(card)}
            style={{ cursor:"pointer", borderRadius:6, overflow:"visible", position:"relative",
              border:`2px solid ${isOn ? G : BD}`,
              boxShadow: isOn ? `0 0 0 2px ${G}44` : "none",
              background:"#1a1917", transition:"border-color .15s" }}>
            <img src={thumb} alt={card.name}
              style={{ width:"100%", display:"block", borderRadius:4 }} />
            <div style={{ padding:"3px 5px 4px" }}>
              <div style={{ fontSize:9, color:"#cdccca", fontWeight:600,
                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {border}{card.set_name} {yr && `'${yr.slice(2)}`}
              </div>
              <div style={{ fontSize:8, color:"#797876",
                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {artist}
              </div>
            </div>
            {isOn && (
              <>
                <div style={{ position:"absolute", top:4, left:4, background:G, borderRadius:"50%",
                  width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:11, color:"#000", fontWeight:800, pointerEvents:"none" }}>✓</div>
                <div onClick={e => e.stopPropagation()}
                  style={{ position:"absolute", top:4, right:4 }}>
                  <input type="number" min={1} max={20} value={selected[card.id].qty}
                    onChange={e => onQty(card.id, e.target.value)}
                    style={{ width:38, background:"#000", color:G, border:`1px solid ${G}`,
                      borderRadius:4, padding:"2px 4px", fontSize:12, fontWeight:700,
                      textAlign:"center", outline:"none" }} />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScryfallSearchPanel({ onAddCards }) {
  const [query, setQuery]         = React.useState("");
  const [suggestions, setSuggs]   = React.useState([]);
  const [showSugg, setShowSugg]   = React.useState(false);
  const [loadingSugg, setLdSugg]  = React.useState(false);
  const [prints, setPrints]       = React.useState([]);
  const [loading, setLoading]     = React.useState(false);
  const [loadMsg, setLoadMsg]     = React.useState("");
  const [error, setError]         = React.useState("");
  const [selected, setSelected]   = React.useState({});
  const [expandedName, setExpandedName] = React.useState(null);
  const suggTimer = React.useRef(null);
  const G = "#4f98a3", BD = "#393836", SURF = "#252420";

  const fetchSuggestions = (val) => {
    clearTimeout(suggTimer.current);
    if (val.length < 2) { setSuggs([]); return; }
    setLdSugg(true);
    suggTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(val)}`);
        const j = await r.json();
        setSuggs((j.data || []).slice(0, 10));
      } catch { setSuggs([]); }
      setLdSugg(false);
    }, 220);
  };

  const handleInput = (val) => {
    setQuery(val); setShowSugg(true);
    setPrints([]); setError(""); setSelected({}); setExpandedName(null);
    fetchSuggestions(val);
  };

  const searchCard = async (name) => {
    setQuery(name); setShowSugg(false); setSuggs([]);
    setLoading(true); setLoadMsg("Cerco carte…"); setPrints([]);
    setError(""); setSelected({}); setExpandedName(null);
    try {
      const term = name.trim();
      const names = [];
      const seen = new Set();
      const pushName = (n) => { if (n && !seen.has(n)) { seen.add(n); names.push(n); } };

      try {
        let url = `https://api.scryfall.com/cards/search?q=name:${encodeURIComponent(term)}&unique=cards&order=released&dir=desc`;
        while (url) {
          const r = await fetch(url);
          if (!r.ok) break;
          const j = await r.json();
          if (j.object === "error") break;
          (j.data || []).forEach(c => pushName(c.name));
          url = j.has_more ? j.next_page : null;
          if (url) await new Promise(r => setTimeout(r, 100));
        }
      } catch {}

      if (!names.length) {
        try {
          const nr = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(term)}`);
          if (nr.ok) {
            const nj = await nr.json();
            if (nj.object !== "error" && nj.name) {
              pushName(nj.name);
              setQuery(nj.name);
            }
          }
        } catch {}
      }

      const all = [];
      setLoadMsg("Caricamento stampe…");
      for (const cardName of names) {
        let url = `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(cardName)}"&unique=prints&order=released&dir=desc`;
        while (url) {
          const r = await fetch(url);
          if (!r.ok) break;
          const j = await r.json();
          if (j.object === "error") { url = null; break; }
          all.push(...(j.data || []));
          setPrints([...all]);
          setLoadMsg(`Caricamento… ${all.length} stampe`);
          url = j.has_more ? j.next_page : null;
          if (url) await new Promise(r => setTimeout(r, 100));
        }
      }

      if (!all.length) setError(`Nessun risultato per "${name}"`);
      else setLoadMsg(`${all.length} stampe totali`);
    } catch (e) { setError("Errore di rete: " + e.message); }
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && query.trim()) searchCard(query.trim());
    if (e.key === "Escape") setShowSugg(false);
  };

  const grouped = React.useMemo(() => {
    const map = {};
    for (const c of prints) {
      if (!map[c.name]) map[c.name] = [];
      map[c.name].push(c);
    }
    return map;
  }, [prints]);
  const cardNames = Object.keys(grouped);

  const togglePrint = (card) =>
    setSelected(prev => prev[card.id]
      ? (() => { const n={...prev}; delete n[card.id]; return n; })()
      : { ...prev, [card.id]: { qty:1, card } }
    );
  const setQty = (id, v) =>
    setSelected(prev => ({ ...prev, [id]: { ...prev[id], qty: Math.max(1, Math.min(20, Number(v))) } }));

  const addSelected = async () => {
    const entries = Object.values(selected);
    if (!entries.length) return;
    const items = [];
    for (const { card, qty } of entries) {
      const imgUrl = card.image_uris?.normal || card.image_uris?.large || card.card_faces?.[0]?.image_uris?.normal;
      if (!imgUrl) continue;
      try {
        const blob = await fetch(imgUrl).then(r => r.blob());
        const lu = URL.createObjectURL(blob);
        const file = new File([blob], `${card.name}.jpg`, { type: blob.type });
        for (let i = 0; i < qty; i++)
          items.push({ id: card.id+"_"+i+"_"+Math.random(), name:card.name, url:lu, file, srcType:"scryfall",
            thumb: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small, set:card.set_name });
      } catch {
        for (let i = 0; i < qty; i++)
          items.push({ id: card.id+"_"+i+"_"+Math.random(), name:card.name, url:imgUrl, srcType:"scryfall",
            thumb: card.image_uris?.small });
      }
    }
    onAddCards(items);
    setSelected({}); setPrints([]); setQuery(""); setSuggs([]);
  };

  const selCount  = Object.values(selected).reduce((a, {qty}) => a + qty, 0);
  const selPrints = Object.keys(selected).length;

  return (
    <div style={{ background:"#201f1d", border:`1px solid ${BD}`, borderRadius:10, padding:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth={2}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <span style={{ fontWeight:700, color:G, fontSize:14 }}>Cerca carta su Scryfall</span>
        <span style={{ fontSize:11, color:"#4a4948" }}>— tutte le stampe + scelta art</span>
      </div>

      <div style={{ position:"relative", marginBottom:10 }}>
        <div style={{ display:"flex", gap:8 }}>
          <div style={{ position:"relative", flex:1 }}>
            <input value={query} onChange={e => handleInput(e.target.value)}
              onKeyDown={handleKey}
              onFocus={() => query.length >= 2 && setShowSugg(true)}
              onBlur={() => setTimeout(() => setShowSugg(false), 180)}
              placeholder="Es. Lightning Bolt, Llanowar Elves…"
              style={{ width:"100%", background:SURF, color:"#cdccca", border:`1px solid ${BD}`,
                borderRadius:6, padding:"8px 36px 8px 10px", fontSize:13, outline:"none", boxSizing:"border-box" }} />
            {loadingSugg && (
              <div style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
                width:14, height:14, border:`2px solid ${BD}`, borderTopColor:G,
                borderRadius:"50%", animation:"spin .7s linear infinite" }} />
            )}
          </div>
          <button onClick={() => query.trim() && searchCard(query.trim())}
            disabled={loading || !query.trim()}
            style={{ padding:"8px 18px", borderRadius:6, background:G, color:"#000",
              border:"none", fontWeight:700, fontSize:13, cursor:"pointer",
              opacity: loading || !query.trim() ? 0.5 : 1, whiteSpace:"nowrap" }}>
            {loading ? "…" : "Cerca"}
          </button>
        </div>

        {showSugg && suggestions.length > 0 && (
          <div style={{ position:"absolute", top:"100%", left:0, right:60, background:"#1c1b19",
            border:`1px solid ${BD}`, borderRadius:8, zIndex:200,
            boxShadow:"0 8px 24px rgba(0,0,0,.5)", overflow:"hidden", marginTop:2 }}>
            {suggestions.map((s, i) => (
              <div key={i} onMouseDown={() => searchCard(s)}
                style={{ padding:"9px 14px", cursor:"pointer", fontSize:13, color:"#cdccca",
                  borderBottom: i < suggestions.length-1 ? `1px solid ${BD}` : "none" }}
                onMouseEnter={e => e.currentTarget.style.background="#252420"}
                onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                <span style={{ color:G, marginRight:6, fontSize:11 }}>🃏</span>{s}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div style={{ fontSize:12, color:"#f87171", marginBottom:8 }}>{error}</div>}

      {loading && (
        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#797876", marginBottom:10 }}>
          <div style={{ width:14, height:14, border:`2px solid ${BD}`, borderTopColor:G,
            borderRadius:"50%", animation:"spin .7s linear infinite", flexShrink:0 }} />
          {loadMsg}
        </div>
      )}
      {!loading && prints.length > 0 && (
        <div style={{ fontSize:11, color:"#797876", marginBottom:10 }}>
          <strong style={{ color:G }}>{prints.length}</strong> stampe trovate per{" "}
          <strong style={{ color:"#cdccca" }}>{cardNames.length}</strong> carta{cardNames.length>1?"e":""}
          {" — "}griglia scrollabile, clicca una carta per vedere le art
        </div>
      )}

      {cardNames.length > 0 && (
        <div style={{ maxHeight:560, overflowY:"auto", paddingRight:4 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:10 }}>
            {cardNames.map(cardName => {
              const cardPrints = grouped[cardName];
              const isExp = expandedName === cardName;
              const rep   = cardPrints[0];
              const repThumb = rep.image_uris?.small || rep.card_faces?.[0]?.image_uris?.small;
              const selForCard = cardPrints.filter(p => selected[p.id]);
              const totalQtyForCard = selForCard.reduce((s,p) => s + (selected[p.id]?.qty||0), 0);

              return (
                <div key={cardName} style={{ border:`1px solid ${BD}`, borderRadius:10, overflow:"hidden", background:"#1c1b19" }}>
                  <div onClick={() => setExpandedName(isExp ? null : cardName)}
                    style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
                      background: isExp ? "#252420" : "#1c1b19", cursor:"pointer", minHeight:72 }}>
                    <img src={repThumb} alt={cardName}
                      style={{ width:40, height:56, objectFit:"cover", borderRadius:4, flexShrink:0, background:'#111' }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:"#cdccca", lineHeight:1.2,
                        display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                        {cardName}
                      </div>
                      <div style={{ fontSize:11, color:"#797876", marginTop:4 }}>
                        {cardPrints.length} stampa{cardPrints.length>1?"e":""} disponibili
                        {selForCard.length > 0 && (
                          <span style={{ marginLeft:8, color:"#4ade80", fontWeight:600 }}>
                            · {totalQtyForCard} cop{totalQtyForCard===1?"ia":"ie"}
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ color:"#4a4948", fontSize:13, flexShrink:0 }}>{isExp?"▲":"▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding:"10px 12px", background:"#181716", borderTop:`1px solid ${BD}` }}>
                      <div style={{ fontSize:11, color:"#797876", marginBottom:8 }}>
                        {cardPrints.length} stampe — clicca per selezionare, modifica la quantità
                      </div>
                      <div style={{ maxHeight:320, overflowY:"auto", paddingRight:4 }}>
                        <PrintGrid
                          prints={cardPrints}
                          selected={selected}
                          onToggle={togglePrint}
                          onQty={setQty}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selPrints > 0 && (
        <button onClick={addSelected}
          style={{ width:"100%", marginTop:12, padding:"10px", borderRadius:7,
            background:G, color:"#000", border:"none", fontWeight:700, fontSize:13, cursor:"pointer" }}>
          ➕ Aggiungi {selCount} cop{selCount===1?"ia":"ie"} alla coda ({selPrints} stampa{selPrints===1?"":"e"})
        </button>
      )}

      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
    </div>
  );
}

// ── BULK IMPORT PANEL ─────────────────────────────────────────────────────────
function BulkImportPanel({ onAddCards, toast }) {
  const [text, setText]             = React.useState("");
  const [loading, setLoading]       = React.useState(false);
  const [loadMsg, setLoadMsg]       = React.useState("");
  const [entries, setEntries]       = React.useState([]);
  const [resolved, setResolved]     = React.useState(false);
  const [expandedArt, setExpandedArt] = React.useState(null);
  const G = "#4f98a3", BD = "#393836";

  const parseList = (raw) =>
    raw.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
      const m1 = line.match(/^(\d+)[xX]?\s+(.+)$/);
      const m2 = line.match(/^(.+?)\s+[xX](\d+)$/);
      const m3 = line.match(/^(.+?)\s+(\d+)$/);
      if (m1) return { qty: Math.min(20, parseInt(m1[1])), name: m1[2].trim() };
      if (m2) return { qty: Math.min(20, parseInt(m2[2])), name: m2[1].trim() };
      if (m3) return { qty: Math.min(20, parseInt(m3[2])), name: m3[1].trim() };
      return { qty:1, name: line.trim() };
    }).filter(e => e.name);

  const resolveCards = async () => {
    const parsed = parseList(text);
    if (!parsed.length) return;
    setLoading(true); setResolved(false); setEntries([]);
    const results = [];
    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i];
      setLoadMsg(`Verifico ${i+1}/${parsed.length}: ${entry.name}`);
      try {
        const allPrints = await fetchAllPrints(entry.name);
        if (!allPrints.length) {
          results.push({ ...entry, status:"not_found", card:null, prints:[], selectedPrint:null });
        } else {
          results.push({ ...entry, status:"found", card:allPrints[0], prints:allPrints, selectedPrint:allPrints[0] });
        }
      } catch {
        results.push({ ...entry, status:"error", card:null, prints:[], selectedPrint:null });
      }
      await new Promise(r => setTimeout(r, 80));
    }
    setEntries(results);
    setResolved(true);
    setLoading(false);
    setLoadMsg("");
  };

  const updateQty = (i, val) => setEntries(prev => prev.map((e, idx) => idx===i ? {...e, qty: Math.max(1, Math.min(20, Number(val)))} : e));
  const toggleExclude = (i) => setEntries(prev => prev.map((e, idx) => idx===i ? {...e, excluded:!e.excluded} : e));
  const selectPrint = (entryIdx, card) => setEntries(prev => prev.map((e, i) => i===entryIdx ? {...e, selectedPrint:card, card} : e));

  const addAll = async () => {
    const toAdd = entries.filter(e => e.status==="found" && !e.excluded);
    if (!toAdd.length) return;
    setLoading(true); setLoadMsg("Scarico immagini…");
    const items = [];
    for (const entry of toAdd) {
      const card = entry.selectedPrint || entry.card;
      const imgUrl = card.image_uris?.normal || card.image_uris?.large || card.card_faces?.[0]?.image_uris?.normal;
      if (!imgUrl) continue;
      try {
        const blob = await fetch(imgUrl).then(r => r.blob());
        const lu = URL.createObjectURL(blob);
        const file = new File([blob], `${card.name}.jpg`, { type: blob.type });
        for (let i = 0; i < entry.qty; i++) items.push({ id:card.id+"_"+i+"_"+Math.random(), name:card.name, url:lu, file, srcType:"scryfall", thumb:card.image_uris?.small||card.card_faces?.[0]?.image_uris?.small });
      } catch {
        for (let i = 0; i < entry.qty; i++) items.push({ id:card.id+"_"+i+"_"+Math.random(), name:card.name, url:imgUrl, srcType:"scryfall", thumb:card.image_uris?.small });
      }
    }
    onAddCards(items);
    setText(""); setEntries([]); setResolved(false); setLoading(false); setLoadMsg("");
  };

  const foundCount = entries.filter(e => e.status==="found" && !e.excluded).length;
  const nfCount = entries.filter(e => e.status==="not_found").length;
  const totalCopies = entries.filter(e=>e.status==="found"&&!e.excluded).reduce((s,e)=>s+e.qty,0);

  return (
    <div style={{ background:"#201f1d", border:`1px solid ${BD}`, borderRadius:10, padding:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
        <span style={{ fontSize:18 }}>📋</span>
        <span style={{ fontWeight:700, color:G, fontSize:14 }}>Importa lista massiva</span>
      </div>

      <div style={{ fontSize:11, color:"#797876", marginBottom:6 }}>
        Formati: <code style={{color:G}}>4 Lightning Bolt</code> · <code style={{color:G}}>4x Bolt</code> · <code style={{color:G}}>Bolt x4</code> · solo nome
      </div>
      <textarea value={text} onChange={e => { setText(e.target.value); setResolved(false); setEntries([]); }}
        placeholder={"4 Lightning Bolt\n2 Counterspell\n1 Black Lotus\nSol Ring x4"}
        rows={6}
        style={{ width:"100%", background:"#252420", color:"#cdccca", border:`1px solid ${BD}`,
          borderRadius:6, padding:"8px 10px", fontSize:13, outline:"none", resize:"vertical",
          boxSizing:"border-box", fontFamily:"monospace", marginBottom:8 }} />

      <button onClick={resolveCards} disabled={loading || !text.trim()}
        style={{ width:"100%", padding:"9px", borderRadius:7,
          background: loading||!text.trim() ? "#333" : G,
          color: loading||!text.trim() ? "#555" : "#000",
          border:"none", fontWeight:700, fontSize:13,
          cursor: loading||!text.trim() ? "not-allowed" : "pointer",
          marginBottom: entries.length ? 14 : 0 }}>
        {loading && !resolved ? `⏳ ${loadMsg||"Verifica in corso…"}` : "🔎 Verifica carte"}
      </button>

      {resolved && entries.length > 0 && (
        <>
          <div style={{ display:"flex", gap:10, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:12, color:"#4ade80" }}>✓ {foundCount} trovate</span>
            {nfCount > 0 && <span style={{ fontSize:12, color:"#f87171" }}>✗ {nfCount} non trovate</span>}
            <span style={{ fontSize:11, color:"#4a4948", marginLeft:"auto" }}>
              Clicca "Scegli art" per selezionare la stampa preferita
            </span>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:480, overflowY:"auto" }}>
            {entries.map((entry, i) => {
              const thumb = (entry.selectedPrint || entry.card)?.image_uris?.small || (entry.selectedPrint || entry.card)?.card_faces?.[0]?.image_uris?.small;
              const isArtOpen = expandedArt === i;
              return (
                <div key={i} style={{ borderRadius:8, overflow:"hidden",
                  border:`1px solid ${entry.excluded ? BD : entry.status==="found" ? "#2d5a2d" : "#5a2d2d"}`,
                  opacity: entry.excluded ? 0.45 : 1, transition:"opacity .2s" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 10px",
                    background: entry.excluded ? "#1a1917" : entry.status==="found" ? "#1e2b1e" : "#2b1e1e" }}>
                    {thumb ? <img src={thumb} alt={entry.name} style={{ width:32, height:44, objectFit:"cover", borderRadius:3, flexShrink:0 }} />
                      : <div style={{ width:32, height:44, background:"#333", borderRadius:3, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>{entry.status==="not_found"?"❓":"⚠️"}</div>}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:13, color:"#cdccca", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{(entry.selectedPrint||entry.card)?.name || entry.name}</div>
                      {entry.status==="found" && <div style={{ fontSize:10, color:"#797876" }}>{(entry.selectedPrint||entry.card)?.set_name} · {(entry.selectedPrint||entry.card)?.artist} · <span style={{ color:G }}>{entry.prints.length} stampe</span></div>}
                      {entry.status==="not_found" && <div style={{ fontSize:10, color:"#f87171" }}>Carta non trovata</div>}
                    </div>
                    {entry.status==="found" && entry.prints.length > 1 && (
                      <button onClick={() => setExpandedArt(isArtOpen ? null : i)}
                        style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${G}`,
                          background: isArtOpen ? G : "transparent", color: isArtOpen ? "#000" : G,
                          fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
                        🎨 {isArtOpen ? "Chiudi" : "Scegli art"}
                      </button>
                    )}
                    {entry.status==="found" && (
                      <input type="number" min={1} max={20} value={entry.qty}
                        onChange={e => updateQty(i, e.target.value)}
                        style={{ width:46, background:"#252420", color:G, border:`1px solid ${BD}`, borderRadius:5, padding:"4px 6px", fontSize:13, fontWeight:700, textAlign:"center", outline:"none", flexShrink:0 }} />
                    )}
                    {entry.status==="found" && (
                      <button onClick={() => toggleExclude(i)} style={{ background:"transparent", border:"none", cursor:"pointer", color: entry.excluded ? G : "#f87171", fontSize:16, lineHeight:1, padding:2, flexShrink:0 }}>{entry.excluded ? "↩" : "✕"}</button>
                    )}
                  </div>

                  {isArtOpen && entry.prints.length > 0 && (
                    <div style={{ padding:"10px 12px", background:"#181716" }}>
                      <div style={{ fontSize:11, color:"#797876", marginBottom:8 }}>
                        {entry.prints.length} stampe disponibili — clicca per scegliere
                      </div>
                      {(() => {
                        const grouped = {};
                        for (const c of entry.prints) {
                          if (!grouped[c.name]) grouped[c.name] = [];
                          grouped[c.name].push(c);
                        }
                        const names = Object.keys(grouped);
                        return (
                          <div style={{ maxHeight:360, overflowY:"auto", paddingRight:4 }}>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:8 }}>
                              {names.map(cardName => {
                                const cardPrints = grouped[cardName];
                                const isGroupExp = expandedArt === `${i}_${cardName}`;
                                const rep = cardPrints[0];
                                const repThumb = rep.image_uris?.small || rep.card_faces?.[0]?.image_uris?.small;
                                const isCurrent = cardPrints.some(p => (entry.selectedPrint||entry.card)?.id === p.id);
                                return (
                                  <div key={cardName} style={{ border:`1px solid ${BD}`, borderRadius:8, overflow:"hidden", background:'#1c1b19' }}>
                                    <div onClick={() => setExpandedArt(isGroupExp ? i : `${i}_${cardName}`)}
                                      style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:isGroupExp?"#252420":"#1c1b19", cursor:"pointer", minHeight:64 }}>
                                      <img src={repThumb} alt={cardName} style={{ width:32, height:44, objectFit:"cover", borderRadius:3, flexShrink:0 }} />
                                      <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontWeight:700, fontSize:12, color:"#cdccca", lineHeight:1.2, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{cardName}</div>
                                        <div style={{ fontSize:10, color:"#797876", marginTop:4 }}>
                                          {cardPrints.length} stampa{cardPrints.length>1?"e":""} disponibili
                                          {isCurrent && <span style={{ marginLeft:6, color:G }}>· selezionata</span>}
                                        </div>
                                      </div>
                                      {cardPrints.length === 1 && (
                                        <button onClick={e => { e.stopPropagation(); selectPrint(i, rep); setExpandedArt(i); }}
                                          style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${G}`,
                                            background: (entry.selectedPrint||entry.card)?.id===rep.id ? G : "transparent",
                                            color: (entry.selectedPrint||entry.card)?.id===rep.id ? "#000" : G,
                                            fontSize:11, fontWeight:700, cursor:"pointer", flexShrink:0 }}>
                                          {(entry.selectedPrint||entry.card)?.id===rep.id ? "✓ Selezionata" : "Usa questa"}
                                        </button>
                                      )}
                                      <span style={{ color:"#4a4948", fontSize:12, flexShrink:0 }}>{isGroupExp?"▲":"▼"}</span>
                                    </div>
                                    {isGroupExp && (
                                      <div style={{ padding:"8px 10px", background:"#181716", maxHeight:260, overflowY:"auto" }}>
                                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(80px,1fr))", gap:6 }}>
                                          {cardPrints.map(card => {
                                            const t = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small;
                                            const isSel = (entry.selectedPrint||entry.card)?.id === card.id;
                                            return (
                                              <div key={card.id} onClick={() => { selectPrint(i, card); setExpandedArt(i); }}
                                                style={{ cursor:"pointer", borderRadius:6, overflow:"hidden", position:"relative", border:`2px solid ${isSel ? G : BD}`,
                                                  boxShadow: isSel ? `0 0 0 2px ${G}44` : "none", background:"#1a1917", transition:"border-color .15s" }}>
                                                <img src={t} alt={card.name} style={{ width:"100%", display:"block" }} />
                                                <div style={{ padding:"2px 4px 3px" }}>
                                                  <div style={{ fontSize:8, color:"#cdccca", fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{card.set_name} {card.released_at?.slice(2,4) && `'${card.released_at.slice(2,4)}`}</div>
                                                  <div style={{ fontSize:7, color:"#797876", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{card.artist}</div>
                                                </div>
                                                {isSel && <div style={{ position:"absolute", top:3, left:3, background:G, borderRadius:"50%", width:16, height:16, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#000", fontWeight:800, pointerEvents:"none" }}>✓</div>}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {foundCount > 0 && (
            <button onClick={addAll} disabled={loading}
              style={{ width:"100%", marginTop:12, padding:"10px", borderRadius:7, background: loading ? "#333" : G, color: loading ? "#555" : "#000", border:"none", fontWeight:700, fontSize:13, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? `⏳ ${loadMsg}` : `➕ Aggiungi ${totalCopies} cop${totalCopies===1?"ia":"ie"} alla coda (${foundCount} carte)`}
            </button>
          )}
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
          🔍 Cerca carte · Importa lista
          <span style={{ marginLeft:"auto", fontSize:11, opacity:.7 }}>
            {showScryfall ? "▲ chiudi" : "▼ apri"}
          </span>
        </button>

        {showScryfall && (
          <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:8 }}>
            <ScryfallSearchPanel onAddCards={cards => {
              setImages(prev => [...prev, ...cards]);
              toast(`✅ ${cards.length} cop${cards.length===1?"ia":"ie"} aggiunte alla coda!`);
            }} />
            <BulkImportPanel
              onAddCards={cards => {
                setImages(prev => [...prev, ...cards]);
                toast(`✅ ${cards.length} cop${cards.length===1?"ia":"ie"} aggiunte alla coda!`);
              }}
              toast={toast}
            />
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
