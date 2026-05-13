import React, { useState, useRef, useEffect } from 'react';
import { createWorker } from 'tesseract.js';
import { Search, Image as ImageIcon, Trash2, Plus, Loader2, CheckCircle2, AlertCircle, Wand2 } from 'lucide-react';
import './DeckScanner.css';

const DeckScanner = ({ onAddToQueue }) => {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rawText, setRawText] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
      setResults([]);
      setRawText('');
      setError(null);
    }
  };

  const processImage = async () => {
    if (!image) return;
    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      const worker = await createWorker('eng+ita', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        }
      });

      const { data: { text } } = await worker.recognize(image);
      setRawText(text);
      await worker.terminate();
      
      parseText(text);
    } catch (err) {
      console.error('OCR Error:', err);
      setError('Errore durante la scansione dell\'immagine. Riprova con un\'immagine più nitida.');
    } finally {
      setIsProcessing(false);
    }
  };

  const parseText = (text) => {
    // 1. Split by newlines, pipes, brackets AND double spaces (columns)
    const rawChunks = text.split(/[\n|()\[\]\\\/]|\s{2,}/);
    const candidateMap = new Map();
    
    const basicLands = ['island', 'swamp', 'mountain', 'forest', 'plains', 'isola', 'palude', 'montagna', 'foresta', 'pianura', 'wastes', 'land'];
    const priorityShort = ['opt', 'duress', 'shock', 'bolt']; // Common short names

    rawChunks.forEach(chunk => {
      let trimmed = chunk.trim();
      if (!trimmed || trimmed.length < 2) return;

      const lower = trimmed.toLowerCase();
      
      // Handle OCR spacing artifacts for lands (e.g., "I s l a n d")
      const compacted = lower.replace(/\s+/g, '');
      const isLand = basicLands.some(l => compacted.includes(l));
      
      // HEURISTIC: If it's very short but contains "op" or "is", it might be Opt or Island
      let name = trimmed;
      if (compacted.includes('opt')) name = 'Opt';
      else if (compacted.includes('isla') || compacted.includes('isol')) name = 'Island';
      else if (compacted.includes('moun') || compacted.includes('mont')) name = 'Mountain';
      else if (compacted.includes('swam') || compacted.includes('palu')) name = 'Swamp';
      else if (compacted.includes('fore')) name = 'Forest';
      else if (compacted.includes('plai') || compacted.includes('pian')) name = 'Plains';

      const isShort = priorityShort.some(s => lower === s || compacted === s) || name === 'Opt';
      const isActualLand = basicLands.some(l => name.toLowerCase().includes(l));
      
      if (!isActualLand && !isShort) {
        if (trimmed.length > 50) return;
        if (lower.includes('http') || lower.includes('www')) return;
      }

      let qty = 1;
      // If we didn't force the name above, try to extract quantity
      if (name === trimmed && !trimmed.includes('/')) {
        const startQty = trimmed.match(/^(\d+)\s*[xX]?\s+/);
        const endQty = trimmed.match(/\s+(\d+)\s*[xX]?$/);
        
        if (startQty) {
          qty = parseInt(startQty[1]);
          name = trimmed.replace(startQty[0], '').trim();
        } else if (endQty) {
          qty = parseInt(endQty[1]);
          name = trimmed.replace(endQty[0], '').trim();
        }
      }

      // Hard limit of 4 for non-lands
      if (!isActualLand) {
        qty = Math.min(qty, 4);
      } else {
        qty = Math.min(qty, 60); 
      }

      if (name === trimmed) {
        name = name.replace(/[^\w\s',-]/g, ' ').replace(/\s+/g, ' ').trim();
      }
      if (name.length < 2) return;
      
      const key = name.toLowerCase();
      if (candidateMap.has(key)) {
        const existing = candidateMap.get(key);
        existing.qty = Math.min(existing.qty + qty, isActualLand ? 100 : 4);
      } else {
        candidateMap.set(key, { name, qty });
      }
    });

    const detectedCards = Array.from(candidateMap.values()).map(item => ({
      id: Math.random().toString(36).substr(2, 9),
      qty: item.qty,
      name: item.name,
      status: 'pending',
      data: null
    }));

    setResults(detectedCards);
    searchAllCards(detectedCards);
  };

  const searchCard = async (card) => {
    setResults(prev => prev.map(c => c.id === card.id ? { ...c, status: 'searching' } : c));
    
    try {
      const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(card.name)}`);
      const data = await response.json();

      if (data.object === 'card') {
        setResults(prev => {
          // Check if this card (by Scryfall ID) already exists in our results as 'found'
          const existingIdx = prev.findIndex(c => c.status === 'found' && c.data?.id === data.id && c.id !== card.id);
          
          if (existingIdx !== -1) {
            // If it exists, merge the quantity and remove the current duplicate-to-be
            const newResults = [...prev];
            const isLand = basicLands.some(l => data.name.toLowerCase().includes(l));
            const newQty = newResults[existingIdx].qty + card.qty;
            newResults[existingIdx].qty = isLand ? newQty : Math.min(newQty, 4);
            return newResults.filter(c => c.id !== card.id);
          }

          // Otherwise, update the current card to 'found'
          return prev.map(c => c.id === card.id ? { 
            ...c, 
            status: 'found', 
            name: data.name, 
            data: data 
          } : c);
        });
      } else {
        setResults(prev => prev.filter(c => c.id !== card.id));
      }
    } catch (err) {
      setResults(prev => prev.filter(c => c.id !== card.id));
    }
  };

  const searchAllCards = (cards) => {
    cards.forEach(card => searchCard(card));
  };

  const updateCardQty = (id, newQty) => {
    setResults(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, newQty) } : c));
  };

  const removeCard = (id) => {
    setResults(prev => prev.filter(c => c.id !== id));
  };

  const handleAddToQueue = () => {
    const validCards = results.filter(c => c.status === 'found');
    if (validCards.length === 0) return;

    const queueItems = validCards.map(c => ({
      id: c.data.id,
      name: c.data.name,
      qty: c.qty,
      image: c.data.image_uris?.normal || c.data.card_faces?.[0]?.image_uris?.normal,
      set: c.data.set_name,
      artist: c.data.artist
    }));

    onAddToQueue(queueItems);
    // Optional: show success or redirect
  };

  return (
    <div className="deck-scanner-container">
      <div className="scanner-header">
        <div className="scanner-title">
          <Wand2 className="text-accent" />
          <h2>Deck Scanner OCR</h2>
        </div>
        <p className="scanner-subtitle">
          Carica una foto della tua decklist o uno screenshot per convertirlo istantaneamente in proxy.
        </p>
      </div>

      <div className="scanner-layout">
        <div className="scanner-upload-section">
          <div 
            className={`scanner-dropzone ${isProcessing ? 'processing' : ''}`}
            onClick={() => !isProcessing && fileInputRef.current.click()}
          >
            {preview ? (
              <img src={preview} alt="Anteprima" className="scanner-preview-img" />
            ) : (
              <div className="dropzone-placeholder">
                <ImageIcon size={48} className="mb-3 opacity-40" />
                <span>Trascina qui l'immagine o clicca per caricare</span>
                <p className="text-xs text-muted mt-2">Supporta JPG, PNG</p>
              </div>
            )}
            
            {isProcessing && (
              <div className="processing-overlay">
                <Loader2 className="animate-spin mb-2" size={32} />
                <span>Scansione in corso... {progress}%</span>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            )}
          </div>

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
            accept="image/*" 
            className="hidden" 
          />

          <button 
            className="btn btn-primary btn-block mt-4" 
            onClick={processImage} 
            disabled={!image || isProcessing}
          >
            {isProcessing ? 'Elaborazione...' : 'Inizia Scansione OCR'}
          </button>
        </div>

        <div className="scanner-results-section">
          <div className="results-header">
            <h3>Risultati Riconosciuti ({results.length})</h3>
            {results.length > 0 && (
              <button 
                className="btn btn-accent text-xs py-1"
                onClick={handleAddToQueue}
                disabled={!results.some(c => c.status === 'found')}
              >
                <Plus size={14} /> Aggiungi alla Coda
              </button>
            )}
          </div>

          <div className="results-list">
            {results.length === 0 && !isProcessing && (
              <div className="results-empty">
                <Search size={32} className="opacity-20 mb-2" />
                <p>Nessuna carta rilevata. Carica un'immagine per iniziare.</p>
              </div>
            )}

            {results.map((card) => (
              <div key={card.id} className={`result-card-item ${card.status}`}>
                {card.status === 'found' && card.data?.image_uris?.normal && (
                  <div className="card-thumb">
                    <img src={card.data.image_uris.small || card.data.image_uris.normal} alt={card.name} />
                  </div>
                )}
                
                <div className="card-item-body">
                  <div className="card-item-main">
                    <span className="result-name" title={card.name}>{card.name}</span>
                    <div className="result-status-tag">
                      {card.status === 'searching' && <Loader2 size={10} className="animate-spin" />}
                      {card.status === 'found' && <CheckCircle2 size={10} className="text-success" />}
                      <span className="ml-1 text-[9px] uppercase font-bold opacity-70">
                        {card.status === 'searching' ? 'Ricerca...' : 'Confermata'}
                      </span>
                    </div>
                  </div>

                  <div className="card-item-footer">
                    <div className="result-qty-control">
                      <button onClick={() => updateCardQty(card.id, card.qty - 1)}>-</button>
                      <input 
                        type="number" 
                        value={card.qty} 
                        onChange={(e) => updateCardQty(card.id, parseInt(e.target.value))}
                        min="1"
                      />
                      <button onClick={() => updateCardQty(card.id, card.qty + 1)}>+</button>
                    </div>
                    <button className="delete-btn" onClick={() => removeCard(card.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {error && <div className="error-text mt-3">{error}</div>}
        </div>
      </div>
    </div>
  );
};

export default DeckScanner;
