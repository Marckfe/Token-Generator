import React, { useState, useRef } from 'react';
import { Search, Image as ImageIcon, Trash2, Plus, Loader2, AlertCircle, Wand2, Key, Upload, Bug, RefreshCw, HelpCircle, LayoutGrid, Layers } from 'lucide-react';
import './DeckScanner.css';
import { useAuth } from '../../context/AuthContext';

const basicLands = ['island', 'swamp', 'mountain', 'forest', 'plains', 'isola', 'palude', 'montagna', 'foresta', 'pianura', 'wastes', 'land'];

const DeckScanner = ({ onAddToQueue }) => {
  const [mainImage, setMainImage] = useState(null);
  const [mainPreview, setMainPreview] = useState(null);
  const [sideImage, setSideImage] = useState(null);
  const [sidePreview, setSidePreview] = useState(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  
  const mainInputRef = useRef(null);
  const sideInputRef = useRef(null);

  const handleImageUpload = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      if (type === 'main') {
        setMainImage(file);
        setMainPreview(URL.createObjectURL(file));
      } else {
        setSideImage(file);
        setSidePreview(URL.createObjectURL(file));
      }
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
          const MAX_SIZE = 1200;
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
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
      };
    });
  };

  const analyzeSingleImage = async (imageFile, isSide) => {
    const base64Image = await compressImage(imageFile);
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64Image })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    
    return data.map(item => ({
      id: Math.random().toString(36).substr(2, 9),
      qty: item.qty || 1,
      name: item.name,
      status: 'pending',
      data: null,
      isSide
    }));
  };

  const processImages = async () => {
    if (!mainImage && !sideImage) return;
    if (!user) {
      setError("Devi essere loggato per usare l'analisi IA.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResults([]);
    setStatusMessage('Inizializzazione Vision IA...');

    try {
      const tasks = [];
      if (mainImage) {
        tasks.push(analyzeSingleImage(mainImage, false));
      }
      if (sideImage) {
        tasks.push(analyzeSingleImage(sideImage, true));
      }

      setStatusMessage('Analisi immagini in corso...');
      const responses = await Promise.all(tasks);
      const allDetected = responses.flat();
      
      setResults(allDetected);
      allDetected.forEach(card => searchCard(card));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  const searchCard = async (card) => {
    setResults(prev => prev.map(c => c.id === card.id ? { ...c, status: 'searching' } : c));
    try {
      const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(card.name)}`);
      const data = await response.json();
      if (data.object === 'card') {
        setResults(prev => {
          // Check for existing same card in SAME section (main/side)
          const existing = prev.find(c => c.status === 'found' && c.data?.id === data.id && c.isSide === card.isSide && c.id !== card.id);
          if (existing) {
            const isLand = basicLands.some(l => data.name.toLowerCase().includes(l));
            existing.qty = isLand ? existing.qty + card.qty : Math.min(existing.qty + card.qty, 4);
            return prev.filter(c => c.id !== card.id);
          }
          return prev.map(c => c.id === card.id ? { ...c, status: 'found', name: data.name, data } : c);
        });
      } else {
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

  const mainCards = results.filter(r => !r.isSide);
  const sideCards = results.filter(r => r.isSide);

  return (
    <div className="deck-scanner-container">
      <div className="scanner-header-v2">
        <div className="scanner-title-group">
          <div className="scanner-icon-bg">
            <Wand2 className="text-accent" size={28} />
          </div>
          <div className="scanner-text-group">
            <h2>Deck Scanner Elite <span className="version-tag-v2">VISION AI</span></h2>
            <p className="scanner-subtitle">Analisi intelligente per Mainboard e Sideboard</p>
          </div>
        </div>
        <div className="header-actions">
           <button className="add-to-queue-btn-v2" onClick={handleAddToQueue} disabled={results.length === 0}>
             Aggiungi {results.filter(r => r.status === 'found').length} carte
           </button>
        </div>
      </div>

      <div className="scanner-layout-v2">
        <div className="scanner-sidebar-v2">
          <div className="upload-grid">
            {/* MAINBOARD UPLOAD */}
            <div className={`upload-card ${mainImage ? 'has-image' : ''}`} onClick={() => !isProcessing && mainInputRef.current.click()}>
              <div className="upload-card-header">
                <LayoutGrid size={16} />
                <span>Mainboard</span>
              </div>
              <input type="file" ref={mainInputRef} onChange={(e) => handleImageUpload(e, 'main')} accept="image/*" style={{ display: 'none' }} />
              {mainPreview ? (
                <div className="upload-preview">
                  <img src={mainPreview} alt="Mainboard" />
                  <div className="upload-overlay"><RefreshCw size={20} /></div>
                </div>
              ) : (
                <div className="upload-placeholder">
                  <ImageIcon size={32} />
                  <p>Carica Foto</p>
                </div>
              )}
            </div>

            {/* SIDEBOARD UPLOAD */}
            <div className={`upload-card ${sideImage ? 'has-image' : ''}`} onClick={() => !isProcessing && sideInputRef.current.click()}>
              <div className="upload-card-header">
                <Layers size={16} />
                <span>Sideboard</span>
              </div>
              <input type="file" ref={sideInputRef} onChange={(e) => handleImageUpload(e, 'side')} accept="image/*" style={{ display: 'none' }} />
              {sidePreview ? (
                <div className="upload-preview">
                  <img src={sidePreview} alt="Sideboard" />
                  <div className="upload-overlay"><RefreshCw size={20} /></div>
                </div>
              ) : (
                <div className="upload-placeholder">
                  <ImageIcon size={32} />
                  <p>Carica Foto</p>
                </div>
              )}
            </div>
          </div>

          <button className="process-action-btn" onClick={processImages} disabled={(!mainImage && !sideImage) || isProcessing}>
            {isProcessing ? (
              <><Loader2 size={18} className="animate-spin" /> {statusMessage || 'Analisi...'}</>
            ) : (
              <><Wand2 size={18} /> Avvia Analisi Vision</>
            )}
          </button>

          {error && (
            <div className="error-message-v2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="scanner-main-results">
          {results.length === 0 ? (
            <div className="results-empty-v2">
              <ImageIcon size={64} className="opacity-10" />
              <p>Carica una foto per iniziare l'analisi</p>
            </div>
          ) : (
            <div className="results-scroll-v2">
              {/* MAINBOARD SECTION */}
              {mainCards.length > 0 && (
                <div className="result-section-v2">
                  <div className="section-header-v2">
                    <LayoutGrid size={16} />
                    <span>Mainboard ({mainCards.length})</span>
                  </div>
                  <div className="results-grid-v2">
                    {mainCards.map(card => <ResultCard key={card.id} card={card} onUpdateQty={updateCardQty} onRemove={removeCard} />)}
                  </div>
                </div>
              )}

              {/* SIDEBOARD SECTION */}
              {sideCards.length > 0 && (
                <div className="result-section-v2">
                  <div className="section-header-v2">
                    <Layers size={16} />
                    <span>Sideboard ({sideCards.length})</span>
                  </div>
                  <div className="results-grid-v2">
                    {sideCards.map(card => <ResultCard key={card.id} card={card} onUpdateQty={updateCardQty} onRemove={removeCard} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ResultCard = ({ card, onUpdateQty, onRemove }) => (
  <div className={`card-item-v2 ${card.status}`}>
    <div className="card-thumb-v2">
      {card.status === 'found' ? (
        <img src={card.data?.image_uris?.normal || card.data?.card_faces?.[0]?.image_uris?.normal} alt={card.name} />
      ) : (
        <div className="thumb-placeholder-v2">
          {card.status === 'searching' ? <Loader2 className="animate-spin" size={24} /> : <HelpCircle size={24} />}
        </div>
      )}
      {card.isSide && <div className="side-badge">SIDE</div>}
    </div>
    <div className="card-content-v2">
      <div className="card-name-v2">{card.name}</div>
      <div className="card-controls-v2">
        <div className="qty-pill-v2">
          <button onClick={() => onUpdateQty(card.id, card.qty - 1)}>-</button>
          <span>{card.qty}</span>
          <button onClick={() => onUpdateQty(card.id, card.qty + 1)}>+</button>
        </div>
        <button className="remove-card-btn-v2" onClick={() => onRemove(card.id)}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  </div>
);

export default DeckScanner;

