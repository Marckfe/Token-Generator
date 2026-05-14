import React, { useState, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import {
  ShieldCheck, AlertTriangle, FileText, Download,
  Search, CheckCircle2, XCircle, Clock, Plus,
  CheckCircle, ShieldAlert
} from 'lucide-react';
import './DeckChecker.css';
import { useLanguage } from '../../context/LanguageContext';

const FORMATS = [
  { id: 'commander',  name: 'Commander' },
  { id: 'duel',       name: 'Duel Cmdr' },
  { id: 'modern',     name: 'Modern' },
  { id: 'standard',   name: 'Standard' },
  { id: 'pioneer',    name: 'Pioneer' },
  { id: 'pauper',     name: 'Pauper' },
  { id: 'legacy',     name: 'Legacy' },
  { id: 'vintage',    name: 'Vintage' },
  { id: 'premodern',  name: 'Premodern' },
  { id: 'oldschool',  name: 'Oldschool' }
];

export default function DeckChecker({ onAddToQueue, initialDeck }) {
  const { t } = useLanguage();
  const [selectedFormat, setSelectedFormat] = useState('commander');
  const [maindeck, setMaindeck] = useState('');
  const [sideboard, setSideboard] = useState('');
  const [commander1, setCommander1] = useState('');
  const [commander2, setCommander2] = useState('');
  const [cmdSuggestions, setCmdSuggestions] = useState([]);
  const [playerData, setPlayerData] = useState({
    lastName: '', firstName: '', playerId: '', date: '', event: '', deckName: '', deckDesigner: ''
  });
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState(null);
  const [parsedDeck, setParsedDeck] = useState({ main: [], cmd: [] });
  const [importedBanner, setImportedBanner] = useState(false);
  const searchTimeout = useRef(null);

  const isSingleton = ['commander', 'duel', 'brawl'].includes(selectedFormat);

  // ── Accept pre-filled deck from DeckScanner ──────────────────────
  useEffect(() => {
    if (initialDeck) {
      if (initialDeck.maindeck) setMaindeck(initialDeck.maindeck);
      if (initialDeck.sideboard) setSideboard(initialDeck.sideboard);
      setImportedBanner(true);
      setTimeout(() => setImportedBanner(false), 4000);
    }
  }, [initialDeck]);

  // ── Commander autocomplete ────────────────────────────────────────
  const handleCmdSearch = (val, setter) => {
    setter(val);
    clearTimeout(searchTimeout.current);
    if (val.length >= 3) {
      searchTimeout.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `https://api.scryfall.com/cards/search?q=is:commander+(f:duel+or+f:commander)+${encodeURIComponent(val)}`
          );
          const data = await res.json();
          if (data.data) setCmdSuggestions(data.data.slice(0, 8).map(c => c.name));
        } catch { /* ignore */ }
      }, 350);
    } else {
      setCmdSuggestions([]);
    }
  };

  // ── Parse deck list text ──────────────────────────────────────────
  const parseLines = (text) => {
    const EXCLUDED_KEYWORDS = [
      'creatures', 'instants', 'sorceries', 'lands', 'artifacts', 'enchantments', 
      'planeswalkers', 'sideboard', 'commander', 'maybeboard', 'tokens', 'other',
      'and', 'spells'
    ];

    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//') && !line.startsWith('#'))
      .map(line => {
        // Remove set info like (M21) or collector numbers
        const clean = line.replace(/\s+\([a-zA-Z0-9_]+\)\s*.*$/i, '').trim();
        const m = clean.match(/^(\d+)x?\s+(.+)$/i);
        const name = (m ? m[2] : clean).split(/\s*\/\/??\s*/)[0].trim();
        const qty = m ? parseInt(m[1], 10) : 1;

        if (!name || name.length < 3) return null;

        // Skip if line is all caps (often a header)
        if (name === name.toUpperCase() && /[A-Z]/.test(name)) return null;

        // Skip if name is just a common category header
        const lowerName = name.toLowerCase();
        if (EXCLUDED_KEYWORDS.some(k => lowerName === k || lowerName.includes(k + ' and ') || lowerName.includes(' and ' + k))) {
          // If it has a number at start, it might be a card, otherwise it's likely a header
          if (!m) return null;
        }

        return { qty, name };
      })
      .filter(Boolean);
  };

  // ── Main check logic ──────────────────────────────────────────────
  const handleCheck = async () => {
    setChecking(true);
    setResults(null);

    const mainLines = parseLines(maindeck);
    const cmdLines = isSingleton
      ? [
          commander1.trim() ? { qty: 1, name: commander1.trim().split(/\s*\/\/??\s*/)[0].trim() } : null,
          commander2.trim() ? { qty: 1, name: commander2.trim().split(/\s*\/\/??\s*/)[0].trim() } : null
        ].filter(Boolean)
      : parseLines(sideboard);

    if (mainLines.length === 0 && cmdLines.length === 0) {
      setChecking(false);
      return;
    }

    try {
      const allCards = [...mainLines, ...cmdLines];
      const uniqueNames = [...new Set(allCards.map(c => c.name))];

      // Batch lookup
      let fetchedCards = [];
      for (let i = 0; i < uniqueNames.length; i += 75) {
        const chunk = uniqueNames.slice(i, i + 75).map(name => ({ name }));
        const res = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: chunk })
        });
        const data = await res.json();
        if (data.data) fetchedCards = fetchedCards.concat(data.data);
      }

      const cardMap = {};
      fetchedCards.forEach(c => {
        cardMap[c.name.toLowerCase()] = { legalities: c.legalities, type: c.type_line, fullName: c.name };
      });

      // Fuzzy fallback for not found
      const missing = allCards.filter(c => !cardMap[c.name.toLowerCase()]);
      await Promise.all(missing.map(async item => {
        try {
          const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(item.name)}`);
          const d = await res.json();
          if (d.object === 'card') {
            cardMap[item.name.toLowerCase()] = { legalities: d.legalities, type: d.type_line, fullName: d.name };
          }
        } catch { /* ignore */ }
      }));

      const mergeItems = (items) => {
        const map = {};
        items.forEach(item => {
          const key = item.name.toLowerCase();
          if (map[key]) {
            map[key].qty += item.qty;
          } else {
            map[key] = { ...item };
          }
        });
        return Object.values(map);
      };

      const enrichedMain = mergeItems(enrich(mainLines));
      const enrichedCmd = mergeItems(enrich(cmdLines));
      setParsedDeck({ main: enrichedMain, cmd: enrichedCmd });

      const isSingletonFormat = selectedFormat === 'commander' || selectedFormat === 'duel';
      const allEnriched = [...enrichedMain, ...enrichedCmd];
      
      allEnriched.forEach(item => {
        const info = cardMap[item.name.toLowerCase()];
        if (!info) {
          verdict.status = 'banned';
          verdict.reasons.push({ name: item.name, reason: t('checker.not_found') });
          return;
        }

        // Singleton check
        if (isSingletonFormat && item.qty > 1 && !info.type.toLowerCase().includes('basic land')) {
          verdict.status = 'banned';
          verdict.reasons.push({ name: info.fullName, reason: `${t('checker.singleton_violation')} (${item.qty}x)` });
        }

        const l = info.legalities[selectedFormat];
        if (l === 'not_legal') {
          verdict.status = 'banned';
          verdict.reasons.push({ name: info.fullName, reason: t('checker.not_legal') });
        } else if (l === 'banned' || (selectedFormat === 'duel' && l === 'restricted')) {
          verdict.status = 'banned';
          verdict.reasons.push({ name: info.fullName, reason: t('checker.banned') });
        }
      });

      setResults(verdict);
    } catch (e) {
      console.error(e);
    }
    setChecking(false);
  };

  // ── Generate PDF ──────────────────────────────────────────────────
  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Header with MTG Logo
    const logoUrl = 'https://raw.githubusercontent.com/filipekiss/mtg-icons/master/png/128/mtg.png';
    try {
      doc.addImage(logoUrl, 'PNG', 15, 10, 10, 10);
    } catch (e) {
      doc.setFillColor(0, 0, 0);
      doc.rect(15, 10, 10, 10, 'F');
      doc.setTextColor(255); doc.setFontSize(8);
      doc.text('MTG', 20, 16.5, { align: 'center' });
    }

    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(t('checker.official_sheet').toUpperCase(), 105, 17, { align: 'center' });

    const drawField = (label, val, x, y, w) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text(label.toUpperCase() + ':', x, y);
      doc.setFont('helvetica', 'normal');
      doc.text(val || '', x + 35, y);
      doc.setDrawColor(180); doc.line(x + 35, y + 1, x + w, y + 1);
    };
    drawField(t('checker.last_name'),  playerData.lastName,  20,  30, 95);
    drawField(t('checker.first_name'), playerData.firstName, 110, 30, 190);
    drawField(t('checker.player_id'),  playerData.playerId,  20,  38, 95);
    drawField(t('checker.date'),       playerData.date,      110, 38, 190);
    drawField(t('checker.deck_name'),  playerData.deckName,  20,  46, 95);
    drawField(t('checker.event_name'), playerData.event,     110, 46, 190);

    const categorize = (deck) => {
      const g = { Land: [], Creature: [], 'Instant/Sorcery': [], Other: [] };
      deck.forEach(c => {
        const t = c.type.toLowerCase();
        if (t.includes('land')) g.Land.push(c);
        else if (t.includes('creature')) g.Creature.push(c);
        else if (t.includes('instant') || t.includes('sorcery')) g['Instant/Sorcery'].push(c);
        else g.Other.push(c);
      });
      return g;
    };

    const drawSection = (title, items, x, y) => {
      if (!items.length) return y;
      const total = items.reduce((s, i) => s + i.qty, 0);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.setFillColor(0, 0, 0); doc.rect(x - 2, y - 4, 87, 5.5, 'F');
      doc.setTextColor(255);
      doc.text(`${title.toUpperCase()} (${total})`, x, y);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      let ny = y + 4.5;
      items.forEach(item => {
        if (ny > 282) return; // Almost end of A4
        doc.setFont('helvetica', 'bold'); doc.text(String(item.qty), x, ny);
        doc.setFont('helvetica', 'normal'); doc.text(item.name.substring(0, 42), x + 5, ny);
        doc.setDrawColor(235); doc.line(x, ny + 0.4, x + 85, ny + 0.4);
        ny += 4.0; // Tighter line height
      });
      return ny + 4; // Tighter section gap
    };

    const mainGroups = categorize(parsedDeck.main);
    let startY = 60;
    if (isSingleton && parsedDeck.cmd.length) {
      startY = drawSection(t('checker.cat_commanders'), parsedDeck.cmd, 20, 60);
    }
    let y1 = drawSection(t('checker.cat_creatures'), mainGroups.Creature, 20, startY);
    y1 = drawSection(t('checker.cat_lands'), mainGroups.Land, 20, y1);
    let y2 = drawSection(t('checker.cat_instants'), mainGroups['Instant/Sorcery'], 110, startY);
    y2 = drawSection(t('checker.cat_other'), mainGroups.Other, 110, y2);
    let finalY = Math.max(y1, y2) + 10;
    if (!isSingleton && parsedDeck.cmd.length) {
      if (finalY > 270) finalY = 270;
      drawSection(t('checker.cat_sideboard'), parsedDeck.cmd, 20, finalY);
    }

    const totalMain = parsedDeck.main.reduce((s, i) => s + i.qty, 0);
    const totalCmd  = parsedDeck.cmd.reduce((s, i) => s + i.qty, 0);
    const footerY = 288;
    doc.setFontSize(9);
    doc.text(t('checker.footer_main', { count: totalMain }), 20, footerY);
    doc.text(t(isSingleton ? 'checker.footer_cmd' : 'checker.footer_side', { count: totalCmd }), 65, footerY);
    
    // Grand Total in black box
    const totalAll = totalMain + totalCmd;
    doc.setFillColor(0, 0, 0); doc.rect(130, footerY - 5, 65, 8, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    const totalLabel = t('checker.grand_total', { count: totalAll });
    doc.text(totalLabel, 162.5, footerY + 1, { align: 'center' });
    doc.setTextColor(0);

    doc.save(`${playerData.lastName || 'deck'}_Registration.pdf`);
  };

  // ── Add checked deck to print queue ──────────────────────────────
  const handleAddToQueue = async () => {
    if (!onAddToQueue) return;
    const all = [...parsedDeck.main, ...parsedDeck.cmd];
    const items = [];
    for (const card of all) {
      try {
        const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}`);
        const data = await res.json();
        const img = data.image_uris?.normal || data.card_faces?.[0]?.image_uris?.normal;
        if (!img) continue;
        for (let i = 0; i < card.qty; i++) {
          items.push({
            id: `${data.id}_${i}_${Math.random()}`,
            name: data.name,
            url: img,
            thumb: data.image_uris?.small || data.card_faces?.[0]?.image_uris?.small,
            srcType: 'scryfall',
            set: data.set_name
          });
        }
      } catch { /* ignore */ }
    }
    if (items.length > 0) onAddToQueue(items);
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="dc-container">
      {/* ── Sidebar ────────────────────────────────────────── */}
      <div className="dc-sidebar">

        {/* Imported banner */}
        {importedBanner && (
          <div className="dc-imported-banner">
            <CheckCircle2 size={15} />
            {t('checker.imported_from_scanner')}
          </div>
        )}

        {/* Tournament data */}
        <div className="dc-panel">
          <div className="dc-panel-title">
            <FileText size={16} />
            {t('checker.tournament_data')}
          </div>
          <div className="dc-fields">
            <div className="dc-field-row">
              <input className="dc-input" placeholder={t('checker.last_name')}
                value={playerData.lastName}
                onChange={e => setPlayerData({ ...playerData, lastName: e.target.value })} />
              <input className="dc-input" placeholder={t('checker.first_name')}
                value={playerData.firstName}
                onChange={e => setPlayerData({ ...playerData, firstName: e.target.value })} />
            </div>
            <div className="dc-field-row">
              <input className="dc-input" placeholder={t('checker.player_id')}
                value={playerData.playerId}
                onChange={e => setPlayerData({ ...playerData, playerId: e.target.value })} />
              <input type="date" className="dc-input"
                value={playerData.date}
                onChange={e => setPlayerData({ ...playerData, date: e.target.value })} />
            </div>
            <input className="dc-input" placeholder={t('checker.event_name')}
              value={playerData.event}
              onChange={e => setPlayerData({ ...playerData, event: e.target.value })} />
            <div className="dc-field-row">
              <input className="dc-input" placeholder={t('checker.deck_name')}
                value={playerData.deckName}
                onChange={e => setPlayerData({ ...playerData, deckName: e.target.value })} />
              <input className="dc-input" placeholder={t('checker.designer')}
                value={playerData.deckDesigner}
                onChange={e => setPlayerData({ ...playerData, deckDesigner: e.target.value })} />
            </div>
          </div>
          <button
            className="dc-btn dc-btn-pdf"
            onClick={generatePDF}
            disabled={!parsedDeck.main.length && !parsedDeck.cmd.length}
          >
            <Download size={16} />
            {t('checker.export_pdf')}
          </button>
        </div>

        {/* Format */}
        <div className="dc-panel">
          <div className="dc-panel-title">
            <ShieldCheck size={16} />
            {t('checker.legality_analysis')}
          </div>
          <label className="dc-label">{t('checker.select_format')}</label>
          <div className="dc-format-grid">
            {FORMATS.map(f => (
              <button
                key={f.id}
                className={`dc-format-btn ${selectedFormat === f.id ? 'active' : ''}`}
                onClick={() => { setSelectedFormat(f.id); setResults(null); }}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Maindeck */}
        <div className="dc-panel dc-panel-flex">
          <label className="dc-label">{t('checker.maindeck_list')}</label>
          <textarea
            className="dc-textarea"
            rows={isSingleton ? 10 : 7}
            placeholder={'4x Brainstorm\n1 Lightning Bolt'}
            value={maindeck}
            onChange={e => setMaindeck(e.target.value)}
          />
        </div>

        {/* Commander or Sideboard */}
        {isSingleton ? (
          <div className="dc-panel">
            <label className="dc-label">{t('checker.commanders')}</label>
            <div className="dc-search-row">
              <Search size={13} className="dc-search-icon" />
              <input
                className="dc-input dc-input-search"
                placeholder={t('checker.commander_placeholder', { n: 1 })}
                value={commander1}
                onChange={e => handleCmdSearch(e.target.value, setCommander1)}
                list="cmd-list"
              />
            </div>
            <div className="dc-search-row" style={{ marginTop: '8px' }}>
              <Search size={13} className="dc-search-icon" />
              <input
                className="dc-input dc-input-search"
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
          <div className="dc-panel dc-panel-flex">
            <label className="dc-label">{t('checker.sideboard')}</label>
            <textarea
              className="dc-textarea"
              rows={4}
              placeholder={'3x Duress\n1 Pyroblast'}
              value={sideboard}
              onChange={e => setSideboard(e.target.value)}
            />
          </div>
        )}

        {/* Check button */}
        <button className="dc-btn dc-btn-check" onClick={handleCheck} disabled={checking}>
          {checking ? <Clock size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {checking ? t('checker.checking') : t('checker.check_button')}
        </button>
      </div>

      {/* ── Main results ────────────────────────────────────── */}
      <div className="dc-main">
        {results ? (
          <div className="dc-result-hero">
            <div className={`dc-result-icon ${results.status === 'legal' ? 'text-success' : 'text-error'}`}>
              {results.status === 'legal' ? <CheckCircle size={80} /> : <AlertTriangle size={80} />}
            </div>
            <h2 className={`dc-result-title ${results.status}`}>
              {results.status === 'legal' ? t('checker.legal_title') : t('checker.not_legal_title')}
            </h2>
            <p className="dc-result-format">
              {t('checker.format_label', { format: FORMATS.find(f => f.id === selectedFormat)?.name })}
            </p>

            {results.status === 'legal' ? (
              <div className="dc-legal-box">
                <ShieldCheck size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p>{t('checker.legal_desc')}</p>
              </div>
            ) : (
              <div className="dc-banned-box">
                <div className="dc-banned-title">
                  <ShieldAlert size={16} />
                  {t('checker.issues_found', { count: results.reasons.length })}
                </div>
                <div className="dc-banned-list">
                  {results.reasons
                    .filter(r => {
                      const n = r.name.toLowerCase();
                      return !['instants', 'sorceries', 'creatures', 'lands', 'and'].some(k => n === k || n.includes(k + ' and '));
                    })
                    .map((r, i) => (
                    <div key={i} className="dc-banned-item">
                      <span className="dc-banned-name">{r.name}</span>
                      <span className="dc-banned-reason">{r.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="dc-result-actions">
              <button className="dc-btn dc-btn-ghost" onClick={() => setResults(null)}>
                {t('checker.new_analysis')}
              </button>
              {onAddToQueue && (
                <button className="dc-btn dc-btn-queue" onClick={handleAddToQueue}>
                  <Plus size={16} />
                  {t('checker.add_all_to_queue')}
                </button>
              )}
              <button className="dc-btn dc-btn-pdf" onClick={generatePDF}>
                <Download size={16} />
                {t('checker.export_pdf')}
              </button>
            </div>
          </div>
        ) : (
          <div className="dc-empty">
            <ShieldCheck size={80} style={{ opacity: 0.07, marginBottom: '20px' }} />
            <h3 className="dc-empty-title">{t('checker.waiting_title')}</h3>
            <p className="dc-empty-desc">{t('checker.waiting_desc')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
