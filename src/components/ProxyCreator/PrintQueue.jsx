import React, { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";

export default function PrintQueue({
  images,
  dragIdx,
  setDragIdx,
  reorder,
  remove,
  dup,
  isMobile
}) {
  const { t } = useLanguage();
  const [dropTargetIdx, setDropTargetIdx] = useState(null);

  if (images.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🃏</div>
        <div className="empty-title">{t('proxy.empty_queue')}</div>
        <div className="empty-subtitle">
          {t('proxy.empty_subtitle')}
        </div>
      </div>
    );
  }

  return (
    <div
      className="print-queue-grid"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 80 : 100}px, 1fr))` }}
    >
      {images.map((img, idx) => (
        <div
          key={img.id}
          draggable
          onDragStart={() => { setDragIdx(idx); setDropTargetIdx(null); }}
          onDragOver={e => { e.preventDefault(); setDropTargetIdx(idx); reorder(idx); }}
          onDragEnd={() => { setDragIdx(null); setDropTargetIdx(null); }}
          className={`queue-card ${dragIdx === idx ? 'dragging' : ''} ${dropTargetIdx === idx && dragIdx !== idx ? 'drop-target' : ''}`}
        >
          <img src={img.url} alt={img.name || t('common.name')} className="queue-card-img" />

          {/* Drop placeholder line indicator */}
          {dropTargetIdx === idx && dragIdx !== null && dragIdx !== idx && (
            <div className="drop-placeholder-line" />
          )}

          <div className="card-overlay">
            <button title={t('common.duplicate')} onClick={e => { e.stopPropagation(); dup(idx); }} className="overlay-btn">
              ⧉ {t('common.duplicate')}
            </button>
            <button title={t('common.remove')} onClick={e => { e.stopPropagation(); remove(idx); }} className="overlay-btn danger">
              ✕ {t('common.remove')}
            </button>
          </div>

          {img.srcType === "scryfall" && img.name && (
            <div className="card-name-label">{img.name}</div>
          )}
        </div>
      ))}
    </div>
  );
}
