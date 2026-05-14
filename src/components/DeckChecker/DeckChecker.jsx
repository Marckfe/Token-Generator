import React, { useState, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import {
  ShieldCheck, AlertTriangle, FileText, Download,
  Search, CheckCircle2, XCircle, Clock, Plus,
  CheckCircle, ShieldAlert, Save, Library, Trash2
} from 'lucide-react';
import './DeckChecker.css';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { saveUserDeck, getUserDecks, deleteUserDeck } from '../../services/dbService';

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
  const { user } = useAuth();
  const [selectedFormat, setSelectedFormat] = useState('commander');
  const [maindeck, setMaindeck] = useState('');
  const [sideboard, setSideboard] = useState('');
  const [commander1, setCommander1] = useState('');
  const [commander2, setCommander2] = useState('');
  const [cmdSuggestions, setCmdSuggestions] = useState([]);
  const [playerData, setPlayerData] = useState({
    lastName: '', firstName: '', playerId: '', date: '', event: '', deckName: '', deckDesigner: '', tableNumber: ''
  });
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState(null);
  const [parsedDeck, setParsedDeck] = useState({ main: [], cmd: [] });
  const [importedBanner, setImportedBanner] = useState(false);
  const [savedDecks, setSavedDecks] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [saving, setSaving] = useState(false);
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

  // ── Fetch saved decks ─────────────────────────────────────────────
  useEffect(() => {
    if (user) {
      getUserDecks(user.uid).then(setSavedDecks);
    }
  }, [user]);

  const handleSaveDeck = async () => {
    if (!user) {
      alert("Accedi con il tuo account per salvare le liste.");
      return;
    }
    if (!maindeck.trim() && !commander1.trim()) return;
    
    setSaving(true);
    try {
      const deckData = {
        name: playerData.deckName || "Nuovo Mazzo",
        format: selectedFormat,
        maindeck,
        sideboard,
        commander1,
        commander2,
        playerData: { ...playerData }
      };
      await saveUserDeck(user.uid, deckData);
      const updated = await getUserDecks(user.uid);
      setSavedDecks(updated);
      alert("Mazzo salvato correttamente!");
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadDeck = (deck) => {
    setSelectedFormat(deck.format);
    setMaindeck(deck.maindeck);
    setSideboard(deck.sideboard || '');
    setCommander1(deck.commander1 || '');
    setCommander2(deck.commander2 || '');
    if (deck.playerData) setPlayerData(deck.playerData);
    setShowLibrary(false);
    setResults(null);
  };

  const handleDeleteDeck = async (id) => {
    if (!window.confirm("Sei sicuro di voler eliminare questo mazzo?")) return;
    try {
      await deleteUserDeck(user.uid, id);
      setSavedDecks(prev => prev.filter(d => d.id !== id));
    } catch (error) {
      alert("Errore durante l'eliminazione.");
    }
  };

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
      .map(line => line.trim().replace(/[\u200B-\u200D\uFEFF]/g, '')) // Remove zero-width spaces
      .filter(line => line && !line.startsWith('//') && !line.startsWith('#'))
      .map(line => {
        // Remove set info like (M21) or collector numbers, and trailing punctuation
        const clean = line.replace(/\s+\([a-zA-Z0-9_]+\)\s*.*$/i, '')
                          .replace(/[.,;:]\s*$/, '')
                          .trim();
        const m = clean.match(/^(\d+)x?\s+(.+)$/i);
        const name = (m ? m[2] : clean).split(/\s*\/\/??\s*/)[0].trim();
        const qty = m ? parseInt(m[1], 10) : 1;

        if (!name || name.length < 3) return null;

        // Skip if line is all caps (often a header)
        if (name === name.toUpperCase() && /[A-Z]/.test(name)) return null;

        // Skip if name is just a common category header
        const lowerName = name.toLowerCase();
        if (EXCLUDED_KEYWORDS.some(k => lowerName === k || lowerName.includes(k + ' and ') || lowerName.includes(' and ' + k))) {
          return null;
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
      
      // Clean names for lookup (remove leading qty from commanders if present)
      const cleanAllCards = allCards.map(c => {
        const m = c.name.match(/^(\d+)x?\s+(.+)$/i);
        return { ...c, name: m ? m[2].trim() : c.name.trim() };
      });

      const uniqueNames = [...new Set(cleanAllCards.map(c => c.name))].filter(n => n.length >= 2);
      if (uniqueNames.length === 0) {
        setChecking(false);
        return;
      }

      // Batch lookup
      let fetchedCards = [];
      for (let i = 0; i < uniqueNames.length; i += 75) {
        const chunk = uniqueNames.slice(i, i + 75).map(name => ({ name }));
        const res = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: chunk })
        });
        if (!res.ok) throw new Error(t('checker.api_error'));
        const data = await res.json();
        if (data.data) fetchedCards = fetchedCards.concat(data.data);
      }

      const cardMap = {};
      fetchedCards.forEach(c => {
        cardMap[c.name.toLowerCase()] = { legalities: c.legalities, type: c.type_line, fullName: c.name };
      });

      // Fuzzy fallback for not found
      const missing = cleanAllCards.filter(c => !cardMap[c.name.toLowerCase()]);
      await Promise.all(missing.slice(0, 10).map(async item => {
        try {
          const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(item.name)}`);
          if (res.ok) {
            const d = await res.json();
            cardMap[item.name.toLowerCase()] = { legalities: d.legalities, type: d.type_line, fullName: d.name };
          }
        } catch { /* ignore */ }
      }));

      const enrich = (items) => items.map(item => {
        // Clean item name before lookup
        const m = item.name.match(/^(\d+)x?\s+(.+)$/i);
        const searchName = m ? m[2].trim() : item.name.trim();
        const info = cardMap[searchName.toLowerCase()];
        return { ...item, name: info ? info.fullName : item.name, type: info?.type || 'Unknown' };
      });

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

      const verdict = { status: 'legal', reasons: [] };
      const isSingletonFormat = selectedFormat === 'commander' || selectedFormat === 'duel';
      const allEnriched = [...enrichedMain, ...enrichedCmd];
      
      allEnriched.forEach(item => {
        const m = item.name.match(/^(\d+)x?\s+(.+)$/i);
        const searchName = m ? m[2].trim() : item.name.trim();
        const info = cardMap[searchName.toLowerCase()];
        
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
      alert(e.message || "Errore durante la verifica");
    }
    setChecking(false);
  };

  // ── Generate PDF (Official WotC Style) ────────────────────────────
  const generatePDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const t_up = (key, params) => t(key, params).toUpperCase();

    // Helper: Logo
    const logoUrl = '/assets/mtg-logo.png';
    const getLogoDim = () => new Promise(res => {
      const img = new Image();
      img.onload = () => res({ w: 35, h: 35 * (img.naturalHeight / img.naturalWidth) });
      img.onerror = () => res({ w: 15, h: 10, err: true });
      img.src = logoUrl;
    });
    const logo = await getLogoDim();
    if (!logo.err) doc.addImage(logoUrl, 'PNG', 12, 12, logo.w, logo.h);

    // Title
    doc.setFont('helvetica', 'normal'); doc.setFontSize(16);
    doc.text('DECK REGISTRATION SHEET', 105, 12, { align: 'center' });

    // Top Right Box: First Letter of Last Name
    doc.setDrawColor(0); doc.setLineWidth(0.3);
    doc.setFontSize(7); doc.text('First Letter of\nLast Name', 188, 10, { align: 'right' });
    doc.rect(190, 6, 12, 12);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text((playerData.lastName?.[0] || '').toUpperCase(), 196, 14, { align: 'center' });

    // Table Number Stamp (Custom addition)
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(t_up('checker.table'), 175, 10, { align: 'right' });
    doc.rect(176, 6, 12, 12);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(String(playerData.tableNumber || ''), 182, 14, { align: 'center' });

    // Header Grid
    doc.setLineWidth(0.2); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    const gridY = 20;
    doc.rect(40, gridY, 162, 24); // Main box
    doc.line(40, gridY + 8, 202, gridY + 8);  // Row 1
    doc.line(40, gridY + 16, 202, gridY + 16); // Row 2
    doc.line(115, gridY, 115, gridY + 24);     // Col separator

    const drawGridField = (label, val, x, y) => {
      doc.setFontSize(7); doc.setTextColor(100);
      doc.text(label + ':', x + 2, y + 5);
      doc.setFontSize(10); doc.setTextColor(0);
      doc.text(val || '', x + 18, y + 5.5);
    };
    drawGridField('Date', playerData.date, 40, gridY);
    drawGridField('Event', playerData.event, 115, gridY);
    drawGridField('Location', '', 40, gridY + 8);
    drawGridField('Deck Name', playerData.deckName, 115, gridY + 8);
    drawGridField('Designer', playerData.deckDesigner, 115, gridY + 16);

    // Left Vertical Sidebar (Gray Bar)
    doc.setFillColor(235, 235, 235); doc.rect(10, 20, 10, 260, 'F');
    doc.setDrawColor(0); doc.rect(10, 20, 10, 260, 'S');
    doc.setTextColor(80); doc.setFontSize(8);
    // Vertical text
    doc.text('First Name:', 14, 215, { angle: 90 });
    doc.text('Last Name:', 14, 275, { angle: 90 });
    doc.setTextColor(0); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(playerData.firstName || '', 17, 215, { angle: 90 });
    doc.text(playerData.lastName || '', 17, 275, { angle: 90 });

    // Body Titles
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('PRINT CLEARLY USING ENGLISH CARD NAMES', 105, 52, { align: 'center' });

    // Column Balancing
    const col1Y = 60;
    const col2Y = 60;
    
    // Split main deck and sideboard/commanders
    const mainList = parsedDeck.main;
    const sideList = parsedDeck.cmd;

    const drawWotCSection = (title, subtitle, items, x, y, maxRows = 38, lineH = 4.5) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text(title, x, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      if (subtitle) doc.text(subtitle, x + doc.getTextWidth(title) + 2, y);
      
      doc.setFontSize(8); doc.text('# in deck:', x, y + 6); doc.text('Card Name:', x + 18, y + 6);
      doc.setLineWidth(0.1); doc.line(x, y + 7, x + 85, y + 7);

      let curY = y + 12;
      items.slice(0, maxRows).forEach(item => {
        doc.setFont('helvetica', 'bold'); doc.text(String(item.qty), x + 2, curY);
        doc.setFont('helvetica', 'normal'); doc.text(item.name.substring(0, 45), x + 18, curY);
        doc.setDrawColor(200); doc.line(x, curY + 1, x + 85, curY + 1);
        curY += lineH;
      });

      // Fill empty lines
      const remaining = maxRows - items.length;
      if (remaining > 0) {
        for(let i=0; i<remaining; i++) {
          doc.setDrawColor(230); doc.line(x, curY + 1, x + 85, curY + 1);
          curY += lineH;
        }
      }
      return curY;
    };

    if (isSingleton) {
      // Commander Layout: Tightened line height to fit 100 cards (3.5mm)
      const lineH = 3.5;
      let yLeft = drawWotCSection('Commanders:', '', sideList, 25, col1Y, 3, lineH); 
      
      const main1 = mainList.slice(0, 50);
      const main2 = mainList.slice(50, 100);
      
      drawWotCSection('Main Deck:', '(99 Total)', main1, 25, yLeft + 5, 50, lineH);
      drawWotCSection('Main Deck Continued:', '', main2, 115, col2Y, 55, lineH);
    } else {
      // Standard/Modern Layout (Classic spacing)
      const main1 = mainList.slice(0, 38);
      const main2 = mainList.slice(38);
      drawWotCSection('Main Deck:', '(Magic: 60 Minimum)', main1, 25, col1Y, 38, 4.5);
      let yRight = drawWotCSection('Main Deck Continued:', '', main2, 115, col2Y, 15, 4.5);
      drawWotCSection('Sideboard:', '(Magic: Up to 15)', sideList, 115, yRight + 10, 15, 4.5);
    }

    // Totals
    const totalMain = mainList.reduce((s, i) => s + i.qty, 0);
    const totalCmd  = sideList.reduce((s, i) => s + i.qty, 0);
    const totalAll  = totalMain + totalCmd;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(isSingleton ? 'Total Number of Cards in Deck:' : 'Total Number of Cards in Main Deck:', 40, 275);
    doc.rect(88, 270, 15, 8);
    doc.setFont('helvetica', 'bold'); doc.text(String(isSingleton ? totalAll : totalMain), 95.5, 275.5, { align: 'center' });

    if (!isSingleton) {
      doc.setFont('helvetica', 'normal'); doc.text('Total Number of Cards in Sideboard:', 130, 255);
      doc.rect(182, 250, 15, 8);
      doc.setFont('helvetica', 'bold'); doc.text(String(totalCmd), 189.5, 255.5, { align: 'center' });
    } else {
      // Footer text for official usage
      doc.setFontSize(7); doc.text('FOR OFFICIAL USE ONLY', 115, 272);
      doc.rect(115, 273, 85, 12);
    }

    // Disclaimer
    doc.setFontSize(6); doc.setTextColor(150);
    doc.text('TM & © 2024 Wizards of the Coast LLC. Generated via MTG Tools.', 200, 292, { align: 'right' });

    doc.save(`${playerData.lastName || 'deck'}_Official_WotC.pdf`);
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
              <FileText size={16} />
              {t('checker.tournament_data')}
            </div>
            <div className="dc-panel-actions">
              <button className="dc-icon-btn" onClick={() => setShowLibrary(true)} title="Libreria Mazzi">
                <Library size={18} />
                {savedDecks.length > 0 && <span className="dc-badge">{savedDecks.length}</span>}
              </button>
              <button className={`dc-icon-btn ${saving ? 'spinning' : ''}`} onClick={handleSaveDeck} title="Salva Mazzo">
                <Save size={18} />
              </button>
            </div>
          </div>
          
          {/* Library Overlay */}
          {showLibrary && (
            <div className="dc-library-overlay" onClick={() => setShowLibrary(false)}>
              <div className="dc-library-content" onClick={e => e.stopPropagation()}>
                <div className="dc-library-header">
                  <h3><Library size={20} /> {t('checker.saved_decks')} ({savedDecks.length}/10)</h3>
                  <button className="dc-close-btn" onClick={() => setShowLibrary(false)}><XCircle size={20} /></button>
                </div>
                <div className="dc-library-list">
                  {savedDecks.length === 0 ? (
                    <div className="dc-empty-library">Non hai ancora salvato alcun mazzo.</div>
                  ) : (
                    savedDecks.map(deck => (
                      <div key={deck.id} className="dc-library-item">
                        <div className="dc-lib-info" onClick={() => handleLoadDeck(deck)}>
                          <span className="dc-lib-name">{deck.name}</span>
                          <span className="dc-lib-meta">{deck.format.toUpperCase()} • {new Date(deck.updatedAt).toLocaleDateString()}</span>
                        </div>
                        <button className="dc-lib-delete" onClick={() => handleDeleteDeck(deck.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

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
              <input className="dc-input" placeholder={t('checker.table')}
                style={{ flex: '0 0 80px' }}
                value={playerData.tableNumber}
                onChange={e => setPlayerData({ ...playerData, tableNumber: e.target.value })} />
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
                  {results.reasons.map((r, i) => (
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
