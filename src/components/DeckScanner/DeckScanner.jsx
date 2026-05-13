import React, { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { Search, Image as ImageIcon, Trash2, Plus, Loader2, CheckCircle2, AlertCircle, Wand2, Settings } from 'lucide-react';
import './DeckScanner.css';

const basicLands = ['island', 'swamp', 'mountain', 'forest', 'plains', 'isola', 'palude', 'montagna', 'foresta', 'pianura', 'wastes', 'land'];
const priorityShort = ['opt', 'duress', 'shock', 'bolt'];

const DeckScanner = ({ onAddToQueue }) => {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [useAI, setUseAI] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('openrouter_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef(null);

  const saveKey = (key) => {
    const cleanKey = key.trim();
    setApiKey(cleanKey);
    localStorage.setItem('openrouter_key', cleanKey);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
      setResults([]);
      setError(null);
    }
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  const processWithAI = async () => {
    if (!image) return;
    if (!apiKey) {
      setError("Inserisci una API Key nelle impostazioni per usare l'IA.");
      setShowSettings(true);
      return;
    }

    setIsProcessing(true);
    setProgress(20);
    setError(null);

    try {
      const base64Image = await fileToBase64(image);
      setProgress(50);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": window.location.origin, // Required by OpenRouter
          "X-Title": "MTG Proxy Creator", // Required by OpenRouter
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "model": "google/gemini-flash-1.5-exp:free",
          "messages": [
            {
              "role": "user",
              "content": [
                {
                  "type": "text",
                  "text": "Extract all Magic: The Gathering card names and their exact quantities from this image. Format the output strictly as a JSON array of objects: [{\"name\": \"Card Name\", \"qty\": 4}]. Count stacked cards by their visible headers. Ignore non-card text."
                },
                {
                  "type": "image_url",
                  "image_url": {
                    "url": base64Image
                  }
                }
              ]
            }
          ]
        })
      });

      const data = await response.json();
      setProgress(80);

      if (data.choices && data.choices[0]) {
        const content = data.choices[0].message.content;
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsedResults = JSON.parse(jsonMatch[0]);
          const detectedCards = parsedResults.map(item => ({
            id: Math.random().toString(36).substr(2, 9),
            qty: item.qty,
            name: item.name,
            status: 'pending',
            data: null
          }));
          setResults(detectedCards);
          searchAllCards(detectedCards);
        } else {
          throw new Error("L'IA non ha rilevato carte valide.");
        }
      } else {
        const errMsg = data.error?.message || "Errore API OpenRouter. Verifica la tua API Key.";
        throw new Error(errMsg);
      }
    } catch (err) {
      console.error('AI Error:', err);
      setError(err.message);
    } finally {
      setIsProcessing(false);
      setProgress(100);
    }
  };

  const processImage = async () => {
    if (useAI) return processWithAI();
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
      await worker.terminate();
      parseText(text);
    } catch (err) {
      console.error('OCR Error:', err);
      setError('Errore durante la scansione OCR.');
    } finally {
      setIsProcessing(false);
    }
  };

  const isLikelyCardName = (name) => {
    const n = name.toLowerCase();
    const boxKeywords = ['whenever', 'enters', 'battlefield', 'damage', 'creature', 'target', 'untap', 'draw', 'scry', 'surveil', 'lifelink', 'haste', 'flying', 'trample', 'vigilance', 'token', 'put a', 'counter', 'search', 'library', 'graveyard', 'exile', 'mana', 'pay', 'cost', 'additional', 'sacrifice', 'destroy', 'return', 'hand', 'bottom', 'top', 'reveal'];
    if (boxKeywords.some(word => n.includes(word))) return false;
    if (!/[aeiouy]/.test(n) && n.length > 3) return false;
    const symbols = (name.match(/[^\w\s]/g) || []).length;
    if (symbols > 3) return false;
    const letters = (name.match(/[a-zA-Z]/g) || []).length;
    if (letters / name.length < 0.6) return false;
    return true;
  };

  const parseText = (text) => {
    const rawChunks = text.split(/[\n|()\[\]\\\/]|\s{2,}/);
    const candidateMap = new Map();
    rawChunks.forEach(chunk => {
      let trimmed = chunk.trim();
      if (!trimmed || trimmed.length < 2) return;
      const lower = trimmed.toLowerCase();
      const compacted = lower.replace(/\s+/g, '');
      let name = trimmed;
      let isForced = false;
      if (compacted.includes('opt')) { name = 'Opt'; isForced = true; }
      else if (compacted.includes('isla') || compacted.includes('isol')) { name = 'Island'; isForced = true; }
      else if (compacted.includes('moun') || compacted.includes('mont')) { name = 'Mountain'; isForced = true; }
      else if (compacted.includes('swam') || compacted.includes('palu')) { name = 'Swamp'; isForced = true; }
      else if (compacted.includes('fore')) { name = 'Forest'; isForced = true; }
      else if (compacted.includes('plai') || compacted.includes('pian')) { name = 'Plains'; isForced = true; }
      if (!isForced && !isLikelyCardName(trimmed)) return;
      let qty = 1;
      if (!isForced && !trimmed.includes('/')) {
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
      const isLand = basicLands.some(l => name.toLowerCase().includes(l));
      qty = isLand ? Math.min(qty, 60) : Math.min(qty, 4);
      if (!isForced) name = name.replace(/[^\w\s',-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (name.length < 2) return;
      const key = name.toLowerCase();
      if (candidateMap.has(key)) {
        const existing = candidateMap.get(key);
        existing.qty = Math.min(existing.qty + qty, isLand ? 100 : 4);
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
          const existingIdx = prev.findIndex(c => c.status === 'found' && c.data?.id === data.id && c.id !== card.id);
          if (existingIdx !== -1) {
            const newResults = [...prev];
            const isLand = basicLands.some(l => data.name.toLowerCase().includes(l));
            const newQty = newResults[existingIdx].qty + card.qty;
            newResults[existingIdx].qty = isLand ? newQty : Math.min(newQty, 4);
            return newResults.filter(c => c.id !== card.id);
          }
          return prev.map(c => c.id === card.id ? { ...c, status: 'found', name: data.name, data: data } : c);
        });
      } else {
        setResults(prev => prev.filter(c => c.id !== card.id));
      }
    } catch (err) {
      setResults(prev => prev.filter(c => c.id !== card.id));
    }
  };

  const searchAllCards = (cards) => cards.forEach(card => searchCard(card));
  const updateCardQty = (id, newQty) => setResults(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, newQty) } : c));
  const removeCard = (id) => setResults(prev => prev.filter(c => c.id !== id));
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
  };

  return (
    <div className="deck-scanner-container">
      <div className="scanner-header">
        <div className="scanner-title-row">
          <div className="scanner-title-group">
            <Wand2 className="text-accent" size={24} />
            <h2>Deck Scanner OCR</h2>
          </div>
          <button 
            className={`settings-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title="Impostazioni API"
          >
            <Settings size={20} />
          </button>
        </div>
        <p className="scanner-subtitle">Analisi avanzata con IA per mazzi e screenshot.</p>
        
        {showSettings && (
          <div className="settings-panel">
            <label>Chiave API OpenRouter (sk-or-v1-...)</label>
            <div className="settings-input-group">
              <input 
                type="password" 
                placeholder="Incolla la tua chiave qui..." 
                value={apiKey}
                onChange={(e) => saveKey(e.target.value)}
              />
              <button onClick={() => setShowSettings(false)}>Chiudi</button>
            </div>
            <p className="settings-hint">La chiave viene salvata localmente nel browser.</p>
          </div>
        )}
      </div>

      <div className="scanner-layout">
        <div className="scanner-upload-section">
          <div 
            className={`scanner-dropzone ${isProcessing ? 'processing' : ''}`}
            onClick={() => !isProcessing && fileInputRef.current.click()}
          >
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
            {preview ? (
              <img src={preview} alt="Anteprima" className="scanner-preview-img" />
            ) : (
              <div className="dropzone-placeholder">
                <ImageIcon size={48} />
                <p>Trascina un'immagine o clicca per caricare</p>
              </div>
            )}
            {isProcessing && (
              <div className="processing-overlay">
                <Loader2 size={40} className="animate-spin mb-4 text-accent" />
                <p className="font-bold">{useAI ? 'L\'IA sta analizzando...' : 'Scansione OCR...'}</p>
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>
              </div>
            )}
          </div>

          <div className="scanner-controls">
            <div className="ai-mode-card">
              <div className="ai-mode-info">
                <Wand2 size={18} className={useAI ? 'text-accent' : 'text-muted'} />
                <div>
                  <p className="mode-label">Modalità IA Avanzata</p>
                  <p className="mode-desc">Precisione massima con Vision AI</p>
                </div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
                <span className="slider"></span>
              </label>
            </div>

            <button 
              className={`main-process-btn ${useAI ? 'ai' : ''}`}
              onClick={processImage}
              disabled={!image || isProcessing}
            >
              {isProcessing ? (
                <><Loader2 size={18} className="animate-spin" /> Analisi in corso...</>
              ) : (
                <>{useAI ? <Wand2 size={18} /> : <Search size={18} />} {useAI ? 'Avvia Analisi IA' : 'Inizia Scansione OCR'}</>
              )}
            </button>
            {error && <div className="error-box"><AlertCircle size={14} /> {error}</div>}
          </div>
        </div>

        <div className="scanner-results-section">
          <div className="results-header">
            <h3>Risultati ({results.length})</h3>
            <button className="add-to-queue-btn" onClick={handleAddToQueue} disabled={results.length === 0}>
              <Plus size={14} /> Aggiungi alla Coda
            </button>
          </div>
          <div className="results-grid">
            {results.length === 0 && !isProcessing && (
              <div className="empty-results">
                <Search size={32} />
                <p>Nessuna carta rilevata.</p>
              </div>
            )}
            {results.map((card) => (
              <div key={card.id} className={`result-card-item ${card.status}`}>
                {card.status === 'found' && card.data?.image_uris?.normal && (
                  <div className="card-thumb"><img src={card.data.image_uris.small} alt={card.name} /></div>
                )}
                <div className="card-item-body">
                  <span className="result-name" title={card.name}>{card.name}</span>
                  <div className="card-item-footer">
                    <div className="qty-control">
                      <button onClick={() => updateCardQty(card.id, card.qty - 1)}>-</button>
                      <input type="number" value={card.qty} readOnly />
                      <button onClick={() => updateCardQty(card.id, card.qty + 1)}>+</button>
                    </div>
                    <button className="del-btn" onClick={() => removeCard(card.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeckScanner;
