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

const FORMATS = [
  { id: 'commander', name: 'Commander' },
  { id: 'duel', name: 'Duel Commander' },
  { id: 'modern', name: 'Modern' },
  { id: 'standard', name: 'Standard' },
  { id: 'legacy', name: 'Legacy' },
  { id: 'pioneer', name: 'Pioneer' }
];

export default function DeckChecker() {
  const [selectedFormat, setSelectedFormat] = useState('commander');
  const [maindeck, setMaindeck] = useState('');
  const [sideboard, setSideboard] = useState('');
  const [commander1, setCommander1] = useState('');
  const [commander2, setCommander2] = useState('');
  const [cmdSuggestions, setCmdSuggestions] = useState([]);
  
  const searchTimeout = useRef(null);

  const isSingleton = selectedFormat === 'commander' || selectedFormat === 'duel';

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
        let cleanLine = line.replace(/\s+\([a-zA-Z0-9_]+\)\s*.*$/i, '').trim();
        const match = cleanLine.match(/^(\d+)x?\s+(.+)$/i);
        let name = match ? match[2].trim() : cleanLine.trim();
        let qty = match ? parseInt(match[1], 10) : 1;
        name = name.split(/\s*\/\/?\s*/)[0].trim();
        return { qty, name };
      });
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
          type: c.type_line
        }; 
      });

      const enrichedMain = mainLines.map(item => ({
        ...item,
        type: cardInfoMap[item.name.toLowerCase()]?.type || 'Unknown'
      }));
      const enrichedCmd = cmdLines.map(item => ({
        ...item,
        type: cardInfoMap[item.name.toLowerCase()]?.type || 'Unknown'
      }));

      setParsedDeck({ main: enrichedMain, cmd: enrichedCmd });

      const newResults = { status: 'legal', reasons: [] };
      allCards.forEach(item => {
        const info = cardInfoMap[item.name.toLowerCase()];
        if (!info) {
          newResults.status = 'banned';
          newResults.reasons.push({ name: item.name, reason: 'Non trovata' });
          return;
        }
        
        const l = info.legalities[selectedFormat];
        if (l === 'not_legal' || l === 'banned') {
          newResults.status = 'banned';
          newResults.reasons.push({ name: item.name, reason: l === 'not_legal' ? 'Non legale' : 'Bannata' });
        } else if (selectedFormat === 'duel' && l === 'restricted') {
          newResults.status = 'banned';
          newResults.reasons.push({ name: item.name, reason: 'Bannata come Comandante' });
        }
      });

      setResults(newResults);
    } catch (e) {
      console.error(e);
      alert("Errore durante il controllo.");
    }
    setChecking(false);
  };

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    // Header Logo & Title
    doc.setFillColor(0, 188, 212);
    doc.circle(20, 15, 6, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.text("M", 20, 16.2, { align: "center" });
    doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text("OFFICIAL DECK REGISTRATION SHEET", 105, 16, { align: "center" });

    // Player Info Grid
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    const drawField = (label, val, x, y, w) => {
      doc.setFont("helvetica", "bold"); doc.text(label, x, y);
      doc.setFont("helvetica", "normal"); doc.text(val || "________________", x + 25, y);
      doc.setDrawColor(200); doc.line(x + 25, y + 1, x + w, y + 1);
    };

    drawField("Last Name:", playerData.lastName, 20, 30, 80);
    drawField("First Name:", playerData.firstName, 110, 30, 80);
    drawField("Player ID:", playerData.playerId, 20, 38, 80);
    drawField("Date:", playerData.date, 110, 38, 80);
    drawField("Deck Name:", playerData.deckName, 20, 46, 80);
    drawField("Event:", playerData.event, 110, 46, 80);

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
      let nextY = y + 6;
      items.forEach(item => {
        doc.text(item.qty.toString(), x, nextY);
        doc.text(item.name.substring(0, 35), x + 8, nextY);
        doc.setDrawColor(230); doc.line(x, nextY + 1, x + colW, nextY + 1);
        nextY += 5.5;
      });
      return nextY + 6;
    };

    // Column 1: Creatures & Lands
    let y1 = drawSection("Creatures", mainGroups.Creature, 20, 65);
    y1 = drawSection("Lands", mainGroups.Land, 20, y1);

    // Column 2: Spells & Other
    let y2 = drawSection("Instants & Sorceries", mainGroups["Instant/Sorcery"], 110, 65);
    y2 = drawSection("Other Spells", mainGroups.Other, 110, y2);

    // Sideboard / Commander Section
    if (parsedDeck.cmd.length > 0) {
      let finalY = Math.max(y1, y2) + 5;
      if (finalY > 260) { // New page or shift? Let's try to fit on one page.
         finalY = 230; 
      }
      const title = isSingleton ? "Commanders" : "Sideboard";
      drawSection(title, parsedDeck.cmd, 20, finalY);
    }

    // Totals Footer
    const totalMain = parsedDeck.main.reduce((sum, i) => sum + i.qty, 0);
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL MAIN DECK: ${totalMain}`, 110, 280);
    
    doc.save(`${playerData.lastName}_Registration.pdf`);
  };

  return (
    <div className="deck-checker-container">
      <div className="deck-checker-sidebar">
        {/* 1. DATI TORNEO (IN ALTO) */}
        <div className="sidebar-panel-title flex items-center gap-2">
          <FileText size={18} />
          <span>Dati Torneo</span>
        </div>
        <div className="p-4 bg-[var(--surface2)] rounded-xl border border-[var(--border)] mb-6">
          <div className="flex gap-2 mb-2">
            <input type="text" className="control-input" placeholder="Cognome" value={playerData.lastName} onChange={e => setPlayerData({...playerData, lastName: e.target.value})} />
            <input type="text" className="control-input" placeholder="Nome" value={playerData.firstName} onChange={e => setPlayerData({...playerData, firstName: e.target.value})} />
          </div>
          <div className="flex gap-2 mb-2">
            <input type="text" className="control-input" placeholder="Player ID (ex DCI)" value={playerData.playerId} onChange={e => setPlayerData({...playerData, playerId: e.target.value})} />
            <input type="date" className="control-input" value={playerData.date} onChange={e => setPlayerData({...playerData, date: e.target.value})} />
          </div>
          <div className="mb-2">
            <input type="text" className="control-input" placeholder="Nome Evento" value={playerData.event} onChange={e => setPlayerData({...playerData, event: e.target.value})} />
          </div>
          <div className="flex gap-2 mb-4">
            <input type="text" className="control-input" placeholder="Nome Mazzo" value={playerData.deckName} onChange={e => setPlayerData({...playerData, deckName: e.target.value})} />
            <input type="text" className="control-input" placeholder="Designer" value={playerData.deckDesigner} onChange={e => setPlayerData({...playerData, deckDesigner: e.target.value})} />
          </div>
          <button className="btn btn-ghost w-full border border-[var(--border)] text-xs" onClick={generatePDF}>
            <Download size={14} className="mr-2" />
            Export PDF Sheet
          </button>
        </div>

        {/* 2. SELEZIONE FORMATO */}
        <div className="sidebar-panel-title flex items-center gap-2">
          <ShieldCheck size={18} />
          <span>Analisi Legalità</span>
        </div>

        <div className="control-field mb-6 px-1">
          <label className="control-label mb-2">Seleziona Formato</label>
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
          <label className="control-label">Lista Carte (Maindeck)</label>
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
            <label className="control-label">Comandanti</label>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-3 opacity-40" />
              <input 
                type="text" 
                className="control-input pl-9" 
                placeholder="Comandante 1..." 
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
                placeholder="Partner / Background..." 
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
            <label className="control-label">Sideboard</label>
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
          {checking ? 'Analisi in corso...' : 'Verifica Mazzo'}
        </button>
      </div>

      <div className="deck-checker-main">
        {results ? (
          <div className="check-result-hero">
            <div className="status-badge">
              {results.status === 'legal' ? <CheckCircle2 size={80} color="var(--success)" /> : <XCircle size={80} color="var(--error)" />}
            </div>
            <h2 className={`status-title ${results.status}`}>
              {results.status === 'legal' ? 'Mazzo Legale' : 'Mazzo Non Legale'}
            </h2>
            <p className="format-name-hero">Formato: {FORMATS.find(f => f.id === selectedFormat)?.name}</p>

            {results.status === 'legal' ? (
              <div className="p-8 bg-[var(--success-hl)] rounded-2xl border border-[var(--success)]/20 max-w-md">
                <ShieldCheck size={40} className="mx-auto mb-4 opacity-40" />
                <p className="text-lg">Tutte le carte sono state verificate con successo nel database globale di Scryfall.</p>
              </div>
            ) : (
              <div className="banned-list-container">
                <div className="banned-list-title">
                  <AlertTriangle size={18} />
                  <span>Problemi rilevati ({results.reasons.length})</span>
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
            
            <button className="btn btn-ghost mt-12 opacity-50 hover:opacity-100" onClick={() => setResults(null)}>
              Nuova Analisi
            </button>
          </div>
        ) : (
          <div className="deck-checker-empty">
            <ShieldCheck size={100} className="empty-icon opacity-10 mb-6" />
            <h3 className="text-2xl font-black uppercase opacity-20">In attesa di analisi</h3>
            <p className="max-w-xs mt-4 text-center opacity-40">Seleziona il formato, inserisci la lista e premi "Verifica Mazzo" per iniziare il controllo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
