import React, { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { Search, Image as ImageIcon, Trash2, Plus, Loader2, CheckCircle2, AlertCircle, Wand2, Key } from 'lucide-react';
import './DeckScanner.css';

const basicLands = ['island', 'swamp', 'mountain', 'forest', 'plains', 'isola', 'palude', 'montagna', 'foresta', 'pianura', 'wastes', 'land'];

const DeckScanner = ({ onAddToQueue }) => {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [useAI, setUseAI] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('openrouter_key') || '');
  const [customModel, setCustomModel] = useState(localStorage.getItem('openrouter_model') || 'google/gemini-2.0-flash-exp:free');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const fileInputRef = useRef(null);

  const saveSettings = (key, model) => {
    const cleanKey = key.trim();
    const cleanModel = model.trim();
    setApiKey(cleanKey);
    setCustomModel(cleanModel);
    localStorage.setItem('openrouter_key', cleanKey);
    localStorage.setItem('openrouter_model', cleanModel);
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
      setError("Inserisci la tua API Key.");
      setShowKeyInput(true);
      return;
    }

    setIsProcessing(true);
    setProgress(20);
    setError(null);

    // Hardcoded known working models list on OpenRouter
    const models = [
      customModel,
      "google/gemini-2.0-flash-exp:free",
      "google/gemini-flash-1.5-exp:free",
      "google/gemini-pro-1.5-exp:free",
      "google/gemini-flash-1.5-8b-exp:free"
    ].filter(Boolean);

    const tryModel = async (index) => {
      if (index >= models.length) {
        throw new Error("Nessun modello IA disponibile. Controlla il nome del modello nelle impostazioni.");
      }

      const model = models[index].trim();
      try {
        const base64Image = await fileToBase64(image);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": window.location.origin,
            "X-Title": "MTG Proxy Creator",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            "model": model,
            "messages": [
              {
                "role": "user",
                "content": [
                  { "type": "text", "text": "List MTG cards in this image as JSON: [{\"name\":\"Card Name\",\"qty\":4}]. Count stacked cards." },
                  { "type": "image_url", "image_url": { "url": base64Image } }
                ]
              }
            ]
          })
        });

        const data = await response.json();
        
        if (data.error) {
          // If model not found, try next one
          if (data.error.code === 404 || data.error.message.includes("model") || data.error.message.includes("not found")) {
            return tryModel(index + 1);
          }
          throw new Error(data.error.message);
        }

        if (data.choices?.[0]?.message?.content) {
          const content = data.choices[0].message.content;
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const detected = parsed.map(item => ({
              id: Math.random().toString(36).substr(2, 9),
              qty: item.qty,
              name: item.name,
              status: 'pending',
              data: null
            }));
            setResults(detected);
            detected.forEach(card => searchCard(card));
          } else {
            throw new Error("L'IA non ha rilevato carte.");
          }
        }
      } catch (err) {
        if (err.message.includes("not found") || err.message.includes("404")) {
          return tryModel(index + 1);
        }
        throw err;
      }
    };

    try {
      await tryModel(0);
    } catch (err) {
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
        logger: m => m.status === 'recognizing text' && setProgress(Math.round(m.progress * 100))
      });
      const { data: { text } } = await worker.recognize(image);
      await worker.terminate();
      parseText(text);
    } catch (err) {
      setError('Errore OCR.');
    } finally {
      setIsProcessing(false);
    }
  };

  const parseText = (text) => {
    const rawChunks = text.split(/[\n|()\[\]\\\/]|\s{2,}/);
    const candidateMap = new Map();
    rawChunks.forEach(chunk => {
      let trimmed = chunk.trim();
      if (trimmed.length < 2) return;
      let name = trimmed;
      let qty = 1;
      const startQty = trimmed.match(/^(\d+)\s*[xX]?\s+/);
      if (startQty) {
        qty = parseInt(startQty[1]);
        name = trimmed.replace(startQty[0], '').trim();
      }
      const isLand = basicLands.some(l => name.toLowerCase().includes(l));
      qty = isLand ? Math.min(qty, 60) : Math.min(qty, 4);
      if (name.length < 2) return;
      const key = name.toLowerCase();
      if (candidateMap.has(key)) {
        candidateMap.get(key).qty = Math.min(candidateMap.get(key).qty + qty, isLand ? 100 : 4);
      } else {
        candidateMap.set(key, { name, qty });
      }
    });
    const detected = Array.from(candidateMap.values()).map(item => ({
      id: Math.random().toString(36).substr(2, 9),
      qty: item.qty,
      name: item.name,
      status: 'pending',
      data: null
    }));
    setResults(detected);
    detected.forEach(card => searchCard(card));
  };

  const searchCard = async (card) => {
    setResults(prev => prev.map(c => c.id === card.id ? { ...c, status: 'searching' } : c));
    try {
      const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(card.name)}`);
      const data = await response.json();
      if (data.object === 'card') {
        setResults(prev => {
          const existing = prev.find(c => c.status === 'found' && c.data?.id === data.id && c.id !== card.id);
          if (existing) {
            const isLand = basicLands.some(l => data.name.toLowerCase().includes(l));
            existing.qty = isLand ? existing.qty + card.qty : Math.min(existing.qty + card.qty, 4);
            return prev.filter(c => c.id !== card.id);
          }
          return prev.map(c => c.id === card.id ? { ...c, status: 'found', name: data.name, data } : c);
        });
      } else {
        setResults(prev => prev.filter(c => c.id !== card.id));
      }
    } catch (err) {
      setResults(prev => prev.filter(c => c.id !== card.id));
    }
  };

  const updateCardQty = (id, newQty) => setResults(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, newQty) } : c));
  const removeCard = (id) => setResults(prev => prev.filter(c => c.id !== id));
  const handleAddToQueue = () => {
    const validCards = results.filter(c => c.status === 'found');
    onAddToQueue(validCards.map(c => ({
      id: c.data.id,
      name: c.data.name,
      qty: c.qty,
      image: c.data.image_uris?.normal || c.data.card_faces?.[0]?.image_uris?.normal,
      set: c.data.set_name,
      artist: c.data.artist
    })));
  };

  return (
    <div className="deck-scanner-container">
      <div className="scanner-header">
        <div className="scanner-title-row">
          <div className="scanner-title-group">
            <Wand2 className="text-accent" size={24} />
            <h2>Deck Scanner OCR</h2>
          </div>
        </div>
        <p className="scanner-subtitle">Analisi avanzata con IA.</p>
      </div>

      <div className="scanner-layout">
        <div className="scanner-upload-section">
          <div className={`scanner-dropzone ${isProcessing ? 'processing' : ''}`} onClick={() => !isProcessing && fileInputRef.current.click()}>
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
            {preview ? <img src={preview} alt="Anteprima" className="scanner-preview-img" /> : <div className="dropzone-placeholder"><ImageIcon size={48} /><p>Carica un'immagine</p></div>}
            {isProcessing && <div className="processing-overlay"><Loader2 size={40} className="animate-spin mb-4 text-accent" /><p className="font-bold">Analisi...</p></div>}
          </div>

          <div className="scanner-controls">
            <div className="ai-mode-card">
              <div className="ai-mode-info">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <Wand2 size={18} className={useAI ? 'text-accent' : 'text-muted'} />
                    <p className="mode-label">Modalità IA Avanzata</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button className={`p-2 rounded-lg transition-all ${apiKey ? 'text-success' : 'text-error'}`} onClick={() => setShowKeyInput(!showKeyInput)}><Key size={18} /></button>
                <label className="switch"><input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} /><span className="slider"></span></label>
              </div>
            </div>

            {showKeyInput && (
              <div className="api-key-panel">
                <div className="flex flex-col gap-3">
                  <input type="password" placeholder="API Key..." className="api-key-input" value={apiKey} onChange={(e) => saveSettings(e.target.value, customModel)} />
                  <input type="text" placeholder="Modello (es: google/gemini-2.0-flash-exp:free)" className="api-key-input" value={customModel} onChange={(e) => saveSettings(apiKey, e.target.value)} />
                  <button className="api-key-save py-2" onClick={() => setShowKeyInput(false)}>Salva</button>
                </div>
              </div>
            )}

            <button className={`main-process-btn ${useAI ? 'ai' : ''}`} onClick={processImage} disabled={!image || isProcessing}>
              {isProcessing ? <><Loader2 size={18} className="animate-spin" /> Analisi...</> : <>{useAI ? <Wand2 size={18} /> : <Search size={18} />} {useAI ? 'Analisi IA' : 'Scansione OCR'}</>}
            </button>
            {error && <div className="error-box"><AlertCircle size={14} /> {error}</div>}
          </div>
        </div>

        <div className="scanner-results-section">
          <div className="results-header">
            <h3>Risultati ({results.length})</h3>
            <button className="add-to-queue-btn" onClick={handleAddToQueue} disabled={results.length === 0}>Aggiungi</button>
          </div>
          <div className="results-grid">
            {results.map((card) => (
              <div key={card.id} className={`result-card-item ${card.status}`}>
                {card.status === 'found' && card.data?.image_uris?.normal && (
                  <div className="card-thumb"><img src={card.data.image_uris.small} alt={card.name} /></div>
                )}
                <div className="card-item-body">
                  <span className="result-name">{card.name}</span>
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
