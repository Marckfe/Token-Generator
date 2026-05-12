import React, { useState } from "react";
import { fetchAllPrints } from "../../utils/scryfallApi";

const LANGUAGES = [
  { code: 'en', name: 'Inglese' },
  { code: 'it', name: 'Italiano' },
  { code: 'es', name: 'Spagnolo' },
  { code: 'fr', name: 'Francese' },
  { code: 'de', name: 'Tedesco' },
  { code: 'pt', name: 'Portoghese' },
  { code: 'ja', name: 'Giapponese' },
  { code: 'ko', name: 'Coreano' },
  { code: 'zhs', name: 'Cinese Sempl.' },
  { code: 'zht', name: 'Cinese Trad.' },
  { code: 'ru', name: 'Russo' },
];

export default function BulkImportPanel({ onAddCards, toast }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [entries, setEntries] = useState([]);
  const [resolved, setResolved] = useState(false);
  const [expandedArt, setExpandedArt] = useState(null);
  const [modalLang, setModalLang] = useState('en');

  const parseList = (raw) =>
    raw.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
      let cleanLine = line.replace(/\s+\([a-zA-Z0-9_]+\)\s*.*$/i, '').trim();
      const m1 = cleanLine.match(/^(\d+)[xX]?\s+(.+)$/);
      const m2 = cleanLine.match(/^(.+?)\s+[xX](\d+)$/);
      const m3 = cleanLine.match(/^(.+?)\s+(\d+)$/);
      let qty = 1;
      let name = cleanLine;
      if (m1) { qty = Math.min(100, parseInt(m1[1])); name = m1[2].trim(); }
      else if (m2) { qty = Math.min(100, parseInt(m2[2])); name = m2[1].trim(); }
      else if (m3) { qty = Math.min(100, parseInt(m3[2])); name = m3[1].trim(); }
      name = name.split(/\s*\/\/?\s*/)[0].trim();
      return { qty, name, original: line };
    }).filter(e => e.name);

  const resolveCards = async () => {
    const parsed = parseList(text);
    if (!parsed.length) return;
    setLoading(true); setResolved(false); setEntries([]);
    setLoadMsg("Verifico la lista nel database in bulk...");
    let fetchedCards = [];
    try {
      const identifiers = parsed.map(p => ({ name: p.name }));
      for (let i = 0; i < identifiers.length; i += 75) {
        const chunk = identifiers.slice(i, i + 75);
        const res = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: chunk })
        });
        const data = await res.json();
        if (data.data) fetchedCards = fetchedCards.concat(data.data);
      }
    } catch (e) {
      setLoadMsg("Errore di rete durante la verifica.");
      setLoading(false);
      return;
    }
    const results = parsed.map(entry => {
      const frontName = entry.name.toLowerCase();
      const card = fetchedCards.find(c => c.name.toLowerCase().startsWith(frontName) || (c.card_faces && c.card_faces[0].name.toLowerCase().startsWith(frontName)));
      if (card) {
        return { ...entry, status: "found", card, prints: [card], selectedPrint: card, lang: 'en' };
      } else {
        return { ...entry, status: "not_found", card: null, prints: [], selectedPrint: null };
      }
    });
    setEntries(results);
    setResolved(true);
    setLoading(false);
    setLoadMsg("");
  };

  const handleExpandArt = async (idx, name, lang = modalLang) => {
    if (expandedArt === idx && lang === modalLang) {
      setExpandedArt(null);
      return;
    }
    setExpandedArt(idx);
    setModalLang(lang);
    const entry = entries[idx];
    if (entry.prints.length > 1 && lang === 'en' && entry.lang === 'en') return;
    setLoadMsg("Caricamento illustrazioni...");
    try {
      const all = await fetchAllPrints(name, lang);
      setEntries(prev => prev.map((e, i) => i === idx ? { ...e, prints: all, lang: lang } : e));
    } catch (e) {
      console.error(e);
    }
    setLoadMsg("");
  };

  const updateQty = (i, val) => setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, qty: Math.max(1, Math.min(100, Number(val))) } : e));
  const toggleExclude = (i) => setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, excluded: !e.excluded } : e));
  const selectPrint = (entryIdx, card) => setEntries(prev => prev.map((e, i) => i === entryIdx ? { ...e, selectedPrint: card, card } : e));

  const addAll = async () => {
    const toAdd = entries.filter(e => e.status === "found" && !e.excluded);
    if (!toAdd.length) return;
    setLoading(true); 
    const items = [];
    let completed = 0;
    for (let i = 0; i < toAdd.length; i += 10) {
      const chunk = toAdd.slice(i, i + 10);
      await Promise.all(chunk.map(async (entry) => {
        const card = entry.selectedPrint || entry.card;
        const imgUrl = card.image_uris?.normal || card.image_uris?.large || card.card_faces?.[0]?.image_uris?.normal;
        if (!imgUrl) return;
        try {
          const blob = await fetch(imgUrl).then(r => r.blob());
          const lu = URL.createObjectURL(blob);
          const file = new File([blob], `${card.name}.jpg`, { type: blob.type });
          for (let j = 0; j < entry.qty; j++) items.push({ id: card.id + "_" + j + "_" + Math.random(), name: card.name, url: lu, file, srcType: "provider", thumb: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small });
        } catch {
          for (let j = 0; j < entry.qty; j++) items.push({ id: card.id + "_" + j + "_" + Math.random(), name: card.name, url: imgUrl, srcType: "provider", thumb: card.image_uris?.small });
        }
        completed++;
        setLoadMsg(`Scarico immagini: ${completed}/${toAdd.length}`);
      }));
    }
    onAddCards(items);
    setText(""); setEntries([]); setResolved(false); setLoading(false); setLoadMsg("");
  };

  const foundCount = entries.filter(e => e.status === "found" && !e.excluded).length;
  const nfCount = entries.filter(e => e.status === "not_found").length;
  const totalCopies = entries.filter(e => e.status === "found" && !e.excluded).reduce((s, e) => s + e.qty, 0);

  return (
    <div className="panel-container">
      <div className="panel-header">
        <span style={{ fontSize: 18 }}>📋</span>
        <span className="panel-title">Importa lista massiva</span>
      </div>

      <div className="panel-hint">
        Formati: <code className="text-accent">4 Lightning Bolt</code> · <code className="text-accent">4x Bolt</code> · <code className="text-accent">Bolt x4</code> · solo nome
      </div>
      
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setResolved(false); setEntries([]); }}
        placeholder={"4 Lightning Bolt\n2 Counterspell\n1 Black Lotus\nSol Ring x4"}
        rows={6}
        className="form-input textarea-list"
      />

      <button
        onClick={resolveCards}
        disabled={loading || !text.trim()}
        className={`btn btn-block ${loading || !text.trim() ? "btn-disabled" : "btn-primary"} ${entries.length ? "mb-3" : ""}`}
      >
        {loading && !resolved ? `⏳ ${loadMsg || "Verifica in corso…"}` : "🔎 Verifica carte"}
      </button>

      {resolved && entries.length > 0 && (
        <>
          <div className="bulk-status-bar">
            <span className="text-success text-xs">✓ {foundCount} trovate</span>
            {nfCount > 0 && <span className="text-error text-xs">✗ {nfCount} non trovate</span>}
            <span className="text-muted text-xs ml-auto">Clicca "Scegli art" per selezionare la stampa preferita</span>
          </div>

          <div className="bulk-list-container">
            {entries.map((entry, i) => {
              const thumb = (entry.selectedPrint || entry.card)?.image_uris?.small || (entry.selectedPrint || entry.card)?.card_faces?.[0]?.image_uris?.small;
              let rowClass = "bulk-row";
              if (entry.excluded) rowClass += " excluded";
              else if (entry.status === "found") rowClass += " found";
              else rowClass += " not-found";
              return (
                <div key={i} className={`bulk-item-wrapper ${entry.excluded ? 'excluded' : entry.status === 'found' ? 'found' : 'not-found'}`}>
                  <div className={rowClass}>
                    {thumb ? (
                      <img src={thumb} alt={entry.name} className="bulk-thumb" />
                    ) : (
                      <div className="bulk-thumb-placeholder">{entry.status === "not_found" ? "❓" : "⚠️"}</div>
                    )}
                    <div className="bulk-overlay">
                      {entry.status === "found" && (
                        <input type="number" min={1} max={100} value={entry.qty} onChange={e => updateQty(i, e.target.value)} className="form-input" style={{ width: '40px', padding: '2px', textAlign: 'center', height: '24px', fontSize: '12px' }} />
                      )}
                      {entry.status === "found" && (
                        <button onClick={() => toggleExclude(i)} className="btn-icon" style={{ background: 'var(--surf)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>
                          {entry.excluded ? "↩" : "✕"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="bulk-info">
                    <div className="bulk-title">{(entry.selectedPrint || entry.card)?.name || entry.name}</div>
                    {entry.status === "found" && (
                      <div className="bulk-meta">{(entry.selectedPrint || entry.card)?.set_name}</div>
                    )}
                    {entry.status === "not_found" && <div className="text-error text-xs mt-1">Non trovata</div>}
                  </div>
                  {entry.status === "found" && (
                    <div className="bulk-actions">
                      <button onClick={() => handleExpandArt(i, entry.name)} className="btn-outline-accent text-xs" style={{ width: '100%' }}>
                        🎨 Scegli art / lingua
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {expandedArt !== null && typeof expandedArt === 'number' && entries[expandedArt] && (
            <div className="bulk-modal-overlay" onClick={() => setExpandedArt(null)}>
              <div className="bulk-modal-content" onClick={e => e.stopPropagation()}>
                <div className="bulk-modal-header">
                  <div className="flex-1">
                    <h3 className="m-0 text-lg">{entries[expandedArt].name}</h3>
                    <div className="text-xs text-[var(--faint)]">Seleziona artwork e lingua</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider opacity-60">Lingua:</label>
                    <select 
                      className="form-input text-xs py-1" 
                      value={modalLang} 
                      onChange={e => handleExpandArt(expandedArt, entries[expandedArt].name, e.target.value)}
                      style={{ width: '140px' }}
                    >
                      {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                    </select>
                    <button className="btn-icon ml-4" onClick={() => setExpandedArt(null)}>✕</button>
                  </div>
                </div>
                <div className="bulk-modal-body">
                  {entries[expandedArt].prints.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-[var(--faint)]">
                      <div className="spinner-small mb-4"></div>
                      <div>Cerco versioni disponibili...</div>
                    </div>
                  ) : (
                    (() => {
                      const entry = entries[expandedArt];
                      const grouped = {};
                      for (const c of entry.prints) {
                        if (!grouped[c.name]) grouped[c.name] = [];
                        grouped[c.name].push(c);
                      }
                      const names = Object.keys(grouped);
                      return (
                        <div className="card-groups-grid">
                          {names.map(cardName => {
                            const cardPrints = grouped[cardName];
                            return (
                              <div key={cardName} className="card-group-container">
                                <div className="card-group-label">{cardName}</div>
                                <div className="print-grid">
                                  {cardPrints.map(card => {
                                    const t = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small;
                                    const isSel = (entry.selectedPrint || entry.card)?.id === card.id;
                                    return (
                                      <div key={card.id} onClick={() => { selectPrint(expandedArt, card); setExpandedArt(null); }} className={`print-card ${isSel ? "selected" : ""}`}>
                                        <img src={t} alt={card.name} />
                                        <div className="print-info">
                                          <div className="print-set">{card.set_name} {card.released_at?.slice(2, 4) && `'${card.released_at.slice(2, 4)}`}</div>
                                          <div className="print-artist">{card.artist}</div>
                                        </div>
                                        {isSel && <div className="check-badge">✓</div>}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>
          )}

          {foundCount > 0 && (
            <button onClick={addAll} disabled={loading} className={`btn btn-block mt-3 ${loading ? "btn-disabled" : "btn-primary"}`}>
              {loading ? `⏳ ${loadMsg}` : `➕ Aggiungi ${totalCopies} cop${totalCopies === 1 ? "ia" : "ie"} alla coda (${foundCount} carte)`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
