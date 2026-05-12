import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import './DeckChecker.css';

const FORMATS = [
  { id: 'standard', name: 'Standard' },
  { id: 'modern', name: 'Modern' },
  { id: 'legacy', name: 'Legacy' },
  { id: 'premodern', name: 'Premodern' },
  { id: 'duel', name: 'Duel Commander' }
];

export default function DeckChecker() {
  const [maindeck, setMaindeck] = useState('');
  const [commanders, setCommanders] = useState('');
  
  const [playerData, setPlayerData] = useState({
    lastName: '', firstName: '', dci: '', date: '', event: '', deckName: '', deckDesigner: ''
  });

  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState(null); // { formatId: { status: 'legal'|'banned', reasons: [...] } }
  const [parsedDeck, setParsedDeck] = useState({ main: [], cmd: [] }); // For PDF

  const parseLines = (text) => {
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Strip set codes like "(OTP) 8" or "(MH3) 241"
        let cleanLine = line.replace(/\s+\([a-zA-Z0-9_]+\)\s*.*$/i, '').trim();
        // Convert single slashes to double slashes for split cards if needed
        cleanLine = cleanLine.replace(/\s+\/\s+/g, ' // ');
        
        const match = cleanLine.match(/^(\d+)x?\s+(.+)$/i);
        if (match) return { qty: parseInt(match[1], 10), name: match[2].trim() };
        return { qty: 1, name: cleanLine.trim() };
      });
  };

  const handleCheck = async () => {
    setChecking(true);
    setResults(null);
    
    const mainLines = parseLines(maindeck);
    const cmdLines = parseLines(commanders);
    setParsedDeck({ main: mainLines, cmd: cmdLines });

    const allCards = [...mainLines, ...cmdLines];
    if (allCards.length === 0) {
      setChecking(false);
      return;
    }

    try {
      // Chunk requests for Scryfall (max 75 per request)
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

      // Map legalities
      const legalityMap = {}; // name -> legalities
      fetchedCards.forEach(c => { legalityMap[c.name.toLowerCase()] = c.legalities; });

      const newResults = {};
      FORMATS.forEach(f => {
        newResults[f.id] = { status: 'legal', reasons: [] };
      });

      // Check maindeck
      mainLines.forEach(item => {
        const leg = legalityMap[item.name.toLowerCase()];
        if (!leg) {
          FORMATS.forEach(f => newResults[f.id].reasons.push(`${item.name}: Non trovata`));
          return;
        }
        FORMATS.forEach(f => {
          const l = leg[f.id];
          if (l === 'not_legal' || l === 'banned') {
            newResults[f.id].status = 'banned';
            newResults[f.id].reasons.push(`${item.name} (${l === 'not_legal' ? 'Non legale' : 'Bannata'})`);
          }
        });
      });

      // Check commanders
      cmdLines.forEach(item => {
        const leg = legalityMap[item.name.toLowerCase()];
        if (!leg) {
          FORMATS.forEach(f => newResults[f.id].reasons.push(`${item.name} (Cmd): Non trovata`));
          return;
        }
        FORMATS.forEach(f => {
          const l = leg[f.id];
          if (l === 'not_legal' || l === 'banned') {
            newResults[f.id].status = 'banned';
            newResults[f.id].reasons.push(`${item.name} (Cmd) (${l === 'not_legal' ? 'Non legale' : 'Bannata'})`);
          } else if (f.id === 'duel' && l === 'restricted') {
            newResults[f.id].status = 'banned';
            newResults[f.id].reasons.push(`${item.name} (Bannata come Comandante)`);
          }
        });
      });

      setResults(newResults);
    } catch (e) {
      alert("Errore durante il controllo con Scryfall.");
    }
    setChecking(false);
  };

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("DECK REGISTRATION SHEET", 105, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    // Header info
    doc.text(`Last Name: ${playerData.lastName}`, 20, 35);
    doc.text(`First Name: ${playerData.firstName}`, 110, 35);
    doc.text(`Event: ${playerData.event}`, 20, 45);
    doc.text(`Date: ${playerData.date}`, 110, 45);
    doc.text(`DCI / Player #: ${playerData.dci}`, 20, 55);
    doc.text(`Deck Name: ${playerData.deckName}`, 110, 55);
    doc.text(`Deck Designer: ${playerData.deckDesigner}`, 20, 65);

    doc.setLineWidth(0.5);
    doc.line(20, 70, 190, 70);

    // Columns
    doc.setFont("helvetica", "bold");
    doc.text("Qty", 20, 80); doc.text("Card Name", 35, 80);
    doc.text("Qty", 110, 80); doc.text("Card Name", 125, 80);
    doc.setFont("helvetica", "normal");

    let y1 = 88;
    let y2 = 88;

    // Draw main deck items
    parsedDeck.main.forEach((item, idx) => {
      // Split into two columns for maindeck (e.g. 60 cards -> 30/30)
      if (idx < 35) {
        doc.text(item.qty.toString(), 22, y1);
        doc.text(item.name.substring(0, 30), 35, y1);
        doc.line(20, y1 + 1, 100, y1 + 1); // underline
        y1 += 6;
      } else {
        doc.text(item.qty.toString(), 112, y2);
        doc.text(item.name.substring(0, 30), 125, y2);
        doc.line(110, y2 + 1, 190, y2 + 1); // underline
        y2 += 6;
      }
    });

    // Draw commanders / sideboard
    if (parsedDeck.cmd.length > 0) {
      let sy = Math.max(y1, y2) + 15;
      doc.setFont("helvetica", "bold");
      doc.text("Commanders / Sideboard", 20, sy);
      doc.setFont("helvetica", "normal");
      sy += 8;
      parsedDeck.cmd.forEach(item => {
        doc.text(item.qty.toString(), 22, sy);
        doc.text(item.name.substring(0, 30), 35, sy);
        doc.line(20, sy + 1, 100, sy + 1);
        sy += 6;
      });
    }

    doc.save(`${playerData.lastName}_${playerData.deckName}_Registration.pdf`.replace(/\s+/g, '_'));
  };

  return (
    <div className="deck-checker-container">
      <div className="deck-checker-sidebar">
        <div className="sidebar-panel-title">🛡️ Formazione Mazzo</div>
        
        <div className="control-field mb-4">
          <label className="control-label">Maindeck (Qtà Nome, una per riga)</label>
          <textarea className="control-input" rows={12} placeholder="es. 4x Brainstorm&#10;1 Lightning Bolt" value={maindeck} onChange={e => setMaindeck(e.target.value)}></textarea>
        </div>
        
        <div className="control-field mb-4">
          <label className="control-label">Comandante/i o Sideboard</label>
          <textarea className="control-input" rows={3} placeholder="es. Vial Smasher the Fierce" value={commanders} onChange={e => setCommanders(e.target.value)}></textarea>
        </div>

        <button className="btn btn-primary w-full" onClick={handleCheck} disabled={checking}>
          {checking ? 'Controllo in corso...' : '🔍 Controlla Legalità'}
        </button>

        <hr className="my-4 border-[var(--border)]" />
        <div className="sidebar-panel-title">📝 Dati Torneo (per Export PDF)</div>
        <div className="flex gap-2 mb-2">
          <input type="text" className="control-input" placeholder="Cognome" value={playerData.lastName} onChange={e => setPlayerData({...playerData, lastName: e.target.value})} />
          <input type="text" className="control-input" placeholder="Nome" value={playerData.firstName} onChange={e => setPlayerData({...playerData, firstName: e.target.value})} />
        </div>
        <div className="flex gap-2 mb-2">
          <input type="text" className="control-input" placeholder="DCI / ID" value={playerData.dci} onChange={e => setPlayerData({...playerData, dci: e.target.value})} />
          <input type="date" className="control-input" value={playerData.date} onChange={e => setPlayerData({...playerData, date: e.target.value})} />
        </div>
        <div className="mb-2">
          <input type="text" className="control-input" placeholder="Nome Evento" value={playerData.event} onChange={e => setPlayerData({...playerData, event: e.target.value})} />
        </div>
        <div className="flex gap-2 mb-4">
          <input type="text" className="control-input" placeholder="Nome Mazzo" value={playerData.deckName} onChange={e => setPlayerData({...playerData, deckName: e.target.value})} />
          <input type="text" className="control-input" placeholder="Designer" value={playerData.deckDesigner} onChange={e => setPlayerData({...playerData, deckDesigner: e.target.value})} />
        </div>
        
        <button className="btn btn-ghost w-full" style={{ background: 'var(--surf-off)' }} onClick={generatePDF}>
          ⬇ Scarica Registration Sheet PDF
        </button>
      </div>

      <div className="deck-checker-main">
        {results ? (
          <div className="results-grid">
            {FORMATS.map(f => {
              const res = results[f.id];
              return (
                <div key={f.id} className={`result-card ${res.status}`}>
                  <h3>{f.name}</h3>
                  {res.status === 'legal' ? (
                    <div className="text-success font-bold text-lg">✅ LEGAL</div>
                  ) : (
                    <div>
                      <div className="text-error font-bold text-lg mb-2">❌ BANNED</div>
                      <ul className="text-sm text-left pl-4 list-disc text-[var(--faint)]">
                        {res.reasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="deck-checker-empty">
            <div className="sheet-preview">
              <h3>📄 Anteprima DCI Registration Sheet</h3>
              <div className="sheet-preview-content">
                <div className="sheet-header">
                  <div><strong>Last Name:</strong> {playerData.lastName || '________'}</div>
                  <div><strong>First Name:</strong> {playerData.firstName || '________'}</div>
                  <div><strong>Event:</strong> {playerData.event || '________'}</div>
                  <div><strong>Date:</strong> {playerData.date || '________'}</div>
                  <div><strong>DCI / ID:</strong> {playerData.dci || '________'}</div>
                  <div><strong>Deck Name:</strong> {playerData.deckName || '________'}</div>
                </div>
                <div className="sheet-body">
                  <div className="sheet-col">
                    <div className="sheet-title">Main Deck</div>
                    <div className="sheet-lines">
                      {parseLines(maindeck).slice(0, 15).map((c, i) => (
                        <div key={i} className="sheet-line"><span>{c.qty}</span> <span className="line-text">{c.name}</span></div>
                      ))}
                      {parseLines(maindeck).length > 15 && <div className="text-xs text-muted mt-2">...e altre carte</div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-8 text-[var(--faint)] text-center">Inserisci una lista e clicca "Controlla Legalità" per interrogare il database globale Scryfall, oppure compila i dati e scarica il foglio PDF ufficiale per i tornei!</p>
          </div>
        )}
      </div>
    </div>
  );
}
