import React, { useState } from "react";
import { fetchAllPrints } from "../../utils/scryfallApi";

export default function BulkImportPanel({ onAddCards, toast }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [entries, setEntries] = useState([]);
  const [resolved, setResolved] = useState(false);
  const [expandedArt, setExpandedArt] = useState(null);

  const parseList = (raw) =>
    raw.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
      const m1 = line.match(/^(\d+)[xX]?\s+(.+)$/);
      const m2 = line.match(/^(.+?)\s+[xX](\d+)$/);
      const m3 = line.match(/^(.+?)\s+(\d+)$/);
      if (m1) return { qty: Math.min(20, parseInt(m1[1])), name: m1[2].trim() };
      if (m2) return { qty: Math.min(20, parseInt(m2[2])), name: m2[1].trim() };
      if (m3) return { qty: Math.min(20, parseInt(m3[2])), name: m3[1].trim() };
      return { qty: 1, name: line.trim() };
    }).filter(e => e.name);

  const resolveCards = async () => {
    const parsed = parseList(text);
    if (!parsed.length) return;
    setLoading(true); setResolved(false); setEntries([]);
    const results = [];
    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i];
      setLoadMsg(`Verifico ${i + 1}/${parsed.length}: ${entry.name}`);
      try {
        const allPrints = await fetchAllPrints(entry.name);
        if (!allPrints.length) {
          results.push({ ...entry, status: "not_found", card: null, prints: [], selectedPrint: null });
        } else {
          results.push({ ...entry, status: "found", card: allPrints[0], prints: allPrints, selectedPrint: allPrints[0] });
        }
      } catch {
        results.push({ ...entry, status: "error", card: null, prints: [], selectedPrint: null });
      }
      await new Promise(r => setTimeout(r, 80));
    }
    setEntries(results);
    setResolved(true);
    setLoading(false);
    setLoadMsg("");
  };

  const updateQty = (i, val) => setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, qty: Math.max(1, Math.min(20, Number(val))) } : e));
  const toggleExclude = (i) => setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, excluded: !e.excluded } : e));
  const selectPrint = (entryIdx, card) => setEntries(prev => prev.map((e, i) => i === entryIdx ? { ...e, selectedPrint: card, card } : e));

  const addAll = async () => {
    const toAdd = entries.filter(e => e.status === "found" && !e.excluded);
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
        for (let i = 0; i < entry.qty; i++) items.push({ id: card.id + "_" + i + "_" + Math.random(), name: card.name, url: lu, file, srcType: "scryfall", thumb: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small });
      } catch {
        for (let i = 0; i < entry.qty; i++) items.push({ id: card.id + "_" + i + "_" + Math.random(), name: card.name, url: imgUrl, srcType: "scryfall", thumb: card.image_uris?.small });
      }
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
              const isArtOpen = expandedArt === i;
              
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
                    <div className="bulk-info">
                      <div className="bulk-title">{(entry.selectedPrint || entry.card)?.name || entry.name}</div>
                      {entry.status === "found" && (
                        <div className="bulk-meta">
                          {(entry.selectedPrint || entry.card)?.set_name} · {(entry.selectedPrint || entry.card)?.artist} · <span className="text-accent">{entry.prints.length} stampe</span>
                        </div>
                      )}
                      {entry.status === "not_found" && <div className="text-error text-xs mt-1">Carta non trovata</div>}
                    </div>
                    
                    {entry.status === "found" && entry.prints.length > 1 && (
                      <button onClick={() => setExpandedArt(isArtOpen ? null : i)} className={`btn-outline-accent text-xs ${isArtOpen ? 'active' : ''}`}>
                        🎨 {isArtOpen ? "Chiudi" : "Scegli art"}
                      </button>
                    )}
                    {entry.status === "found" && (
                      <input type="number" min={1} max={20} value={entry.qty} onChange={e => updateQty(i, e.target.value)} className="form-input qty-input" />
                    )}
                    {entry.status === "found" && (
                      <button onClick={() => toggleExclude(i)} className="btn-icon">
                        {entry.excluded ? "↩" : "✕"}
                      </button>
                    )}
                  </div>

                  {isArtOpen && entry.prints.length > 0 && (
                    <div className="bulk-art-picker">
                      <div className="panel-hint mb-2">{entry.prints.length} stampe disponibili — clicca per scegliere</div>
                      {(() => {
                        const grouped = {};
                        for (const c of entry.prints) {
                          if (!grouped[c.name]) grouped[c.name] = [];
                          grouped[c.name].push(c);
                        }
                        const names = Object.keys(grouped);
                        return (
                          <div className="card-groups-container">
                            <div className="card-groups-grid">
                              {names.map(cardName => {
                                const cardPrints = grouped[cardName];
                                const isGroupExp = expandedArt === `${i}_${cardName}`;
                                const rep = cardPrints[0];
                                const repThumb = rep.image_uris?.small || rep.card_faces?.[0]?.image_uris?.small;
                                const isCurrent = cardPrints.some(p => (entry.selectedPrint || entry.card)?.id === p.id);
                                return (
                                  <div key={cardName} className="card-group">
                                    <div onClick={() => setExpandedArt(isGroupExp ? i : `${i}_${cardName}`)} className={`card-group-header ${isGroupExp ? 'expanded' : ''}`}>
                                      <img src={repThumb} alt={cardName} />
                                      <div className="card-group-info">
                                        <div className="card-group-title">{cardName}</div>
                                        <div className="card-group-meta">
                                          {cardPrints.length} stampa{cardPrints.length > 1 ? "e" : ""}
                                          {isCurrent && <span className="text-accent ml-1">· selezionata</span>}
                                        </div>
                                      </div>
                                      {cardPrints.length === 1 && (
                                        <button onClick={e => { e.stopPropagation(); selectPrint(i, rep); setExpandedArt(i); }} className={`btn-outline-accent text-xs ${isCurrent ? 'active' : ''}`}>
                                          {isCurrent ? "✓ Selezionata" : "Usa questa"}
                                        </button>
                                      )}
                                      <span className="expand-icon">{isGroupExp ? "▲" : "▼"}</span>
                                    </div>
                                    {isGroupExp && (
                                      <div className="card-group-content" style={{ maxHeight: 260 }}>
                                        <div className="print-grid mini">
                                          {cardPrints.map(card => {
                                            const t = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small;
                                            const isSel = (entry.selectedPrint || entry.card)?.id === card.id;
                                            return (
                                              <div key={card.id} onClick={() => { selectPrint(i, card); setExpandedArt(i); }} className={`print-card ${isSel ? "selected" : ""}`}>
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
            <button onClick={addAll} disabled={loading} className={`btn btn-block mt-3 ${loading ? "btn-disabled" : "btn-primary"}`}>
              {loading ? `⏳ ${loadMsg}` : `➕ Aggiungi ${totalCopies} cop${totalCopies === 1 ? "ia" : "ie"} alla coda (${foundCount} carte)`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
