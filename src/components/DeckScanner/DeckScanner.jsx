import React, { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { Search, Image as ImageIcon, Trash2, Plus, Loader2, AlertCircle, Wand2, Key, Upload, Bug, RefreshCw, HelpCircle } from 'lucide-react';
import './DeckScanner.css';

const basicLands = ['island', 'swamp', 'mountain', 'forest', 'plains', 'isola', 'palude', 'montagna', 'foresta', 'pianura', 'wastes', 'land'];

const DeckScanner = ({ onAddToQueue }) => {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);
  const [useAI, setUseAI] = useState(false);
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
      setResults([]);
      setError(null);
    }
  };

  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 1000;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
          } else {
            if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
      };
    });
  };

  const processWithAI = async () => {
    if (!image) return;
    if (!user) {
      setError("Devi essere loggato per usare l'analisi IA.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStatusMessage('Analisi sicura con Gemini...');

    try {
      const base64Image = await compressImage(image);
      
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Image })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      const detected = data.map(item => ({
        id: Math.random().toString(36).substr(2, 9),
        qty: item.qty || 1,
        name: item.name,
        status: 'pending',
        data: null
      }));
      
      setResults(detected);
      detected.forEach(card => searchCard(card));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  const processImage = async () => {
    if (useAI) return processWithAI();
    if (!image) return;
    setIsProcessing(true);
    setError(null);
    try {
      const worker = await createWorker('eng+ita', 1);
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
          // If we found a card that's already in the list as "found", merge them
          const existing = prev.find(c => c.status === 'found' && c.data?.id === data.id && c.id !== card.id);
          if (existing) {
            const isLand = basicLands.some(l => data.name.toLowerCase().includes(l));
            existing.qty = isLand ? existing.qty + card.qty : Math.min(existing.qty + card.qty, 4);
            return prev.filter(c => c.id !== card.id);
          }
          return prev.map(c => c.id === card.id ? { ...c, status: 'found', name: data.name, data } : c);
        });
      } else {
        // KEEP THE CARD even if not found, mark as error
        setResults(prev => prev.map(c => c.id === card.id ? { ...c, status: 'error' } : c));
      }
    } catch (err) {
      setResults(prev => prev.map(c => c.id === card.id ? { ...c, status: 'error' } : c));
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
            <h2>Deck Scanner OCR <span className="version-tag">v2.3</span></h2>
          </div>
        </div>
        <p className="scanner-subtitle">Analisi avanzata con IA.</p>
      </div>

      <div className="scanner-layout">
        <div className="scanner-upload-section">
          <div className={`scanner-dropzone ${isProcessing ? 'processing' : ''}`} onClick={() => !isProcessing && fileInputRef.current.click()}>
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} />
            {preview ? (
              <div className="preview-container">
                <img src={preview} alt="Anteprima" className="scanner-preview-img" />
                <div className="preview-overlay"><Upload size={20} /><span>Cambia</span></div>
              </div>
            ) : (
              <div className="dropzone-placeholder"><ImageIcon size={48} className="opacity-20 mb-3" /><p>Carica immagine</p></div>
            )}
            {isProcessing && (
              <div className="processing-overlay">
                <Loader2 size={40} className="animate-spin mb-4 text-accent" />
                <p className="font-bold text-center px-4">{statusMessage || 'Analisi...'}</p>
              </div>
            )}
          </div>

          <div className="scanner-controls">
            <div className="ai-mode-card">
              <div className="ai-mode-info">
                <div className="flex items-center gap-2">
                  <Wand2 size={18} className={useAI ? 'text-accent' : 'text-muted'} />
                  <p className="mode-label">IA Avanzata</p>
                </div>
                <p className="mode-desc">Analisi sicura tramite Google Gemini</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
                <span className="slider"></span>
              </label>
            </div>

            <button className={`main-process-btn ${useAI ? 'ai' : ''}`} onClick={processImage} disabled={!image || isProcessing}>
              {isProcessing ? (
                <><Loader2 size={18} className="animate-spin" /> {statusMessage || 'Analisi...'}</>
              ) : (
                <>{useAI ? <Wand2 size={18} /> : <Search size={18} />} {useAI ? 'Analisi IA Sicura' : 'Scansione OCR'}</>
              )}
            </button>
            
            {error && (
              <div className="error-box">
                <AlertCircle size={14} />
                <span className="flex-1">{error}</span>
              </div>
            )}
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
                <div className="card-thumb">
                  {card.status === 'found' ? (
                    <img src={card.data?.image_uris?.normal || card.data?.card_faces?.[0]?.image_uris?.normal} alt={card.name} />
                  ) : (
                    <div className="card-thumb-placeholder">
                      {card.status === 'searching' ? <Loader2 className="animate-spin" size={24} /> : <HelpCircle size={24} />}
                    </div>
                  )}
                </div>
                <div className="card-item-body">
                  <div className="card-item-info">
                    <span className="result-name">{card.name}</span>
                    {card.status === 'error' && <span className="status-badge error">Non trovata</span>}
                  </div>
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
