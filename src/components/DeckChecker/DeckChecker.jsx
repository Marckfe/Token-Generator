import React, { useState, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Info, 
  FileText, 
  Download, 
  Search,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import './DeckChecker.css';
import { useLanguage } from '../../context/LanguageContext';

const FORMATS = [
  { id: 'commander', name: 'Commander' },
  { id: 'duel', name: 'Duel Commander' },
  { id: 'modern', name: 'Modern' },
  { id: 'standard', name: 'Standard' },
  { id: 'pioneer', name: 'Pioneer' },
  { id: 'pauper', name: 'Pauper' },
  { id: 'legacy', name: 'Legacy' },
  { id: 'vintage', name: 'Vintage' },
  { id: 'premodern', name: 'Premodern' },
  { id: 'oldschool', name: 'Oldschool' }
];

export default function DeckChecker({ onAddToQueue }) {
  const { t } = useLanguage();
  const [selectedFormat, setSelectedFormat] = useState('commander');
  const [maindeck, setMaindeck] = useState('');
  const [sideboard, setSideboard] = useState('');
  const [commander1, setCommander1] = useState('');
  const [commander2, setCommander2] = useState('');
  const [cmdSuggestions, setCmdSuggestions] = useState([]);
  
  const searchTimeout = useRef(null);

  const isSingleton = selectedFormat === 'commander' || selectedFormat === 'duel' || selectedFormat === 'brawl';

  const handleCmdSearch = (val, setter) => {
    setter(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (val.length >= 3) {
      searchTimeout.current = setTimeout(async () => {
        try {
          const res = await fetch(`https://api.scryfall.com/cards/search?q=is:commander+(f:duel+or+f:commander)+${encodeURIComponent(val)}`);
          const data = await res.json();
          if (data.data) {
            setCmdSuggestions(data.data.map(c => c.name));
          }
        } catch (e) {}
      }, 400);
    }
  };

  const [playerData, setPlayerData] = useState({
    lastName: '', firstName: '', playerId: '', date: '', event: '', deckName: '', deckDesigner: ''
  });

  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState(null); 
  const [parsedDeck, setParsedDeck] = useState({ main: [], cmd: [] }); 

  const parseLines = (text) => {
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Skip comment lines (// or #)
        if (line.startsWith('//') || line.startsWith('#')) return null;

        let cleanLine = line.replace(/\s+\([a-zA-Z0-9_]+\)\s*.*$/i, '').trim();
        const match = cleanLine.match(/^(\d+)x?\s+(.+)$/i);
        let name = match ? match[2].trim() : cleanLine.trim();
        let qty = match ? parseInt(match[1], 10) : 1;
        name = name.split(/\s*\/\/?\s*/)[0].trim();

        // Skip section headers: ALL CAPS lines like "21 LANDS", "10 CREATURES", "25 INSTANTS and SORC."
        if (name && name === name.toUpperCase() && /[A-Z]/.test(name)) return null;

        return { qty, name };
      })
      .filter(Boolean)
      .filter(e => e.name && e.name.length > 1);
  };

  const handleCheck = async () => {
    setChecking(true);
    setResults(null);
    
    const mainLines = parseLines(maindeck);
    const cmdLines = [];
    
    if (isSingleton) {
      if (commander1.trim()) cmdLines.push({ qty: 1, name: commander1.trim().split(/\s*\/\/?\s*/)[0].trim() });
      if (commander2.trim()) cmdLines.push({ qty: 1, name: commander2.trim().split(/\s*\/\/?\s*/)[0].trim() });
    } else {
      cmdLines.push(...parseLines(sideboard));
    }
    
    const allCards = [...mainLines, ...cmdLines];
    if (allCards.length === 0) {
      setChecking(false);
      return;
    }

    try {
      const uniqueNames = [...new Set(allCards.map(c => c.name))];
      let fetchedCards = [];
      
      for (let i = 0; i < uniqueNames.length; i += 75) {
        const chunk = uniqueNames.slice(i, i + 75).map(name => ({ name }));
        const response = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: chunk })
        });
        const data = await response.json();
        fetchedCards = fetchedCards.concat(data.data);
      }

      const cardInfoMap = {}; 
      fetchedCards.forEach(c => { 
        cardInfoMap[c.name.toLowerCase()] = {
          legalities: c.legalities,
          type: c.type_line,
          fullName: c.name
        }; 
      });

      // FALLBACK for missing cards (Fuzzy search)
      for (const item of allCards) {
        if (!cardInfoMap[item.name.toLowerCase()]) {
          try {
            const fRes = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(item.name)}`);
            const fData = await fRes.json();
            if (fData.object === 'card') {
              cardInfoMap[item.name.toLowerCase()] = {
                legalities: fData.legalities,
                type: fData.type_line,
                fullName: fData.name
              };
            }
          } catch (e) {
            console.warn(`Fuzzy lookup failed for ${item.name}`);
          }
        }
      }

      const enrichedMain = mainLines.map(item => {
        const info = cardInfoMap[item.name.toLowerCase()];
        return {
          ...item,
          name: info ? info.fullName : item.name,
          type: info ? info.type : 'Unknown'
        };
      });
      const enrichedCmd = cmdLines.map(item => {
        const info = cardInfoMap[item.name.toLowerCase()];
        return {
          ...item,
          name: info ? info.fullName : item.name,
          type: info ? info.type : 'Unknown'
        };
      });

      setParsedDeck({ main: enrichedMain, cmd: enrichedCmd });

      const newResults = { status: 'legal', reasons: [] };
      allCards.forEach(item => {
        const info = cardInfoMap[item.name.toLowerCase()];
        if (!info) {
          newResults.status = 'banned';
          newResults.reasons.push({ name: item.name, reason: t('checker.not_found') });
          return;
        }
        
        const l = info.legalities[selectedFormat];
        if (l === 'not_legal' || l === 'banned') {
          newResults.status = 'banned';
          newResults.reasons.push({ name: info.fullName, reason: l === 'not_legal' ? t('checker.not_legal') : t('checker.banned') });
        } else if (selectedFormat === 'duel' && l === 'restricted') {
          newResults.status = 'banned';
          newResults.reasons.push({ name: info.fullName, reason: t('checker.banned_commander') });
        }
      });

      setResults(newResults);
    } catch (e) {
      console.error(e);
      alert(t('common.error'));
    }
    setChecking(false);
  };

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    // Header Logo & Title
    doc.setFillColor(0, 188, 212);
    doc.circle(20, 15, 6, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.text("M", 20, 16.2, { align: "center" });
    doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text(t('checker.official_sheet'), 105, 16, { align: "center" });

    // Player Info Grid
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    const drawField = (label, val, x, y, w) => {
      doc.setFont("helvetica", "bold"); doc.text(label + ":", x, y);
      doc.setFont("helvetica", "normal"); doc.text(val || "________________", x + 30, y);
      doc.setDrawColor(200); doc.line(x + 30, y + 1, x + w, y + 1);
    };

    drawField(t('checker.last_name'), playerData.lastName, 20, 30, 80);
    drawField(t('checker.first_name'), playerData.firstName, 110, 30, 80);
    drawField(t('checker.player_id'), playerData.playerId, 20, 38, 80);
    drawField(t('checker.date'), playerData.date, 110, 38, 80);
    drawField(t('checker.deck_name'), playerData.deckName, 20, 46, 80);
    drawField(t('checker.event_name'), playerData.event, 110, 46, 80);

    // Categories Logic
    const categorize = (deck) => {
      const groups = {
        Land: [],
        Creature: [],
        "Instant/Sorcery": [],
        Other: []
      };
      deck.forEach(c => {
        const type = c.type.toLowerCase();
        if (type.includes("land")) groups.Land.push(c);
        else if (type.includes("creature")) groups.Creature.push(c);
        else if (type.includes("instant") || type.includes("sorcery")) groups["Instant/Sorcery"].push(c);
        else groups.Other.push(c);
      });
      return groups;
    };

    const mainGroups = categorize(parsedDeck.main);
    const isSingleton = selectedFormat === 'commander' || selectedFormat === 'duel';
    
    let currentY = 60;
    let colX = 20;
    const colW = 85;

    const drawSection = (title, items, x, y) => {
      if (items.length === 0) return y;
      const total = items.reduce((sum, i) => sum + i.qty, 0);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240); doc.rect(x - 2, y - 4, colW + 4, 6, 'F');
      doc.text(`${title.toUpperCase()} (${total})`, x, y);
      doc.setFont("helvetica", "normal");
      let nextY = y + 5;
      doc.setFontSize(8); // Smaller font for card list
      items.forEach(item => {
        if (nextY > 280) return; // Basic overflow protection
        doc.text(item.qty.toString(), x, nextY);
        doc.text(item.name.substring(0, 40), x + 6, nextY);
        doc.setDrawColor(230); doc.line(x, nextY + 0.5, x + colW, nextY + 0.5);
        nextY += 4.5; // Tighter line height
      });
      return nextY + 6;
    };

    // 1. COMMANDERS AT TOP (if singleton)
    let startY = 60;
    if (isSingleton && parsedDeck.cmd.length > 0) {
      startY = drawSection(t('checker.cat_commanders'), parsedDeck.cmd, 20, 60);
    }

    // 2. MAIN DECK COLUMNS
    let y1 = drawSection(t('checker.cat_creatures'), mainGroups.Creature, 20, startY);
    y1 = drawSection(t('checker.cat_lands'), mainGroups.Land, 20, y1);

    let y2 = drawSection(t('checker.cat_instants'), mainGroups["Instant/Sorcery"], 110, startY);
    y2 = drawSection(t('checker.cat_other'), mainGroups.Other, 110, y2);

    let finalY = Math.max(y1, y2) + 10;

    // 3. SIDEBOARD AT BOTTOM (if not singleton)
    if (!isSingleton && parsedDeck.cmd.length > 0) {
      if (finalY > 270) finalY = 270;
      finalY = drawSection(t('checker.cat_sideboard'), parsedDeck.cmd, 20, finalY);
    }

    // Totals Footer
    const totalMain = parsedDeck.main.reduce((sum, i) => sum + i.qty, 0);
    const totalSide = parsedDeck.cmd.reduce((sum, i) => sum + i.qty, 0);
    const grandTotal = totalMain + totalSide;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const footerY = Math.min(290, Math.max(finalY + 5, 285));
    
    doc.text(t('checker.footer_main', { count: totalMain }), 20, footerY);
    doc.text(t(isSingleton ? 'checker.footer_cmd' : 'checker.footer_side', { count: totalSide }), 60, footerY);
    doc.setFillColor(0, 188, 212); // Cyan accent
    doc.setTextColor(255);
    doc.rect(108, footerY - 5, 82, 7, 'F');
    doc.text(t('checker.grand_total', { count: grandTotal }), 110, footerY);
    doc.setTextColor(0);
    
    doc.save(`${playerData.lastName}_Registration.pdf`);
  };

  return (
    <div className="deck-checker-container">
      <div className="deck-checker-sidebar">
        {/* 1. DATI TORNEO (IN ALTO) */}
        <div className="sidebar-panel-title flex items-center gap-2">
          <FileText size={18} />
          <span>{t('checker.tournament_data')}</span>
        </div>
        <div className="p-4 bg-[var(--surface2)] rounded-xl border border-[var(--border)] mb-6">
          <div className="flex gap-2 mb-2">
            <input type="text" className="control-input" placeholder={t('checker.last_name')} value={playerData.lastName} onChange={e => setPlayerData({...playerData, lastName: e.target.value})} />
            <input type="text" className="control-input" placeholder={t('checker.first_name')} value={playerData.firstName} onChange={e => setPlayerData({...playerData, firstName: e.target.value})} />
          </div>
          <div className="flex gap-2 mb-2">
            <input type="text" className="control-input" placeholder={t('checker.player_id')} value={playerData.playerId} onChange={e => setPlayerData({...playerData, playerId: e.target.value})} />
            <input type="date" className="control-input" value={playerData.date} onChange={e => setPlayerData({...playerData, date: e.target.value})} />
          </div>
          <div className="mb-2">
            <input type="text" className="control-input" placeholder={t('checker.event_name')} value={playerData.event} onChange={e => setPlayerData({...playerData, event: e.target.value})} />
          </div>
          <div className="flex gap-2 mb-4">
            <input type="text" className="control-input" placeholder={t('checker.deck_name')} value={playerData.deckName} onChange={e => setPlayerData({...playerData, deckName: e.target.value})} />
            <input type="text" className="control-input" placeholder={t('checker.designer')} value={playerData.deckDesigner} onChange={e => setPlayerData({...playerData, deckDesigner: e.target.value})} />
          </div>
          <div className="flex justify-center mt-6">
            <button
              className="btn btn-primary px-8 py-4 font-bold shadow-xl transition-all hover:scale-105"
              onClick={generatePDF}
              disabled={!parsedDeck.main.length && !parsedDeck.cmd.length}
              style={{ 
                opacity: (!parsedDeck.main.length && !parsedDeck.cmd.length) ? 0.3 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <Download size={20} />
              {t('checker.export_pdf')}
            </button>
          </div>
        </div>

        {/* 2. SELEZIONE FORMATO */}
        <div className="sidebar-panel-title flex items-center gap-2">
          <ShieldCheck size={18} />
          <span>{t('checker.legality_analysis')}</span>
        </div>

        <div className="control-field mb-6 px-1">
          <label className="control-label mb-2">{t('checker.select_format')}</label>
          <div className="format-selector">
            {FORMATS.map(f => (
              <button 
                key={f.id} 
                className={`format-btn ${selectedFormat === f.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedFormat(f.id);
                  setResults(null); // Reset results when changing format
                }}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
        
        {/* 3. INSERIMENTO CARTE */}
        <div className="control-field mb-4">
          <label className="control-label">{t('checker.maindeck_list')}</label>
          <textarea 
            className="control-input" 
            rows={isSingleton ? 10 : 7} 
            placeholder="es. 4x Brainstorm&#10;1 Lightning Bolt" 
            value={maindeck} 
            onChange={e => setMaindeck(e.target.value)}
          ></textarea>
        </div>

        {isSingleton ? (
          <div className="control-field mb-6">
            <label className="control-label">{t('checker.commanders')}</label>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-3 opacity-40" />
              <input 
                type="text" 
                className="control-input pl-9" 
                placeholder={t('checker.commander_placeholder', { n: 1 })} 
                value={commander1} 
                onChange={e => handleCmdSearch(e.target.value, setCommander1)} 
                list="cmd-list" 
              />
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-3 opacity-40" />
              <input 
                type="text" 
                className="control-input pl-9" 
                placeholder={t('checker.partner_placeholder')} 
                value={commander2} 
                onChange={e => handleCmdSearch(e.target.value, setCommander2)} 
                list="cmd-list" 
              />
            </div>
            <datalist id="cmd-list">
              {cmdSuggestions.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
        ) : (
          <div className="control-field mb-6">
            <label className="control-label">{t('checker.sideboard')}</label>
            <textarea 
              className="control-input" 
              rows={4} 
              placeholder="es. 3x Duress&#10;1 Pyroblast" 
              value={sideboard} 
              onChange={e => setSideboard(e.target.value)}
            ></textarea>
          </div>
        )}

        <button className="btn btn-primary w-full py-4 text-lg font-bold shadow-lg" onClick={handleCheck} disabled={checking}>
          {checking ? <Clock className="animate-spin mr-2" /> : <ShieldCheck className="mr-2" />}
          {checking ? t('checker.checking') : t('checker.check_button')}
        </button>
      </div>

      <div className="deck-checker-main">
        {results ? (
          <div className="check-result-hero">
            <div className="status-badge">
              {results.status === 'legal' ? <CheckCircle2 size={80} color="var(--success)" /> : <XCircle size={80} color="var(--error)" />}
            </div>
            <h2 className={`status-title ${results.status}`}>
              {results.status === 'legal' ? t('checker.legal_title') : t('checker.not_legal_title')}
            </h2>
            <p className="format-name-hero">{t('checker.format_label', { format: FORMATS.find(f => f.id === selectedFormat)?.name })}</p>

            {results.status === 'legal' ? (
              <div className="p-8 bg-[var(--success-hl)] rounded-2xl border border-[var(--success)]/20 max-w-md">
                <ShieldCheck size={40} className="mx-auto mb-4 opacity-40" />
                <p className="text-lg">{t('checker.legal_desc')}</p>
              </div>
            ) : (
              <div className="banned-list-container">
                <div className="banned-list-title">
                  <AlertTriangle size={18} />
                  <span>{t('checker.issues_found', { count: results.reasons.length })}</span>
                </div>
                <div className="banned-items-list">
                  {results.reasons.map((r, i) => (
                    <div key={i} className="banned-item">
                      <span className="card-name">{r.name}</span>
                      <span className="ban-reason">{r.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex gap-4 mt-12">
              <button className="btn btn-ghost opacity-50 hover:opacity-100" onClick={() => setResults(null)}>
                {t('checker.new_analysis')}
              </button>
              <button 
                className="btn btn-accent flex items-center gap-2" 
                onClick={async () => {
                  const items = [];
                  const all = [...parsedDeck.main, ...parsedDeck.cmd];
                  for (const card of all) {
                    try {
                      const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}`);
                      const data = await res.json();
                      const imgUrl = data.image_uris?.normal || data.card_faces?.[0]?.image_uris?.normal;
                      if (!imgUrl) continue;
                      for (let i = 0; i < card.qty; i++) {
                        items.push({
                          id: data.id + "_" + i + "_" + Math.random(),
                          name: data.name,
                          url: imgUrl,
                          thumb: data.image_uris?.small || data.card_faces?.[0]?.image_uris?.small,
                          srcType: "scryfall",
                          set: data.set_name
                        });
                      }
                    } catch (e) {}
                  }
                  if (items.length > 0) {
                    onAddToQueue(items);
                  }
                }}
              >
                <Download size={18} />
                {t('checker.add_all_to_queue')}
              </button>
            </div>
          </div>
        ) : (
          <div className="deck-checker-empty">
            <ShieldCheck size={100} className="empty-icon opacity-10 mb-6" />
            <h3 className="text-2xl font-black uppercase opacity-20">{t('checker.waiting_title')}</h3>
            <p className="max-w-xs mt-4 text-center opacity-40">{t('checker.waiting_desc')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
