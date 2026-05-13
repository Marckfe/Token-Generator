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
    // Regex to find patterns like "4 Lightning Bolt" or "1x Sol Ring" or just "Black Lotus"
    const lines = text.split('\n');
    const detectedCards = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3) return;

      // Try to extract quantity and name
      // Pattern: optional number, optional 'x', then name
      const match = trimmed.match(/^(\d+)?\s*[xX]?\s*(.+)$/);
      if (match) {
        const qty = parseInt(match[1]) || 1;
        const name = match[2].trim();
        
        // Basic filtering to avoid common OCR noise
        if (name.length > 3 && !name.includes('http') && !name.includes('www')) {
          detectedCards.push({
            id: Math.random().toString(36).substr(2, 9),
            qty,
            name,
            status: 'pending', // pending, searching, found, error
            data: null
          });
        }
      }
    });

    setResults(detectedCards);
    // Auto-search for found cards
    searchAllCards(detectedCards);
  };

  const searchCard = async (card) => {
    setResults(prev => prev.map(c => c.id === card.id ? { ...c, status: 'searching' } : c));
    
    try {
      const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(card.name)}`);
      const data = await response.json();

      if (data.object === 'card') {
        setResults(prev => prev.map(c => c.id === card.id ? { 
          ...c, 
          status: 'found', 
          name: data.name, 
          data: data 
        } : c));
      } else {
        setResults(prev => prev.map(c => c.id === card.id ? { ...c, status: 'error' } : c));
      }
    } catch (err) {
      setResults(prev => prev.map(c => c.id === card.id ? { ...c, status: 'error' } : c));
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
              <div key={card.id} className={`result-item ${card.status}`}>
                <div className="result-qty-control">
                  <input 
                    type="number" 
                    value={card.qty} 
                    onChange={(e) => updateCardQty(card.id, parseInt(e.target.value))}
                    min="1"
                  />
                </div>
                
                <div className="result-info">
                  <span className="result-name">{card.name}</span>
                  <div className="result-status-tag">
                    {card.status === 'searching' && <Loader2 size={12} className="animate-spin" />}
                    {card.status === 'found' && <CheckCircle2 size={12} className="text-success" />}
                    {card.status === 'error' && <AlertCircle size={12} className="text-error" />}
                    <span className="ml-1 text-[10px] uppercase font-bold">
                      {card.status === 'searching' ? 'Ricerca...' : card.status === 'found' ? 'Trovata' : card.status === 'error' ? 'Non Trovata' : 'In attesa'}
                    </span>
                  </div>
                </div>

                <div className="result-actions">
                  <button className="text-error hover:opacity-100 opacity-50 transition-opacity" onClick={() => removeCard(card.id)}>
                    <Trash2 size={16} />
                  </button>
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
