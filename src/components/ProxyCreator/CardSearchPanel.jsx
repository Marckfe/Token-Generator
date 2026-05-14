import React, { useState, useRef, useMemo } from "react";
import { fetchSuggestions } from "../../utils/scryfallApi";
import { useLanguage } from "../../context/LanguageContext";

function PrintGrid({ prints, selected, onToggle, onQty }) {
  if (!prints.length) return null;
  return (
    <div className="print-grid">
      {prints.map(card => {
        const thumb = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small;
        const isOn = !!selected[card.id];
        const artist = card.artist || "";
        const yr = card.released_at?.slice(0, 4) || "";
        const border = card.border_color === "borderless" ? "🔲" : card.frame_effects?.includes("extendedart") ? "🖼" : "";
        return (
          <div key={card.id} onClick={() => onToggle(card)} className={`print-card ${isOn ? "selected" : ""}`}>
            <img src={thumb} alt={card.name} />
            <div className="print-info">
              <div className="print-set">{border}{card.set_name} {yr && `'${yr.slice(2)}`}</div>
              <div className="print-artist">{artist}</div>
            </div>
            {isOn && (
              <>
                <div className="check-badge">✓</div>
                <div className="qty-input-wrapper" onClick={e => e.stopPropagation()}>
                  <input type="number" min={1} max={20} value={selected[card.id].qty} onChange={e => onQty(card.id, e.target.value)} />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CardSearchPanel({ onAddCards }) {
  const { t, lang } = useLanguage();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggs] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const [loadingSugg, setLdSugg] = useState(false);
  const [prints, setPrints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState({});
  const [expandedName, setExpandedName] = useState(null);
  const suggTimer = useRef(null);

  const fetchSuggs = (val) => {
    clearTimeout(suggTimer.current);
    if (val.length < 2) { setSuggs([]); return; }
    setLdSugg(true);
    suggTimer.current = setTimeout(async () => {
      const s = await fetchSuggestions(val);
      setSuggs(s);
      setLdSugg(false);
    }, 220);
  };

  const handleInput = (val) => {
    setQuery(val);
    setShowSugg(true);
    setPrints([]);
    setError("");
    setSelected({});
    setExpandedName(null);
    fetchSuggs(val);
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

  const grouped = useMemo(() => {
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
      ? (() => { const n = { ...prev }; delete n[card.id]; return n; })()
      : { ...prev, [card.id]: { qty: 1, card } }
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
        for (let i = 0; i < qty; i++) {
          items.push({
            id: card.id + "_" + i + "_" + Math.random(), name: card.name, url: lu, file, srcType: "scryfall",
            thumb: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small, set: card.set_name
          });
        }
      } catch {
        for (let i = 0; i < qty; i++) {
          items.push({
            id: card.id + "_" + i + "_" + Math.random(), name: card.name, url: imgUrl, srcType: "scryfall",
            thumb: card.image_uris?.small
          });
        }
      }
    }
    onAddCards(items);
    setSelected({}); setPrints([]); setQuery(""); setSuggs([]);
  };

  const selCount = Object.values(selected).reduce((a, { qty }) => a + qty, 0);
  const selPrints = Object.keys(selected).length;

  return (
    <div className="panel-container" style={{ background: 'transparent', border: 'none', padding: 0, boxShadow: 'none', animation: 'none' }}>
      <div className="search-box-wrapper">
        <div className="search-input-group">
          <div className="search-input-container">
            <input
              value={query} onChange={e => handleInput(e.target.value)}
              onKeyDown={handleKey}
              onFocus={() => query.length >= 2 && setShowSugg(true)}
              onBlur={() => setTimeout(() => setShowSugg(false), 180)}
              placeholder={t('proxy.search_placeholder')}
              className="form-input search-input"
            />
            {loadingSugg && <div className="spinner-small absolute-right"></div>}
          </div>
          <button
            onClick={() => query.trim() && searchCard(query.trim())}
            disabled={loading || !query.trim()}
            className="btn btn-primary"
          >
            {loading ? "…" : t('common.search')}
          </button>
        </div>

        {showSugg && suggestions.length > 0 && (
          <div className="suggestions-dropdown">
            {suggestions.map((s, i) => (
              <div key={i} onMouseDown={() => searchCard(s)} className="suggestion-item">
                <span className="suggestion-icon">🃏</span>{s}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {loading && (
        <div className="loading-status">
          <div className="spinner-small"></div>
          {loadMsg}
        </div>
      )}
      
      {!loading && prints.length > 0 && (
        <div className="results-info">
          <strong className="text-accent">{prints.length}</strong> {t('proxy.cards_found', { count: prints.length, cards: cardNames.length })}
          {t('proxy.grid_hint')}
        </div>
      )}

      {cardNames.length > 0 && (
        <div className="card-groups-container">
          <div className="card-groups-grid">
            {cardNames.map(cardName => {
              const cardPrints = grouped[cardName];
              const isExp = expandedName === cardName;
              const rep = cardPrints[0];
              const repThumb = rep.image_uris?.small || rep.card_faces?.[0]?.image_uris?.small;
              const selForCard = cardPrints.filter(p => selected[p.id]);
              const totalQtyForCard = selForCard.reduce((s, p) => s + (selected[p.id]?.qty || 0), 0);

              const suffix = totalQtyForCard === 1 ? (lang === 'it' ? 'ia' : 'y') : (lang === 'it' ? 'ie' : 'ies');
              return (
                <div key={cardName} className="card-group">
                  <div onClick={() => setExpandedName(isExp ? null : cardName)} className={`card-group-header ${isExp ? 'expanded' : ''}`}>
                    <img src={repThumb} alt={cardName} />
                    <div className="card-group-info">
                      <div className="card-group-title">{cardName}</div>
                      <div className="card-group-meta">
                        {cardPrints.length} stampa{cardPrints.length > 1 ? "e" : ""} disponibili
                        {selForCard.length > 0 && (
                          <span className="text-success ml-2">· {totalQtyForCard} cop{suffix}</span>
                        )}
                      </div>
                    </div>
                    <span className="expand-icon">{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div className="card-group-content">
                      <div className="card-group-hint">
                        {cardPrints.length} stampe — clicca per selezionare, modifica la quantità
                      </div>
                      <div className="print-grid-scroll">
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
        <button onClick={addSelected} className="btn btn-primary btn-block mt-3">
          {t('proxy.add_to_queue', { count: selCount, suffix: selCount === 1 ? (lang === 'it' ? 'ia' : 'y') : (lang === 'it' ? 'ie' : 'ies') })} ({selPrints} {t('common.type')}{selPrints === 1 ? "" : "s"})
        </button>
      )}
    </div>
  );
}
