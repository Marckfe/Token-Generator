import React, { useState, useRef, useEffect } from 'react';
import { getScryfallPreviewUri, getScryfallPrintUri } from '../../utils/scryfallImages';
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

      // Safety Timeout to prevent infinite hang (10s)
      const savePromise = saveUserDeck(user.uid, deckData);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout: Il database non risponde. Controlla la connessione.")), 10000)
      );

      await Promise.race([savePromise, timeoutPromise]);
      
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
      if (import.meta.env.DEV) console.error(e);
      alert(e.message || "Errore durante la verifica");
    }
    setChecking(false);
  };

  // ── Generate PDF (Official WotC Style - PRINTER SAFE) ────────────
  const generatePDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    // Header Data
    const logoUrl = '/assets/mtg-logo.png';
    const getLogoDim = () => new Promise(res => {
      const img = new Image();
      img.onload = () => res({ w: 20, h: 20 * (img.naturalHeight / img.naturalWidth) });
      img.onerror = () => res({ w: 15, h: 10, err: true });
      img.src = logoUrl;
    });
    const logo = await getLogoDim();

    // Top Right Boxes (HARDCODED COORDS TO AVOID OVERLAP)
    doc.setDrawColor(0); doc.setLineWidth(0.3);
    
    // Initial Box
    doc.setFontSize(5); doc.setFont('helvetica', 'normal');
    doc.text('First Letter of Last Name', 195, 8, { align: 'center' });
    doc.rect(190, 10, 10, 10);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text((playerData.lastName?.[0] || '').toUpperCase(), 195, 17, { align: 'center' });
    
    // Table Box (Shifted more to the left)
    doc.setFontSize(5); doc.setFont('helvetica', 'normal');
    doc.text('TAVOLO', 175, 8, { align: 'center' });
    doc.rect(170, 10, 10, 10);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(String(playerData.tableNumber || ''), 175, 17, { align: 'center' });

    // Main Title
    doc.setFont('helvetica', 'normal'); doc.setFontSize(14);
    doc.text('DECK REGISTRATION SHEET', 105, 15, { align: 'center' });

    // Header Table (Restructured)
    const gridX = 35;
    const gridY = 18;
    const gridW = 167;
    doc.setLineWidth(0.2); 
    doc.rect(gridX, gridY, gridW, 24); // 3 rows of 8mm
    doc.line(gridX, gridY + 8, gridX + gridW, gridY + 8);
    doc.line(gridX, gridY + 16, gridX + gridW, gridY + 16);
    doc.line(gridX + 83.5, gridY, gridX + 83.5, gridY + 24);

    const drawGridField = (lbl, val, x, y, colW = 83.5) => {
      doc.setFontSize(7); doc.setTextColor(100); doc.setFont('helvetica', 'normal');
      doc.text(lbl + ':', x + 2, y + 5);
      doc.setFontSize(9); doc.setTextColor(0); doc.setFont('helvetica', 'bold');
      doc.text(val || '', x + 18, y + 5.5);
    };

    drawGridField('Last Name', playerData.lastName, gridX, gridY);
    drawGridField('First Name', playerData.firstName, gridX + 83.5, gridY);
    drawGridField('Date', playerData.date, gridX, gridY + 8);
    drawGridField('Event', playerData.event, gridX + 83.5, gridY + 8);
    drawGridField('Location', playerData.location, gridX, gridY + 16);
    drawGridField('Deck Name', playerData.deckName, gridX + 83.5, gridY + 16);

    // Logo (Placed at top-left, now that sidebar is gone)
    if (!logo.err) doc.addImage(logoUrl, 'PNG', 10, 19, logo.w, logo.h);

    // Instructions
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('PRINT CLEARLY USING ENGLISH CARD NAMES', 110, 52, { align: 'center' });

    // Sections
    const col1X = 22;
    const col2X = 115;
    let curY1 = 62;
    let curY2 = 62;

    const drawWotCRow = (qty, name, x, y, fSize = 8) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(fSize);
      doc.text(String(qty), x + 2, y);
      doc.setFont('helvetica', 'normal'); doc.text(name.substring(0, 45), x + 12, y);
      doc.setDrawColor(220); doc.line(x, y + 1, x + 85, y + 1);
    };

    const drawWotCHeader = (title, subtitle, x, y) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      const fullTitle = subtitle ? `${title}  ${subtitle}` : title;
      doc.text(fullTitle, x, y);
      doc.setFontSize(7); doc.setTextColor(100);
      doc.text('# in deck:', x, y + 5); doc.text('Card Name:', x + 12, y + 5);
      doc.setDrawColor(0); doc.line(x, y + 6, x + 85, y + 6);
      doc.setTextColor(0);
      return y + 11;
    };

    const mainList = parsedDeck.main;
    const sideList = parsedDeck.cmd;
    const totalCount = mainList.reduce((s, i) => s + i.qty, 0) + sideList.reduce((s, i) => s + i.qty, 0);
    const useLargeFont = totalCount < 85;

    if (isSingleton) {
      const lineH = 3.6;
      // Commanders
      curY1 = drawWotCHeader('Commanders:', '', col1X, curY1);
      sideList.forEach(item => { drawWotCRow(item.qty, item.name, col1X, curY1, 8); curY1 += lineH; });
      
      // Main Deck (LARGE GAP TO PREVENT OVERLAP)
      curY1 += 18;
      curY1 = drawWotCHeader('Main Deck:', `(${totalCount} Total)`, col1X, curY1);
      const main1 = mainList.slice(0, 45);
      main1.forEach(item => { drawWotCRow(item.qty, item.name, col1X, curY1, 8); curY1 += lineH; });
      
      // Col 2
      curY2 = drawWotCHeader('Main Deck Continued:', '', col2X, curY2);
      const main2 = mainList.slice(45);
      main2.forEach(item => { drawWotCRow(item.qty, item.name, col2X, curY2); curY2 += lineH; });
    } else {
      const lineH = useLargeFont ? 6.5 : 4.5;
      const fSize = useLargeFont ? 10 : 8;
      
      curY1 = drawWotCHeader('Main Deck:', '(60 Minimum)', col1X, curY1);
      const main1 = mainList.slice(0, 32);
      main1.forEach(item => { drawWotCRow(item.qty, item.name, col1X, curY1, fSize); curY1 += lineH; });
      
      curY2 = drawWotCHeader('Main Deck Continued:', '', col2X, curY2);
      const main2 = mainList.slice(32);
      main2.forEach(item => { drawWotCRow(item.qty, item.name, col2X, curY2, fSize); curY2 += lineH; });
      
      curY2 += 12;
      curY2 = drawWotCHeader('Sideboard:', '(15 Maximum)', col2X, curY2);
      sideList.forEach(item => { drawWotCRow(item.qty, item.name, col2X, curY2, fSize); curY2 += lineH; });
    }

    // Footer (REPOSITIONED TO AVOID BOX OVERLAP)
    const footerY = 285;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    // Start text from x=15 to have plenty of room before box at 93
    const footerText = isSingleton ? 'Total Number of Cards in Deck:' : 'Total Number of Cards in Main Deck:';
    doc.text(footerText, 15, footerY);
    doc.rect(93, footerY - 5, 12, 7);
    doc.setFont('helvetica', 'bold'); doc.text(String(totalCount), 99, footerY, { align: 'center' });

    // Official Box
    doc.rect(120, 275, 80, 12);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text('FOR OFFICIAL USE ONLY', 122, 279);
    doc.line(120, 281, 200, 281);

    doc.setFontSize(6); doc.setTextColor(150);
    doc.text('TM & © 2024 Wizards of the Coast LLC. Generated via MTG Tools.', 200, 292, { align: 'right' });

    doc.save(`${playerData.lastName || 'deck'}_Final.pdf`);
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
        const previewUrl = getScryfallPreviewUri(data);
        const printUrl = getScryfallPrintUri(data);
        if (!previewUrl && !printUrl) continue;
        for (let i = 0; i < card.qty; i++) {
          items.push({
            id: `${data.id}_${i}_${Math.random()}`,
            name: data.name,
            url: previewUrl || printUrl,
            previewUrl: previewUrl || printUrl,
            printUrl: printUrl || previewUrl,
            thumb: previewUrl || printUrl,
            srcType: 'scryfall',
            set: data.set_name,
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
              <button className="dc-action-btn" onClick={() => setShowLibrary(true)}>
                <Library size={16} />
                Libreria
                {savedDecks.length > 0 && <span className="dc-badge">{savedDecks.length}</span>}
              </button>
              <button className={`dc-action-btn primary ${saving ? 'spinning' : ''}`} onClick={handleSaveDeck}>
                <Save size={16} />
                {saving ? 'Salvataggio...' : 'Salva'}
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
              <input className="dc-input" placeholder={t('checker.location') || "Luogo"}
                style={{ flex: '1' }}
                value={playerData.location}
                onChange={e => setPlayerData({ ...playerData, location: e.target.value })} />
              <input className="dc-input" placeholder={t('checker.table')}
                style={{ flex: '0 0 100px' }}
                value={playerData.tableNumber}
                onChange={e => setPlayerData({ ...playerData, tableNumber: e.target.value })} />
            </div>
            <input type="date" className="dc-input dc-date-input"
              value={playerData.date}
              onChange={e => setPlayerData({ ...playerData, date: e.target.value })} />
            <input className="dc-input" placeholder={t('checker.event_name')}
              value={playerData.event}
              onChange={e => setPlayerData({ ...playerData, event: e.target.value })} />
            <input className="dc-input" placeholder={t('checker.deck_name')}
              value={playerData.deckName}
              onChange={e => setPlayerData({ ...playerData, deckName: e.target.value })} />
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

        {/* Commander (Only for Singleton) */}
        {isSingleton && (
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
        )}

        {/* Maindeck */}
        <div className="dc-panel dc-panel-flex">
          <label className="dc-label">{t('checker.maindeck_list')}</label>
          <textarea
            className="property-textarea"
            style={{ minHeight: isSingleton ? '250px' : '180px', fontFamily: 'monospace' }}
            placeholder={'4x Brainstorm\n1 Lightning Bolt'}
            value={maindeck}
            onChange={e => setMaindeck(e.target.value)}
          />
        </div>

        {/* Sideboard (Only for Standard/Modern/etc) */}
        {!isSingleton && (
          <div className="dc-panel dc-panel-flex">
            <label className="dc-label">{t('checker.sideboard')}</label>
            <textarea
              className="property-textarea"
              style={{ minHeight: '120px', fontFamily: 'monospace' }}
              placeholder={'3x Duress\n1 Pyroblast'}
              value={sideboard}
              onChange={e => setSideboard(e.target.value)}
            />
          </div>
        )}

        {/* Check button */}
        <button className="btn btn-primary btn-block py-3 mt-4" onClick={handleCheck} disabled={checking}>
          {checking ? <Clock size={16} className="animate-spin" /> : <ShieldCheck size={18} />}
          {checking ? t('checker.checking') : t('checker.check_button')}
        </button>
      </div>

      {/* ── Main results ────────────────────────────────────── */}
      <div className="dc-main">
        {results ? (
          <div className="dc-result-hero panel-container">
            <div className={`dc-result-icon ${results.status === 'legal' ? 'text-success' : 'text-error'}`}>
              {results.status === 'legal' ? <CheckCircle size={80} /> : <AlertTriangle size={80} />}
            </div>
            <h2 className={`dc-result-title ${results.status}`} style={{ fontWeight: '900', fontSize: '2rem', letterSpacing: '-0.04em' }}>
              {results.status === 'legal' ? t('checker.legal_title') : t('checker.not_legal_title')}
            </h2>
            <p className="dc-result-format" style={{ opacity: 0.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {t('checker.format_label', { format: FORMATS.find(f => f.id === selectedFormat)?.name })}
            </p>

            {results.status === 'legal' ? (
              <div className="mt-8 p-6 rounded-2xl bg-success/5 border border-success/10 flex flex-col items-center">
                <ShieldCheck size={40} className="text-success mb-4 opacity-50" />
                <p className="text-success font-bold">{t('checker.legal_desc')}</p>
              </div>
            ) : (
              <div className="mt-8 w-full max-w-md p-6 rounded-2xl bg-error/5 border border-error/10">
                <div className="flex items-center gap-3 text-error font-black uppercase text-xs mb-4">
                  <ShieldAlert size={16} />
                  {t('checker.issues_found', { count: results.reasons.length })}
                </div>
                <div className="flex flex-col gap-3">
                  {results.reasons.map((r, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-black/20 rounded-lg border border-white/5">
                      <span className="font-bold text-white/90 text-sm">{r.name}</span>
                      <span className="text-xs text-error font-bold">{r.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-4 mt-10">
              <button className="btn btn-ghost px-8" onClick={() => setResults(null)}>
                {t('checker.new_analysis')}
              </button>
              {onAddToQueue && (
                <button className="btn btn-accent px-8" onClick={handleAddToQueue}>
                  <Plus size={16} />
                  {t('checker.add_all_to_queue')}
                </button>
              )}
              <button className="btn btn-primary px-10" onClick={generatePDF}>
                <Download size={16} />
                {t('checker.export_pdf')}
              </button>
            </div>
          </div>
        ) : (
          <div className="dc-empty">
            <div className="p-10 rounded-full bg-white/5 mb-8">
              <ShieldCheck size={80} style={{ opacity: 0.1 }} />
            </div>
            <h3 className="text-2xl font-black text-white mb-2">{t('checker.waiting_title')}</h3>
            <p className="text-muted max-w-sm mx-auto">{t('checker.waiting_desc')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
