import React, { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import LazyInView from "../common/LazyInView";

export default function PrintQueue({
  images,
  dragIdx,
  setDragIdx,
  onReorder,
  onRemove,
  onDup,
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

  const gridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 80 : 100}px, 1fr))`,
    maxHeight: images.length > 30 ? "min(70vh, 900px)" : undefined,
    overflowY: images.length > 30 ? "auto" : undefined,
  };

  return (
    <div className="print-queue-grid" style={gridStyle}>
      {images.map((img, idx) => (
        <LazyInView
          key={img.id}
          listLength={images.length}
          minHeight={isMobile ? 112 : 140}
        >
          <div
            draggable
            onDragStart={() => { setDragIdx(idx); setDropTargetIdx(null); }}
            onDragOver={e => { e.preventDefault(); setDropTargetIdx(idx); onReorder(idx); }}
            onDragEnd={() => { setDragIdx(null); setDropTargetIdx(null); }}
            className={`queue-card ${dragIdx === idx ? 'dragging' : ''} ${dropTargetIdx === idx && dragIdx !== idx ? 'drop-target' : ''}`}
          >
            <img
              src={img.thumb || img.previewUrl || img.url}
              alt={img.name || t('common.name')}
              className="queue-card-img"
              loading="lazy"
              decoding="async"
            />

            {dropTargetIdx === idx && dragIdx !== null && dragIdx !== idx && (
              <div className="drop-placeholder-line" />
            )}

            <div className="card-overlay">
              <button type="button" title={t('common.duplicate')} onClick={e => { e.stopPropagation(); onDup(idx); }} className="overlay-btn">
                ⧉ {t('common.duplicate')}
              </button>
              <button type="button" title={t('common.remove')} onClick={e => { e.stopPropagation(); onRemove(idx); }} className="overlay-btn danger">
                ✕ {t('common.remove')}
              </button>
            </div>

            {img.srcType === "scryfall" && img.name && (
              <div className="card-name-label">{img.name}</div>
            )}
          </div>
        </LazyInView>
      ))}
    </div>
  );
}
