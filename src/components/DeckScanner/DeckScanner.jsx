import React, { useState, useRef, useEffect } from 'react';
import { 
  Loader2, Trash2, HelpCircle, 
  ShieldCheck, Printer, CheckCircle2, XCircle, Cloud, Save
} from 'lucide-react';
import './DeckScanner.css';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { saveUserDeck } from '../../services/dbService';

const basicLands = ['island', 'swamp', 'mountain', 'forest', 'plains', 'wastes'];

// ── Sub-component: single card result ──────────────────────────────────
const ResultCard = ({ card, onUpdateQty, onRemove }) => (
  <div className={`sc-card ${card.status}`}>
    <div className="sc-card-thumb">
      {card.status === 'found' ? (
        <img
          src={card.data?.image_uris?.normal || card.data?.card_faces?.[0]?.image_uris?.normal}
          alt={card.name}
          loading="lazy"
        />
      ) : (
        <div className="sc-card-placeholder">
          {card.status === 'searching'
            ? <Loader2 className="loading-spin" size={24} />
            : <HelpCircle size={24} />}
        </div>
      )}
      {card.isSide && <div className="sc-side-badge">SIDE</div>}
      {card.status === 'error' && <div className="sc-error-badge">?</div>}
    </div>
    <div className="sc-card-body">
      <div className="sc-card-name" title={card.name}>{card.name}</div>
      <div className="sc-card-controls">
        <div className="sc-qty-pill">
          <button onClick={() => onUpdateQty(card.id, card.qty - 1)}>−</button>
          <span>{card.qty}</span>
          <button onClick={() => onUpdateQty(card.id, card.qty + 1)}>+</button>
        </div>
        <button className="sc-remove-btn" onClick={() => onRemove(card.id)} title="Remove">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  </div>
);

// ── Sub-component: section header ──────────────────────────────────────
const SectionHeader = ({ icon, label, count }) => (
  <div className="sc-section-header">
    {icon}
    <span>{label}</span>
    <span className="sc-section-count">{count}</span>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────
const DeckScanner = ({ onAddToQueue, onValidateDeck }) => {
  const [mainImage, setMainImage] = useState(null);
  const [mainPreview, setMainPreview] = useState(null);
  const [sideImage, setSideImage] = useState(null);
  const [sidePreview, setSidePreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);
  const [validationResult, setValidationResult] = useState(null); // null | 'pending' | 'legal' | 'illegal'

  const { user } = useAuth();
  const { t } = useLanguage();
  const mainInputRef = useRef(null);
  const sideInputRef = useRef(null);

  // ── Image upload ───────────────────────────────────────────────────
  const handleImageUpload = (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (type === 'main') { setMainImage(file); setMainPreview(url); }
    else { setSideImage(file); setSidePreview(url); }
    setError(null);
  };

  // ── Image compression ──────────────────────────────────────────────
  const compressImage = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const MAX = 1200;
        let { width, height } = img;
        if (width > height && width > MAX) { height = (height * MAX) / width; width = MAX; }
        else if (height > MAX) { width = (width * MAX) / height; height = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
    };
  });

  // ── AI analysis of one image ───────────────────────────────────────
  const analyzeSingleImage = async (imageFile, isSide) => {
    const base64Image = await compressImage(imageFile);
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    setDebugInfo({
      provider: data.provider || 'Unknown',
      model: data.model || 'Unknown',
      logs: Array.isArray(data.debugLogs) ? data.debugLogs : []
    });

    const cards = Array.isArray(data.cards) ? data.cards : [];
    return cards
      .filter(item => item?.name)
      .map(item => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        qty: Math.max(1, Number(item.qty) || 1),
        name: item.name.trim(),
        status: 'pending',
        data: null,
        isSide
      }));
  };

  // ── Scryfall lookup for one card ───────────────────────────────────
  const searchCard = async (card) => {
    setResults(prev => prev.map(c => c.id === card.id ? { ...c, status: 'searching' } : c));
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(card.name)}`
      );
      const data = await res.json();
      if (data.object === 'card') {
        setResults(prev => {
          const isLand = basicLands.some(l => data.name.toLowerCase() === l);
          const existing = prev.find(
            c => c.status === 'found' && c.data?.id === data.id && c.isSide === card.isSide && c.id !== card.id
          );
          if (existing) {
            return prev.map(c => {
              if (c.id === existing.id) {
                return { ...c, qty: isLand ? c.qty + card.qty : Math.min(c.qty + card.qty, 4) };
              }
              return c.id === card.id ? null : c;
            }).filter(Boolean);
          }
          return prev.map(c =>
            c.id === card.id ? { ...c, status: 'found', name: data.name, data } : c
          );
        });
      } else {
        setResults(prev => prev.map(c => c.id === card.id ? { ...c, status: 'error' } : c));
      }
    } catch {
      setResults(prev => prev.map(c => c.id === card.id ? { ...c, status: 'error' } : c));
    }
  };

  // ── Process all images ─────────────────────────────────────────────
  const processImages = async () => {
    if (!mainImage && !sideImage) return;
    if (!user) { setError(t('scanner.error_login')); return; }

    setIsProcessing(true);
    setError(null);
    setResults([]);
    setDebugInfo(null);
    setValidationResult(null);
    setStatusMessage(t('scanner.status_init'));

    try {
      const tasks = [
        mainImage ? analyzeSingleImage(mainImage, false) : Promise.resolve([]),
        sideImage ? analyzeSingleImage(sideImage, true) : Promise.resolve([])
      ];
      setStatusMessage(t('scanner.status_analysis'));
      const [mainCards, sideCards] = await Promise.all(tasks);
      const allCards = [...mainCards, ...sideCards];
      setResults(allCards);
      setStatusMessage(t('scanner.status_resolving'));
      // Fire off Scryfall lookups concurrently (max 10 at a time)
      const chunks = [];
      for (let i = 0; i < allCards.length; i += 10) chunks.push(allCards.slice(i, i + 10));
      for (const chunk of chunks) await Promise.all(chunk.map(card => searchCard(card)));
      setStatusMessage(t('scanner.status_done'));
    } finally {
      setIsProcessing(false);
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };
  
  // ── Save to Cloud ──────────────────────────────────────────────────
  const handleSaveToCloud = async () => {
    if (!user) { alert(t('studio.login_required')); return; }
    const mainCards = results.filter(c => !c.isSide && c.status === 'found');
    const sideCards = results.filter(c => c.isSide && c.status === 'found');
    const toList = (arr) => arr.map(c => `${c.qty} ${c.name}`).join('\n');
    
    try {
      setIsProcessing(true);
      setStatusMessage(t('scanner.status_syncing'));
      const deckName = `Scan ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      await saveUserDeck(user.uid, {
        name: deckName,
        maindeck: toList(mainCards),
        sideboard: toList(sideCards),
        format: 'standard'
      });
      setStatusMessage(t('proxy.cloud_sync_success'));
      setTimeout(() => setStatusMessage(''), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Queue actions ──────────────────────────────────────────────────
  const handleAddToQueue = () => {
    const valid = results.filter(c => c.status === 'found');
    onAddToQueue(valid.map(c => ({
      id: c.data.id + '_' + Math.random(),
      name: c.data.name,
      qty: c.qty,
      url: c.data.image_uris?.normal || c.data.card_faces?.[0]?.image_uris?.normal,
      thumb: c.data.image_uris?.small || c.data.card_faces?.[0]?.image_uris?.small,
      srcType: 'scryfall',
      set: c.data.set_name
    })));
  };

  // ── Validate & send to DeckChecker ────────────────────────────────
  const handleValidate = () => {
    if (!onValidateDeck) return;
    const mainCards = results.filter(c => !c.isSide && c.status === 'found');
    const sideCards = results.filter(c => c.isSide && c.status === 'found');
    const toList = (arr) => arr.map(c => `${c.qty} ${c.name}`).join('\n');
    onValidateDeck({ maindeck: toList(mainCards), sideboard: toList(sideCards) });
  };

  // ── Derived state ──────────────────────────────────────────────────
  const updateCardQty = (id, qty) =>
    setResults(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, qty) } : c));
  const removeCard = (id) => setResults(prev => prev.filter(c => c.id !== id));

  const mainCards = results.filter(r => !r.isSide);
  const sideCards = results.filter(r => r.isSide);
  const foundCount = results.filter(c => c.status === 'found').length;
  const hasResults = results.length > 0;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="sc-container">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="sc-header">
        <div className="sc-header-left">
          <div className="sc-header-icon"><Wand2 size={22} /></div>
          <div>
            <h2 className="sc-header-title">
              {t('scanner.title')}
              <span className="sc-version-badge">VISION AI</span>
            </h2>
            <p className="sc-header-sub">{t('scanner.subtitle')}</p>
          </div>
        </div>
        {hasResults && (
          <div className="sc-header-actions">
            {onValidateDeck && (
              <button
                className="sc-btn sc-btn-validate"
                onClick={handleValidate}
                title={t('scanner.validate_btn')}
              >
                <ShieldCheck size={16} />
                {t('scanner.validate_btn')}
              </button>
            )}
            <button
              className="sc-btn sc-btn-cloud"
              onClick={handleSaveToCloud}
              disabled={isProcessing || foundCount === 0}
            >
              <Cloud size={16} />
              {t('scanner.save_cloud')}
            </button>
            <button
              className="sc-btn sc-btn-queue"
              onClick={handleAddToQueue}
              disabled={foundCount === 0}
            >
              <Printer size={16} />
              {t('scanner.print_btn', { count: foundCount })}
            </button>
          </div>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="sc-body">
        {/* ── Sidebar ───────────────────────────────────────── */}
        <div className="sc-sidebar">
          {/* Upload cards */}
          <div className="sc-upload-grid">
            {/* Mainboard */}
            <div
              className={`sc-upload-card ${mainImage ? 'has-image' : ''}`}
              onClick={() => !isProcessing && mainInputRef.current?.click()}
            >
              <div className="sc-upload-label">
                <LayoutGrid size={14} />
                <span>{t('scanner.mainboard')}</span>
              </div>
              <input
                ref={mainInputRef} type="file" accept="image/*"
                style={{ display: 'none' }}
                onChange={e => handleImageUpload(e, 'main')}
              />
              {mainPreview ? (
                <div className="sc-upload-preview">
                  <img src={mainPreview} alt="mainboard" />
                  <div className="sc-upload-overlay"><RefreshCw size={18} /></div>
                </div>
              ) : (
                <div className="sc-upload-empty">
                  <ImageIcon size={28} />
                  <span>{t('scanner.upload_btn')}</span>
                </div>
              )}
            </div>

            {/* Sideboard */}
            <div
              className={`sc-upload-card ${sideImage ? 'has-image' : ''}`}
              onClick={() => !isProcessing && sideInputRef.current?.click()}
            >
              <div className="sc-upload-label">
                <Layers size={14} />
                <span>{t('scanner.sideboard')}</span>
              </div>
              <input
                ref={sideInputRef} type="file" accept="image/*"
                style={{ display: 'none' }}
                onChange={e => handleImageUpload(e, 'side')}
              />
              {sidePreview ? (
                <div className="sc-upload-preview">
                  <img src={sidePreview} alt="sideboard" />
                  <div className="sc-upload-overlay"><RefreshCw size={18} /></div>
                </div>
              ) : (
                <div className="sc-upload-empty">
                  <ImageIcon size={28} />
                  <span>{t('scanner.upload_btn')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Scan button */}
          <button
            className="sc-scan-btn"
            onClick={processImages}
            disabled={(!mainImage && !sideImage) || isProcessing}
          >
            {isProcessing ? (
              <><Loader2 size={18} className="animate-spin" /> {statusMessage}</>
            ) : (
              <><Wand2 size={18} /> {t('scanner.start_btn')}</>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="sc-error">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* AI Debug banner */}
          {debugInfo && (
            <div className="sc-debug-banner">
              <div className="sc-debug-row">
                <span className="sc-debug-label">AI</span>
                <span className="sc-debug-provider">{debugInfo.provider}</span>
                <span className="sc-debug-sep">·</span>
                <span className="sc-debug-model">{debugInfo.model}</span>
              </div>
              {debugInfo.logs.length > 0 && (
                <div className="sc-debug-logs">
                  {debugInfo.logs.map((l, i) => <span key={i}>{l}</span>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Results ───────────────────────────────────────── */}
        <div className="sc-results">
          {!hasResults ? (
            <div className="sc-empty">
              <ImageIcon size={56} style={{ opacity: 0.08 }} />
              <p>{t('scanner.empty_state')}</p>
            </div>
          ) : (
            <div className="sc-results-scroll">
              {mainCards.length > 0 && (
                <div className="sc-section">
                  <SectionHeader
                    icon={<LayoutGrid size={14} />}
                    label={t('scanner.mainboard')}
                    count={mainCards.length}
                  />
                  <div className="sc-cards-grid">
                    {mainCards.map(card => (
                      <ResultCard
                        key={card.id}
                        card={card}
                        onUpdateQty={updateCardQty}
                        onRemove={removeCard}
                      />
                    ))}
                  </div>
                </div>
              )}

              {sideCards.length > 0 && (
                <div className="sc-section">
                  <SectionHeader
                    icon={<Layers size={14} />}
                    label={t('scanner.sideboard')}
                    count={sideCards.length}
                  />
                  <div className="sc-cards-grid">
                    {sideCards.map(card => (
                      <ResultCard
                        key={card.id}
                        card={card}
                        onUpdateQty={updateCardQty}
                        onRemove={removeCard}
                      />
                    ))}
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

export default DeckScanner;
